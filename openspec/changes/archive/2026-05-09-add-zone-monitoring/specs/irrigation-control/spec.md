## MODIFIED Requirements

### Requirement: start_zone tool runs a single zone

The server SHALL expose an MCP tool named `start_zone` that takes a required integer `zone_id`, an optional integer `minutes`, and two optional booleans `learn_current_from_next_run` and `learn_flow_from_next_run`. When `minutes` is omitted or `0`, the server SHALL start the zone using its configured default duration. When `minutes` is greater than `0`, the server SHALL convert it to seconds and pass it as the custom run duration. The tool SHALL stack the new run after any in-progress run rather than replacing it. When either learn flag is `true`, the server SHALL forward the corresponding `learnCurrentFromNextRun` / `learnFlowFromNextRun` argument to the upstream `startZone` mutation so the controller learns the baseline value during this run; when omitted or `false`, no learning is requested.

#### Scenario: Start with default duration

- **WHEN** an MCP client calls `start_zone` with only `zone_id`
- **THEN** the server invokes the Hydrawise `startZone` mutation for that zone with no custom duration, and the tool returns a success result on a non-error response

#### Scenario: Start with custom duration in minutes

- **WHEN** an MCP client calls `start_zone` with `zone_id=42` and `minutes=10`
- **THEN** the server invokes the Hydrawise `startZone` mutation for zone 42 with `customRunDuration=600` seconds and `stackRuns=true`

#### Scenario: Start and learn flow on next run

- **WHEN** an MCP client calls `start_zone` with `zone_id=42`, `minutes=10`, and `learn_flow_from_next_run: true`
- **THEN** the dispatched `startZone` mutation includes `learnFlowFromNextRun: true` (and `learnCurrentFromNextRun` omitted or false)

#### Scenario: Zone rejected by upstream

- **WHEN** an MCP client calls `start_zone` and the Hydrawise API returns a non-OK status with a summary string
- **THEN** the tool returns an error whose message includes that summary string

### Requirement: start_all_zones tool runs every zone on a controller

The server SHALL expose an MCP tool named `start_all_zones` that takes a required integer `controller_id`, an optional integer `minutes`, and two optional booleans `learn_current_from_next_run` and `learn_flow_from_next_run`. The duration semantics SHALL match `start_zone`: omitted or `0` means each zone uses its configured default; a positive value is converted to seconds and applied to every zone. When either learn flag is `true`, the server SHALL forward it to the upstream `startAllZones` mutation so all zones learn their baselines during this run.

#### Scenario: Start all with default durations

- **WHEN** an MCP client calls `start_all_zones` with only `controller_id`
- **THEN** the server invokes the Hydrawise `startAllZones` mutation for that controller with no custom duration

#### Scenario: Start all with custom duration

- **WHEN** an MCP client calls `start_all_zones` with `controller_id=7` and `minutes=5`
- **THEN** the server invokes the Hydrawise `startAllZones` mutation for controller 7 with `customRunDuration=300` seconds

#### Scenario: Start all and learn current on next run

- **WHEN** an MCP client calls `start_all_zones` with `controller_id=7` and `learn_current_from_next_run: true`
- **THEN** the dispatched `startAllZones` mutation includes `learnCurrentFromNextRun: true`
