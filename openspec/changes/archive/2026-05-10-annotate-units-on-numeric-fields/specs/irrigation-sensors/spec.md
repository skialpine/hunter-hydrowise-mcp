## MODIFIED Requirements

### Requirement: list_sensors tool returns all sensors on a controller

The server SHALL expose a read-only tool named `list_sensors` that accepts a required integer `controller_id`. It SHALL return an array of sensor objects. Each entry SHALL include `id`, `name`, `model_id`, `input_number`, `zone_ids` (array of integer zone IDs the sensor protects), and a sibling `_observed` block containing read-only model details: `model_name`, `sensor_type` (one of `LEVEL_OPEN | LEVEL_CLOSED | FLOW | THRESHOLD`), `mode_type` (one of `START | STOP | REPORT`), `divisor`, `flow_rate`, `delay_seconds`, `off_timer_seconds`. Numeric fields in the `_observed` block whose underlying Hydrawise type is a fixed-unit `Int` SHALL carry the unit as a name suffix; identifier-class fields (`model_id`, `input_number`) and dimensionless fields (`divisor`, `flow_rate`) are exempt.

#### Scenario: Controller has multiple sensors

- **WHEN** an MCP client calls `list_sensors` with a valid `controller_id`
- **THEN** the response is an array with one entry per sensor, each containing the writable fields plus an `_observed` block

#### Scenario: Sensor delay and off-timer carry seconds suffix

- **WHEN** an MCP client inspects the `_observed` block of any sensor entry
- **THEN** the timer fields are named `delay_seconds` and `off_timer_seconds`, not bare `delay` / `off_timer`

#### Scenario: Controller has no sensors

- **WHEN** an MCP client calls `list_sensors` for a controller without sensors
- **THEN** the response is an empty array

### Requirement: list_zone_sensors tool returns sensors guarding a single zone

The server SHALL expose a read-only tool named `list_zone_sensors` that accepts a required integer `zone_id`. It SHALL return an array of sensor objects with the same shape as `list_sensors` (without the redundant `zone_ids` field, since the perspective is already zone-scoped). The same unit-suffix convention applies to the `_observed` block.

#### Scenario: Zone is guarded by one sensor

- **WHEN** an MCP client calls `list_zone_sensors` for a zone protected by a rain sensor
- **THEN** the response is an array with one entry containing the sensor details, including `_observed.delay_seconds` and `_observed.off_timer_seconds`

### Requirement: Custom sensor type CRUD tools manage user-defined sensor models

The server SHALL expose `create_custom_sensor_type`, `update_custom_sensor_type`, and `delete_custom_sensor_type` tools that wrap the corresponding Hydrawise mutations. All three are `PHYSICAL ACTION:` and accept a `preview` boolean. Field names SHALL match the writable shape per project conventions (snake_case, scalar values). Numeric input fields with a fixed unit SHALL carry the unit as a name suffix: `delay_seconds`, `off_timer_seconds`, `flow_sensor_rate` (the rate field is a dimensionless flow-meter ratio per Hydrawise schema and stays un-suffixed).

#### Scenario: Create a custom flow meter type

- **WHEN** an MCP client calls `create_custom_sensor_type` with the required fields
- **THEN** the tool dispatches `createCustomSensorType(customerId, name, customSensorType, modeType, ...)` and returns the created `SensorModel`

#### Scenario: Reject unknown sensor type enum

- **WHEN** an MCP client passes an invalid `custom_sensor_type` value
- **THEN** the tool returns a `config_error`

#### Scenario: Numeric input descriptions cite the unit

- **WHEN** an MCP client requests `tools/list` and inspects `create_custom_sensor_type`
- **THEN** the `delay_seconds` and `off_timer_seconds` input descriptions contain the word "seconds" and a citation of the source (Hydrawise schema or empirical verification)
