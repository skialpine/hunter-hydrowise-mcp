## 1. Schema reads (extend the GraphQL surface)

- [x] 1.1 Add `ZONE_SETTINGS_QUERY` to `src/hydrawise/queries.ts` selecting the writable `Zone` fields (`runTime`, `wateringMode`, `wateringFrequencyMode`, `fixedWateringFrequency`, `smartWateringFrequency`, `cycleSoakEnable`, `cycleCustomTime`, `soakCustomTime`, `wateringAdjustment`, `factors`, `name`, `number`, `globalMasterValve`, `wateringType`, `scheduleAdjustmentIds`, `runNextAvailableStartTime`, `preConfiguredWateringScheduleId`, `sensorIds`)
- [x] 1.2 Add the corresponding `ZoneSettings` TypeScript interface in `queries.ts`
- [x] 1.3 Add `PROGRAMS_QUERY` selecting the union of program shapes — Standard programs and the three Watering-program subtypes — using GraphQL inline fragments. Each result entry must carry enough fields to reconstruct an `update*` payload.
- [x] 1.4 Add discriminated TypeScript types for `Program` (Standard / Time / Smart / VirtualSolarSync) keyed by `program_type`
- [x] 1.5 Add `STANDARD_PROGRAM_QUERY` and `WATERING_PROGRAM_QUERY` for single-program detail (used by `update_*` tools to fetch-then-merge)
- [x] 1.6 Add `PROGRAM_START_TIMES_QUERY` (verify exact path; likely `Controller.permittedProgramStartTimes` or equivalent)
- [x] 1.7 Add the `ProgramStartTime` interface
- [x] 1.8 Add `SEASONAL_ADJUSTMENTS_QUERY` (verify path on schema)
- [x] 1.9 Add `WATERING_TRIGGERS_QUERY` selecting every field on `WateringTriggers` writable via `updateWateringTriggers`
- [x] 1.10 Add the `WateringTriggers` interface

## 2. Schema mutations (extend the GraphQL surface)

- [x] 2.1 Add `UPDATE_ZONE_MUTATION` mirroring `updateZone` (full-replace, every required field present)
- [x] 2.2 Add `UPDATE_SEASONAL_ADJUSTMENTS_MUTATION`
- [x] 2.3 Add `CREATE_PROGRAM_START_TIME_MUTATION`, `UPDATE_PROGRAM_START_TIME_MUTATION`, `DELETE_PROGRAM_START_TIME_MUTATION`
- [x] 2.4 Add `CREATE_STANDARD_PROGRAM_MUTATION`, `UPDATE_STANDARD_PROGRAM_MUTATION`, `DELETE_STANDARD_PROGRAM_MUTATION`
- [x] 2.5 Add `CREATE_TIME_WATERING_PROGRAM_MUTATION`, `CREATE_SMART_WATERING_PROGRAM_MUTATION`, `CREATE_VSS_WATERING_PROGRAM_MUTATION`
- [x] 2.6 Add `UPDATE_TIME_WATERING_PROGRAM_MUTATION`, `UPDATE_SMART_WATERING_PROGRAM_MUTATION`, `UPDATE_VSS_WATERING_PROGRAM_MUTATION`
- [x] 2.7 Add `REMOVE_WATERING_PROGRAM_MUTATION`
- [x] 2.8 Add `UPDATE_WATERING_TRIGGERS_MUTATION`
- [x] 2.9 Confirm each mutation's return type (most are `StatusCodeAndSummary`, some return the entity, some return `Boolean`/`Int`); unify into a typed result the MCP layer can serialize

## 3. HydrawiseApi expansions

- [x] 3.1 `getZoneSettings(zoneId)` and `updateZone(payload)` (full payload)
- [x] 3.2 `getPrograms(controllerId)` returning the discriminated unified list
- [x] 3.3 `getStandardProgram(programId)` and `getWateringProgram(programId, programType)` for fetch-then-merge
- [x] 3.4 `createStandardProgram`, `updateStandardProgram`, `deleteStandardProgram`
- [x] 3.5 `createWateringProgram(programType, payload)` (dispatches by subtype), `updateWateringProgram(programType, payload)`, `removeWateringProgram(programId)`
- [x] 3.6 `getProgramStartTimes`, `createProgramStartTime`, `updateProgramStartTime`, `deleteProgramStartTime`
- [x] 3.7 `getSeasonalAdjustments`, `updateSeasonalAdjustments`
- [x] 3.8 `getWateringTriggers`, `updateWateringTriggers`
- [x] 3.9 Mutations route through the existing `client.mutate` (or an extended variant for non-`StatusCodeAndSummary` returns) so failures map to `HydrawiseMutationError`

