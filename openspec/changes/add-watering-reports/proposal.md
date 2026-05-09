## Why

The MCP server has no visibility into watering history or run summaries, so an AI assistant cannot answer basic questions like "did my zones run this week?" or "how much water did zone 3 use last month?" The Hydrawise API exposes this data — it just isn't surfaced yet.

## What Changes

- Add `get_watering_report` tool — controller-level run log for a date range, returning scheduled vs. reported times, water usage, and stop reasons per zone
- Add `get_zone_run_history` tool — past runs for a specific zone (last run + recent history)
- Add `get_run_summary` tool — aggregated normal vs. actual run time (and optionally water volume) for a zone or controller, over weekly/monthly/annual periods

## Capabilities

### New Capabilities
- `irrigation-reporting`: Read-only tools for querying watering history, zone run history, and run summaries from the Hydrawise API

### Modified Capabilities
- `irrigation-status`: `get_zone` will expose `scheduledRuns` and `pastRuns` fields from the live schema (currently omitted from the zone query)

## Impact

- New GraphQL queries added to `src/hydrawise/queries.ts`
- New API methods on `HydrawiseApi` in `src/hydrawise/api.ts`
- New read-only tools registered in a new `src/tools/reporting.ts` file
- New serializers in `src/tools/serializers.ts` for run event and summary types
- New unit tests for serializers; new integration test coverage for the reporting tools
- No mutations; no breaking changes to existing tools
