## Why

The MCP exposes only past runs (`get_watering_report`, `get_zone_run_history`) — there is no way to ask "what is scheduled to run next?" from within the MCP, which is the first question after waking a hibernated controller, editing programs, or after a rain-trigger suspension. The upstream Hydrawise schema exposes `Zone.runsBetween(from, until)`, `Zone.scheduledRuns`, and per-zone `nextRun` with zero new dependencies.

## What Changes

- New tool `get_zone_scheduled_runs(zone_id, from_epoch_seconds?, until_epoch_seconds?)` — wraps `Zone.runsBetween(from, until)` with a default window of now → now+7d when arguments are omitted. Returns an array of scheduled run objects with start/end/duration normalized per project conventions.
- New tool `get_zone_next_run(zone_id)` — returns a single next-run summary from `Zone.scheduledRuns.nextRun`. Cheap; useful for status checks.
- New tool `get_controller_schedule(controller_id, from_epoch_seconds?, until_epoch_seconds?)` — fans out `runsBetween` across all zones on the controller and returns a per-zone timeline. Default window: now → now+7d.
- New file `src/tools/schedule-reads.ts` (or added to `status.ts`) containing the three tool handlers.
- All `ScheduledZoneRun` numeric fields serialized with unit suffixes: `normal_duration_minutes`, `duration_minutes`, `remaining_time_seconds` (units are documented in the live schema).

## Capabilities

### New Capabilities

- `irrigation-scheduled-runs`: MCP read tools that expose upcoming and currently-running zone schedules.

### Modified Capabilities

_(none — existing tools are unchanged)_

## Impact

- `src/hydrawise/queries.ts` — new queries for `Zone.runsBetween`, `Zone.scheduledRuns`, and fan-out.
- `src/tools/schedule-reads.ts` (new) — three tool handlers + serializer for `ScheduledZoneRun`.
- `src/server.ts` — register the three new tools.
- Tests: unit tests for `ScheduledZoneRun` serialization; integration tests for empty-result, window-with-runs, and `from > until` validation-error cases.
- `CLAUDE.md` — gotchas for `Zone.status.nextRun` null-in-bulk-fan-out behavior and `DateTime` sub-selection requirement.