## 4. Snapshot tool (irrigation-backup)

- [x] 4.1 Create `src/tools/backup.ts` exporting `registerBackupTools(server, api)`
- [x] 4.2 Implement `dump_controller_snapshot({ controller_id })`: walks user → controller header → in parallel: zones with settings, programs, program start times, seasonal adjustments, watering triggers
- [x] 4.3 Wrap the snapshot result in the versioned envelope (`snapshot_version: 1`, `captured_at`, `server_version`, `user`, singular `controller`)
- [x] 4.4 Use `Promise.all` for the per-controller fan-out; first failure propagates and `runTool` maps it to `isError: true`
- [x] 4.5 Add a serializer for snapshot output (snake_case throughout, consistent with v1 conventions)
- [x] 4.6 Register `dump_controller_snapshot` in `src/server.ts` alongside the v1 tool registrations

## 5. Schedule read tools (irrigation-scheduling, read side)

- [x] 5.1 Create `src/tools/scheduling.ts` exporting `registerSchedulingTools(server, api)`
- [x] 5.2 Implement `get_zone_settings({ zone_id })` returning the snake_case settings object
- [x] 5.3 Implement `list_programs({ controller_id })` returning an array with `program_type` discriminator
- [x] 5.4 Implement `get_program({ program_id, program_type })` returning the per-type detail
- [x] 5.5 Implement `list_program_start_times({ controller_id })`
- [x] 5.6 Implement `get_seasonal_adjustments({ controller_id })` returning `{ factors: [12 ints] }`
- [x] 5.7 Implement `get_watering_triggers({ controller_id })` returning the trigger fields in snake_case

## 6. Shared write infrastructure

- [x] 6.1 Add `previewOrApply<TVars, TResult>(operation, variables, preview, apply)` helper in `src/tools/_helpers.ts` returning `{ preview: true, operation, variables }` for previews and `await apply()` otherwise
- [x] 6.2 Add a discriminator validator helper for the watering-program subtype (`Time | Smart | VirtualSolarSync`), routing through `runTool` on validation failure
- [x] 6.3 Add serializer helpers in `src/tools/serializers.ts` that translate read-shape values into writable-shape values: `SelectedOption.value` → bare int; `LocalizedValueType.value` → bare number; day-pattern enum arrays → seven `sunday..saturday` ints

## 7. Schedule write tools (irrigation-scheduling, write side)

All tools below take `preview?: boolean` and the **full** writable payload that the upstream mutation requires. None fetch-and-merge; the AI is expected to produce the full payload from a recent `get_*` call (or snapshot). Each description begins with `PHYSICAL ACTION:`.

- [x] 7.1 `update_zone_settings({ zone_id, preview?, ...full updateZone payload })` — Zod-validated, dispatches `api.updateZone(payload)`
- [x] 7.2 `update_seasonal_adjustments({ controller_id, factors, preview? })` — Zod refinement: `factors.length === 12`
- [x] 7.3 `create_program_start_time({ controller_id, ...full payload, preview? })`, `update_program_start_time({ id, controller_id, ...full payload, preview? })`, `delete_program_start_time({ id, controller_id, preview? })`
- [x] 7.4 `create_standard_program({ controller_id, ...full payload, preview? })`, `update_standard_program({ program_id, controller_id, ...full payload, preview? })`, `delete_standard_program({ program_id, controller_id, preview? })`
- [x] 7.5 `update_watering_program({ program_id, program_type, ...full payload, preview? })` — dispatches the matching `update*WateringProgram` based on `program_type`
- [x] 7.6 `create_watering_program({ program_type, ...full payload, preview? })` — dispatches one of the three `create*WateringProgram` mutations
- [x] 7.7 `delete_watering_program({ program_id, preview? })` — wraps `removeWateringProgram`
- [x] 7.8 `update_watering_triggers({ controller_id, ...full payload, preview? })` — dispatches `updateWateringTriggers`
- [x] 7.9 Every write tool's description begins with the literal `PHYSICAL ACTION:`
- [x] 7.10 Register all of the above in `src/server.ts`

## 8. Tests

