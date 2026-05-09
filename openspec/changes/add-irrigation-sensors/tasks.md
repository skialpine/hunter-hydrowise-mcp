## 1. Schema reads — types and queries

- [ ] 1.1 Add `SensorRead`, `SensorModelRead`, `SensorInputRead` TypeScript interfaces in `src/hydrawise/queries.ts`
- [ ] 1.2 Add `CONTROLLER_SENSORS_QUERY` — `controller(controllerId) { sensors { id, name, model { id, name, sensorType, modeType, mode, active, offLevel, offTimer, delay, divisor, flowRate, customerId, type { value, label }, category { id, name } }, input { number, label }, zones { id, number { value }, name } } }`
- [ ] 1.3 Add `ZONE_SENSORS_QUERY` — `zone(zoneId) { sensors { id, name, model { ... }, input { ... } } }` (no zone-back-reference to avoid recursion)
- [ ] 1.4 Investigate and add a query for the available SensorModel catalog (likely `Controller.sensorModels` or top-level — verify against live schema and pick the right path)
- [ ] 1.5 If no catalog query exists, add a fallback documented in the restore skill (Phase 4)

## 2. Schema writes — mutation strings

- [ ] 2.1 Add `CREATE_SENSOR_MUTATION`, `UPDATE_SENSOR_MUTATION`, `DELETE_SENSOR_MUTATION`
- [ ] 2.2 Add `CREATE_CUSTOM_SENSOR_TYPE_MUTATION`, `UPDATE_CUSTOM_SENSOR_TYPE_MUTATION`, `DELETE_CUSTOM_SENSOR_TYPE_MUTATION`

## 3. API layer

- [ ] 3.1 Add `HydrawiseApi.getControllerSensors(controllerId): Promise<SensorRead[]>`
- [ ] 3.2 Add `HydrawiseApi.getZoneSensors(zoneId): Promise<SensorRead[]>`
- [ ] 3.3 Add `HydrawiseApi.listSensorModels(controllerId): Promise<SensorModelRead[]>` (path TBD by 1.4)
- [ ] 3.4 Add `HydrawiseApi.createSensor(payload)`, `updateSensor(payload)`, `deleteSensor(sensorId)` — each using `mutateRaw` with appropriate extractors
- [ ] 3.5 Add `HydrawiseApi.createCustomSensorType`, `updateCustomSensorType`, `deleteCustomSensorType`

## 4. Serializers

- [ ] 4.1 Add `serializeSensor(s: SensorRead)` to `src/tools/serializers.ts` — returns flat `{ id, name, model_id, input_number, zone_ids, _observed: { model_name, sensor_type, mode_type, ... } }`
- [ ] 4.2 Add `serializeSensorModel(m: SensorModelRead)` for the catalog tool
- [ ] 4.3 Add helper to flatten per-zone sensor refs to `[{ id, name }]` (for embedding in zone snapshot)

## 5. New tools — `irrigation-sensors`

- [ ] 5.1 Create `src/tools/sensors.ts` with `registerSensorTools(server, api, logger)` export
- [ ] 5.2 Implement `list_sensors(controller_id)` — read-only
- [ ] 5.3 Implement `list_zone_sensors(zone_id)` — read-only
- [ ] 5.4 Implement `list_sensor_models(controller_id)` — read-only catalog
- [ ] 5.5 Implement `create_sensor(controller_id, name, model_id, input_number, zone_ids)` — `PHYSICAL ACTION:`, preview
- [ ] 5.6 Implement `update_sensor(sensor_id, controller_id, name, model_id, input_number, zone_ids)` — `PHYSICAL ACTION:`, preview
- [ ] 5.7 Implement `delete_sensor(sensor_id)` — `PHYSICAL ACTION:`, preview
- [ ] 5.8 Implement `create_custom_sensor_type(customer_id, name, custom_sensor_type, mode_type, ...)` — `PHYSICAL ACTION:`, preview
- [ ] 5.9 Implement `update_custom_sensor_type(...)` — `PHYSICAL ACTION:`, preview
- [ ] 5.10 Implement `delete_custom_sensor_type(id)` — `PHYSICAL ACTION:`, preview
- [ ] 5.11 Register the new tool group in `src/server.ts`'s `buildMcpServer`

## 6. Snapshot extension

- [ ] 6.1 Add `controller.sensors` array to the snapshot envelope, populated by `getControllerSensors`
- [ ] 6.2 Add per-zone `sensors: [{ id, name }]` denormalized references within each `controller.zones[]` entry
- [ ] 6.3 Update the `ControllerSnapshotV2` (or whatever current version) interface in `src/tools/backup.ts`
- [ ] 6.4 Bump `snapshot_version` (informational marker)
- [ ] 6.5 Update `dump_controller_snapshot` description to mention sensor capture

## 7. Tests

- [ ] 7.1 Unit tests for `serializeSensor` and `serializeSensorModel` (round-trip a fixture, assert shape)
- [ ] 7.2 Unit tests for sensor CRUD API methods (mutation variable shape correctness)
- [ ] 7.3 Integration test: `tools/list` includes all new sensor tool names
- [ ] 7.4 Integration test: `create_sensor` with `preview: true` returns the planned variables; `preview: false` invokes the API
- [ ] 7.5 Integration test: `dump_controller_snapshot` includes a `controller.sensors` array when the fake API returns sensor records, and per-zone `sensors` references are correctly denormalized

## 8. Documentation

- [ ] 8.1 Add a new section to CLAUDE.md MCP tools listing the new `irrigation-sensors` capability and its tools
- [ ] 8.2 Add a CLAUDE.md gotcha: if sensor model catalog query path differs from initial assumption, document the actual path
- [ ] 8.3 Add a CLAUDE.md gotcha: hardware re-wiring is out-of-band — snapshot reflects what was wired, not what is wired now
