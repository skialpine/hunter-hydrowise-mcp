## 1. GraphQL types and queries

- [x] 1.1 Add `RunEventType`, `ScheduledZoneRun`, `PastZoneRuns`, `ZoneRunSummary`, and `RunSummaryDetails` TypeScript interfaces to `src/hydrawise/queries.ts`
- [x] 1.2 Add `WATERING_REPORT_QUERY` — `controller { reports { watering(from, until) { runEvent { ... } } } }` using `controllerId: Int!, from: Int!, until: Int!`
- [x] 1.3 Add `ZONE_PAST_RUNS_QUERY` — `zone(zoneId) { pastRuns { lastRun { ... } runs { ... } } }` selecting all `ScheduledZoneRun` fields
- [x] 1.4 Add `ZONE_RUN_SUMMARY_QUERY` — `zone(zoneId) { runSummary { currentWeek { ... } weekly(...) { ... } monthly(...) { ... } annual(...) { ... } } }` with all period sub-fields; pass unused period args as null/omitted via variables

## 2. API methods

- [x] 2.1 Add `getWateringReport(controllerId: number, from: number, until: number): Promise<RunEventType[]>` to `HydrawiseApi`
- [x] 2.2 Add `getZonePastRuns(zoneId: number): Promise<PastZoneRuns>` to `HydrawiseApi`
- [x] 2.3 Add `getZoneRunSummary(zoneId: number, period: RunSummaryPeriod, args: RunSummaryArgs): Promise<RunSummaryDetails | null>` to `HydrawiseApi` — accepts a discriminated period type and the relevant numeric args

## 3. Helpers

- [x] 3.1 Add `parseUnixTimestamp(iso: string): number` to `src/tools/_helpers.ts` — parses ISO-8601 date string to Unix epoch (seconds), throws `ConfigError` if unparseable
- [x] 3.2 Add `validateRunSummaryArgs(period, args)` to `src/tools/_helpers.ts` — throws `ConfigError` if required period-specific args are missing

## 4. Serializers

- [x] 4.1 Add `serializeRunEvent(e: RunEventType)` to `src/tools/serializers.ts` — flat snake_case object with zone id/name, program id/name, all scheduled/reported ISO timestamps, durations in seconds (keys suffixed `_seconds`), water usage as `{ value, unit }`, and stop reason label
- [x] 4.2 Add `serializeScheduledZoneRun(r: ScheduledZoneRun)` to `src/tools/serializers.ts` — id, ISO start/end times, `normal_duration_minutes`, `duration_minutes`, and status label; handle null input by returning null
- [x] 4.3 Add `serializeRunSummaryDetails(d: RunSummaryDetails | null)` to `src/tools/serializers.ts` — returns `{ total_normal_run_time_minutes, total_actual_run_time_minutes, total_water_volume: { value, unit } | null }` or null-safe zeros when input is null

## 5. Reporting tools

- [x] 5.1 Create `src/tools/reporting.ts` with `registerReportingTools(server, api)` export
- [x] 5.2 Implement `get_watering_report` tool — validate + convert `from`/`until` ISO strings to Unix timestamps via `parseUnixTimestamp`, call `api.getWateringReport`, map through `serializeRunEvent`
- [x] 5.3 Implement `get_zone_run_history` tool — call `api.getZonePastRuns`, return `{ last_run: serializeScheduledZoneRun(lastRun), runs: runs.map(serializeScheduledZoneRun) }`; return 404-style object if zone not found
- [x] 5.4 Implement `get_run_summary` tool — validate period args via `validateRunSummaryArgs`, call `api.getZoneRunSummary`, return `serializeRunSummaryDetails`

## 6. Wire up

- [x] 6.1 Import and call `registerReportingTools(server, api)` in `src/server.ts` alongside the existing tool registrations
- [x] 6.2 Update `CLAUDE.md` MCP tools section to list `get_watering_report`, `get_zone_run_history`, and `get_run_summary` under a new "Reporting" group

## 7. Tests

- [x] 7.1 Unit test `parseUnixTimestamp` — valid ISO date string, ISO datetime with timezone, and invalid string (throws ConfigError)
- [x] 7.2 Unit test `validateRunSummaryArgs` — each period variant with correct args passes, each variant with missing args throws ConfigError
- [x] 7.3 Unit test `serializeRunEvent` — fully-populated event, event with null optional fields (null program, null reported times, null water usage)
- [x] 7.4 Unit test `serializeScheduledZoneRun` — normal run, null input
- [x] 7.5 Unit test `serializeRunSummaryDetails` — with data, with null input
- [x] 7.6 Integration test `get_watering_report` — fake api returns one run event, response serializes correctly; fake api throws, response is isError
- [x] 7.7 Integration test `get_zone_run_history` — fake api returns history; zone not found case
- [x] 7.8 Integration test `get_run_summary` — CURRENT_WEEK succeeds; WEEK with missing args returns config_error
