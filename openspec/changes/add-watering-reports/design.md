## Context

The Hydrawise GraphQL API exposes three distinct reporting surfaces:

1. **`controller.reports.watering(from, until)`** — returns `[WateringReportEntry { runEvent: RunEventType }]` for all zones on a controller over a date range. `RunEventType` carries scheduled vs. reported start/end times, reported water usage, stop reason, and the program that triggered the run.
2. **`zone.pastRuns`** — returns `PastZoneRuns { lastRun, runs: [ScheduledZoneRun] }`. Simple: id, start/end time, normal/actual duration, remaining time, status.
3. **`zone.runSummary`** — returns `ZoneRunSummary` with `weekly`, `monthly`, `annual`, and `currentWeek` sub-fields. Each aggregates `totalNormalRunTime`, `totalActualRunTime`, and `totalWaterVolume`. Arguments vary by period (e.g. `weekly(startWeek, endWeek, year)`).

A parallel controller-level summary exists at `controller.runSummary` but omits water volume (only `totalNormalRunTime` / `totalActualRunTime`).

All three tools are read-only — no mutations, no `previewOrApply`.

## Goals / Non-Goals

**Goals:**
- `get_watering_report(controller_id, from, until)` — full run-event log for a controller+date-range
- `get_zone_run_history(zone_id)` — recent past runs for a single zone
- `get_run_summary(zone_id, period, ...)` — aggregated normal vs. actual run time (and water volume) for a zone over a period

**Non-Goals:**
- Controller-level run summary (`controller.runSummary`) — omits water volume, lower value; can be added later
- Deprecated `controller.reporting(option, startTime, endTime)` calendar/chart reports — complex opaque scalars, contractor-oriented
- Watering schedule (upcoming runs) — already partially surfaced via `list_zones` / `get_zone`; can extend separately
- Sensor / weather / flow-meter reports

## Decisions

### 1. New file `src/tools/reporting.ts`
One tool file per functional category is the established pattern (status, control, scheduling, backup). A `reporting.ts` file avoids bloating `status.ts` and keeps read-only reporting concerns isolated.

*Alternative considered*: add to `status.ts`. Rejected — `status.ts` is already dense and focuses on current state, not history.

### 2. Use `controller.reports.watering` (not deprecated `controller.reporting`)
`Reports.watering(from, until)` is the current non-deprecated API and returns structured `RunEventType` objects with typed fields. The deprecated `Reporting` type returns opaque `GeneralJson` and `ReportCalendar` scalars that would require JSON parsing with no type safety.

### 3. `get_zone_run_history` uses `zone.pastRuns` (no date args)
`pastRuns` requires no inputs and avoids Unix-timestamp conversion complexity. The schema also offers `zone.runsBetween(from, until)` but that's an optimization path — `pastRuns` is sufficient to answer "when did this zone last run?" and returns the same `ScheduledZoneRun` shape.

`pastRuns` is a single-zone query (not a bulk fan-out), so the `zones { ... }` 500-error gotcha does not apply here.

### 4. `get_run_summary` takes `period` enum + optional period-number args
The three `ZoneRunSummary` sub-fields (`weekly`, `monthly`, `annual`) each have different signatures. Rather than three separate tools, a single tool with a `period` discriminator keeps the surface clean:

- `period: "CURRENT_WEEK"` → `currentWeek` (no extra args)
- `period: "WEEK"` → `weekly(startWeek, endWeek, year)`
- `period: "MONTH"` → `monthly(startMonth, endMonth, year)`
- `period: "YEAR"` → `annual(startYear, endYear)`

The tool validates that required numeric args are present for the chosen period and throws `ConfigError` otherwise (same pattern as `resolveUntil`).

### 5. Date range inputs as ISO-8601 strings, converted to Unix timestamps
`controller.reports.watering(from, until)` takes `Int!` Unix timestamps. Tools accept ISO-8601 date strings (e.g. `"2026-05-01"`) and convert via `Math.floor(new Date(s).getTime() / 1000)`. This is friendlier for LLM callers than raw epoch integers.

A `parseUnixTimestamp(iso: string): number` helper will be added to `_helpers.ts`.

### 6. New serializers for `RunEventType` and `ScheduledZoneRun`
Following the existing pattern in `serializers.ts`:
- `serializeRunEvent(e: RunEventType)` — flat snake_case object with zone id/name, program id/name, all scheduled/reported timestamps, durations in seconds, water usage value+unit, stop reason
- `serializeScheduledZoneRun(r: ScheduledZoneRun)` — id, start/end times, normal/actual duration in minutes, status label

### 7. New TypeScript interfaces in `queries.ts`
`RunEventType`, `ScheduledZoneRun`, `PastZoneRuns`, `ZoneRunSummary`, `RunSummaryDetails` interfaces and the corresponding query strings will be added to `queries.ts`. New API methods go on `HydrawiseApi`.

## Risks / Trade-offs

- **`controller.reports.watering` fan-out** — this fetches runs for all zones on the controller. On accounts with many zones and wide date ranges it may be slow. Mitigations: document that narrower date ranges perform better; start with no artificial limit and add pagination only if real-account testing shows it's needed.
- **`ScheduledZoneRun.runs` size** — `pastRuns.runs` has no pagination argument in the schema. Unknown how many items the API returns. Serialize all of them; if the response is unwieldy, a `limit` arg can be added later.
- **`ZoneRunSummary` nullability** — all three sub-fields return nullable `RunSummaryDetails`. Zones with no run history will return `null`; the serializer must handle this gracefully.
- **Unit inconsistency** — `ScheduledZoneRun.normalDuration` / `duration` are **minutes**; `RunEventType.normalDuration` / `scheduledDuration` / `reportedDuration` are **seconds**. Serializers must normalize and document the unit in the output keys (e.g. `normal_duration_minutes` vs `normal_duration_seconds`).

## Open Questions

- None blocking implementation. After real-account testing, evaluate whether `get_watering_report` needs a `limit` or pagination argument for wide date ranges.
