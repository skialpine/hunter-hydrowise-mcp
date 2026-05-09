## ADDED Requirements

### Requirement: get_zone_settings tool returns the zone's full watering settings

The server SHALL expose an MCP tool named `get_zone_settings` that takes a required integer `zone_id` and returns the readable watering-settings fields for that zone — at minimum `run_time`, `watering_mode`, `watering_frequency_mode`, `fixed_watering_frequency`, `smart_watering_frequency`, `cycle_soak_enable`, `cycle_custom_time`, `soak_custom_time`, `watering_adjustment`, and `factors` (the 12-month seasonal adjustment array if present on the zone).

#### Scenario: Zone exists

- **WHEN** an MCP client calls `get_zone_settings` with a valid `zone_id`
- **THEN** the response is a JSON object containing the listed settings fields populated from the Hydrawise zone record

#### Scenario: Zone does not exist

- **WHEN** an MCP client calls `get_zone_settings` with a `zone_id` that does not belong to the authenticated account
- **THEN** the tool returns an `isError: true` result indicating the zone could not be found

### Requirement: update_zone_settings tool accepts a full writable zone payload

The server SHALL expose an MCP tool named `update_zone_settings` that takes a required integer `zone_id`, an optional `preview` boolean (default false), and every writable field that the upstream `updateZone` mutation requires. The tool SHALL validate the payload via Zod, optionally preview it, and dispatch a single `updateZone` mutation. Tool descriptions SHALL be prefixed with `PHYSICAL ACTION:` so MCP clients prompt for confirmation. Callers are expected to obtain the current values via `get_zone_settings` (or from a recent snapshot) and pass the complete object back with the desired fields modified.

#### Scenario: Apply a full-payload update

- **WHEN** an MCP client calls `update_zone_settings` with `{ zone_id: 42, name, number, run_time, watering_mode, watering_frequency_mode, ... }` (every required field) and `preview` is omitted or false
- **THEN** the tool validates the payload, dispatches Hydrawise's `updateZone` mutation with the supplied values, and returns the upstream `StatusCodeAndSummary`

#### Scenario: Missing required field is rejected client-side

- **WHEN** an MCP client calls `update_zone_settings` without one of the upstream-required fields (e.g. omitting `watering_mode`)
- **THEN** the tool returns an `isError: true` Tool Execution Error naming the missing field, and does not contact Hydrawise

#### Scenario: Preview mode does not mutate state

- **WHEN** an MCP client calls `update_zone_settings` with the full payload and `preview: true`
- **THEN** the tool returns the GraphQL operation name and the variables it would send, the response's `preview` flag is `true`, and no mutation is dispatched to Hydrawise

#### Scenario: Upstream rejects the update

- **WHEN** an MCP client calls `update_zone_settings` with values that Hydrawise rejects (e.g. invalid frequency mode)
- **THEN** the tool returns an `isError: true` result whose message contains the upstream `summary` string

### Requirement: get_seasonal_adjustments and update_seasonal_adjustments form a paired set

The server SHALL expose `get_seasonal_adjustments(controller_id)` returning the 12-element integer factor array and `update_seasonal_adjustments(controller_id, factors, preview?)` that takes the controller id, a required `factors` array of exactly 12 integers, and an optional `preview` boolean. Tool descriptions SHALL be prefixed with `PHYSICAL ACTION:`.

#### Scenario: Read seasonal adjustments

- **WHEN** an MCP client calls `get_seasonal_adjustments` with a valid `controller_id`
- **THEN** the response is a JSON object containing `factors` as an array of exactly 12 integers

#### Scenario: Update with preview

- **WHEN** an MCP client calls `update_seasonal_adjustments` with `controller_id`, a 12-integer `factors` array, and `preview: true`
- **THEN** the tool returns the planned mutation payload and does not dispatch the mutation

#### Scenario: Update with wrong number of factors

- **WHEN** an MCP client calls `update_seasonal_adjustments` with a `factors` array whose length is not 12
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

The server SHALL expose `list_programs(controller_id)` returning programs with a `program_type` discriminator equal to `Standard` for standard programs and `Time` / `Smart` / `VirtualSolarSync` for the watering-program subtypes. The server SHALL also expose:

- `get_program(program_id, program_type)` — returns full per-program detail; the `program_type` argument lets the server pick the right query path.
- `create_standard_program(controller_id, ...full_payload, preview?)` — wraps `createStandardProgram`.
- `update_standard_program(program_id, controller_id, preview?, ...full_payload)` — accepts the complete writable payload and dispatches `updateStandardProgram`.
- `delete_standard_program(program_id, controller_id, preview?)` — wraps `deleteStandardProgram`.

Write tools SHALL be prefixed `PHYSICAL ACTION:`.

#### Scenario: List programs returns mixed types

- **WHEN** an MCP client calls `list_programs` for a controller that has at least one standard program and at least one watering program
- **THEN** the response is a JSON array with each entry containing a `program_type` field whose value is one of `Standard`, `Time`, `Smart`, `VirtualSolarSync`

#### Scenario: Update a standard program with preview

- **WHEN** an MCP client calls `update_standard_program` with the program id and full writable payload and `preview: true`
- **THEN** the response contains the GraphQL operation name and the variables that would be dispatched, and Hydrawise's `updateStandardProgram` is not invoked

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
