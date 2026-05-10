## Why

The MCP server has zero awareness of sensors today. The Hydrowise GUI clearly exposes them — every Hydrawise account that uses a rain sensor, soil sensor, or flow meter has at least one `Sensor` record protecting one or more zones. The Heller Tufts controller, for example, has a "Rain Sensor (normally closed wire)" wired to `SEN-1` that protects all 22 zones; none of that is in the snapshot, none of it is queryable through any current tool, and a restore would silently wipe sensor associations.

The schema audit confirms full sensor lifecycle is supported by Hydrawise mutations: `createSensor`, `updateSensor`, `deleteSensor`, plus custom-type CRUD via `createCustomSensorType` / `updateCustomSensorType` / `deleteCustomSensorType`. So sensor restore is not just possible — it's nearly trivial once the read paths are wired and tools exposed.

## What Changes

- Add **read tools**: `list_sensors(controller_id)`, `get_sensor(sensor_id)` (if schema supports lookup-by-id), `list_zone_sensors(zone_id)`.
- Add **write tools**: `create_sensor`, `update_sensor`, `delete_sensor` (each `PHYSICAL ACTION:`, each accepting `preview`).
- Add **custom sensor type management** as a separate sub-set: `list_sensor_models`, `create_custom_sensor_type`, `update_custom_sensor_type`, `delete_custom_sensor_type`.
- **Extend `dump_controller_snapshot`** to include `sensors` (controller-level array) with each sensor's full configuration, model, input, and zones-protected.
- **Extend per-zone serialization** so zones include a `sensors` array showing which sensors guard each zone.

## Capabilities

### New Capabilities
- `irrigation-sensors`: read + write tools for `Sensor` and `SensorModel` types.

### Modified Capabilities
- `irrigation-backup`: snapshot envelope now includes a `controller.sensors` array and per-zone `sensors` references.

## Impact

- `src/hydrawise/queries.ts`: add Sensor-related TypeScript interfaces; add `SENSORS_QUERY` (controller + per-zone), sensor CRUD mutations.
- `src/hydrawise/api.ts`: `getControllerSensors`, `getZoneSensors`, sensor and custom-sensor-type CRUD.
- `src/tools/serializers.ts`: `serializeSensor`, `serializeSensorModel`.
- New file `src/tools/sensors.ts` with `registerSensorTools(server, api, logger)` export.
- Extend `dump_controller_snapshot` and the snapshot serializer to pull and emit sensor data.
- Tests: serializer unit tests, API method unit tests, integration test for tool registrations + preview path.
- Documentation: CLAUDE.md MCP tools list updated.
