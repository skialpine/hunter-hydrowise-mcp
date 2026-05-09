## Context

Per the `add-schedule-management` design decision (preserved): *"Restore is an AI workflow, not a server primitive."* The user has reaffirmed this preference: pure AI-orchestrated restore, no monolithic `restore_from_backup` tool.

What restore-from-snapshot looks like in practice today (after Phases 1–3 ship) without further help:

```
1. AI reads snapshot file
2. AI calls list_controllers + get_controller(controller_id) to see current state
3. AI diffs every category in its head:
   - location? master_valve? programs? watering_triggers? seasonal_adjustments? sensors? notes?
4. For each category that differs, AI:
   a. Looks up the matching update_* tool name
   b. Constructs the full payload from the snapshot
   c. Calls with preview: true
   d. Shows the user the diff
   e. Calls with preview: false on confirmation
5. AI handles failures, ordering dependencies (custom sensor types before sensors that reference them, etc.)
```

Steps 3, 4a, 4b, and 5 require the AI to have memorized the entire restore choreography. That's brittle — the AI may pick wrong tools, miss a category, or get the dependency order wrong (e.g., restore a sensor before its custom type exists).

The fix is to **encode the choreography in the snapshot itself**. The recipe builder runs at snapshot-capture time, walks the captured data, and emits an ordered list of `{ tool, args, depends_on, notes }` records. The AI's restore loop becomes:

```
1. AI loads snapshot file → extracts snapshot.controller and snapshot._restore_recipe
2. AI calls list_controllers + get_controller(controller_id) to verify target controller
3. For each step in snapshot._restore_recipe (in order):
   a. Call step.tool(step.args, preview=true)
   b. If preview matches what we'd expect: show the user, ask to confirm
   c. On confirmation, call step.tool(step.args, preview=false)
4. Aggregate final state: report what changed
```

The AI is no longer making independent dispatch decisions per category — it's executing a pre-computed plan. Failure modes are limited to: (a) a step's preview comes back unexpected, (b) a dependency wasn't satisfied (handled by `depends_on`), or (c) the live API rejects the mutation (surfaced via existing error machinery).

The `_caveats` block surfaces known restore limitations that don't fit cleanly into a recipe step but the AI must consider: e.g., reusable_schedule_id 17 might no longer exist; the AI should re-query and reconcile or warn the user.

## Goals / Non-Goals

**Goals:**
- Snapshot envelope contains a top-level `_restore_recipe` ordered list of `{ order, tool, args, depends_on, notes }`. AI executes the list as a sequence to restore.
- Snapshot envelope contains a top-level `_caveats` array — strings describing known restore limitations.
- Recipe is a pure function of the snapshot data — no live API calls during recipe building, no state.
- A skill file documents the AI restore workflow.
- A round-trip integration test catches gaps where a captured field has no corresponding restore step.

**Non-Goals:**
- A `restore_from_backup` MCP tool — explicitly preserved as not-built per the existing design.
- Live API state reconciliation in the recipe builder — the recipe is a snapshot of the snapshot; reconciliation happens at execute time via `preview: true`.
- Atomic / transactional restore — Hydrawise mutations aren't transactional, and adding a "rollback" layer would mean tracking pre-mutation values and re-issuing reverse mutations on failure. Out of scope; the recipe is fail-fast (stop on first error, leave the controller in a partial state, surface the error).
- Conflict resolution rules in the server — the AI handles conflicts by showing diffs and asking the user.

## Decisions

### Recipe is embedded in the snapshot, not a separate tool

The recipe is a pure derivation from the snapshot data, computed once at capture time. Embedding it in the envelope means: (a) the snapshot file is self-sufficient — open it later, the recipe is right there, no need to re-call the server, (b) the recipe accurately reflects what the snapshot represents (no chance of drift between a separate "compute_recipe" tool and the snapshot file).

