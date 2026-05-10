## 1. Live API Verification

- [ ] 1.1 On a zone with no upcoming runs, query `Zone.scheduledRuns { nextRun { startTime { value } endTime { value } duration } }` — confirm it returns `nextRun: null` (not a 500). If it 500s, switch `get_zone_next_run` implementation to use `runsBetween(now, now+86400)[0]` instead.
- [ ] 1.2 On a controller with zones that have no upcoming runs, query `Controller.zones { scheduledRuns { runs { id } } }` — confirm it returns `[]` (not a 500). If safe, document that the bulk path is usable; if not, keep the per-zone fan-out strategy for `get_controller_schedule`.

## 2. GraphQL Queries

- [ ] 2.1 In `src/hydrawise/queries.ts`, define `ZONE_RUNS_BETWEEN_QUERY` — selects `Zone.runsBetween(from, until)` returning the full `ScheduledZoneRun` shape (id, startTime { value }, endTime { value }, normalDuration, duration, remainingTime, status { value label }).
- [ ] 2.2 Define `ZONE_NEXT_RUN_QUERY` — selects `Zone.scheduledRuns { nextRun { ... } }` (same ScheduledZoneRun shape). If live-API probe (task 1.1) shows this path is unsafe, implement using `ZONE_RUNS_BETWEEN_QUERY` with `until = now + 86400` and take the first result.
- [ ] 2.3 Add TypeScript types for `ScheduledZoneRun` and `ScheduledZoneRuns` in `queries.ts` to match the selected shape.

## 3. API Wrapper

- [ ] 3.1 In `src/hydrawise/api.ts`, add `getZoneRunsBetween(zoneId: number, from: number, until: number): Promise<ScheduledZoneRun[]>`.
- [ ] 3.2 Add `getZoneNextRun(zoneId: number): Promise<ScheduledZoneRun | null>`.
- [ ] 3.3 Add `getControllerSchedule(controllerId: number, from: number, until: number): Promise<{ zoneId: number; zoneName: string; runs: ScheduledZoneRun[] }[]>` — fans out per zone using the list from `getZones` (already available).

## 4. Serializer

- [ ] 4.1 In `src/tools/serializers.ts` (or a new `schedule-reads.ts`), implement `serializeScheduledZoneRun(run: ScheduledZoneRun)` returning: `id`, `start_time` (unwrapped from `DateTime.value`), `end_time`, `normal_duration_minutes`, `duration_minutes`, `remaining_time_seconds`, `status`.
- [ ] 4.2 Confirm the lint-numeric-units test passes for the new field names.

## 5. Tool Handlers

- [ ] 5.1 Create `src/tools/schedule-reads.ts` with handlers for all three tools wrapped in `runTool`. Implement `from`/`until` defaulting (now, now+7d) and `ConfigError` when `from >= until`.
- [ ] 5.2 Register `get_zone_scheduled_runs`, `get_zone_next_run`, and `get_controller_schedule` on the `McpServer` in `server.ts` (or the tool-registration file, following the existing pattern).

## 6. Tests

- [ ] 6.1 Unit test `serializeScheduledZoneRun` with a fixture covering all fields including DateTime unwrapping.
- [ ] 6.2 Unit test the `from/until` defaulting and `from >= until` validation (can test the helper directly without HTTP).
- [ ] 6.3 Integration test `get_zone_scheduled_runs`: zone with upcoming runs (non-empty array), zone with no upcoming runs (empty array).
- [ ] 6.4 Integration test `get_zone_next_run`: zone with a next run (returns object), zone with no next run (returns null).
- [ ] 6.5 Integration test `get_controller_schedule`: controller with multiple zones, at least one has runs and one does not; verify all zones appear in the response.
- [ ] 6.6 Integration test `from > until` on each tool — expect `config_error`.
- [ ] 6.7 Run `npm test` — all tests pass.

## 7. Documentation

- [ ] 7.1 In `CLAUDE.md` MCP tools section, add the three new tools under a new `### Schedule reads` heading (or similar).
- [ ] 7.2 In `CLAUDE.md` gotchas section, document: "`Zone.scheduledRuns` / `runsBetween` are the safe paths for upcoming run data. `Zone.status.nextRun` is declared `DateTime!` but null on zones with no history and causes 500s in bulk `Controller.zones` queries — do NOT select it inside `CONTROLLER_FIELDS`."
- [ ] 7.3 Archive the `expose-scheduled-runs` change with `/opsx:archive` once implementation is merged.
