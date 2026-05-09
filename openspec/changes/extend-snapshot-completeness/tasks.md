## 1. Schema and types — extend reads

- [x] 1.1 Extend `CONTROLLER_FIELDS` in `src/hydrawise/queries.ts` to include `location { coordinates { latitude, longitude }, address, country, state, locality }`, `settings { timeZone { id, name }, zones { interZoneDelay, masterZone { zoneNumber { value }, delay, postTimer } } }`, `masterZone { zoneNumber { value }, delay, postTimer }`, `expanders { id, name, number, hardware { model { id }, firmware { type, version } } }`, `runTimeGroups { id, name, duration }`, `controllerNotes { id, note, type, pinnedToTop, lastUpdatedAt { value } }`, `hardware.modules { id, name, serialNumber, moduleType, firmwareVersion }`
- [x] 1.2 Extend `ZONE_FULL_QUERY` to include `masterValve`, `zoneNotes { id, note, type, pinnedToTop, lastUpdatedAt { value } }`
- [x] 1.3 Extend `PROGRAM_START_TIMES_QUERY` to select `wateringDays`
- [x] 1.4 Extend `PROGRAMS_FULL_QUERY` (or add a new sibling) to select `timeRange { validFrom, validTo }`, `conditionalWateringAdjustments(controllerId) { id, label }` on the StandardProgram fragment
- [x] 1.5 Add TypeScript interfaces for the new types (`LocationRead`, `ExpanderRead`, `RunTimeGroupRead`, `ControllerNoteRead`, `ZoneNoteRead`, `ModuleRead`, `MasterValveRead`, `TimeZoneRead`)

## 2. Schema and types — add mutation strings

- [x] 2.1 Add `UPDATE_LOCATION_MUTATION` and `UPDATE_LOCATION_COORDINATES_MUTATION`
- [x] 2.2 Add `UPDATE_CONTROLLER_MASTER_VALVE_MUTATION`
- [x] 2.3 Add `UPDATE_CONTROLLER_PROGRAM_MODE_MUTATION`
- [x] 2.4 Add `HIBERNATE_CONTROLLER_MUTATION` and `WAKE_CONTROLLER_MUTATION`
- [x] 2.5 Add `CREATE_EXPANDER_MUTATION`, `UPDATE_EXPANDER_MUTATION`, `DELETE_EXPANDER_MUTATION`
- [x] 2.6 Add note CRUD mutations: `CREATE/UPDATE/DELETE_CONTROLLER_NOTE_MUTATION`, `CREATE/UPDATE/DELETE_ZONE_NOTE_MUTATION`
- [x] 2.7 Add `CREATE_ZONE_ADVANCED_MUTATION` and `DELETE_ZONE_MUTATION` (the Advanced variant; the deprecated `createZone` is intentionally not wrapped)

## 3. API layer

- [x] 3.1 Update `Controller`, `Zone`, `ZoneRichRead` interfaces in `src/hydrawise/queries.ts` to reflect the extended read shapes
- [x] 3.2 Update `getController`, `getZoneFull` in `src/hydrawise/api.ts` to surface the new fields (the queries change will populate them automatically; the typed result shape just needs updating)
- [x] 3.3 Add `HydrawiseApi.updateLocation(deviceId, payload)` — accepts `{ address?, latitude?, longitude? }` and dispatches one or both upstream mutations; returns combined result
- [x] 3.4 Add `HydrawiseApi.updateControllerMasterValve(controllerId, zoneNumber)`
- [x] 3.5 Add `HydrawiseApi.updateControllerProgramMode(controllerId, mode)` — accepts `'STANDARD' | 'ADVANCED'`
- [x] 3.6 Add `HydrawiseApi.hibernateController(controllerId)` and `wakeController(controllerId)`
- [x] 3.7 Add `HydrawiseApi.createExpander / updateExpander / deleteExpander`
- [x] 3.8 Add note CRUD methods to `HydrawiseApi` (controller and zone variants)
- [x] 3.9 Add `HydrawiseApi.createZone(payload)` (wraps `createZoneAdvanced`) and `deleteZone(zoneId)` methods

## 4. Serializers

- [x] 4.1 Extend `serializeController` to include `location`, `time_zone`, `master_valve`, `expanders`, `modules`, `controller_notes`, `run_time_groups`
- [x] 4.2 Extend `serializeZoneSettings` to include `master_valve_override` (from `Zone.masterValve`), `zone_notes` array, and a top-level `_unreadable_fields` array listing the writable-but-not-readable field names
- [x] 4.3 Add `serializeLocation`, `serializeExpander`, `serializeRunTimeGroup`, `serializeNote` (covers both controller and zone notes)
- [x] 4.4 Update `serializeWateringTriggers` to emit `{ value, unit }` for every LocalizedValueType field (extend_water_temperature, suspend_water_*_, suspend_wind, reduce_water_temperature, etc.). Capture the unit string verbatim from the API.
- [x] 4.5 Update `serializeZoneSettings` `monitoring_observed` block to emit `{ value, unit }` for water_flow_rate and electric_current entries.
- [x] 4.6 Update `serializeRunSummaryDetails` `total_water_volume` to preserve `unit` (already does — verify).
- [x] 4.7 Update `serializeRunEvent` `reported_water_usage` and `reported_current` to preserve `unit` (verify already correct).