**Alternative considered:** a separate MCP tool `compute_restore_recipe(snapshot_json)` that accepts a snapshot file as input and returns the recipe. Rejected because it adds a tool the AI must know to call, and the snapshot file would no longer be self-sufficient. Embedding is strictly better.

### Recipe shape

```json
{
  "_restore_recipe": [
    {
      "order": 1,
      "tool": "update_controller_program_mode",
      "args": { "controller_id": 317416, "program_mode": "STANDARD" },
      "depends_on": [],
      "notes": "Set program mode first; switching modes invalidates per-zone schedule"
    },
    {
      "order": 2,
      "tool": "update_location",
      "args": { "controller_id": 317416, "address": "...", "latitude": 39.6, "longitude": -104.9 },
      "depends_on": [],
      "notes": "Required for Virtual Solar Sync"
    },
    {
      "order": 3,
      "tool": "create_custom_sensor_type",
      "args": { ... },
      "depends_on": [],
      "notes": "Custom sensor types must exist before sensors that reference them"
    },
    {
      "order": 4,
      "tool": "create_sensor",
      "args": { ... },
      "depends_on": [3]
    },
    ...
  ]
}
```

`order` provides explicit numbering. `depends_on` references prior `order` numbers; the AI should not run a step until its dependencies have completed successfully. `notes` is optional, present only where the rationale isn't obvious.

### Restore order (encoded by recipe builder)

```
1. Controller-level prerequisites:
   - update_controller_program_mode (if mode changed)
   - update_location (Solar Sync prerequisite)
   - update_controller_master_valve
   - update_seasonal_adjustments
   - update_watering_triggers
2. Sensor universe (depends on nothing else):
   - create_custom_sensor_type (per snapshot custom type)
   - create_sensor / update_sensor / delete_sensor (after custom types exist)
3. Programs (depends on sensors and master valve):
   - STANDARD: create_standard_program / update_standard_program per program
   - ADVANCED: create/update_watering_program (Time/Smart/VSS) per zone, then per-zone updates
4. Per-zone settings:
   - update_zone_settings per zone (after programs and sensors exist; references sensor_ids)
5. Per-zone start times (Advanced only):
   - create_program_start_time per zone
6. Notes:
   - create_controller_note per note
   - create_zone_note per zone-note
```

This ordering is encoded in the recipe builder's source code, so it's reviewable and testable.

**Alternative considered:** topological sort from explicit dependencies. Rejected because the dependencies are largely fixed by domain (you can't create a sensor before its custom type exists; you can't reference a sensor in `update_zone_settings` before the sensor exists). Hard-coded order matches the deterministic real-world dependency graph.

### `_caveats` are static rules applied at snapshot time

The recipe builder also examines the captured data and emits `_caveats` strings:

- "Snapshot references reusable_schedule_id N. This is Hydrawise-managed; restore will fail if it no longer exists. Verify with `list_zone_settings` for any zone before running restore."
- "Snapshot zone X has _unreadable_fields populated. Restore cannot infer values for these fields; supply them explicitly or accept the live values at restore time."
- "Snapshot was captured from program_mode STANDARD; if restoring to a controller currently in ADVANCED mode, set step 1 expects to switch the mode (which discards Advanced program state)."

The list is short and authored from the known limitations. New caveats are added as new limitations are discovered.

### Two skill files, both shipped in the repo

#### `.claude/skills/restore-irrigation-backup.md`

The AI restore workflow. Loaded when the user asks to restore.

- When to load: user asks "restore my irrigation backup", "apply this snapshot", etc.
- Required input: a snapshot file path or pasted JSON.
- Steps: load file, parse, verify target controller, walk `_restore_recipe`, preview each step, confirm with user, execute, report.
- Zone-existence diff: AI compares snapshot zones to live zones by `name + number`; recipe steps include `create_zone` / `delete_zone` calls as needed (added by recipe builder when the snapshot's zones don't match the live state).
- Failure handling: stop on first error, report which step failed and what state was achieved before the failure.
- `_caveats` handling: present them to the user up-front and require acknowledgment.
- Pre-restore snapshot recommendation: capture a fresh snapshot of the target controller before restore (acts as a savepoint).

