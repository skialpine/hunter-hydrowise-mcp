---
name: restore-irrigation-backup
description: Apply a Hydrawise snapshot to a controller. Use when the user says "restore my irrigation backup", "apply this snapshot", "restore from snapshot", "apply backup file", or any phrasing indicating they want to push a previously-captured snapshot file's state back to a Hydrawise controller. The snapshot file embeds a `_restore_recipe` block that this skill executes step-by-step with preview-then-apply confirmation.
---

# Restore an irrigation backup

Apply a Hydrawise snapshot file (produced by `dump_controller_snapshot`) to a controller. The snapshot embeds a `_restore_recipe` array — the AI's playbook — which this skill walks step-by-step, previewing each mutation, confirming with the user, then applying.

## Trigger phrases

- "restore my irrigation backup"
- "apply this snapshot"
- "restore from snapshot"
- "apply backup file `<path>`"
- "restore controller `<id>` from `<snapshot file>`"

## Inputs

- **Required**: a snapshot file path OR pasted JSON content.
- **Optional**: target `controller_id` (defaults to the snapshot's `controller.id` if not specified).

## Workflow

### 1. Load and validate the snapshot

- If the user gave a file path, read it. Otherwise parse the pasted JSON.
- Check `snapshot_version`:
  - **`< 5`**: STOP — this snapshot predates `_restore_recipe` and cannot be replayed. Tell the user to re-capture using the current server.
  - **`>= 5 and < 6` (pre-v6)**: STOP immediately with this message:
    > "This snapshot uses pre-v6 field names (e.g. `cycle_custom_time`, `factors`, `interval`, `delay`) that are incompatible with the current server's v6 naming convention (`cycle_custom_time_minutes`, `monthly_adjustment_percents`, `interval_days`, `delay_seconds`, etc.). The embedded `_restore_recipe` args will fail Zod validation if replayed against this server. **Do not proceed.** Re-capture the snapshot using the current server first: run the `capture-irrigation-snapshot` skill, then use the new v6 snapshot file."
    Do NOT attempt to replay a v5 recipe. Do NOT manually translate field names.
  - **`>= 6`**: proceed.
- Extract `snapshot.controller.id`, `snapshot._restore_recipe`, and `snapshot._caveats`.

### 2. Verify the target controller

- Call `list_controllers` and `get_controller(snapshot.controller.id)`.
- If the controller doesn't exist on the live account: stop and report — the snapshot may be from a different account.
- If the live controller is online but in a different `program_mode` than the snapshot, surface this prominently — the recipe's first step (`update_controller_program_mode`) will switch modes and that DISCARDS the live mode's schedule data. Ask the user to confirm before proceeding.

### 3. Diff zones (name + number)

- Call `list_zones(snapshot.controller.id)`.
- Compare snapshot zones (snapshot.controller.zones[]) against live zones by `(name, number)` pair.
- Report the diff to the user:
  - Snapshot has zones live doesn't → these need `create_zone` calls (the recipe does NOT auto-emit these; they're added by you, the AI, with the user's blessing). Build the `create_zone` payloads from the snapshot's zone settings.
  - Live has zones snapshot doesn't → propose `delete_zone` calls. Get explicit user confirmation; deletion is destructive.
  - Same `(name, number)` exists on both sides → no zone-CRUD action needed; the recipe's `update_zone_settings` step will reconcile the per-zone state.
- If zone CRUD is needed, run those steps BEFORE the recipe (after step 5 caveats but before step 6 below).

### 4. Present `_caveats` up front

Caveats are tiered:

- **FYI caveats** (those starting with the literal prefix `"FYI: "`) — display as a single info line; do NOT prompt for individual acknowledgement. These are reminders the user can ignore in the common case (e.g. sensor wiring hasn't changed). Bundle them after the safety-critical caveats so they don't crowd the prompt loop.
- **Safety-critical caveats** (everything else) — display each one and ask: "Acknowledge?" The user must respond before proceeding.

Specific safety-critical caveats:

- If a caveat mentions **unit-pref drift** (watering triggers captured in F/mph but live account uses C/kph, etc.) — STOP. Do not proceed until the user explicitly tells you whether to convert values. Applying the recipe verbatim would produce numerically wrong results (97°F captured → 97 restored as °C scorches the lawn).
- If a caveat mentions **custom sensor types** — note that the recipe's `create_sensor` steps reference snapshot-time `model_id`s that won't exist on the new account; you'll re-resolve the new ids after each `create_custom_sensor_type` succeeds (see step 6).
- If a caveat mentions **unreadable fields** — note that `update_zone_settings` steps will have null values for required fields; you'll merge with live state at execute time (see step 6).

### 5. Recommend a savepoint

Recommend (don't enforce): "Before I run this restore, I can capture a fresh snapshot of the current live state of controller `{id}` as a savepoint. If anything goes wrong mid-restore, you can use that snapshot to recover. Want me to do that?"

If yes, invoke the `capture-irrigation-snapshot` skill with the live controller's id and store the file path.

### 6. Walk the recipe

For each step in `snapshot._restore_recipe` (in `order` ascending):

#### a. Check `depends_on`

If any dependency step has not yet been successfully applied, halt with an error — the recipe order should make this impossible, but verify defensively.

#### b. Pre-process the args (per-step rules)

- **`update_zone_settings`**: if the step's args contain `null` for required fields (watering_mode, global_master_valve, watering_type, watering_frequency_mode, etc. — see the per-step `notes` field), call `get_zone_settings(zone_id)` first, take the live values for the null fields, and merge over the snapshot's non-null values. The MERGED payload is what you preview/apply.
- **`create_sensor` referencing a custom type** (the step's `notes` say "model_id refers to the custom type created above"): look up the prior `create_custom_sensor_type` step's RESULT (the SensorModel object returned), extract the new `id`, and substitute it for the snapshot-time `model_id` in this step's args.
- **`update_standard_program`**: the snapshot doesn't capture `program_type`, `day_pattern`, `run_duration` (for every zone in `zone_run_times`), or `ignore_rain_sensor` — they arrive as `null` in the recipe args. **You MUST call `get_program(controller_id, program_id, "Standard")` first**, take those fields from the live program, and merge the snapshot's non-null values over. Do NOT apply this step with null `run_duration` values — doing so silently zeros out every zone's run time with no error from Zod or the API.
- **`create_program_start_time`**: the snapshot doesn't capture all required fields (apply_all, zones, schedules, days-of-week ints) — the recipe emits the captured `time` and `zones` (translated from `zone_ids`) plus null for everything else. Call `list_program_start_times_for_zone(zone_id)` to inspect the live state.
  - **Idempotency check** (skip if already present): match the recipe's `args.time` (HH:MM string) against each live start time's `time` field; if you find a match where the `zones` arrays overlap, the start time is already there — skip this step. Strict equality on time + any zone overlap is the right granularity (the same time can have different zone subsets, but for restore-equivalence we treat them as the same start time).
  - If no match exists, build the full payload from the snapshot's `time`/`zones` plus live patterns (apply_all, schedules, watering_type, time_type, day-of-week ints).

#### c. Preview the step

Call `step.tool({ ...mergedArgs, preview: true })`. Show the user the planned variables.

If preview returns an error, halt: report which step failed, what state was achieved before this point, and what the error said. Do NOT continue to the next step (the recipe is fail-fast).

#### d. Confirm and apply

Show the user a one-line summary: "Step {order}/{total}: {tool} on {target} → {brief description from notes or args}. Apply?"

If yes, call `step.tool({ ...mergedArgs, preview: false })`. Record the result (especially for `create_*` steps where you'll need the returned id for downstream `depends_on`).

If no, halt: "Restore halted at step {order}. {N} steps applied; {M} remaining."

#### e. Continue

Repeat (a) through (d) for the next step.

### 7. Final report

When all steps complete (or restore halts), report:

- Total steps in recipe.
- Steps successfully applied.
- Steps skipped (with reason — e.g., zone CRUD diff, already-present, user declined).
- Steps that failed (which step, what error, what live state was last verified).
- The savepoint file path (if step 5 created one).
- Recommendation: "Capture a fresh snapshot now to verify the restored state matches the source."

## Failure handling

- **Fail-fast**: halt on first failure. Do NOT auto-retry; do NOT roll back. Hydrawise mutations aren't transactional and a partial-restore state is recoverable from the savepoint snapshot from step 5.
- **Report**: name the failed step's `order` and `tool`, surface the underlying error message verbatim, list which prior steps succeeded.
- **Hand off**: tell the user to inspect the GUI, fix the immediate issue, and either re-run the restore (which will preview-then-apply the remaining steps) or restore from the savepoint snapshot to get back to the pre-restore state.

## Rules

- ALWAYS preview every step (`preview: true`) before applying. NEVER call a write tool with `preview: false` without showing the user the planned variables first.
- NEVER apply the recipe verbatim if `_caveats` includes a unit-pref mismatch. Halt until the user reconciles.
- NEVER skip the zone-diff step (workflow step 3). Restoring a snapshot to a controller with different zones than the snapshot was captured from will silently apply settings to the wrong zones.
- NEVER assume the recipe is complete. Each step's `notes` field may flag fields the AI must merge from live state; honor those notes.

## What this skill is NOT

- **Not a single-tool restore**. There is intentionally no `restore_from_backup` MCP tool; restore is the AI's choreography of `update_*`/`create_*` calls, gated by `preview: true` confirmation. This skill IS the restore workflow.
- **Not transactional**. Hydrawise mutations don't roll back; partial restore is the user's problem to recover from (savepoint snapshot helps).
- **Not silent**. Every mutation requires explicit user confirmation after preview.
