## 1. Schema queries / mutations

- [ ] 1.1 Replace `UPDATE_ZONE_MUTATION` in `src/hydrawise/queries.ts` with `UPDATE_ZONE_ADVANCED_MUTATION`, declaring the four new monitoring args and matching `updateZoneAdvanced`'s argument shapes (note `cycleSoakEnable: Boolean`, `runNextAvailableStartTime: Boolean`, `currentMonitoringValue: Int`, `flowMonitoringValue: Float`)
- [ ] 1.2 Add `SET_BASELINE_VALUES_MUTATION` for `setBaselineValues(zoneId, flowMonitoringMethod, currentMonitoringMethod, flowMonitoringValue?, currentMonitoringValue?): StatusCodeAndSummary!`
- [ ] 1.3 Extend `ZONE_FULL_QUERY` to include `monitoringSettings { operatingRanges { waterFlowRate { value } electricCurrent { value } } measuredMedians { waterFlowRate { value } electricCurrent { value } } }`
- [ ] 1.4 Update the `ZoneRichRead` interface for the new monitoring read fields
- [ ] 1.5 Update `ZoneWritable` interface: change `cycle_soak_enable` and `run_next_available_start_time` to `boolean`; add `flow_monitoring_method` / `current_monitoring_method` (`'MANUAL' | 'LEARN_FROM_NEXT_RUN' | null`), `flow_monitoring_value` (`number | null`), `current_monitoring_value` (`number | null`)

## 2. HydrawiseApi

- [ ] 2.1 Update `updateZone` (rename internal method to `updateZoneAdvanced` for clarity) to dispatch the new mutation and map writable → camelCase variables (including the four new monitoring fields and the boolean shape changes)
- [ ] 2.2 Add `setBaselineValues(payload)` returning `StatusCodeAndSummary` — uses `client.mutate` since the upstream returns `StatusCodeAndSummary!`
- [ ] 2.3 Update existing `start_zone`/`start_all_zones` API methods to accept and forward `learnCurrentFromNextRun` and `learnFlowFromNextRun` boolean args. Add the args to the corresponding mutation strings (`START_ZONE_MUTATION`, `START_ALL_ZONES_MUTATION`)

## 3. Tools (irrigation-scheduling)

- [ ] 3.1 In `src/tools/scheduling.ts`, update `update_zone_settings` Zod input schema: change `cycle_soak_enable` and `run_next_available_start_time` to `z.boolean()`, add the four monitoring fields as optional with `z.enum(['MANUAL', 'LEARN_FROM_NEXT_RUN'])` for the methods
- [ ] 3.2 Update the call site to dispatch `api.updateZoneAdvanced` and report the operation as `updateZoneAdvanced` in preview output
- [ ] 3.3 Update `serializeZoneSettings` to emit `cycle_soak_enable` as boolean (true/false), include the four monitoring fields (each `null` since the read schema doesn't expose them directly), and a new `monitoring_observed` block with the read-only `operating_ranges` and `measured_medians` translated from `LocalizedValueType` to bare numbers
- [ ] 3.4 Add `set_zone_baseline` tool with input `{ zone_id, flow_monitoring_method, current_monitoring_method, flow_monitoring_value?, current_monitoring_value?, preview? }` (both methods required); description prefixed `PHYSICAL ACTION:`; supports `preview: true`
- [ ] 3.5 Register `set_zone_baseline` in `registerSchedulingTools`

## 4. Tools (irrigation-control)

- [ ] 4.1 In `src/tools/control.ts`, extend `start_zone` Zod input with optional `learn_current_from_next_run` and `learn_flow_from_next_run` booleans
- [ ] 4.2 Update the `start_zone` call site to forward the new flags to `api.startZone`
- [ ] 4.3 Same extension for `start_all_zones`
- [ ] 4.4 Update tool descriptions to mention the optional learn flags

## 5. Snapshot

- [ ] 5.1 No code change in `src/tools/backup.ts` is needed — `dump_controller_snapshot` already calls `api.getZoneFull` and inserts whatever `serializeZoneSettings` returns. Verify the snapshot envelope picks up `monitoring_observed` per zone after task 3.3 lands.

## 6. Tests

- [ ] 6.1 Unit test in `tests/unit/api.test.ts`: `updateZoneAdvanced` dispatches with the right camelCase variables when given a writable payload that includes the four monitoring fields
- [ ] 6.2 Unit test: `setBaselineValues` API method dispatches the correct mutation with method enums and optional values
- [ ] 6.3 Unit test in `tests/unit/scheduling.test.ts`: `set_zone_baseline` Zod rejects unknown method strings; `runTool` returns an `isError: true` Tool Execution Error
- [ ] 6.4 Unit test that `start_zone` forwards `learn_flow_from_next_run: true` to `api.startZone` as `learnFlowFromNextRun: true`
- [ ] 6.5 Update the integration tool-list test in `tests/integration/http.test.ts` to include `set_zone_baseline`
- [ ] 6.6 Snapshot serializer test: assert `monitoring_observed` appears in `serializeZoneSettings` output

## 7. Documentation

- [ ] 7.1 Bump `package.json` version to `0.3.0`
- [ ] 7.2 README "Schedule editing" section: add a paragraph describing `set_zone_baseline`, the `*_monitoring_*` writable fields, and the `learn_*_from_next_run` flags on `start_zone` / `start_all_zones`
- [ ] 7.3 README tool catalog: add `set_zone_baseline` (PHYSICAL ACTION) and note the new args on `start_zone` / `start_all_zones`
- [ ] 7.4 CLAUDE.md: reference `schema/hydrawise.live.graphql` as the canonical schema source, and `scripts/probe-schema.ts` as the way to refresh it; note that the cached pydrawise schema is no longer authoritative

## 8. Manual verification

- [ ] 8.1 `npm run build` succeeds; `tools/list` includes `set_zone_baseline` and the `start_zone` / `start_all_zones` tools have `learn_current_from_next_run` and `learn_flow_from_next_run` in their input schemas
- [ ] 8.2 `get_zone_settings` against the user's account (e.g. zone 2063113) returns a `monitoring_observed` block populated with `operating_ranges` and `measured_medians` — **deferred for user verification**
- [ ] 8.3 `update_zone_settings` with `preview: true` against a real zone returns the planned `updateZoneAdvanced` payload — **deferred for user verification**
- [ ] 8.4 `set_zone_baseline` with `preview: true` returns the planned `setBaselineValues` payload — **deferred for user verification**
- [ ] 8.5 Once previews look correct: run a real `start_zone` with `learn_flow_from_next_run: true` for 1 minute on a test zone, verify the GUI shows the learn-flow flag enabled — **deferred for user verification**
- [ ] 8.6 `openspec validate add-zone-monitoring` passes
