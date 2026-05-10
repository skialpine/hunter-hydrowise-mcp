# irrigation-controller-config Specification

## Purpose
TBD - created by archiving change extend-snapshot-completeness. Update Purpose after archive.
## Requirements
### Requirement: update_location tool sets controller location

The server SHALL expose a write tool named `update_location` that accepts a required integer `controller_id`, optional string `address`, optional float `latitude`, and optional float `longitude`. At least one of `address`, `latitude`, or `longitude` SHALL be provided. When `address` is set, the tool dispatches `updateLocation`. When `latitude` and `longitude` are both set, the tool dispatches `updateLocationCoordinates`. The tool SHALL be marked as a `PHYSICAL ACTION:` and SHALL accept a `preview` boolean.

#### Scenario: Update address only

- **WHEN** an MCP client calls `update_location` with `controller_id` and `address`
- **THEN** the tool dispatches `updateLocation(deviceId, address)` and returns the resulting `Location` payload

#### Scenario: Update coordinates only

- **WHEN** an MCP client calls `update_location` with `controller_id`, `latitude`, and `longitude`
- **THEN** the tool dispatches `updateLocationCoordinates(deviceId, latitude, longitude)` and returns the resulting `Location` payload

#### Scenario: Update both address and coordinates

- **WHEN** an MCP client calls `update_location` with all three of `address`, `latitude`, `longitude`
- **THEN** both upstream mutations are dispatched in sequence and the combined result is returned

#### Scenario: Update with no fields provided

- **WHEN** an MCP client calls `update_location` with only `controller_id`
- **THEN** the tool returns a `config_error` indicating that at least one of `address`, `latitude`, or `longitude` is required

#### Scenario: Preview mode does not mutate state

- **WHEN** an MCP client calls `update_location` with `preview: true`
- **THEN** the tool returns the planned variables for each underlying upstream mutation without dispatching either, and the response payload reflects `preview: true`

### Requirement: update_controller_master_valve tool assigns a controller's master valve

The server SHALL expose a write tool named `update_controller_master_valve` that accepts a required integer `controller_id` and a required integer `zone_number` (the zone-number value to designate as master valve). The tool SHALL be marked as `PHYSICAL ACTION:` and accept a `preview` boolean.

#### Scenario: Assign master valve

- **WHEN** an MCP client calls `update_controller_master_valve` with valid arguments
- **THEN** the tool dispatches `updateControllerMasterValve(zoneNumber, controllerId)` and returns the updated `MasterValve` payload

### Requirement: update_controller_program_mode tool switches between STANDARD and ADVANCED

The server SHALL expose a write tool named `update_controller_program_mode` that accepts a required integer `controller_id` and a required string `program_mode` constrained to one of `STANDARD | ADVANCED`. The tool SHALL be marked as `PHYSICAL ACTION:` and accept a `preview` boolean.

#### Scenario: Switch to ADVANCED mode

- **WHEN** an MCP client calls `update_controller_program_mode` with `program_mode: ADVANCED`
- **THEN** the tool dispatches `updateControllerProgramMode(controllerId, programMode: ADVANCED)` and returns the updated `Controller` payload

#### Scenario: Reject unknown mode value

- **WHEN** an MCP client calls `update_controller_program_mode` with `program_mode: SOMETHING_ELSE`
- **THEN** the tool returns a `config_error` (Zod validation failure)

### Requirement: hibernate_controller and wake_controller tools control hibernation

The server SHALL expose write tools named `hibernate_controller` and `wake_controller`, each accepting only `controller_id`. Both tools are `PHYSICAL ACTION:` and accept a `preview` boolean.

#### Scenario: Hibernate a controller

- **WHEN** an MCP client calls `hibernate_controller`
- **THEN** the tool dispatches `hibernateController(controllerId)` and returns the boolean result

#### Scenario: Wake a hibernated controller