## 5. New write tools — `irrigation-controller-config`

- [x] 5.1 Create `src/tools/controllerConfig.ts` with `registerControllerConfigTools(server, api, logger)` export
- [x] 5.2 Implement `update_location` — accepts `controller_id`, optional `address`, optional `latitude`/`longitude`; at least one must be provided; preview shows the full payload of each underlying mutation
- [x] 5.3 Implement `update_controller_master_valve` — `controller_id` + `zone_number`
- [x] 5.4 Implement `update_controller_program_mode` — `controller_id` + `program_mode: 'STANDARD' | 'ADVANCED'`; preview supported
- [x] 5.5 Implement `hibernate_controller` and `wake_controller` — `controller_id` only
- [x] 5.6 Implement expander CRUD — `create/update/delete_expander`
- [x] 5.7 Implement `create_zone(controller_id, name, number, ...zone-config-fields)` — `PHYSICAL ACTION:`, preview. Wraps `createZoneAdvanced` with the same writable-zone shape as `update_zone_settings`.
- [x] 5.8 Implement `delete_zone(zone_id)` — `PHYSICAL ACTION:`, preview. Note in description that this is irreversible.
- [x] 5.9 Register the new tool group in `src/server.ts`'s `buildMcpServer`

## 6. New write + read tools — `irrigation-notes`

- [x] 6.1 Create `src/tools/notes.ts` with `registerNotesTools(server, api, logger)` export
- [x] 6.2 Implement `list_controller_notes(controller_id)` — read-only
- [x] 6.3 Implement `list_zone_notes(zone_id)` — read-only
- [x] 6.4 Implement `create_controller_note`, `update_controller_note`, `delete_controller_note` with preview
- [x] 6.5 Implement `create_zone_note`, `update_zone_note`, `delete_zone_note` with preview
- [x] 6.6 Register the new tool group in `src/server.ts`'s `buildMcpServer`

## 7. Snapshot tool — extend `dump_controller_snapshot`

- [x] 7.1 Update `ControllerSnapshotV1` (or rename to `ControllerSnapshotV2`) interface in `src/tools/backup.ts` to reflect the expanded shape; bump `SNAPSHOT_VERSION` to 2
- [x] 7.2 Inside `dump_controller_snapshot`, after `getPrograms`, call `getStandardProgram(controller_id, program.id)` for each Standard program in parallel; replace each thin entry with the full detail
- [x] 7.3 Surface `controller.location`, `controller.time_zone`, `controller.master_valve`, `controller.expanders`, `controller.modules`, `controller.controller_notes`, `controller.run_time_groups`, `controller.settings.zones.inter_zone_delay` in the envelope
- [x] 7.4 Surface per-zone `master_valve_override` and `zone_notes` in each zone entry
- [x] 7.5 Document the `_unreadable_fields` array in the snapshot envelope (per zone)
- [x] 7.6 Update tool description to reflect the new envelope contents

## 8. Tests

- [x] 8.1 Unit tests for `serializeLocation`, `serializeExpander`, `serializeNote`, `serializeRunTimeGroup`
- [x] 8.2 Unit tests for the extended `serializeController` and `serializeZoneSettings` (including `_unreadable_fields` array contents)
- [x] 8.3 Unit tests for new API methods (mutation variable shape) — at minimum `updateLocation` (both halves), `updateControllerMasterValve`, `updateControllerProgramMode`, expander CRUD, note CRUD
- [x] 8.4 Integration test: `dump_controller_snapshot` returns a `snapshot_version: 2` envelope with all new fields populated when the fake API returns the expanded read shapes
- [x] 8.5 Integration test for each new write tool's preview path (mirrors the `previewApply.test.ts` pattern), including `create_zone` and `delete_zone`
- [x] 8.6 Update `tests/integration/http.test.ts` `tools/list` assertion to include the new tool names
- [x] 8.7 Unit test for unit capture: `serializeWateringTriggers` emits `{ value: 96.99998, unit: "F" }` (or whatever the fixture says) instead of bare numbers

## 9. Documentation

- [x] 9.1 Update CLAUDE.md MCP tools section: add the new `irrigation-controller-config` and `irrigation-notes` tools; document the expanded snapshot envelope
- [x] 9.2 Update CLAUDE.md "Restore-from-backup" section with the new restorable categories
- [x] 9.3 If `Zone.masterValve` turns out to be read-only via API (no `updateZoneAdvanced` arg for it), document the gap in the snapshot envelope and CLAUDE.md
