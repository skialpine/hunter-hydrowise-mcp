## MODIFIED Requirements

### Requirement: get_zone_settings tool returns the zone's full watering settings

The server SHALL expose an MCP tool named `get_zone_settings` that takes a required integer `zone_id` and returns the readable watering-settings fields for that zone — at minimum `run_time`, `watering_mode`, `watering_frequency_mode`, `fixed_watering_frequency`, `smart_watering_frequency`, `cycle_soak_enable`, `cycle_custom_time`, `soak_custom_time`, `watering_adjustment`, and `factors` (the 12-month seasonal adjustment array if present on the zone). The response SHALL also include the four monitoring fields the upstream `updateZoneAdvanced` mutation accepts as part of the writable view (`flow_monitoring_method`, `current_monitoring_method`, `flow_monitoring_value`, `current_monitoring_value`), each `null` when the read schema does not surface the configured value, and a separate `monitoring_observed` block carrying the read-only `operating_ranges` and `measured_medians` from `Zone.monitoringSettings` (water flow rate and electric current as bare numbers, unwrapped from `LocalizedValueType`).

#### Scenario: Zone exists

- **WHEN** an MCP client calls `get_zone_settings` with a valid `zone_id`
- **THEN** the response is a JSON object containing the listed settings fields populated from the Hydrawise zone record, including the four `*_monitoring_*` fields (possibly `null`) and a `monitoring_observed` object

#### Scenario: Zone does not exist

- **WHEN** an MCP client calls `get_zone_settings` with a `zone_id` that does not belong to the authenticated account
- **THEN** the tool returns an `isError: true` result indicating the zone could not be found

#### Scenario: Monitoring telemetry is exposed read-only

- **WHEN** an MCP client inspects the `monitoring_observed` block of a `get_zone_settings` response
- **THEN** the block contains `operating_ranges.{water_flow_rate, electric_current}` and `measured_medians.{water_flow_rate, electric_current}`, with values normalized to bare numbers (or `null` when the controller has not measured a value yet)

### Requirement: update_zone_settings tool accepts a full writable zone payload

The server SHALL expose an MCP tool named `update_zone_settings` that takes a required integer `zone_id`, an optional `preview` boolean (default false), and every writable field that the upstream `updateZoneAdvanced` mutation requires. The tool SHALL validate the payload via Zod, optionally preview it, and dispatch a single `updateZoneAdvanced` mutation (the modern non-deprecated path; the previously-used `updateZone` is `@deprecated` upstream). Tool descriptions SHALL be prefixed with `PHYSICAL ACTION:` so MCP clients prompt for confirmation. Callers are expected to obtain the current values via `get_zone_settings` (or from a recent snapshot) and pass the complete object back with the desired fields modified. The writable shape SHALL declare `cycle_soak_enable` and `run_next_available_start_time` as booleans (matching `updateZoneAdvanced`'s signature, which differs from the deprecated `updateZone` that took those as integers), and SHALL accept four optional monitoring fields: `flow_monitoring_method` and `current_monitoring_method` as the enum `'MANUAL' | 'LEARN_FROM_NEXT_RUN'`, plus optional `flow_monitoring_value` and `current_monitoring_value` numbers.

#### Scenario: Apply a full-payload update

- **WHEN** an MCP client calls `update_zone_settings` with every required field for `updateZoneAdvanced` and `preview` is omitted or false
- **THEN** the tool validates the payload, dispatches Hydrawise's `updateZoneAdvanced` mutation with the supplied values, and returns the upstream result

#### Scenario: Apply a monitoring change

- **WHEN** an MCP client calls `update_zone_settings` with the full base payload plus `current_monitoring_method: "MANUAL"` and `current_monitoring_value: 402`
- **THEN** the dispatched mutation includes `currentMonitoringMethod: MANUAL` and `currentMonitoringValue: 402`

#### Scenario: Missing required field is rejected client-side

- **WHEN** an MCP client calls `update_zone_settings` without one of the upstream-required fields (e.g. omitting `watering_mode`)
- **THEN** the tool returns an `isError: true` Tool Execution Error naming the missing field, and does not contact Hydrawise

#### Scenario: Preview mode does not mutate state

- **WHEN** an MCP client calls `update_zone_settings` with the full payload and `preview: true`
- **THEN** the tool returns the GraphQL operation name (`updateZoneAdvanced`) and the variables it would send, the response's `preview` flag is `true`, and no mutation is dispatched to Hydrawise

#### Scenario: Upstream rejects the update

- **WHEN** an MCP client calls `update_zone_settings` with values that Hydrawise rejects (e.g. invalid frequency mode)
- **THEN** the tool returns an `isError: true` result whose message contains the upstream error text

## ADDED Requirements

### Requirement: set_zone_baseline tool sets monitoring baselines in one call

The server SHALL expose an MCP tool named `set_zone_baseline` that takes a required integer `zone_id`, two required `MonitoringMethodEnum` strings (`flow_monitoring_method` and `current_monitoring_method`, each `'MANUAL'` or `'LEARN_FROM_NEXT_RUN'`), optional numeric `flow_monitoring_value` and `current_monitoring_value`, and an optional `preview` boolean. The tool SHALL dispatch Hydrawise's `setBaselineValues` mutation with the supplied arguments. The tool description SHALL be prefixed `PHYSICAL ACTION:`.

#### Scenario: Set both baselines to MANUAL with values

- **WHEN** an MCP client calls `set_zone_baseline` with `{ zone_id: 42, flow_monitoring_method: "MANUAL", current_monitoring_method: "MANUAL", flow_monitoring_value: 1.2, current_monitoring_value: 402 }` and `preview` omitted or false
- **THEN** the server dispatches `setBaselineValues(zoneId: 42, flowMonitoringMethod: MANUAL, currentMonitoringMethod: MANUAL, flowMonitoringValue: 1.2, currentMonitoringValue: 402)` and returns the upstream `StatusCodeAndSummary`

#### Scenario: Schedule learning on next run

- **WHEN** an MCP client calls `set_zone_baseline` with both methods set to `LEARN_FROM_NEXT_RUN` and no values
- **THEN** the server dispatches `setBaselineValues` with both methods as `LEARN_FROM_NEXT_RUN` and both values as `null`

#### Scenario: Preview baseline change

- **WHEN** an MCP client calls `set_zone_baseline` with `preview: true`
- **THEN** the response contains the planned `setBaselineValues` operation name and variables, no mutation is dispatched, and a `preview: true` marker is present

#### Scenario: Reject unknown monitoring method

- **WHEN** an MCP client calls `set_zone_baseline` with `flow_monitoring_method: "Bogus"`
- **THEN** the tool returns an `isError: true` Tool Execution Error and does not contact Hydrawise
