## MODIFIED Requirements

### Requirement: get_zone_settings tool returns the zone's full watering settings

The server SHALL expose an MCP tool named `get_zone_settings` that takes a required integer `zone_id` and returns the readable watering-settings fields for that zone — at minimum `run_time_minutes`, `watering_mode`, `watering_frequency_mode`, `fixed_watering_frequency_minutes`, `smart_watering_frequency_seconds`, `cycle_soak_enable`, `cycle_custom_time_minutes`, `soak_custom_time_minutes`, `watering_adjustment_percent`, and `monthly_adjustment_percents` (the 12-month seasonal adjustment array if present on the zone). The response SHALL also include the four monitoring fields the upstream `updateZoneAdvanced` mutation accepts as part of the writable view (`flow_monitoring_method`, `current_monitoring_method`, `flow_monitoring_value`, `current_monitoring_value`), each `null` when the read schema does not surface the configured value, and a separate `monitoring_observed` block carrying the read-only `operating_ranges` and `measured_medians` from `Zone.monitoringSettings` (water flow rate and electric current as `{value, unit}` pairs preserving the `LocalizedValueType` unit). All numeric fields with a fixed unit SHALL carry that unit as a name suffix (`_minutes`, `_seconds`, `_days`, `_percent`, `_epoch_seconds`); only `LocalizedValueType` fields whose unit follows the user's account preference SHALL use the `{value, unit}` wrapping.

#### Scenario: Zone exists

- **WHEN** an MCP client calls `get_zone_settings` with a valid `zone_id`
- **THEN** the response is a JSON object containing the listed settings fields populated from the Hydrawise zone record, including the four `*_monitoring_*` fields (possibly `null`) and a `monitoring_observed` object

#### Scenario: Zone does not exist

- **WHEN** an MCP client calls `get_zone_settings` with a `zone_id` that does not belong to the authenticated account
- **THEN** the tool returns an `isError: true` result indicating the zone could not be found

#### Scenario: Monitoring telemetry is exposed read-only

- **WHEN** an MCP client inspects the `monitoring_observed` block of a `get_zone_settings` response
- **THEN** the block contains `operating_ranges.{water_flow_rate, electric_current}` and `measured_medians.{water_flow_rate, electric_current}`, with values surfaced as `{value, unit}` pairs preserving the `LocalizedValueType` unit (or `null` when the controller has not measured a value yet)

#### Scenario: Numeric fields carry their unit in the field name

- **WHEN** an MCP client inspects any numeric field in a `get_zone_settings` response whose underlying Hydrawise type is a fixed-unit Int or Float (not `LocalizedValueType`)
- **THEN** the field name SHALL end with one of the registered unit suffixes (`_minutes`, `_seconds`, `_days`, `_percent`, `_epoch_seconds`), or the field SHALL be a non-unit identifier whitelisted in the lint test (`*_id`, `*_number`, `*_count`, `latitude`, `longitude`, etc.)

### Requirement: update_zone_settings tool accepts a full writable zone payload

The server SHALL expose an MCP tool named `update_zone_settings` that takes a required integer `zone_id`, an optional `preview` boolean (default false), and every writable field that the upstream `updateZoneAdvanced` mutation requires. The tool SHALL validate the payload via Zod, optionally preview it, and dispatch a single `updateZoneAdvanced` mutation (the modern non-deprecated path; the previously-used `updateZone` is `@deprecated` upstream). Tool descriptions SHALL be prefixed with `PHYSICAL ACTION:` so MCP clients prompt for confirmation. Callers are expected to obtain the current values via `get_zone_settings` (or from a recent snapshot) and pass the complete object back with the desired fields modified. Input field names SHALL match the corresponding output names from `get_zone_settings` exactly (so a snapshot value can be passed through without renaming): `cycle_custom_time_minutes`, `soak_custom_time_minutes`, `run_time_minutes`, `watering_adjustment_percent`, `monthly_adjustment_percents`, `fixed_watering_frequency_minutes`, `smart_watering_frequency_seconds`, etc. Every numeric input SHALL carry a `.describe()` annotation echoing the suffix's unit and citing the upstream source. The writable shape SHALL declare `cycle_soak_enable` and `run_next_available_start_time` as booleans (matching `updateZoneAdvanced`'s signature, which differs from the deprecated `updateZone` that took those as integers), and SHALL accept four optional monitoring fields: `flow_monitoring_method` and `current_monitoring_method` as the enum `'MANUAL' | 'LEARN_FROM_NEXT_RUN'`, plus optional `flow_monitoring_value` and `current_monitoring_value` numbers.

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