- [x] 8.1 Unit test `update_zone_settings`: full payload is dispatched verbatim to `api.updateZone`; missing required fields produce a Zod validation error routed through `runTool`
- [x] 8.2 Unit test `previewOrApply`: with `preview: true`, returns the planned payload and does NOT call `apply`; with `preview: false`, calls `apply` exactly once
- [x] 8.3 Unit test `update_seasonal_adjustments` Zod validation rejects arrays of length != 12 and routes the validation error through `runTool`
- [x] 8.4 Unit test the watering-program subtype dispatcher: `program_type: "Time"` calls `updateTimeBasedWateringProgram`, `Smart` → `updateSmartBasedWateringProgram`, `VirtualSolarSync` → `updateVirtualSolarSyncWateringProgram`, unknown → validation error
- [x] 8.5 Unit test the snapshot serializer: assert the envelope contains `snapshot_version: 1`, `captured_at` ISO-8601, singular `controller`, all expected sub-arrays/objects
- [x] 8.6 Unit test that `dump_controller_snapshot` uses only `client.query` (no mutations); inspect the fake client's mutate call list and assert it's empty
- [x] 8.7 HTTP integration test: call `tools/list` and assert all new tool names are present (`dump_controller_snapshot`, `get_zone_settings`, `update_zone_settings`, `list_programs`, `get_program`, `create_standard_program`, `update_standard_program`, `delete_standard_program`, `create_watering_program`, `update_watering_program`, `delete_watering_program`, `list_program_start_times`, `create_program_start_time`, `update_program_start_time`, `delete_program_start_time`, `get_seasonal_adjustments`, `update_seasonal_adjustments`, `get_watering_triggers`, `update_watering_triggers`)
- [x] 8.8 HTTP integration test: call `update_zone_settings` with `preview: true` over the wire; assert no mutation is dispatched (via mocked api) and the response payload contains `preview: true`
- [x] 8.9 Negative test: write tool whose upstream returns `status: ERROR, summary: "..."` produces an `isError: true` result whose text contains the summary
- [x] 8.10 HTTP integration test: every write tool returned by `tools/list` has a `description` starting with `PHYSICAL ACTION:`

## 9. Documentation

- [x] 9.1 Bump `package.json` version to `0.2.0`
- [x] 9.2 Update README: add a "Backup" section explaining `dump_controller_snapshot`, the per-controller envelope shape, and how to persist via filesystem MCP / copy-paste
- [x] 9.3 Update README: add a "Schedule editing" section explaining the read+write pairing, the `preview: true` flow, and the recommended snapshot cadence — take a `dump_controller_snapshot` **before** a change session (as a rollback point) and **after** it (as a record of the new desired state for future diffs)
- [x] 9.4 Update README tool catalog table with the new tools, marking writes as `PHYSICAL ACTION:`
- [x] 9.5 Update CLAUDE.md tool count and any layout references
- [x] 9.6 Note in the README that creating/deleting **zones** is intentionally still out of scope (programs are now in scope)
- [x] 9.7 Note that for a multi-controller account, run `dump_controller_snapshot` once per controller to back up everything

## 10. Manual verification

- [x] 10.1 `npm run build` succeeds; new bin launches; integration test confirms `tools/list` exposes all 13 v1 tools + 18 new tools (31 total)
- [ ] 10.2 `dump_controller_snapshot(controller_id)` against the real account returns a JSON object with the full controller envelope — **deferred for user verification**
- [ ] 10.3 `get_zone_settings` against a real zone returns expected settings; the response keys match those `update_zone_settings` accepts — **deferred for user verification**
- [ ] 10.4 `list_programs` returns the user's actual programs; identify their subtype(s) — **deferred for user verification**
- [ ] 10.5 `update_zone_settings` with `preview: true` against a real zone returns the planned payload without changing anything in the Hydrawise app — **deferred for user verification**
- [ ] 10.6 `update_seasonal_adjustments` with `preview: true` returns a valid payload — **deferred for user verification**
- [ ] 10.7 Once previews look correct: run one real `update_zone_settings` change (e.g. `+1 minute` on a test zone), confirm in the Hydrawise app, revert — **deferred for user verification**
- [ ] 10.8 Run `update_program_start_time` with `preview: true`, then a real change, then revert — **deferred for user verification**
- [ ] 10.9 Run `update_<standard|watering>_program` (matching whatever subtype the user has) with `preview: true`, then a real low-impact change, then revert — **deferred for user verification**
- [x] 10.10 `openspec validate add-schedule-management` passes
