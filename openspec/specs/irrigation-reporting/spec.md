# irrigation-reporting Specification

## Purpose
Read-only reporting tools for the Hydrawise irrigation system. Exposes controller-level run event logs, per-zone run history, and aggregated run statistics for a configurable time period.

## Requirements

### Requirement: get_watering_report tool returns controller-level run event log
The server SHALL expose an MCP tool named `get_watering_report` that accepts a required integer `controller_id`, a required ISO-8601 date string `from`, and a required ISO-8601 date string `until`. It SHALL return an array of run events for all zones on the controller within the given date range. Each entry SHALL include zone id and name, the triggering program (if known), scheduled vs. reported start/end times, normal/scheduled/reported durations (in seconds), reported water usage with units, and the stop reason. The tool is read-only and carries no `preview` argument.

#### Scenario: Controller has runs in the requested range
- **WHEN** an MCP client calls `get_watering_report` with a valid `controller_id`, `from`, and `until` covering a period that includes zone runs
- **THEN** the response is an array of run-event objects, one per run, each containing at minimum `zone_id`, `zone_name`, `reported_start_time`, `reported_end_time`, `reported_duration_seconds`, `scheduled_duration_seconds`, `reported_water_usage`, and `stop_reason`

#### Scenario: No runs in the requested range
- **WHEN** an MCP client calls `get_watering_report` with a date range that contains no runs
- **THEN** the response is an empty array (not an error)

#### Scenario: Invalid date string provided
- **WHEN** an MCP client calls `get_watering_report` with a `from` or `until` value that cannot be parsed as a date
- **THEN** the tool returns an error result (isError: true) with kind `config_error`

### Requirement: get_zone_run_history tool returns past runs for a single zone
The server SHALL expose an MCP tool named `get_zone_run_history` that accepts a required integer `zone_id`. It SHALL return the zone's most recent run (as `last_run`) and an array of recent past runs (as `runs`). Each run entry SHALL include id, start time, end time, normal duration in minutes, actual duration in minutes, and status label. The tool is read-only.

#### Scenario: Zone has past run history
- **WHEN** an MCP client calls `get_zone_run_history` with a valid `zone_id` for a zone that has run at least once
- **THEN** the response contains `last_run` with the most recent run details, and `runs` as an array of recent past runs each including `start_time`, `end_time`, `normal_duration_minutes`, `duration_minutes`, and `status`

#### Scenario: Zone has never run
- **WHEN** an MCP client calls `get_zone_run_history` for a zone with no run history
- **THEN** the response is `{ "last_run": null, "runs": [] }` (not an error)

#### Scenario: Zone does not exist
- **WHEN** an MCP client calls `get_zone_run_history` with a `zone_id` that does not belong to the authenticated account
- **THEN** the tool returns an error result (isError: true) indicating the zone was not found

### Requirement: get_run_summary tool returns aggregated run statistics for a zone
The server SHALL expose an MCP tool named `get_run_summary` that accepts a required integer `zone_id` and a required enum `period` with values `CURRENT_WEEK`, `WEEK`, `MONTH`, or `YEAR`. For period values other than `CURRENT_WEEK`, callers SHALL supply the period-specific numeric arguments as follows:
- `WEEK`: `start_week` (Int, 1-53), `end_week` (Int, 1-53), `year` (Int)
- `MONTH`: `start_month` (Int, 1-12), `end_month` (Int, 1-12), `year` (Int)
- `YEAR`: `start_year` (Int), `end_year` (Int)

The response SHALL include `total_normal_run_time_minutes`, `total_actual_run_time_minutes`, and `total_water_volume` (value + unit) for the requested period. The tool is read-only.

#### Scenario: Summary for current week
- **WHEN** an MCP client calls `get_run_summary` with `period: "CURRENT_WEEK"` and a valid `zone_id`
- **THEN** the response contains run time totals and water volume for the current week to date, with no additional period arguments required

#### Scenario: Summary for a specific month range
- **WHEN** an MCP client calls `get_run_summary` with `period: "MONTH"`, `start_month`, `end_month`, `year`, and a valid `zone_id`
- **THEN** the response contains aggregated run time and water volume totals covering the requested months

#### Scenario: Period-specific args missing for non-CURRENT_WEEK period
- **WHEN** an MCP client calls `get_run_summary` with `period: "WEEK"` but omits `start_week`, `end_week`, or `year`
- **THEN** the tool returns an error result (isError: true) with kind `config_error`

#### Scenario: Zone has no run data for the period
- **WHEN** an MCP client calls `get_run_summary` for a zone with no runs in the requested period
- **THEN** the response contains zero values for all totals (not an error)

### Requirement: get_water_saving_summary tool is part of the reporting capability
The `get_water_saving_summary` tool SHALL be registered and documented as part of the irrigation-reporting capability (alongside `get_watering_report`, `get_zone_run_history`, `get_run_summary`). It is read-only.

#### Scenario: Tool is accessible via MCP
- **WHEN** an MCP client lists tools
- **THEN** `get_water_saving_summary` appears in the tool list alongside the other reporting tools
