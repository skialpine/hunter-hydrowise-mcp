## ADDED Requirements

### Requirement: update_zone_standard tool updates per-zone settings on STANDARD-mode controllers

The server SHALL expose an MCP tool named `update_zone_standard` that wraps the upstream `updateZoneStandard` mutation for STANDARD-mode controllers. The tool SHALL accept the following inputs:

**Required fields:** `zone_id` (Int), `name` (String), `number` (Int), `global_master_valve` (Int), `watering_adjustment_percent` (Int), `cycle_soak_enable` (Boolean).

**Optional fields:** `icon` (Int), `icon_file_id` (Int), `cycle_custom_time_minutes` (Int), `soak_custom_time_minutes` (Int), `sensor_ids` ([Int] — full-replace when supplied, pass `null`/omit to leave existing associations untouched), `flow_monitoring_method` (`'MANUAL' | 'LEARN_FROM_NEXT_RUN'`), `current_monitoring_method` (`'MANUAL' | 'LEARN_FROM_NEXT_RUN'`), `flow_monitoring_value` (Float), `current_monitoring_value` (Int), `preview` (Boolean, default false).

The tool description SHALL be prefixed with `PHYSICAL ACTION:` and SHALL state it is for STANDARD-mode controllers. Every numeric input with a fixed unit SHALL carry a `.describe()` annotation naming the unit. The tool SHALL NOT accept any ADVANCED-mode-only fields (`watering_mode`, `watering_type`, `watering_frequency_mode`, `run_time_minutes`, `schedule_adjustment_ids`, etc.).

#### Scenario: Apply a standard-mode zone update

- **WHEN** an MCP client calls `update_zone_standard` with all required fields and `preview` omitted or false
- **THEN** the tool validates the payload, dispatches `updateZoneStandard` with the supplied values translated to upstream camelCase argument names, and returns the upstream zone result

#### Scenario: Preview mode returns planned variables without mutating

- **WHEN** an MCP client calls `update_zone_standard` with all required fields and `preview: true`
- **THEN** the tool returns `{ preview: true, operation: "updateZoneStandard", variables: { ... } }` and does NOT dispatch any mutation to Hydrawise

#### Scenario: Cycle/soak fields accepted when cycle_soak_enable is true

- **WHEN** an MCP client calls `update_zone_standard` with `cycle_soak_enable: true`, `cycle_custom_time_minutes: 6`, `soak_custom_time_minutes: 50`
- **THEN** the dispatched mutation includes `cycleSoakEnable: true`, `cycleCustomTime: 6`, `soakCustomTime: 50`

#### Scenario: sensor_ids performs full-replace when supplied

- **WHEN** an MCP client calls `update_zone_standard` with `sensor_ids: [42]`
- **THEN** the dispatched mutation includes `sensorIds: [42]` and the zone's sensor associations are replaced (not merged)

#### Scenario: sensor_ids omitted leaves existing associations untouched

- **WHEN** an MCP client calls `update_zone_standard` without `sensor_ids` (or with `sensor_ids: null`)
- **THEN** the dispatched mutation either omits `sensorIds` or passes `null`, and Hydrawise preserves the zone's existing sensor associations

#### Scenario: ADVANCED-mode fields are rejected

- **WHEN** an MCP client calls `update_zone_standard` with an ADVANCED-mode-only field such as `watering_mode`
- **THEN** the MCP framework returns a Tool Execution Error (input validation failure) and does not contact Hydrawise

#### Scenario: Missing required field is rejected

- **WHEN** an MCP client calls `update_zone_standard` without a required field (e.g. omitting `cycle_soak_enable`)
- **THEN** the tool returns an `isError: true` result naming the missing field and does not contact Hydrawise

#### Scenario: Monitoring method and value accepted

- **WHEN** an MCP client calls `update_zone_standard` with `flow_monitoring_method: "MANUAL"` and `flow_monitoring_value: 1.5`
- **THEN** the dispatched mutation includes `flowMonitoringMethod: MANUAL` and `flowMonitoringValue: 1.5`
