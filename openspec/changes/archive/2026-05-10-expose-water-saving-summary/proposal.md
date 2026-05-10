## Why

The MCP has two related gaps around water savings data. First, `accumulated_water_savings` is emitted as a bare integer with no unit annotation, violating the project's unit-suffix/wrapping convention — downstream consumers can't tell whether `100` means gallons or liters without knowing the account locale. Second, the only period-scoped savings data available requires 22+ `get_run_summary` calls and manual arithmetic, even though the upstream schema exposes a purpose-built `WaterSavingSummary` type. Both gaps are fixed together since they share the same locale/unit concern.

## What Changes

- **Wrap `accumulated_water_savings`**: change from bare `Int` to `{value, unit}` (locale-aware), remove from `IDENTIFIER_WHITELIST`, bump snapshot version to 8
- **Add `get_water_saving_summary` tool**: new read-only tool wrapping `Details.waterSavingSummary` / `ReportDetails.waterSavingSummary` schema paths
  - Period-selectable: `CURRENT_WEEK | WEEK | MONTH | YEAR` (matches existing `get_run_summary`)
  - Returns: `normal_duration_minutes`, `scheduled_duration_minutes`, `savings_minutes`, `savings_percent`, `water_saved` as `{value, unit}`, and per-zone breakdown if available
- **CLAUDE.md**: update the `accumulated_water_savings` gotcha to document the new shape; add a new gotcha distinguishing lifetime vs period-scoped savings

## Capabilities

### New Capabilities

- `water-saving-summary`: Period-scoped water savings report — normal vs scheduled run durations, savings delta (minutes + percent), water volume saved as a locale-aware `{value, unit}`, and per-zone breakdown when available

### Modified Capabilities

- `irrigation-reporting`: Add `get_water_saving_summary` to the reporting tool set
- `irrigation-backup`: `accumulated_water_savings` field shape changes from bare `Int` to `{value, unit}`; snapshot version bumps to 8

## Impact

- `src/tools/reporting.ts` — add `get_water_saving_summary` handler
- `src/tools/serializers.ts` — update `accumulated_water_savings` serialization; remove from `IDENTIFIER_WHITELIST`
- `src/hydrawise/queries.ts` — add `WATER_SAVING_SUMMARY_QUERY`
- `src/hydrawise/api.ts` — add `getWaterSavingSummary()` typed wrapper
- `src/tools/backup.ts` — bump `SNAPSHOT_VERSION` to 8
- `tests/unit/lint-numeric-units.test.ts` — remove `accumulated_water_savings` from whitelist assertions
- `CLAUDE.md` — update gotcha + add new gotcha
- No new npm dependencies; no breaking changes to tools (only snapshot shape change)
