## 1. Schema reads — types and queries

- [ ] 1.1 Add `AdvancedProgramRead` TypeScript interface in `src/hydrawise/queries.ts`: `{ __typename, id, name, schedulingMethod, monthlyWateringAdjustments, zoneSpecific, appliesToZones, advancedProgramId, scope, wateringFrequency: { period: { value, label }, label, description }, runTimeGroup: { id, name, duration } }`
- [ ] 1.2 Add `WateringProgramRead` TypeScript interface for the Time/Smart/VSS reference per zone (matches `WateringProgram` type minus deprecated fields)
- [ ] 1.3 Add `ADVANCED_PROGRAM_QUERY` — fetches a single Advanced program by id via `controller(controllerId).programs(includeZoneSpecific: true)` filtered client-side by id+`__typename === 'AdvancedProgram'`, mirroring the STANDARD path
- [ ] 1.4 Extend `ZONE_FULL_QUERY` to include `... on AdvancedWateringSettings { advancedProgram { id, name, advancedProgramId } }` so ADVANCED-mode zones surface the program reference
- [ ] 1.5 Extend `PROGRAMS_FULL_QUERY` to add the `... on AdvancedProgram { ... }` fragment alongside the existing `... on StandardProgram` fragment

## 2. API layer

- [ ] 2.1 Add `HydrawiseApi.getAdvancedProgram(controllerId: number, programId: number): Promise<AdvancedProgramRead | null>` mirroring the existing `getStandardProgram`
- [ ] 2.2 Update `getZoneFull` typed result to include the optional `advancedProgram` field on `wateringSettings` (will be null for STANDARD zones)
- [ ] 2.3 Update `getPrograms` typed result so `program_type` correctly returns `"AdvancedProgram"` for AdvancedProgram entries (already happens via `__typename`; verify)

## 3. Serializers

- [ ] 3.1 Add `serializeAdvancedProgram(p: AdvancedProgramRead)` — flat snake_case shape with `id`, `name`, `advanced_program_id`, `scope`, `zone_specific`, `monthly_watering_adjustments`, `scheduling_method`, `watering_frequency: { period_value, period_label, label, description }`, `run_time_group: { id, name, duration_minutes }`, `applies_to_zones`
- [ ] 3.2 Add `serializeAdvancedProgramReference(p)` for the per-zone short reference: `{ id, name, advanced_program_id }`
- [ ] 3.3 Extend `serializeZoneSettings` to include `advanced_program` (the reference shape) when `wateringSettings.advancedProgram` is present, otherwise omit (STANDARD zones)

## 4. Tool layer

- [ ] 4.1 Extend `get_program` in `src/tools/scheduling.ts` to remove the "only Standard is implemented" guard. Dispatch: `program_type === 'Standard'` → existing path; `program_type === 'Advanced'` → `getAdvancedProgram` + `serializeAdvancedProgram`
- [ ] 4.2 Update tool description to reflect that Advanced is now supported

## 5. Snapshot extension

- [ ] 5.1 In `dump_controller_snapshot`, after `getController(controller_id)`, branch on `controller.program_mode`:
  - `STANDARD`: existing path (Phase 1 already inlines StandardProgram details)
  - `ADVANCED`: for each program returned by `getPrograms`, call `getAdvancedProgram(controller_id, program.id)` in parallel; collect into `advancedPrograms[]`. Add to envelope as `controller.advanced_programs`. Extend per-zone settings to include `advanced_program` reference (already populated by extended `getZoneFull` from task 1.4)
- [ ] 5.2 Update `ControllerSnapshotV2` (or current version) interface to reflect the optional `advanced_programs` field
- [ ] 5.3 Bump `snapshot_version` (informational)

## 6. Tests

- [ ] 6.1 Unit test for `serializeAdvancedProgram` round-trip with a fixture matching the live schema
- [ ] 6.2 Unit test for `serializeZoneSettings` correctly populating `advanced_program` reference when the `wateringSettings` is an `AdvancedWateringSettings`
- [ ] 6.3 Unit test for `getAdvancedProgram` dispatch (no live API, just query variable shape correctness)
- [ ] 6.4 Integration test: `get_program(program_type: Advanced)` against a fake API that returns an AdvancedProgram; assert the serialized output shape
- [ ] 6.5 Integration test: `dump_controller_snapshot` against a fake API where `controller.programMode === 'ADVANCED'` and at least one zone uses `AdvancedWateringSettings` with an `advancedProgram` reference; assert `controller.advanced_programs[]` and per-zone `advanced_program` are populated

## 7. Documentation

- [ ] 7.1 Update CLAUDE.md "Programming modes" table: mark ADVANCED row as "supported (read + restore via per-zone updates)"
- [ ] 7.2 Add CLAUDE.md gotcha: AdvancedProgram has no direct mutation; its state is derived from per-zone watering frequency configuration. Restore is achieved via `update_zone_settings` + `create/update_watering_program` for the referenced WateringProgram subtype.
- [ ] 7.3 Document the limitation: ADVANCED-mode reads have not been validated against a real ADVANCED controller (Heller Tufts is STANDARD). Recommend the next ADVANCED-account user run a snapshot and verify against the GUI.
