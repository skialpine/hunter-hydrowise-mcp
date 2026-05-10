## Why

Hydrawise controllers run in one of two modes — `STANDARD` or `ADVANCED` (`Controller.programMode`) — and the data model differs significantly. The shipped server has full support for STANDARD mode (programs with start times + per-zone run-time groups, edited via `updateStandardProgram`). For ADVANCED mode, **the read path is missing entirely**: the snapshot has no understanding of `AdvancedProgram` records, and there is no `get_advanced_program` tool. Per CLAUDE.md: *"Advanced support is partial: per-zone settings work, but the per-zone schedule edit path isn't fully wired."*

Without ADVANCED mode reads, the snapshot tool silently drops half of the schedule for ADVANCED-mode controllers. A user with an ADVANCED account who runs `dump_controller_snapshot` today gets the controller meta and zone settings but **no schedule** — the `controller.programs[]` array would be populated by `getPrograms`, but our existing `getStandardProgram` filter rejects non-Standard `__typename` values, so AdvancedProgram entries don't get expanded.

Restore for ADVANCED accounts is therefore impossible today.

This change adds the read paths and the small write surface that ADVANCED needs (the existing per-zone `update_zone_settings` plus the watering-program subtype tools, which already exist, are most of what's needed). The new piece is the `update_controller_program_mode` tool added in Phase 1, plus reads.

## What Changes

- Add `AdvancedProgramRead` TypeScript type to `src/hydrawise/queries.ts` matching the schema's `AdvancedProgram implements Program` shape (id, name, schedulingMethod, monthlyWateringAdjustments, zoneSpecific, appliesToZones, advancedProgramId, scope, wateringFrequency, runTimeGroup).
- Add `getAdvancedProgram(controllerId, programId)` to `HydrawiseApi`, mirroring the existing `getStandardProgram` path.
- Extend `get_program` tool to dispatch on `program_type`: when `program_type === 'Advanced'`, call `getAdvancedProgram` and serialize the result.
- Extend `ZONE_FULL_QUERY` to include `wateringSettings.advancedProgram { id, name, ... }` for ADVANCED-mode zones, behind the `... on AdvancedWateringSettings` fragment we already use.
- Extend `dump_controller_snapshot` to dispatch by `controller.programMode`: STANDARD branch uses the existing path; ADVANCED branch uses the new reads. Snapshot envelope grows a small `controller.advanced_programs[]` field for ADVANCED controllers, populated with the inlined `AdvancedProgram` details.
- Add **WateringProgram subtype reads** for the existing Time/Smart/VirtualSolarSync programs (we have the write paths only). This lets the snapshot capture each zone's per-zone advanced watering program configuration in a restorable shape.

## Capabilities

### Modified Capabilities
- `irrigation-scheduling`: `get_program` now supports `program_type: Advanced`. Snapshot includes Advanced program details for ADVANCED-mode controllers.
- `irrigation-backup`: snapshot dispatches by `programMode`; ADVANCED branch populates `controller.advanced_programs` and per-zone `advanced_program` references.

## Impact

- `src/hydrawise/queries.ts`: `AdvancedProgramRead` interface, `WateringProgramRead` (Time/Smart/VSS) interfaces, `ADVANCED_PROGRAM_QUERY`, extended `ZONE_FULL_QUERY` with the AdvancedWateringSettings fragment expanded.
- `src/hydrawise/api.ts`: `getAdvancedProgram(controllerId, programId)` method.
- `src/tools/serializers.ts`: `serializeAdvancedProgram`, `serializeWateringProgramRead` (for the per-zone advanced program reference).
- `src/tools/scheduling.ts`: extend `get_program` tool's dispatch to call `getAdvancedProgram` when `program_type === 'Advanced'`.
- `src/tools/backup.ts`: extend `dump_controller_snapshot` to branch by `programMode` and populate `controller.advanced_programs` for ADVANCED.
- Tests: serializer tests for the new shapes; `getStandardProgram` / `getAdvancedProgram` dispatch test; integration test for `get_program` with `program_type: Advanced` against a fake API.
- Documentation: CLAUDE.md "Programming modes" table updated to mark ADVANCED as supported.

This change has **no new write tools** — every needed write already exists (`update_zone_settings`, `update_controller_program_mode` (added in Phase 1), `create/update/delete_watering_program` (already shipped) for the Time/Smart/VSS subtypes). The gap was reads only.

This change cannot be tested end-to-end against the dev account (Heller Tufts is STANDARD). It ships schema-correct and unit-tested; an integration test against a real ADVANCED controller is a follow-up.
