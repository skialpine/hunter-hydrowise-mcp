# irrigation-sensors Specification

## Purpose
TBD - created by archiving change add-irrigation-sensors. Update Purpose after archive.
## Requirements
### Requirement: list_sensors tool returns all sensors on a controller

The server SHALL expose a read-only tool named `list_sensors` that accepts a required integer `controller_id`. It SHALL return an array of sensor objects. Each entry SHALL include `id`, `name`, `model_id`, `input_number`, `zone_ids` (array of integer zone IDs the sensor protects), and a sibling `_observed` block containing read-only model details: `model_name`, `sensor_type` (one of `LEVEL_OPEN | LEVEL_CLOSED | FLOW | THRESHOLD`), `mode_type` (one of `START | STOP | REPORT`), `divisor`, `flow_rate`.

#### Scenario: Controller has multiple sensors

- **WHEN** an MCP client calls `list_sensors` with a valid `controller_id`
- **THEN** the response is an array with one entry per sensor, each containing the writable fields plus an `_observed` block

#### Scenario: Controller has no sensors

- **WHEN** an MCP client calls `list_sensors` for a controller without sensors
- **THEN** the response is an empty array

### Requirement: list_zone_sensors tool returns sensors guarding a single zone

The server SHALL expose a read-only tool named `list_zone_sensors` that accepts a required integer `zone_id`. It SHALL return an array of sensor objects with the same shape as `list_sensors` (without the redundant `zone_ids` field, since the perspective is already zone-scoped).

#### Scenario: Zone is guarded by one sensor

- **WHEN** an MCP client calls `list_zone_sensors` for a zone protected by a rain sensor
- **THEN** the response is an array with one entry containing the sensor details

### Requirement: list_sensor_models tool returns the available sensor model catalog

The server SHALL expose a read-only tool named `list_sensor_models` that accepts a required integer `controller_id`. It SHALL return an array of `SensorModel` objects available for use on that controller, including both Hydrawise built-in types (rain/soil, flow meters of various sizes) and any custom types created on the account. Each entry SHALL include `id`, `name`, `sensor_type`, `mode_type`, `category` (e.g. `Hunter Clik`, `US Hunter HC Flow Meters`).

#### Scenario: Catalog includes built-in types

- **WHEN** an MCP client calls `list_sensor_models`
- **THEN** the response includes built-in `SensorModel` entries such as "Rain Sensor (normally closed wire)" with the appropriate `sensor_type` and `mode_type` discriminators

### Requirement: create_sensor tool installs a new sensor

The server SHALL expose a write tool named `create_sensor` that accepts a required `controller_id`, `name`, `model_id`, `input_number`, and `zone_ids` (array). The tool SHALL be marked as `PHYSICAL ACTION:` and SHALL accept a `preview` boolean.

#### Scenario: Create a rain sensor protecting all zones

- **WHEN** an MCP client calls `create_sensor` with valid arguments
- **THEN** the tool dispatches `createSensor(controllerId, name, modelId, inputNumber, zoneIds)` and returns the created `Sensor`

#### Scenario: Preview create

- **WHEN** an MCP client calls `create_sensor` with `preview: true`
- **THEN** the tool returns the planned variables without dispatching the upstream mutation

### Requirement: update_sensor tool modifies an existing sensor

The server SHALL expose a write tool named `update_sensor` that accepts a required `sensor_id`, `controller_id`, `name`, `model_id`, `input_number`, and `zone_ids`. The tool SHALL be marked as `PHYSICAL ACTION:` and SHALL accept a `preview` boolean. Mutations are full-replace (the supplied `zone_ids` replaces the previous association set).

#### Scenario: Reassign a sensor to a different zone set

- **WHEN** an MCP client calls `update_sensor` with a different `zone_ids`
- **THEN** the tool dispatches `updateSensor` with the new array, and the response reflects the updated zone associations

### Requirement: delete_sensor tool removes a sensor

The server SHALL expose a write tool named `delete_sensor` that accepts a required `sensor_id`. The tool SHALL be marked as `PHYSICAL ACTION:` and SHALL accept a `preview` boolean.

#### Scenario: Delete a sensor

- **WHEN** an MCP client calls `delete_sensor` with a valid `sensor_id`
- **THEN** the tool dispatches `deleteSensor(sensorId)` and returns the boolean result

### Requirement: Custom sensor type CRUD tools manage user-defined sensor models

The server SHALL expose `create_custom_sensor_type`, `update_custom_sensor_type`, and `delete_custom_sensor_type` tools that wrap the corresponding Hydrawise mutations. All three are `PHYSICAL ACTION:` and accept a `preview` boolean. Field names SHALL match the writable shape per project conventions (snake_case, scalar values).

#### Scenario: Create a custom flow meter type

- **WHEN** an MCP client calls `create_custom_sensor_type` with the required fields
- **THEN** the tool dispatches `createCustomSensorType(customerId, name, customSensorType, modeType, ...)` and returns the created `SensorModel`

#### Scenario: Reject unknown sensor type enum

- **WHEN** an MCP client passes an invalid `custom_sensor_type` value
- **THEN** the tool returns a `config_error`