#### `.claude/skills/capture-irrigation-snapshot.md`

The AI capture workflow. Loaded when the user asks to back up.

- When to load: user asks "back up my irrigation", "snapshot the controller", "capture irrigation state", etc.
- Steps:
  1. Call `dump_controller_snapshot(controller_id)`.
  2. Write the snapshot JSON to `snapshots/<controller-name>-<controller-id>-<ISO-timestamp>Z.json`.
  3. Look at `snapshots/history/` for the most recent watering-report file matching this controller. Determine the delta date range:
     - If a previous report exists: `from = previous report's until`, `until = now`.
     - If no previous report exists: `from = 1 year ago` (max retention), `until = now`.
  4. Call `get_watering_report(controller_id, from, until)`.
  5. Write the report JSON to `snapshots/history/<controller-id>-<from-date>_to_<until-date>.json`.
  6. Report what was captured + total accumulated history coverage.
- Future captures append to history; multi-year coverage survives Hydrawise's ~1-year retention.
- Both files live under `snapshots/`, which is gitignored (per existing repo policy).

**Why the capture skill exists:**
- The user wants permanent watering history, but Hydrawise only retains ~1 year. Periodic capture surviving in `snapshots/history/` solves this.
- The user explicitly rejected scheduled capture (no cron). Manual capture via skill keeps it AI-mediated and visible.
- Embedding the capture procedure in a skill (vs. hardcoded) lets the user adjust the lookback / file naming / directory structure without code changes.

**Both skills are shipped in the repo** at `.claude/skills/`. `.claude/` already has `settings.local.json` checked in (project-level Claude config). Skills travel with the code; users who clone the repo get them automatically. Users who prefer personal skills can copy to `~/.claude/skills/`.

### Round-trip test detects capture/restore gaps

The integration test does:

1. Stand up `fakeApi` with a known controller state (zones, programs, sensors, notes, settings).
2. Call `dump_controller_snapshot(controller_id)`.
3. For each step in the captured `_restore_recipe`, call the named tool with `args` and `preview: true` against the same `fakeApi`.
4. Assert that each preview returns variables matching what the snapshot says (i.e., re-applying the snapshot would be a no-op).

This catches: (a) snapshot captures field X but no `update_*` tool accepts it, (b) `update_*` tool requires field Y but snapshot doesn't capture it, (c) field name mismatch between snapshot and `update_*` tool args, (d) recipe references a tool name that doesn't exist.

## Risks / Trade-offs

- **Recipe size**: the recipe could be large for complex controllers (e.g., 22 zones × multiple updates each). Snapshot file size grows. Mitigation: it's still text; the file remains under 100KB for a typical account.
- **Recipe staleness vs live state**: the recipe is computed at capture time and reflects the snapshot. If the live state has drifted between capture and restore, executing the recipe overwrites that drift. The skill's "preview before execute" workflow shows the user what's about to happen so they can detect drift before it matters.
- **Skill discoverability**: skills only run when Claude Code loads them on user prompt. If the user asks to "restore my backup" but the skill isn't installed in their `.claude/skills/`, the AI falls back to ad-hoc reasoning. Mitigation: ship the skill in the project repo so users who clone it get it for free; document in the README.
- **Hard-coded order assumes Phases 1–3 ship complete**: the recipe builder needs to know every tool that can restore a given category. If a tool changes name or signature, the builder breaks. Mitigation: the round-trip test catches this; if a tool is renamed, both the recipe builder and the test must be updated together.
- **No transactional rollback**: a partial-restore failure leaves the controller in an inconsistent state. Mitigation: the skill instructs the AI to capture a fresh snapshot *before* starting restore, so the user can recover. (Like a SQL `BEGIN`; the snapshot itself is the savepoint.)
