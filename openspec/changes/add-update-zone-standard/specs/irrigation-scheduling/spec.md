## MODIFIED Requirements

### Requirement: update_zone_settings tool accepts a full writable zone payload

The server SHALL expose an MCP tool named `update_zone_settings` that takes a required integer `zone_id`, an optional `preview` boolean (default false), and every writable field that the upstream `updateZoneAdvanced` mutation requires. The tool SHALL validate the payload via Zod, optionally preview it, and dispatch a single `updateZoneAdvanced` mutation (the modern non-deprecated path; the previously-used `updateZone` is `@deprecated` upstream). The tool description SHALL be prefixed with `PHYSICAL ACTION:` and SHALL explicitly state that this tool is for **ADVANCED-mode controllers only**, referencing `update_zone_standard` as the safe alternative for STANDARD-mode controllers. Callers are expected to obtain the current values via `get_zone_settings` (or from a recent snapshot) and pass the complete object back with the desired fields modified. Input field names SHALL match the corresponding output names from `get_zone_settings` exactly (so a snapshot value can be passed through without renaming): `cycle_custom_time_minutes`, `soak_custom_time_minutes`, `run_time_minutes`, `watering_adjustment_percent`, `monthly_adjustment_percents`, `fixed_watering_frequency_minutes`, `smart_watering_frequency_seconds`, etc. Every numeric input SHALL carry a `.describe()` annotation echoing the suffix's unit and citing the upstream source. The writable shape SHALL declare `cycle_soak_enable` and `run_next_available_start_time` as booleans (matching `updateZoneAdvanced`'s signature, which differs from the deprecated `updateZone` that took those as integers), and SHALL accept four optional monitoring fields: `flow_monitoring_method` and `current_monitoring_method` as the enum `'MANUAL' | 'LEARN_FROM_NEXT_RUN'`, plus optional `flow_monitoring_value` and `current_monitoring_value` numbers.

#### Scenario: Apply a full-payload update

- **WHEN** an MCP client calls `update_zone_settings` with every required field for `updateZoneAdvanced` and `preview` is omitted or false
- **THEN** the tool validates the payload, dispatches Hydrawise's `updateZoneAdvanced` mutation with the supplied values translated to the upstream camelCase argument names, and returns the upstream result

#### Scenario: Apply a monitoring change

- **WHEN** an MCP client calls `update_zone_settings` with the full base payload plus `current_monitoring_method: "MANUAL"` and `current_monitoring_value: 402`
- **THEN** the dispatched mutation includes `currentMonitoringMethod: MANUAL` and `currentMonitoringValue: 402`

#### Scenario: Snapshot value passes straight into the input

- **WHEN** an MCP client reads `cycle_custom_time_minutes: 30` from a `get_zone_settings` response (or a v6+ snapshot) and passes it back to `update_zone_settings` under the same field name `cycle_custom_time_minutes: 30`
- **THEN** the tool accepts the input without renaming and dispatches `updateZoneAdvanced` with `cycleCustomTime: 30` (the upstream camelCase name)

#### Scenario: Missing required field is rejected client-side

- **WHEN** an MCP client calls `update_zone_settings` without one of the upstream-required fields (e.g. omitting `watering_mode`)
- **THEN** the tool returns an `isError: true` Tool Execution Error naming the missing field, and does not contact Hydrawise

#### Scenario: Preview mode does not mutate state

- **WHEN** an MCP client calls `update_zone_settings` with the full payload and `preview: true`
- **THEN** the tool returns the GraphQL operation name (`updateZoneAdvanced`) and the variables it would send, the response's `preview` flag is `true`, and no mutation is dispatched to Hydrawise

#### Scenario: Upstream rejects the update

- **WHEN** an MCP client calls `update_zone_settings` with values that Hydrawise rejects (e.g. invalid frequency mode)
- **THEN** the tool returns an `isError: true` result whose message contains the upstream error text

#### Scenario: Tool catalog input descriptions cite the unit

- **WHEN** an MCP client requests `tools/list` and inspects the `update_zone_settings` input schema
- **THEN** every numeric input field's description text contains the unit word matching its suffix (e.g. `cycle_custom_time_minutes`'s description includes "minutes")

## ADDED Requirements

### Requirement: restore recipe uses update_zone_standard for STANDARD-mode controllers

The `_restore_recipe` embedded in a `dump_controller_snapshot` result SHALL dispatch `update_zone_standard` (not `update_zone_settings`) for per-zone setting steps when the snapshot's `controller.program_mode` is `"STANDARD"`. When `program_mode` is `"ADVANCED"` or absent, the recipe SHALL continue to emit `update_zone_settings` steps (existing behavior). STANDARD-mode zone steps SHALL include only the fields accepted by `updateZoneStandard` (name, number, icon, global_master_valve, watering_adjustment_percent, cycle_soak_enable, cycle_custom_time_minutes, soak_custom_time_minutes, sensor_ids, flow_monitoring_method, current_monitoring_method, flow_monitoring_value, current_monitoring_value) and SHALL omit all ADVANCED-only fields.

#### Scenario: STANDARD-mode snapshot recipe references update_zone_standard

- **WHEN** `dump_controller_snapshot` is called for a controller with `program_mode: "STANDARD"`
- **THEN** every per-zone settings step in `_restore_recipe` has `tool: "update_zone_standard"` and its `args` contain only fields valid for `updateZoneStandard`

#### Scenario: ADVANCED-mode snapshot recipe references update_zone_settings

- **WHEN** `dump_controller_snapshot` is called for a controller with `program_mode: "ADVANCED"`
- **THEN** every per-zone settings step in `_restore_recipe` has `tool: "update_zone_settings"` (existing behavior unchanged)

#### Scenario: Snapshot without program_mode falls back to update_zone_settings

- **WHEN** `dump_controller_snapshot` is called for a controller whose `program_mode` is null or absent
- **THEN** per-zone settings steps emit `tool: "update_zone_settings"` (backward-compatible fallback)
