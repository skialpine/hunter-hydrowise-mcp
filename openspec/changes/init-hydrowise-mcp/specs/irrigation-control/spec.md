## ADDED Requirements

### Requirement: start_zone tool runs a single zone

The server SHALL expose an MCP tool named `start_zone` that takes a required integer `zone_id` and an optional integer `minutes`. When `minutes` is omitted or `0`, the server SHALL start the zone using its configured default duration. When `minutes` is greater than `0`, the server SHALL convert it to seconds and pass it as the custom run duration. The tool SHALL stack the new run after any in-progress run rather than replacing it.

#### Scenario: Start with default duration

- **WHEN** an MCP client calls `start_zone` with only `zone_id`
- **THEN** the server invokes the Hydrawise `startZone` mutation for that zone with no custom duration, and the tool returns a success result on a non-error response

#### Scenario: Start with custom duration in minutes

- **WHEN** an MCP client calls `start_zone` with `zone_id=42` and `minutes=10`
- **THEN** the server invokes the Hydrawise `startZone` mutation for zone 42 with `customRunDuration=600` seconds and `stackRuns=true`

#### Scenario: Zone rejected by upstream

- **WHEN** an MCP client calls `start_zone` and the Hydrawise API returns a non-OK status with a summary string
- **THEN** the tool returns an error whose message includes that summary string

### Requirement: stop_zone tool stops a single zone

The server SHALL expose an MCP tool named `stop_zone` that takes a required integer `zone_id` and stops any in-progress run for that zone.

#### Scenario: Zone is running

- **WHEN** an MCP client calls `stop_zone` with the `zone_id` of a currently running zone
- **THEN** the server invokes the Hydrawise `stopZone` mutation and the tool returns a success result on a non-error response

### Requirement: start_all_zones tool runs every zone on a controller

The server SHALL expose an MCP tool named `start_all_zones` that takes a required integer `controller_id` and an optional integer `minutes`. The duration semantics SHALL match `start_zone`: omitted or `0` means each zone uses its configured default; a positive value is converted to seconds and applied to every zone.

#### Scenario: Start all with default durations

- **WHEN** an MCP client calls `start_all_zones` with only `controller_id`
- **THEN** the server invokes the Hydrawise `startAllZones` mutation for that controller with no custom duration

#### Scenario: Start all with custom duration

- **WHEN** an MCP client calls `start_all_zones` with `controller_id=7` and `minutes=5`
- **THEN** the server invokes the Hydrawise `startAllZones` mutation for controller 7 with `customRunDuration=300` seconds

### Requirement: stop_all_zones tool stops every zone on a controller

The server SHALL expose an MCP tool named `stop_all_zones` that takes a required integer `controller_id` and stops any in-progress run on every zone attached to that controller.

#### Scenario: Stop all zones

- **WHEN** an MCP client calls `stop_all_zones` with a valid `controller_id`
- **THEN** the server invokes the Hydrawise `stopAllZones` mutation for that controller and the tool returns a success result on a non-error response

### Requirement: suspend_zone tool suspends a zone's schedule

The server SHALL expose an MCP tool named `suspend_zone` that takes a required integer `zone_id` and exactly one of: an integer `days` (suspension length in days from now) or an ISO-8601 string `until` (absolute end timestamp). The tool SHALL reject calls that supply neither or both.

#### Scenario: Suspend by days

- **WHEN** an MCP client calls `suspend_zone` with `zone_id=42` and `days=3`
- **THEN** the server computes a `datetime` three days from the current time and invokes the Hydrawise `suspendZone` mutation for zone 42 with that timestamp

#### Scenario: Suspend until a specific time

- **WHEN** an MCP client calls `suspend_zone` with `zone_id=42` and `until="2026-05-20T08:00:00Z"`
- **THEN** the server invokes the Hydrawise `suspendZone` mutation for zone 42 with that exact timestamp

#### Scenario: Both arguments provided

- **WHEN** an MCP client calls `suspend_zone` with both `days` and `until`
- **THEN** the tool returns a validation error and does not invoke the Hydrawise API

#### Scenario: Neither argument provided

- **WHEN** an MCP client calls `suspend_zone` with only `zone_id`
- **THEN** the tool returns a validation error and does not invoke the Hydrawise API

### Requirement: resume_zone tool resumes a zone's schedule

The server SHALL expose an MCP tool named `resume_zone` that takes a required integer `zone_id` and clears any active suspension for that zone.

#### Scenario: Zone is suspended

- **WHEN** an MCP client calls `resume_zone` with the `zone_id` of a suspended zone
- **THEN** the server invokes the Hydrawise `resumeZone` mutation and the tool returns a success result on a non-error response

### Requirement: suspend_all_zones tool suspends every zone on a controller

The server SHALL expose an MCP tool named `suspend_all_zones` that takes a required integer `controller_id` and exactly one of `days` or `until`, with the same semantics and validation as `suspend_zone`.

#### Scenario: Suspend all by days

- **WHEN** an MCP client calls `suspend_all_zones` with `controller_id=7` and `days=14`
- **THEN** the server computes a `datetime` fourteen days from the current time and invokes the Hydrawise `suspendAllZones` mutation for controller 7 with that timestamp

#### Scenario: Both arguments provided

- **WHEN** an MCP client calls `suspend_all_zones` with both `days` and `until`
- **THEN** the tool returns a validation error and does not invoke the Hydrawise API

### Requirement: resume_all_zones tool resumes every zone on a controller

The server SHALL expose an MCP tool named `resume_all_zones` that takes a required integer `controller_id` and clears any active suspension for every zone attached to that controller.

#### Scenario: Controller has suspended zones

- **WHEN** an MCP client calls `resume_all_zones` with a valid `controller_id`
- **THEN** the server invokes the Hydrawise `resumeAllZones` mutation for that controller and the tool returns a success result on a non-error response
