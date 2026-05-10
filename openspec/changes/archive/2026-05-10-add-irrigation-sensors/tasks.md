## 1. Schema reads — types and queries

- [x] 1.1 Add `SensorRead`, `SensorModelRead`, `SensorInputRead` TypeScript interfaces in `src/hydrawise/queries.ts`
- [x] 1.2 Add `CONTROLLER_SENSORS_QUERY` — `controller(controllerId) { sensors { id, name, model { id, name, sensorType, modeType, mode, active, offLevel, offTimer, delay, divisor, flowRate, customerId, type { value, label }, category { id, name } }, input { number, label }, zones { id, number { value }, name } } }`
- [x] 1.3 Add `ZONE_SENSORS_QUERY` — `zone(zoneId) { sensors { id, name, model { ... }, input { ... } } }` (no zone-back-reference to avoid recursion)
- [x] 1.4 Investigate and add a query for the available SensorModel catalog (likely `Controller.sensorModels` or top-level — verify against live schema and pick the right path) — actual path is `Configuration.sensorCategories[].models[]` (top-level via `query { configuration { sensorCategories { ... } } }`); SENSOR_MODEL_CATALOG_QUERY emits exactly that.
- [x] 1.5 If no catalog query exists, add a fallback documented in the restore skill (Phase 4) — N/A; catalog query exists.

## 2. Schema writes — mutation strings

- [x] 2.1 Add `CREATE_SENSOR_MUTATION`, `UPDATE_SENSOR_MUTATION`, `DELETE_SENSOR_MUTATION`
- [x] 2.2 Add `CREATE_CUSTOM_SENSOR_TYPE_MUTATION`, `UPDATE_CUSTOM_SENSOR_TYPE_MUTATION`, `DELETE_CUSTOM_SENSOR_TYPE_MUTATION`

## 3. API layer

- [x] 3.1 Add `HydrawiseApi.getControllerSensors(controllerId): Promise<SensorRead[]>`
- [x] 3.2 Add `HydrawiseApi.getZoneSensors(zoneId): Promise<SensorRead[]>`
- [x] 3.3 Add `HydrawiseApi.listSensorModels(controllerId): Promise<SensorModelRead[]>` (path TBD by 1.4) — uses `Configuration.sensorCategories` (account-wide); controllerId param accepted but not passed through. Flattened across categories; per-model `category` field preserved.
- [x] 3.4 Add `HydrawiseApi.createSensor(payload)`, `updateSensor(payload)`, `deleteSensor(sensorId)` — each using `mutateRaw` with appropriate extractors
- [x] 3.5 Add `HydrawiseApi.createCustomSensorType`, `updateCustomSensorType`, `deleteCustomSensorType` — deleteCustomSensorType returns Int per schema; coerced to true on positive count, throws on 0/null

## 4. Serializers

- [x] 4.1 Add `serializeSensor(s: SensorRead)` to `src/tools/serializers.ts` — returns flat `{ id, name, model_id, input_number, zone_ids, _observed: { model_name, sensor_type, mode_type, ... } }`
- [x] 4.2 Add `serializeSensorModel(m: SensorModelRead)` for the catalog tool
- [x] 4.3 Add helper to flatten per-zone sensor refs to `[{ id, name }]` (for embedding in zone snapshot) — `serializeSensorZoneRefsForZone(controllerSensors, zoneId)` derives from already-fetched controller-level sensors to avoid N+1 fetch.

## 5. New tools — `irrigation-sensors`

- [x] 5.1 Create `src/tools/sensors.ts` with `registerSensorTools(server, api, logger)` export
- [x] 5.2 Implement `list_sensors(controller_id)` — read-only
- [x] 5.3 Implement `list_zone_sensors(zone_id)` — read-only
- [x] 5.4 Implement `list_sensor_models(controller_id)` — read-only catalog
- [x] 5.5 Implement `create_sensor(controller_id, name, model_id, input_number, zone_ids)` — `PHYSICAL ACTION:`, preview
- [x] 5.6 Implement `update_sensor(sensor_id, controller_id, name, model_id, input_number, zone_ids)` — `PHYSICAL ACTION:`, preview
- [x] 5.7 Implement `delete_sensor(sensor_id)` — `PHYSICAL ACTION:`, preview
- [x] 5.8 Implement `create_custom_sensor_type(customer_id, name, custom_sensor_type, mode_type, ...)` — `PHYSICAL ACTION:`, preview
- [x] 5.9 Implement `update_custom_sensor_type(...)` — `PHYSICAL ACTION:`, preview
- [x] 5.10 Implement `delete_custom_sensor_type(id)` — `PHYSICAL ACTION:`, preview
- [x] 5.11 Register the new tool group in `src/server.ts`'s `buildMcpServer`

## 6. Snapshot extension

- [x] 6.1 Add `controller.sensors` array to the snapshot envelope, populated by `getControllerSensors`
- [x] 6.2 Add per-zone `sensors: [{ id, name }]` denormalized references within each `controller.zones[]` entry — derived from controller-level sensors via `serializeSensorZoneRefsForZone` (no N+1)
- [x] 6.3 Update the `ControllerSnapshotV2` (or whatever current version) interface in `src/tools/backup.ts` — renamed to `ControllerSnapshotV3`; legacy `ControllerSnapshotV2` re-exported as alias
- [x] 6.4 Bump `snapshot_version` (informational marker) — bumped 2 → 3
- [x] 6.5 Update `dump_controller_snapshot` description to mention sensor capture

## 7. Tests

- [x] 7.1 Unit tests for `serializeSensor` and `serializeSensorModel` (round-trip a fixture, assert shape) — 7 cases including null-zone stripping, custom-type customer_id marker, multi-zone-cross-ref helper
- [x] 7.2 Unit tests for sensor CRUD API methods (mutation variable shape correctness) — 14 cases including malformed-shape rejection, zoneIds=null pass-through, deleteCustomSensorType Int→true coercion
- [x] 7.3 Integration test: `tools/list` includes all new sensor tool names — extended http.test.ts expected-tools list with all 9 sensor tool names
- [x] 7.4 Integration test: `create_sensor` with `preview: true` returns the planned variables; `preview: false` invokes the API
- [x] 7.5 Integration test: `dump_controller_snapshot` includes a `controller.sensors` array when the fake API returns sensor records, and per-zone `sensors` references are correctly denormalized — also tests empty-fixture path

## 8. Documentation

- [x] 8.1 Add a new section to CLAUDE.md MCP tools listing the new `irrigation-sensors` capability and its tools — added between Notes and Reporting sections; project layout updated to include sensors.ts; Backup section now reflects v3 with sensor capture
- [x] 8.2 Add a CLAUDE.md gotcha: if sensor model catalog query path differs from initial assumption, document the actual path — added gotcha noting catalog is at `Configuration.sensorCategories[].models[]` (account-wide, not per-controller); also covers `updateSensor` zoneIds nullability, `deleteCustomSensorType` Int return, custom-type id reallocation
- [x] 8.3 Add a CLAUDE.md gotcha: hardware re-wiring is out-of-band — snapshot reflects what was wired, not what is wired now
