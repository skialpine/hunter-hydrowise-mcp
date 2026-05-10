## Context

The project already has two run-history paths: `get_watering_report` (controller-level log via `ReportingQuery`) and `get_zone_run_history` (per-zone past runs). The upstream schema exposes a parallel set of forward-looking fields:

- `Zone.scheduledRuns: ScheduledZoneRuns!` — aggregated view with `currentRun`, `nextRun`, `runs[]`, `status`, `summary`
- `Zone.runsBetween(from: Int!, until: Int!): [ScheduledZoneRun]!` — explicit window
- `Zone.status: ZoneStatus!` — carries `nextRun: DateTime!`

There is a critical gotcha already in `CLAUDE.md`: `Zone.status.{lastRun, nextRun}` are `DateTime!` but null on zones with no run history, and selecting them inside `Controller.zones { ... }` causes HTTP 500s. The fan-out tool (`get_controller_schedule`) must therefore NOT use `Controller.zones { status { nextRun } }` — it must issue per-zone queries, or fetch `scheduledRuns` inside the `Controller.zones` fragment only if that path is known to be safe. The safe approach is per-zone queries for `runsBetween` (which returns `[]` for zones with no upcoming runs, not null).

`ScheduledZoneRun` has inline unit annotations in the schema:
```
normalDuration: Int!   "in minutes"
duration: Int!          "in minutes"
remainingTime: Int!     "in seconds"
```
These map directly to the project's unit-suffix convention.

All `startTime: DateTime!` and `endTime: DateTime!` fields are object types requiring `{ value }` sub-selection — matches the pattern used in `reporting.ts`.

## Goals / Non-Goals

**Goals:**
- Three new read tools: `get_zone_scheduled_runs`, `get_zone_next_run`, `get_controller_schedule`.
- Window defaults to now → now+7d (Unix epoch seconds) when `from`/`until` are omitted.
- Proper unit suffixes on all `ScheduledZoneRun` numeric fields.
- Fan-out tool uses per-zone queries to avoid the `Controller.zones { status }` 500.
- `get_controller_schedule` returns an array of `{ zone_id, zone_name, zone_number, runs[] }` — not a keyed map — so callers get zone name alongside run data without a secondary lookup, and integer zone IDs aren't used as JSON object keys.
- Fan-out fails fast (via `Promise.all`) if any zone query errors — no silent partial results.
- Zone-not-found on single-zone tools returns `not_found`, not `null` / `[]`.
- Validation error when `from >= until`, including when caller supplies only `until_epoch_seconds` in the past.

**Non-Goals:**
- Modifying past-run tools (`get_watering_report`, `get_zone_run_history`).
- Snapshot inclusion of upcoming schedules (they're ephemeral; backup captures config not telemetry).
- Exposing `ScheduledZoneRuns.waterUsage(since)` — separate concern, defer.
- Exposing `ScheduledZoneRuns.currentWaterUsage` — unit is `LocalizedValueType`; defer for focused scope.

## Decisions

### Tool decomposition: three tools vs. one combined

**Decision**: Three separate tools (`get_zone_scheduled_runs`, `get_zone_next_run`, `get_controller_schedule`).

**Rationale**: `get_zone_next_run` is a single lightweight query suitable for dashboards. The window-based tools are heavier (N per-zone queries for the fan-out). Combining into one tool with optional args would hide the cost difference. Separate tools match the project pattern of one-tool-per-semantic-operation.

### Fan-out strategy for `get_controller_schedule`

**Decision**: Issue one `Zone.runsBetween(from, until)` query per zone via `Promise.all`. Do NOT select `status { nextRun }` inside `Controller.zones { ... }`. If any zone query fails, `Promise.all` rejects and the entire tool call returns `api_error` — no partial results with silently-missing zones.

**Rationale**: The existing gotcha is that `Zone.status.{lastRun, nextRun}` null-in-bulk causes server-side 500s. `runsBetween` returns `[]` for zones with no upcoming runs — this is safe in bulk because it is not a nullable scalar inside a non-null parent; it is a list type. Probe the live API on an account with zones that have no upcoming runs to confirm before shipping.

**Partial failure behavior**: `Promise.allSettled` is explicitly rejected because a silently-absent zone is indistinguishable from a zone with no runs (`runs: []`), which violates the "all zones SHALL appear" spec requirement and makes data loss invisible to callers.

**Alternative considered**: Use `Zone.scheduledRuns.runs[]` inside `Controller.zones` — rejected until the bulk-null behavior of `scheduledRuns` is confirmed safe (not yet tested). If task 1.2 probe confirms safety, this becomes viable and eliminates the N-queries cost.

### Default window

**Decision**: `from` defaults to `Math.floor(Date.now() / 1000)` (now), `until` defaults to `from + 7 * 86400` (7 days). Both are validated: if `from >= until` throw `ConfigError`.

**Rationale**: A 7-day window covers one weekly program cycle. The caller can always narrow or widen it. `ConfigError` maps to `config_error` in `runTool` — the right error kind for bad input.

### `get_zone_next_run` data source

**Decision**: Use `Zone.scheduledRuns { nextRun { ... } }` rather than `Zone.status { nextRun { value } }`.

**Rationale**: `Zone.status.nextRun: DateTime!` is the field that goes null in bulk queries and causes 500s (per CLAUDE.md gotcha). `Zone.scheduledRuns` is a different path that has not been observed to cause 500s. Probe both on a zone with no upcoming runs before shipping; if `scheduledRuns.nextRun` is also unsafe, fall back to `runsBetween(now, now+1d)` and return the first result.

## Risks / Trade-offs

- **`Zone.scheduledRuns` null-in-bulk safety unknown** → Verify against a zone with no upcoming runs before using in `get_zone_next_run`. Fallback: use `runsBetween` window approach instead.
- **N per-zone queries for `get_controller_schedule`** → On large accounts this is slow. A controller with 30 zones = 30 queries. Document this in the tool description and suggest using `get_zone_scheduled_runs` for individual zones. If latency is a blocker, consider batching via a single `Controller.zones { runsBetween(...) }` fragment — but only after confirming safety.
- **`runsBetween` args are `Int!` (Unix seconds)** → Tool inputs are also `Int` (epoch seconds). The tool description must make the unit explicit. Field name convention requires `from_epoch_seconds` / `until_epoch_seconds` as input parameter names.

## Open Questions

- **Is `Zone.scheduledRuns { nextRun }` safe on zones with no upcoming runs?** Probe the live API — if it 500s, switch `get_zone_next_run` to `runsBetween(now, now+1d)[0]` instead.
- **Is `Controller.zones { scheduledRuns { runs } }` safe in bulk?** Probe to confirm before using in `get_controller_schedule` — if safe, it eliminates the N-queries cost. If not safe, keep the per-zone fan-out.
