# irrigation-scheduling Specification

## Purpose
TBD - created by archiving change add-schedule-management. Update Purpose after archive.
## Requirements
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

### Requirement: list_program_start_times reads, plus full CRUD via create/update/delete tools

The server SHALL expose `list_program_start_times(controller_id)` returning the configured program start times for that controller, each entry including `id`, `time`, `time_type`, `watering_type`, `apply_all`, the seven day-of-week integers (`sunday`..`saturday`), and any associated `zones` / `schedules` arrays. The server SHALL also expose:

- `create_program_start_time(controller_id, ...full_payload, preview?)` — wraps Hydrawise's `createProgramStartTime` mutation
- `update_program_start_time(id, controller_id, preview?, ...full_payload)` — accepts the complete writable payload (callers fetch via `list_program_start_times` first) and dispatches `updateProgramStartTime`
- `delete_program_start_time(id, controller_id, preview?)` — wraps `deleteProgramStartTime`

Each write tool SHALL be prefixed `PHYSICAL ACTION:` and SHALL respect the shared `preview` semantics defined later in this spec.

#### Scenario: Update an existing start time with the full payload

- **WHEN** an MCP client calls `update_program_start_time` with the start-time `id`, `controller_id`, and every required field (`time`, `time_type`, `watering_type`, `apply_all`, all seven day-of-week ints, plus optional `zones`/`schedules`) and `preview: false`
- **THEN** the tool dispatches Hydrawise's `updateProgramStartTime` mutation with the supplied values

#### Scenario: Create a new start time

- **WHEN** an MCP client calls `create_program_start_time` with the required fields and `preview: false`
- **THEN** the tool dispatches `createProgramStartTime` and the result includes the new start-time identifier returned by Hydrawise

#### Scenario: Delete a start time with preview

- **WHEN** an MCP client calls `delete_program_start_time` with a valid `id` and `preview: true`
- **THEN** the response indicates the delete that would be performed, no mutation is dispatched, and the start time still exists upstream

### Requirement: Standard programs support full read + CRUD

The `get_program` tool SHALL accept `program_type: 'Standard' | 'Advanced'`. For `program_type: 'Standard'`, the tool SHALL return the full StandardProgram detail (start times, day pattern, days run, monthly adjustments, periodicity expressed as `interval_days`, per-zone run-time groups, `valid_from_epoch_seconds`, `valid_to_epoch_seconds`, conditional adjustments). The tool description SHALL document that `periodicity` is `null` when `standard_program_day_pattern` is `"dow"`, `"odd"`, or `"even"` — periodicity is only meaningful in `"interval"` mode. **For `program_type: 'Advanced'`, the tool SHALL return the full AdvancedProgram detail** (`id`, `name`, `advanced_program_id`, `scope`, `zone_specific`, `monthly_adjustment_percents`, `scheduling_method`, `watering_frequency`, `run_time_group`, `applies_to_zones`). All numeric program fields with a fixed unit SHALL use the suffix convention.

The `create_standard_program` and `update_standard_program` write tools SHALL expose the writable StandardProgram payload with the following field requirements:

- The Hydrawise scheduling-method integer SHALL be accepted as `scheduling_method: number` (not `program_type`). The field description SHALL note it is the same integer returned by `get_program` under the `scheduling_method` field (e.g. `3` for Standard).
- `interval_days`, `series_start_epoch_seconds`, `valid_from_epoch_seconds`, and `valid_to_epoch_seconds` SHALL be nullable and optional (omitting is equivalent to passing `null`). Field descriptions SHALL call out when each is applicable: `interval_days` and `series_start_epoch_seconds` are only meaningful in `"interval"` day-pattern mode; `valid_from_epoch_seconds` and `valid_to_epoch_seconds` bound the program's active date range.

#### Scenario: Get an Advanced program by id

- **WHEN** an MCP client calls `get_program` with `controller_id`, `program_id`, and `program_type: 'Advanced'` for a program that exists
- **THEN** the response includes the AdvancedProgram fields including the `watering_frequency` object and `run_time_group` reference, with all numeric fields carrying unit suffixes

#### Scenario: Get a Standard program — interval expressed in days

- **WHEN** an MCP client calls `get_program` with `program_type: 'Standard'` for a program with periodicity "every 2 days"
- **THEN** the response field `interval_days` equals `2` (not `interval`), and timestamp fields are named `*_epoch_seconds`

#### Scenario: Get a Standard program in dow mode — periodicity is null

- **WHEN** an MCP client calls `get_program` with `program_type: 'Standard'` for a program whose `standard_program_day_pattern` is `"dow"`
- **THEN** the response field `periodicity` is `null` (not an error condition)

#### Scenario: Tool catalog input descriptions cite the unit

- **WHEN** an MCP client requests `tools/list` and inspects the input schemas for Standard program write tools
- **THEN** every numeric input field's description text contains the unit word matching its suffix

#### Scenario: Program type mismatch

- **WHEN** an MCP client calls `get_program` with `program_type: 'Advanced'` against a `program_id` that is actually a StandardProgram (or vice-versa)
- **THEN** the tool returns a `not_found`-class error indicating the program does not exist as the requested type

#### Scenario: Create standard program omitting interval fields in dow mode

- **WHEN** an MCP client calls `create_standard_program` with `standard_program_day_pattern: "dow"` and omits `interval_days`, `series_start_epoch_seconds`, `valid_from_epoch_seconds`, and `valid_to_epoch_seconds`
- **THEN** the tool does not return a validation error and dispatches `createStandardProgram` with those fields coalesced to `null`

