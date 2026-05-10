# irrigation-status Specification

## Purpose
TBD - created by archiving change init-hydrowise-mcp. Update Purpose after archive.
## Requirements
### Requirement: get_user tool returns the authenticated user

The server SHALL expose an MCP tool named `get_user` that takes no arguments and returns the Hydrawise user record for the credentials in use, including at minimum the user's id, email, and customer name.

#### Scenario: Authenticated user is returned

- **WHEN** an MCP client calls `get_user`
- **THEN** the response is a single object containing the user's `id`, `email`, and `name` fields populated from the Hydrawise `me` query

### Requirement: list_controllers tool returns all controllers on the account

The server SHALL expose an MCP tool named `list_controllers` that takes no arguments and returns the list of controllers associated with the authenticated user. Each entry SHALL include at minimum `id`, `name`, `serial_number`, and `online` status.

#### Scenario: Account has one or more controllers

- **WHEN** an MCP client calls `list_controllers`
- **THEN** the response is an array with one entry per controller on the account, each containing the controller's `id`, `name`, `serial_number`, and `online` status

#### Scenario: Account has no controllers

- **WHEN** an MCP client calls `list_controllers` for an account with no controllers
- **THEN** the response is an empty array (not an error)

### Requirement: list_controllers includes scheduler status fields per controller

The server SHALL include `hibernate_status`, `status_summary`, `status_icon`, and `accumulated_water_savings_<unit>` for each entry returned by `list_controllers`, derived from the same `CONTROLLER_FIELDS` fragment used by `get_controller`.

#### Scenario: Account has one or more controllers including a hibernated one

- **WHEN** an MCP client calls `list_controllers` and one controller is hibernated
- **THEN** the hibernated controller entry includes `hibernate_status: true` and the active controllers include `hibernate_status: false` or `null`

### Requirement: get_controller tool returns a single controller by id

The server SHALL expose an MCP tool named `get_controller` that takes a required integer `controller_id` and returns the matching controller's details, or an error if the controller does not exist or does not belong to the authenticated user. The response SHALL include `hibernate_status` (boolean or null), `status_summary` (string), `status_icon` (string), and `accumulated_water_savings_<unit>` (integer with verified unit suffix) in addition to the existing fields.

#### Scenario: Controller exists

- **WHEN** an MCP client calls `get_controller` with a valid `controller_id`
- **THEN** the response is the controller object with `id`, `name`, `serial_number`, `online` status, and any additional metadata exposed by the Hydrawise schema

#### Scenario: Controller does not exist

- **WHEN** an MCP client calls `get_controller` with a `controller_id` that is not on the authenticated account
- **THEN** the tool returns an error indicating the controller could not be found

#### Scenario: Controller is hibernated

- **WHEN** an MCP client calls `get_controller` for a controller that is currently hibernated
- **THEN** the response includes `hibernate_status: true` and a `status_summary` reflecting the hibernated state (e.g., "Sleeping")

#### Scenario: Controller has unknown hibernate status

- **WHEN** the upstream API returns `null` for `hibernateStatus` (older firmware)
- **THEN** the response includes `hibernate_status: null` and the tool does not error

### Requirement: list_zones tool returns zones for a controller

The server SHALL expose an MCP tool named `list_zones` that takes a required integer `controller_id` and returns the zones attached to that controller. Each entry SHALL include at minimum `id`, `name`, `number`, and current run/suspension state.

#### Scenario: Controller has zones

- **WHEN** an MCP client calls `list_zones` with the `controller_id` of a controller that has zones
- **THEN** the response is an array of zone objects, each containing `id`, `name`, `number`, and the zone's current state

#### Scenario: Controller_id is invalid

- **WHEN** an MCP client calls `list_zones` with a `controller_id` that does not belong to the authenticated user
- **THEN** the tool returns an error indicating the controller could not be found

### Requirement: get_zone tool returns a single zone by id

The server SHALL expose an MCP tool named `get_zone` that takes a required integer `zone_id` and returns the matching zone, or an error if the zone does not exist or does not belong to the authenticated user.

#### Scenario: Zone exists

- **WHEN** an MCP client calls `get_zone` with a valid `zone_id`
- **THEN** the response is the zone object with `id`, `name`, `number`, current run state, and any active suspension

#### Scenario: Zone does not exist

- **WHEN** an MCP client calls `get_zone` with a `zone_id` that is not on the authenticated account
- **THEN** the tool returns an error indicating the zone could not be found

