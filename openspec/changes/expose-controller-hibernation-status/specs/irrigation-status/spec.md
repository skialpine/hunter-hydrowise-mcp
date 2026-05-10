## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: list_controllers includes scheduler status fields per controller

The server SHALL include `hibernate_status`, `status_summary`, `status_icon`, and `accumulated_water_savings_<unit>` for each entry returned by `list_controllers`, derived from the same `CONTROLLER_FIELDS` fragment used by `get_controller`.

#### Scenario: Account has one or more controllers including a hibernated one

- **WHEN** an MCP client calls `list_controllers` and one controller is hibernated
- **THEN** the hibernated controller entry includes `hibernate_status: true` and the active controllers include `hibernate_status: false` or `null`
