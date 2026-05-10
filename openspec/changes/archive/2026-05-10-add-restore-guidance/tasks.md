## 1. Recipe builder

- [x] 1.1 Add `buildRestoreRecipe(snapshot: ControllerSnapshotV3): RestoreRecipe[]` to `src/tools/serializers.ts` (or a new `src/tools/restoreRecipe.ts`) — created new file `src/tools/restoreRecipe.ts`. Snapshot version is now V5 (Phases 2-3 bumped past V3).
- [x] 1.2 Define `RestoreRecipe` interface: `{ order: number, tool: string, args: Record<string, unknown>, depends_on: number[], notes?: string }` — exported as `RestoreStep`.
- [x] 1.3 Implement the hard-coded restore order: program_mode → location → master_valve → seasonal_adjustments → watering_triggers → custom sensor types → sensors → programs (Standard or Advanced per mode) → zone settings → program start times (Advanced only) → notes — implemented exactly. Advanced programs deliberately skipped (no createAdvancedProgram mutation per CLAUDE.md gotcha); restore proceeds via per-zone updates instead.
- [x] 1.4 Each step's `args` is built from the captured snapshot data using existing serializer helpers — the recipe builder does not call the live API — pure function over snapshot envelope, no I/O.
- [x] 1.5 Encode `depends_on` for steps that require prior steps (sensors depend on custom types, zone_settings depends on sensors, etc.) — sensor → custom-type via order tracking; zone_settings → all preceding program steps; sensor steps deduplicate custom-type creation by model_id.

## 2. Caveats builder

- [x] 2.1 Add `buildRestoreCaveats(snapshot): string[]` — examines the captured data and emits known-limitation warnings — implemented.
- [x] 2.2 Caveat: any `_unreadable_fields` populated → "Zone X has unreadable fields; supply them at restore or accept live values"
- [x] 2.3 Caveat: any `schedule_adjustment_ids` referenced → "Snapshot references reusable schedule N; verify it still exists before restore"
- [x] 2.4 Caveat: any `custom` sensor types referenced → "Custom sensor types must be re-created and may receive new IDs"
- [x] 2.5 Caveat: program_mode mismatch warning if applicable — emit ADVANCED-mode caveat when applicable, plus hardware re-wiring caveat for any captured sensors and unit-pref drift caveat for watering triggers (added beyond the spec — both surfaced as real risks during implementation).

## 3. Snapshot envelope extension

- [x] 3.1 Update `ControllerSnapshotV3` interface in `src/tools/backup.ts` to include `_restore_recipe: RestoreRecipe[]` and `_caveats: string[]` at the top level — renamed to `ControllerSnapshotV5` (Phase 2 bumped to V3, Phase 3 bumped to V4, Phase 4 bumps to V5).
- [x] 3.2 In `dump_controller_snapshot`, after assembling the `controller` portion, call `buildRestoreRecipe` and `buildRestoreCaveats`, attach to envelope — wired via baseEnvelope spread + recipe/caveats compute step.
- [x] 3.3 Bump `snapshot_version` to 3 (informational) — bumped to 5 (spec was written before Phases 2-3 ate intervening versions).
- [x] 3.4 Update `dump_controller_snapshot` description — describes _restore_recipe + _caveats blocks and points at the restore-irrigation-backup skill.

## 4. Skill files

### 4.A — Restore skill

- [x] 4.A.1 Create `.claude/skills/restore-irrigation-backup.md` — created at `.claude/skills/restore-irrigation-backup/SKILL.md` (matches existing OpenSpec skill convention).
- [x] 4.A.2 Document trigger phrases: "restore my irrigation backup", "apply this snapshot", "restore from snapshot"
- [x] 4.A.3 Document inputs: snapshot file path or pasted JSON content
- [x] 4.A.4 Document workflow: load → verify target controller → diff zones (name+number) → walk recipe → preview each step → confirm with user → execute → report
- [x] 4.A.5 Document `_caveats` handling: present up-front, require acknowledgment
- [x] 4.A.6 Document failure handling: fail-fast, report the failed step, leave the controller in whatever state was achieved
- [x] 4.A.7 Document the "capture-fresh-snapshot-before-restore" rule as a savepoint
- [x] 4.A.8 Document the unit-mismatch refusal: if `_caveats` includes a unit-pref mismatch, restore halts until reconciled

### 4.B — Capture skill

- [x] 4.B.1 Create `.claude/skills/capture-irrigation-snapshot.md` — created at `.claude/skills/capture-irrigation-snapshot/SKILL.md`.
- [x] 4.B.2 Document trigger phrases: "back up my irrigation", "snapshot my controller", "capture irrigation state"
- [x] 4.B.3 Document inputs: required `controller_id`, optional `output_dir` (default `snapshots/`)
- [x] 4.B.4 Document workflow:
    1. Call `dump_controller_snapshot(controller_id)`
    2. Write snapshot JSON to `<output_dir>/<controller-name>-<controller-id>-<ISO-timestamp>Z.json`
    3. Inspect `<output_dir>/history/` for prior report matching this controller; determine delta range
    4. Call `get_watering_report(controller_id, from, until)`
    5. Write report JSON to `<output_dir>/history/<controller-id>-<from-date>_to_<until-date>.json`
    6. Report captured coverage
- [x] 4.B.5 Document filename conventions (sortable ISO timestamps, controller-id namespacing for multi-controller accounts)
- [x] 4.B.6 Document the rationale: Hydrawise only retains ~1 year of report data; per-snapshot delta capture builds permanent multi-year history

## 5. Tests

- [x] 5.1 Unit tests for `buildRestoreRecipe` with several fixtures: STANDARD-only snapshot, ADVANCED snapshot, snapshot with sensors, snapshot with custom sensor types, snapshot with notes — 14 cases including dedup of custom-type creation, depends_on threading, ADVANCED-mode skip behavior.
- [x] 5.2 Unit tests for `buildRestoreCaveats` covering each caveat condition — 7 cases (no caveats baseline, unreadable fields, reusable schedule ids, custom sensor types, ADVANCED mode, hardware re-wiring, unit-pref drift).
- [x] 5.3 Integration test: `tests/integration/snapshot-roundtrip.test.ts`. Stand up a `fakeApi` with rich state; call `dump_controller_snapshot`; for each step in the resulting `_restore_recipe`, call the named tool with `args` and `preview: true`; assert each preview matches what the snapshot says — 5 cases. update_zone_settings deliberately skipped (its args contain documented nulls for unreadable fields the AI must merge; the gap is asserted by the recipe builder's `notes` field, not by Zod-passing args).
- [x] 5.4 Integration test asserting `_restore_recipe` references only tool names that exist in the registered tool catalog (catches typos / removed tools) — folded into 5.3 as the first test in the round-trip suite.

## 6. Documentation

- [x] 6.1 Update CLAUDE.md "Restore-from-backup" section: explain the embedded `_restore_recipe` and `_caveats` blocks; link to the skill — added new sub-section explaining the recipe shape, caveats categories, skill workflow, and the round-trip test rationale.
- [x] 6.2 Add a section to README explaining the snapshot/restore workflow at user-level — extended existing "Backup" section to "Backup and restore" with skill descriptions and the no-monolithic-restore-tool rationale.
- [x] 6.3 Update CLAUDE.md MCP tools description for `dump_controller_snapshot` to mention the restore-recipe block — Backup section in CLAUDE.md now describes _restore_recipe + _caveats and version history v2-v5.