### Requirement: get_seasonal_adjustments and update_seasonal_adjustments form a paired set

The server SHALL expose `get_seasonal_adjustments(controller_id)` returning the 12-element integer array as `monthly_adjustment_percents` and `update_seasonal_adjustments(controller_id, monthly_adjustment_percents, preview?)` that takes the controller id, a required `monthly_adjustment_percents` array of exactly 12 integers, and an optional `preview` boolean. The input field name `monthly_adjustment_percents` SHALL match the output field name from `get_seasonal_adjustments`. Tool descriptions SHALL be prefixed with `PHYSICAL ACTION:`.

#### Scenario: Read seasonal adjustments

- **WHEN** an MCP client calls `get_seasonal_adjustments` with a valid `controller_id`
- **THEN** the response is a JSON object containing `monthly_adjustment_percents` as an array of exactly 12 integers (each value is a percentage 0–200)

#### Scenario: Update with preview

- **WHEN** an MCP client calls `update_seasonal_adjustments` with `controller_id`, a 12-integer `monthly_adjustment_percents` array, and `preview: true`
- **THEN** the tool returns the planned mutation payload (with the upstream argument named `seasonalAdjustmentFactors`) and does not dispatch the mutation

#### Scenario: Update with wrong number of factors

- **WHEN** an MCP client calls `update_seasonal_adjustments` with a `monthly_adjustment_percents` array whose length is not 12
- **THEN** the tool returns an `isError: true` Tool Execution Error explaining the validation failure, and does not contact Hydrawise

### Requirement: Standard programs support full read + CRUD

The `get_program` tool SHALL accept `program_type: 'Standard' | 'Advanced'`. For `program_type: 'Standard'`, the tool SHALL return the full StandardProgram detail (start times, day pattern, days run, monthly adjustments, periodicity expressed as `interval_days`, per-zone run-time groups, `valid_from_epoch_seconds`, `valid_to_epoch_seconds`, conditional adjustments). **For `program_type: 'Advanced'`, the tool SHALL return the full AdvancedProgram detail** (`id`, `name`, `advanced_program_id`, `scope`, `zone_specific`, `monthly_adjustment_percents`, `scheduling_method`, `watering_frequency`, `run_time_group`, `applies_to_zones`). All numeric program fields with a fixed unit SHALL use the suffix convention.

#### Scenario: Get an Advanced program by id

- **WHEN** an MCP client calls `get_program` with `controller_id`, `program_id`, and `program_type: 'Advanced'` for a program that exists
- **THEN** the response includes the AdvancedProgram fields including the `watering_frequency` object and `run_time_group` reference, with all numeric fields carrying unit suffixes

#### Scenario: Get a Standard program — interval expressed in days

- **WHEN** an MCP client calls `get_program` with `program_type: 'Standard'` for a program with periodicity "every 2 days"
- **THEN** the response field `interval_days` equals `2` (not `interval`), and timestamp fields are named `*_epoch_seconds`

#### Scenario: Program type mismatch

- **WHEN** an MCP client calls `get_program` with `program_type: 'Advanced'` against a `program_id` that is actually a StandardProgram (or vice-versa)
- **THEN** the tool returns a `not_found`-class error indicating the program does not exist as the requested type