#### Scenario: Write tool uses scheduling_method not program_type

- **WHEN** an MCP client calls `update_standard_program` with `scheduling_method: 3` (and does not pass `program_type`)
- **THEN** the tool accepts the call and dispatches `updateStandardProgram` with `programType: 3`

#### Scenario: Write tool rejects old program_type integer field

- **WHEN** an MCP client calls `update_standard_program` passing only `program_type: 3` (and not `scheduling_method`)
- **THEN** the tool returns a Zod validation error because `scheduling_method` is required

### Requirement: Watering programs support full CRUD across the three subtypes

The server SHALL expose discriminated write tools for the three watering-program subtypes:

- `create_watering_program(program_type, ...full_payload, preview?)` — `program_type` is one of `Time`, `Smart`, `VirtualSolarSync`; the tool dispatches to the correspondingly-named upstream mutation (`createTimeBasedWateringProgram`, `createSmartBasedWateringProgram`, or `createVirtualSolarSyncWateringProgram`).
- `update_watering_program(program_id, program_type, preview?, ...full_payload)` — accepts the complete writable payload for the given subtype and dispatches the matching `update*WateringProgram` mutation.
- `delete_watering_program(program_id, preview?)` — wraps `removeWateringProgram`.

Write tools SHALL be prefixed `PHYSICAL ACTION:` and reject calls whose `program_type` is not one of the three documented values.

#### Scenario: Update a SmartBased watering program

- **WHEN** an MCP client calls `update_watering_program` with `{ program_id: 99, program_type: "Smart", ...full smart-program payload..., preview: false }`
- **THEN** the tool dispatches `updateSmartBasedWateringProgram` with the supplied values

#### Scenario: Reject an unknown program_type

- **WHEN** an MCP client calls `update_watering_program` with `program_type: "Bogus"`
- **THEN** the tool returns an `isError: true` Tool Execution Error explaining the validation failure, and does not contact Hydrawise

#### Scenario: Delete a watering program

- **WHEN** an MCP client calls `delete_watering_program` with a valid `program_id` and `preview: false`
- **THEN** the tool dispatches `removeWateringProgram` and the program no longer appears in a subsequent `list_programs` call

### Requirement: get_watering_triggers and update_watering_triggers form a paired set

The server SHALL expose `get_watering_triggers(controller_id)` returning the controller's watering trigger configuration (rain/temperature/humidity/wind suspension and extension thresholds, with `LocalizedValueType` fields normalized to bare numbers), and `update_watering_triggers(controller_id, preview?, ...full_payload)` that takes the complete writable trigger set and submits Hydrawise's `updateWateringTriggers` mutation. Tool descriptions SHALL be prefixed `PHYSICAL ACTION:`.

#### Scenario: Update with the full trigger payload

- **WHEN** an MCP client calls `update_watering_triggers` with `controller_id` and every required trigger field
- **THEN** the server dispatches `updateWateringTriggers` with the supplied values and returns the upstream result

### Requirement: Every write tool supports a preview mode

Every `update_*`, `create_*`, and `delete_*` tool defined by this capability SHALL accept an optional `preview` boolean argument (default false). When `preview` is true, the tool SHALL serialize the GraphQL operation name and the variables it would send and return them to the caller without dispatching the mutation. When `preview` is false or omitted, the tool SHALL dispatch the mutation as normal.

#### Scenario: Preview returns a planned payload

- **WHEN** any write tool defined by this capability is invoked with `preview: true`
- **THEN** the response includes the planned GraphQL operation name and the variables, includes a `preview: true` marker, and the server has not contacted Hydrawise's mutation endpoint for that call

### Requirement: Schedule write tools are clearly labeled as physical actions

Every `update_*`, `create_*`, and `delete_*` tool's MCP description SHALL begin with the literal prefix `PHYSICAL ACTION:` so MCP clients can present a confirmation prompt to the user before invocation, matching the convention of the v1 control tools (`start_zone`, `suspend_zone`, etc.).

#### Scenario: Tool catalog labels write tools

- **WHEN** an MCP client requests `tools/list`
- **THEN** every tool whose name begins with `update_`, `create_`, or `delete_` (excluding the v1 suspension tools, which already comply) has a `description` whose first text begins with `PHYSICAL ACTION:`

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

### Requirement: Patch tools are preferred for incremental edits

The server SHALL document in its tool catalog that when making incremental, targeted changes (changing one zone's run time, adjusting a day pattern, updating cycle/soak settings, etc.) callers SHOULD prefer the focused patch tools (`update_zone_run_time_in_program`, `update_program_day_pattern`, `update_program_start_times`, `update_zone_cycle_soak`, `update_zone_watering_adjustment`) over the full-payload `update_*` tools. The full-payload tools (`update_standard_program`, `update_zone_settings`, `update_zone_standard`) SHALL remain available and are the correct choice for bulk updates, restore-recipe playback, and cases where patch tools do not cover the required fields.

#### Scenario: Tool catalog provides precedence guidance

- **WHEN** an MCP client requests `tools/list` and inspects the description of `update_zone_run_time_in_program`
- **THEN** the description includes `PHYSICAL ACTION:` prefix and indicates it is the preferred tool for single-zone run-time changes within a Standard program

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