- **WHEN** an MCP client calls `wake_controller`
- **THEN** the tool dispatches `wakeController(controllerId)` and returns the boolean result

### Requirement: create_zone and delete_zone tools manage zone existence

The server SHALL expose write tools `create_zone` (wrapping `createZoneAdvanced`) and `delete_zone` (wrapping `deleteZone`). `create_zone` SHALL accept the same writable-zone payload as `update_zone_settings`, minus `zone_id` and plus `controller_id`. `delete_zone` SHALL accept only `zone_id`. Both tools are `PHYSICAL ACTION:` and accept a `preview` boolean.

#### Scenario: Create a zone on a fresh controller

- **WHEN** an MCP client calls `create_zone` with `controller_id` and a complete writable-zone payload
- **THEN** the tool dispatches `createZoneAdvanced(...)` and returns the created `Zone` (with the new `id`)

#### Scenario: Delete a zone

- **WHEN** an MCP client calls `delete_zone` with a valid `zone_id`
- **THEN** the tool dispatches `deleteZone(zoneId)` and returns the boolean result

#### Scenario: Reject deprecated createZone variant usage

- **WHEN** an MCP client searches for a `create_zone` tool
- **THEN** only the Advanced-variant is exposed; the deprecated `createZone` mutation (with `Int` cycleSoakEnable / runNextAvailableStartTime) is intentionally not wrapped

### Requirement: Controller-level numeric fields carry their unit in the name

Every numeric input or output field on `update_controller_master_valve`, `create_zone`, `update_zone_settings`, `create_expander`, `update_expander`, and the controller-level fields exposed by `get_controller` / `dump_controller_snapshot` (specifically `inter_zone_delay`, `master_valve.delay`, `master_valve.post_timer`) whose underlying Hydrawise type is a fixed-unit `Int` SHALL carry the unit as a name suffix. Identifier-class fields (`zone_number`, `controller_id`, `expander_id`) are exempt.

#### Scenario: Inter-zone delay is exposed in seconds

- **WHEN** an MCP client reads `controller.inter_zone_delay_seconds` from `get_controller` or `dump_controller_snapshot`
- **THEN** the field name ends in `_seconds` and the value is the integer count of seconds

#### Scenario: Master-valve timer fields carry the seconds suffix

- **WHEN** an MCP client inspects `controller.master_valve` in any read
- **THEN** the writable timer fields are named `delay_seconds` and `post_timer_seconds`, not bare `delay` / `post_timer`

#### Scenario: create_zone uses the same suffixed names as update_zone_settings

- **WHEN** an MCP client invokes `create_zone` with a writable-zone payload
- **THEN** the input field names match `update_zone_settings` exactly — `cycle_custom_time_minutes`, `soak_custom_time_minutes`, `run_time_minutes`, `watering_adjustment_percent`, etc. (so a snapshot value passes through without renaming)

#### Scenario: Tool description cites the unit source

- **WHEN** an MCP client requests `tools/list` and inspects any numeric input on these tools
- **THEN** the field's `.describe()` text names the unit and cites either the Hydrawise schema docstring, an inferred-from-default note, or "verified empirically against live controller"

### Requirement: Expander CRUD tools manage hardware expanders

The server SHALL expose write tools `create_expander`, `update_expander`, and `delete_expander`. `create_expander` accepts `controller_id`, `name`, `number`. `update_expander` accepts `expander_id`, `name`, `number`. `delete_expander` accepts `expander_id`. All tools are `PHYSICAL ACTION:` and accept a `preview` boolean.

#### Scenario: Create an expander

- **WHEN** an MCP client calls `create_expander` with valid arguments
- **THEN** the tool dispatches `createExpander(controllerId, name, number)` and returns the created `Expander` payload

#### Scenario: Delete an expander with preview

- **WHEN** an MCP client calls `delete_expander` with `preview: true`
- **THEN** the tool returns the planned variables without dispatching the upstream mutation

