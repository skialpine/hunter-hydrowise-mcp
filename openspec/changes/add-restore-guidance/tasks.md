## 1. Recipe builder

- [ ] 1.1 Add `buildRestoreRecipe(snapshot: ControllerSnapshotV3): RestoreRecipe[]` to `src/tools/serializers.ts` (or a new `src/tools/restoreRecipe.ts`)
- [ ] 1.2 Define `RestoreRecipe` interface: `{ order: number, tool: string, args: Record<string, unknown>, depends_on: number[], notes?: string }`
- [ ] 1.3 Implement the hard-coded restore order: program_mode → location → master_valve → seasonal_adjustments → watering_triggers → custom sensor types → sensors → programs (Standard or Advanced per mode) → zone settings → program start times (Advanced only) → notes
- [ ] 1.4 Each step's `args` is built from the captured snapshot data using existing serializer helpers — the recipe builder does not call the live API
- [ ] 1.5 Encode `depends_on` for steps that require prior steps (sensors depend on custom types, zone_settings depends on sensors, etc.)

## 2. Caveats builder

- [ ] 2.1 Add `buildRestoreCaveats(snapshot): string[]` — examines the captured data and emits known-limitation warnings
- [ ] 2.2 Caveat: any `_unreadable_fields` populated → "Zone X has unreadable fields; supply them at restore or accept live values"
- [ ] 2.3 Caveat: any `schedule_adjustment_ids` referenced → "Snapshot references reusable schedule N; verify it still exists before restore"
- [ ] 2.4 Caveat: any `custom` sensor types referenced → "Custom sensor types must be re-created and may receive new IDs"
- [ ] 2.5 Caveat: program_mode mismatch warning if applicable

## 3. Snapshot envelope extension

- [ ] 3.1 Update `ControllerSnapshotV3` interface in `src/tools/backup.ts` to include `_restore_recipe: RestoreRecipe[]` and `_caveats: string[]` at the top level
- [ ] 3.2 In `dump_controller_snapshot`, after assembling the `controller` portion, call `buildRestoreRecipe` and `buildRestoreCaveats`, attach to envelope
- [ ] 3.3 Bump `snapshot_version` to 3 (informational)
- [ ] 3.4 Update `dump_controller_snapshot` description

## 4. Skill files

### 4.A — Restore skill

- [ ] 4.A.1 Create `.claude/skills/restore-irrigation-backup.md`
- [ ] 4.A.2 Document trigger phrases: "restore my irrigation backup", "apply this snapshot", "restore from snapshot"
- [ ] 4.A.3 Document inputs: snapshot file path or pasted JSON content
- [ ] 4.A.4 Document workflow: load → verify target controller → diff zones (name+number) → walk recipe → preview each step → confirm with user → execute → report
- [ ] 4.A.5 Document `_caveats` handling: present up-front, require acknowledgment
- [ ] 4.A.6 Document failure handling: fail-fast, report the failed step, leave the controller in whatever state was achieved
- [ ] 4.A.7 Document the "capture-fresh-snapshot-before-restore" rule as a savepoint
- [ ] 4.A.8 Document the unit-mismatch refusal: if `_caveats` includes a unit-pref mismatch, restore halts until reconciled

### 4.B — Capture skill

- [ ] 4.B.1 Create `.claude/skills/capture-irrigation-snapshot.md`
- [ ] 4.B.2 Document trigger phrases: "back up my irrigation", "snapshot my controller", "capture irrigation state"
- [ ] 4.B.3 Document inputs: required `controller_id`, optional `output_dir` (default `snapshots/`)
- [ ] 4.B.4 Document workflow:
    1. Call `dump_controller_snapshot(controller_id)`
    2. Write snapshot JSON to `<output_dir>/<controller-name>-<controller-id>-<ISO-timestamp>Z.json`
    3. Inspect `<output_dir>/history/` for prior report matching this controller; determine delta range
    4. Call `get_watering_report(controller_id, from, until)`
    5. Write report JSON to `<output_dir>/history/<controller-id>-<from-date>_to_<until-date>.json`
    6. Report captured coverage
- [ ] 4.B.5 Document filename conventions (sortable ISO timestamps, controller-id namespacing for multi-controller accounts)
- [ ] 4.B.6 Document the rationale: Hydrawise only retains ~1 year of report data; per-snapshot delta capture builds permanent multi-year history

## 5. Tests

- [ ] 5.1 Unit tests for `buildRestoreRecipe` with several fixtures: STANDARD-only snapshot, ADVANCED snapshot, snapshot with sensors, snapshot with custom sensor types, snapshot with notes
- [ ] 5.2 Unit tests for `buildRestoreCaveats` covering each caveat condition
- [ ] 5.3 Integration test: `tests/integration/snapshot-roundtrip.test.ts`. Stand up a `fakeApi` with rich state; call `dump_controller_snapshot`; for each step in the resulting `_restore_recipe`, call the named tool with `args` and `preview: true`; assert each preview matches what the snapshot says
- [ ] 5.4 Integration test asserting `_restore_recipe` references only tool names that exist in the registered tool catalog (catches typos / removed tools)

## 6. Documentation

- [ ] 6.1 Update CLAUDE.md "Restore-from-backup" section: explain the embedded `_restore_recipe` and `_caveats` blocks; link to the skill
- [ ] 6.2 Add a section to README explaining the snapshot/restore workflow at user-level
- [ ] 6.3 Update CLAUDE.md MCP tools description for `dump_controller_snapshot` to mention the restore-recipe block
