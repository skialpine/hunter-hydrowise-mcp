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

## 4. Skill file

- [ ] 4.1 Create `.claude/skills/restore-irrigation-backup.md` (or appropriate skills directory per project layout)
- [ ] 4.2 Document trigger phrases: "restore my irrigation backup", "apply this snapshot", "restore from snapshot"
- [ ] 4.3 Document inputs: snapshot file path or pasted JSON content
- [ ] 4.4 Document workflow: load → verify target controller → walk recipe → preview each → confirm with user → execute → report
- [ ] 4.5 Document `_caveats` handling: present up-front, require acknowledgment
- [ ] 4.6 Document failure handling: fail-fast, report the failed step, leave the controller in whatever state was achieved
- [ ] 4.7 Document the "capture-fresh-snapshot-before-restore" rule as a savepoint

## 5. Tests

- [ ] 5.1 Unit tests for `buildRestoreRecipe` with several fixtures: STANDARD-only snapshot, ADVANCED snapshot, snapshot with sensors, snapshot with custom sensor types, snapshot with notes
- [ ] 5.2 Unit tests for `buildRestoreCaveats` covering each caveat condition
- [ ] 5.3 Integration test: `tests/integration/snapshot-roundtrip.test.ts`. Stand up a `fakeApi` with rich state; call `dump_controller_snapshot`; for each step in the resulting `_restore_recipe`, call the named tool with `args` and `preview: true`; assert each preview matches what the snapshot says
- [ ] 5.4 Integration test asserting `_restore_recipe` references only tool names that exist in the registered tool catalog (catches typos / removed tools)

## 6. Documentation

- [ ] 6.1 Update CLAUDE.md "Restore-from-backup" section: explain the embedded `_restore_recipe` and `_caveats` blocks; link to the skill
- [ ] 6.2 Add a section to README explaining the snapshot/restore workflow at user-level
- [ ] 6.3 Update CLAUDE.md MCP tools description for `dump_controller_snapshot` to mention the restore-recipe block
