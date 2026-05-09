## ADDED Requirements

### Requirement: dump_controller_snapshot tool returns a per-controller snapshot as JSON

The server SHALL expose an MCP tool named `dump_controller_snapshot` that takes a required integer `controller_id` and returns a single JSON object representing that controller's readable state. The object SHALL include `snapshot_version` (integer), `captured_at` (ISO-8601 timestamp), `server_version` (string), `user`, and `controller` (singular). The `controller` value SHALL include the controller's basic fields (id, name, online, serial_number, last_contact_time) plus arrays for `zones`, `programs`, `program_start_times`, and the objects `seasonal_adjustments` (containing a 12-element integer array) and `watering_triggers`. Each `zone` entry SHALL include the zone's basic fields plus `settings` (the readable watering settings).

#### Scenario: Snapshot a controller with several zones and programs

- **WHEN** an MCP client calls `dump_controller_snapshot` with a `controller_id` of an account-owned controller
- **THEN** the response is a JSON object whose `controller.zones` array has one entry per zone with a populated `settings` object, `controller.programs` is an array (possibly empty), `controller.program_start_times` is an array, and the top-level envelope contains `snapshot_version`, `captured_at`, `server_version`, and `user`

#### Scenario: Snapshot of an unknown controller_id

- **WHEN** an MCP client calls `dump_controller_snapshot` with a `controller_id` that does not belong to the authenticated account
- **THEN** the tool returns an `isError: true` result indicating the controller could not be found, and does not return a partial snapshot

#### Scenario: Authentication failure during snapshot

- **WHEN** an MCP client calls `dump_controller_snapshot` and the underlying Hydrawise API rejects the credentials
- **THEN** the tool returns an `isError: true` result categorized as an authentication failure, and does not return a partial snapshot

### Requirement: Snapshot envelope is versioned

The snapshot JSON SHALL include `snapshot_version: 1` as a top-level integer field so future readers can detect format and migrate. The version SHALL be incremented whenever the shape of the snapshot changes in a backward-incompatible way.

#### Scenario: Snapshot is parseable by version

- **WHEN** any client reads the JSON returned by `dump_controller_snapshot`
- **THEN** the `snapshot_version` field is present at the top level, equal to `1` for the initial implementation, and the field name is stable across calls

### Requirement: Snapshot is read-only and side-effect-free

The `dump_controller_snapshot` tool SHALL NOT issue any GraphQL mutations and SHALL NOT write to the local filesystem. The server SHALL NOT cache, persist, or otherwise retain the returned snapshot beyond the lifetime of the MCP tool response.

#### Scenario: Snapshot does not modify state

- **WHEN** `dump_controller_snapshot` is invoked
- **THEN** the only outbound calls are GraphQL queries (no mutations) and no file writes occur on the server host

### Requirement: Snapshot scope is configuration, not telemetry

The snapshot SHALL include the user reference, the controller header, zones with their watering settings, programs, program start times, seasonal adjustments, and watering triggers. The snapshot SHALL NOT include sensors, weather stations, gateways, alerts, run-event histories, weather observations, or any other telemetry-class data.

#### Scenario: Telemetry fields are absent

- **WHEN** an MCP client inspects the snapshot JSON
- **THEN** there are no top-level or nested fields named `sensors`, `weather_stations`, `gateways`, `alerts`, `run_events`, or `weather_observations`
