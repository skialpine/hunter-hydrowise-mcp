## 1. Schema reads — types and queries

- [x] 1.1 Add `AdvancedProgramRead` TypeScript interface in `src/hydrawise/queries.ts`: `{ __typename, id, name, schedulingMethod, monthlyWateringAdjustments, zoneSpecific, appliesToZones, advancedProgramId, scope, wateringFrequency: { period: { value, label }, label, description }, runTimeGroup: { id, name, duration } }` — also added `AdvancedProgramReferenceRead` for the per-zone short reference.
- [x] 1.2 Add `WateringProgramRead` TypeScript interface for the Time/Smart/VSS reference per zone (matches `WateringProgram` type minus deprecated fields) — N/A for v4: per-zone `programStartTimes` already covered by existing query; the WateringProgram subtype lives behind `advancedProgramId` cross-reference and is fetched via the existing `list_programs` / `get_program` paths.
- [x] 1.3 Add `ADVANCED_PROGRAM_QUERY` — fetches a single Advanced program by id via `controller(controllerId).programs(includeZoneSpecific: true)` filtered client-side by id+`__typename === 'AdvancedProgram'`, mirroring the STANDARD path — implemented by extending `PROGRAMS_FULL_QUERY` with the `... on AdvancedProgram` fragment so a single query covers both subtypes (avoids two parallel queries).
- [x] 1.4 Extend `ZONE_FULL_QUERY` to include `... on AdvancedWateringSettings { advancedProgram { id, name, advancedProgramId } }` so ADVANCED-mode zones surface the program reference
- [x] 1.5 Extend `PROGRAMS_FULL_QUERY` to add the `... on AdvancedProgram { ... }` fragment alongside the existing `... on StandardProgram` fragment

## 2. API layer

- [x] 2.1 Add `HydrawiseApi.getAdvancedProgram(controllerId: number, programId: number): Promise<AdvancedProgramRead | null>` mirroring the existing `getStandardProgram`
- [x] 2.2 Update `getZoneFull` typed result to include the optional `advancedProgram` field on `wateringSettings` (will be null for STANDARD zones) — done via `ZoneRichRead.wateringSettings.advancedProgram?` in queries.ts.
- [x] 2.3 Update `getPrograms` typed result so `program_type` correctly returns `"AdvancedProgram"` for AdvancedProgram entries (already happens via `__typename`; verify) — verified: api.ts:367-370 normalises `__typename: 'AdvancedProgram'` to `program_type: 'Advanced'`.

## 3. Serializers

- [x] 3.1 Add `serializeAdvancedProgram(p: AdvancedProgramRead)` — flat snake_case shape with `id`, `name`, `advanced_program_id`, `scope`, `zone_specific`, `monthly_watering_adjustments`, `scheduling_method`, `watering_frequency: { period_value, period_label, label, description }`, `run_time_group: { id, name, duration_minutes }`, `applies_to_zones`
- [x] 3.2 Add `serializeAdvancedProgramReference(p)` for the per-zone short reference: `{ id, name, advanced_program_id }`
- [x] 3.3 Extend `serializeZoneSettings` to include `advanced_program` (the reference shape) when `wateringSettings.advancedProgram` is present, otherwise `null` (STANDARD zones) — chose `null` over omission to match the project's "every documented field appears as null OR a typed value, never key-absent" snapshot convention.

## 4. Tool layer

- [x] 4.1 Extend `get_program` in `src/tools/scheduling.ts` to remove the "only Standard is implemented" guard. Dispatch: `program_type === 'Standard'` → existing path; `program_type === 'Advanced'` → `getAdvancedProgram` + `serializeAdvancedProgram` — also refactored the Standard branch to use the shared `serializeStandardProgram` helper instead of inlining the shape, eliminating duplication and gaining `valid_from/to` + `schedule_adjustment_ids` automatically.
- [x] 4.2 Update tool description to reflect that Advanced is now supported

## 5. Snapshot extension

- [x] 5.1 In `dump_controller_snapshot`, after `getController(controller_id)`, branch on `controller.program_mode`:
  - `STANDARD`: existing path (Phase 1 already inlines StandardProgram details)
  - `ADVANCED`: for each program returned by `getPrograms`, call `getAdvancedProgram(controller_id, program.id)` in parallel; collect into `advancedPrograms[]`. Add to envelope as `controller.advanced_programs`. Extend per-zone settings to include `advanced_program` reference (already populated by extended `getZoneFull` from task 1.4) — Implemented as a unified loop that dispatches per-program on `program_type` rather than branching at the controller level: each Standard program inlines via Standard path, each Advanced program inlines via Advanced path. The Advanced inlined entries are also collected into a dedicated `controller.advanced_programs[]` for AI consumers that want to scan just one subtype. Same integrity-violation guard as the Standard path: a missing AdvancedProgram triggers `HydrawiseAPIError`.
- [x] 5.2 Update `ControllerSnapshotV2` (or current version) interface to reflect the optional `advanced_programs` field — renamed to `ControllerSnapshotV4` (no V3 alias retained, per the lesson from the previous V2-alias false-friend).
- [x] 5.3 Bump `snapshot_version` (informational) — bumped 3 → 4

## 6. Tests

- [x] 6.1 Unit test for `serializeAdvancedProgram` round-trip with a fixture matching the live schema — 4 test cases (full shape, null run_time_group, null period members, program_type discriminator).
- [x] 6.2 Unit test for `serializeZoneSettings` correctly populating `advanced_program` reference when the `wateringSettings` is an `AdvancedWateringSettings` — 3 cases including null fallback for STANDARD zones and missing wateringSettings.
- [x] 6.3 Unit test for `getAdvancedProgram` dispatch (no live API, just query variable shape correctness) — 5 cases: dispatch shape, correct type returned, null for wrong-type id, null for missing id, HydrawiseNotFoundError for null controller.
- [x] 6.4 Integration test: `get_program(program_type: Advanced)` against a fake API that returns an AdvancedProgram; assert the serialized output shape — 2 cases: success path and config_error when the id isn't Advanced.
- [x] 6.5 Integration test: `dump_controller_snapshot` against a fake API where `controller.programMode === 'ADVANCED'` and at least one zone uses `AdvancedWateringSettings` with an `advancedProgram` reference; assert `controller.advanced_programs[]` and per-zone `advanced_program` are populated — 2 cases: ADVANCED happy path and STANDARD-mode confirmation that advanced fields are empty/null.

## 7. Documentation

- [x] 7.1 Update CLAUDE.md "Programming modes" table: mark ADVANCED row as "supported (read + restore via per-zone updates)" — table extended with snapshot-coverage row showing v4 ADVANCED inlining.
- [x] 7.2 Add CLAUDE.md gotcha: AdvancedProgram has no direct mutation; its state is derived from per-zone watering frequency configuration. Restore is achieved via `update_zone_settings` + `create/update_watering_program` for the referenced WateringProgram subtype.
- [x] 7.3 Document the limitation: ADVANCED-mode reads have not been validated against a real ADVANCED controller (Heller Tufts is STANDARD). Recommend the next ADVANCED-account user run a snapshot and verify against the GUI — added as both a gotcha and a note in the Programming modes section.
