# irrigation-scheduled-runs Specification

## Purpose
TBD - created by archiving change expose-scheduled-runs. Update Purpose after archive.
## Requirements
### Requirement: get_zone_scheduled_runs tool returns upcoming runs for a zone within a time window

The server SHALL expose an MCP tool named `get_zone_scheduled_runs` that takes a required integer `zone_id` and optional integers `from_epoch_seconds` and `until_epoch_seconds`. When `from_epoch_seconds` is omitted it defaults to the current time. When `until_epoch_seconds` is omitted it defaults to seven days after `from_epoch_seconds`. The tool SHALL return an array of scheduled run objects, each containing `id`, `start_time` (ISO-8601 string), `end_time` (ISO-8601 string), `normal_duration_minutes` (int), `duration_minutes` (int), `remaining_time_seconds` (int), and `status` (object with `value` and `label`).

#### Scenario: Zone has upcoming runs in the window

- **WHEN** an MCP client calls `get_zone_scheduled_runs` with a valid `zone_id` and a window that contains scheduled runs
- **THEN** the response is a non-empty array of run objects with all required fields populated

#### Scenario: Zone has no upcoming runs in the window

- **WHEN** an MCP client calls `get_zone_scheduled_runs` with a valid `zone_id` and a window with no scheduled runs (e.g., suspended zone or no program matching)
- **THEN** the response is an empty array (not an error)

#### Scenario: Default window is now to now+7d

- **WHEN** an MCP client calls `get_zone_scheduled_runs` with only `zone_id` supplied
- **THEN** the response reflects runs in the range [current time, current time + 7 days]

#### Scenario: from_epoch_seconds >= until_epoch_seconds is a validation error

- **WHEN** an MCP client supplies `from_epoch_seconds` greater than or equal to `until_epoch_seconds`
- **THEN** the tool returns a `config_error` without calling the upstream API

#### Scenario: until_epoch_seconds in the past triggers a validation error

- **WHEN** an MCP client supplies only `until_epoch_seconds` with a value before the current time (causing the defaulted `from` to exceed `until`)
- **THEN** the tool returns a `config_error` without calling the upstream API

#### Scenario: Zone does not exist or belongs to a different account

- **WHEN** an MCP client calls `get_zone_scheduled_runs` with a `zone_id` that does not exist or does not belong to the authenticated user
- **THEN** the tool returns a `not_found` error (not an empty array)

### Requirement: get_zone_next_run tool returns the immediately upcoming run for a zone

The server SHALL expose an MCP tool named `get_zone_next_run` that takes a required integer `zone_id` and returns the next scheduled run for that zone, or `null` if no run is scheduled. The returned run object SHALL contain the same fields as entries in `get_zone_scheduled_runs`. The tool SHALL return `null` only when the zone exists and genuinely has no upcoming run — a missing or unauthorized zone SHALL produce a `not_found` error.

#### Scenario: Zone has a next run

- **WHEN** an MCP client calls `get_zone_next_run` for a zone that has a future scheduled run
- **THEN** the response is a single run object with `start_time`, `end_time`, `duration_minutes`, and other fields

#### Scenario: Zone has no next run

- **WHEN** an MCP client calls `get_zone_next_run` for a zone that has no upcoming run (suspended, no program, or past end of program range)
- **THEN** the response is `null` (not an error)

#### Scenario: Zone does not exist or belongs to a different account

- **WHEN** an MCP client calls `get_zone_next_run` with a `zone_id` that does not exist or does not belong to the authenticated user
- **THEN** the tool returns a `not_found` error (not `null`)

### Requirement: get_controller_schedule tool returns a per-zone run timeline for a controller

The server SHALL expose an MCP tool named `get_controller_schedule` that takes a required integer `controller_id` and optional integers `from_epoch_seconds` and `until_epoch_seconds` (same defaults as `get_zone_scheduled_runs`). The tool SHALL return an array of per-zone objects, each with shape `{ zone_id, zone_name, zone_number, runs[] }`. Every zone on the controller SHALL appear in the array; zones with no runs in the window SHALL appear with an empty `runs` array rather than being omitted.

#### Scenario: Controller has multiple zones with runs in the window

- **WHEN** an MCP client calls `get_controller_schedule` with a valid `controller_id` and a window covering upcoming runs
- **THEN** the response is an array with one entry per zone, with `runs` populated for zones that have upcoming runs and `[]` for zones that do not

#### Scenario: All zones are suspended

- **WHEN** all zones on the controller are suspended or have no programs matching the window
- **THEN** the response contains an entry for every zone, each with `runs: []`

#### Scenario: One zone query fails during fan-out

- **WHEN** the per-zone `runsBetween` query for one zone returns an API error
- **THEN** the tool returns an `api_error` for the entire call — partial results with a silently missing zone SHALL NOT be returned

#### Scenario: from_epoch_seconds >= until_epoch_seconds is a validation error

- **WHEN** an MCP client supplies `from_epoch_seconds` greater than or equal to `until_epoch_seconds`
- **THEN** the tool returns a `config_error` without calling the upstream API

### Requirement: ScheduledZoneRun fields carry unit suffixes

All fixed-unit numeric fields on scheduled run objects returned by the three new tools SHALL use the project unit-suffix naming convention: `normal_duration_minutes`, `duration_minutes`, `remaining_time_seconds`. No bare numeric field names without unit suffixes SHALL appear in run objects.

#### Scenario: Run object fields are correctly named

- **WHEN** an MCP client inspects any scheduled run object from any of the three new tools
- **THEN** the fields `normal_duration_minutes`, `duration_minutes`, and `remaining_time_seconds` are present and the lint-numeric-units test passes

