# water-saving-summary Specification

## Purpose
Period-scoped water savings reporting for the Hydrawise irrigation system. Exposes a read-only controller-level summary of normal vs. scheduled runtime durations and derived savings metrics for a configurable period (week, month, quarter, or year).

## Requirements

### Requirement: get_water_saving_summary tool returns period-scoped savings report
The server SHALL expose a read-only MCP tool named `get_water_saving_summary` that accepts a required integer `controller_id`, a required integer `year`, a required enum `period` with values `WEEK`, `MONTH`, `QUARTER`, or `YEAR`, and an optional integer `period_number`. For `WEEK`, `MONTH`, and `QUARTER` periods, callers SHALL supply `period_number` (1–53 for WEEK, 1–12 for MONTH, 1–4 for QUARTER). For `YEAR`, `period_number` SHALL be omitted. The tool wraps `Controller.reports.overviews.periodSummary(year, period, periodNumber).details.waterSavingSummary` and returns `normal_duration_minutes`, `scheduled_duration_minutes`, `savings_minutes`, and `savings_percent`. The tool is read-only and carries no `preview` argument.

#### Scenario: Period with watering activity returns savings data
- **WHEN** an MCP client calls `get_water_saving_summary` with a valid `controller_id`, a `year`, `period: "MONTH"`, and a `period_number` covering a month that had watering runs
- **THEN** the response contains `normal_duration_minutes`, `scheduled_duration_minutes`, `savings_minutes` (the difference), and `savings_percent` (rounded to one decimal place)

#### Scenario: No watering in period returns zero durations
- **WHEN** an MCP client calls `get_water_saving_summary` for a period that had no watering runs
- **THEN** the response contains `normal_duration_minutes: 0`, `scheduled_duration_minutes: 0`, `savings_minutes: 0`, and `savings_percent: null`

#### Scenario: period_number required for WEEK/MONTH/QUARTER
- **WHEN** an MCP client calls `get_water_saving_summary` with `period: "WEEK"` but omits `period_number`
- **THEN** the tool returns an error result (isError: true) with kind `config_error`

#### Scenario: period_number omitted for YEAR
- **WHEN** an MCP client calls `get_water_saving_summary` with `period: "YEAR"` and omits `period_number`
- **THEN** the tool succeeds and returns the full-year savings aggregate

#### Scenario: API returns null details
- **WHEN** the upstream `periodSummary.details` is null (controller has no reporting data)
- **THEN** the tool returns a result with all fields null (not an error)
