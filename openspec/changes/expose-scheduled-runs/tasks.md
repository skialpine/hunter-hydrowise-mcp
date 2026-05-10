## 1. Live API Verification

- [ ] 1.1 On a zone with no upcoming runs, query `Zone.scheduledRuns { nextRun { startTime { value } endTime { value } duration } }` — confirm it returns `nextRun: null` (not a 500). If it 500s, switch `get_zone_next_run` to use `runsBetween(now, now+86400)`, sort ascending by `startTime.value`, and take the first result. Record the probe outcome in this task file.
- [ ] 1.2 On a controller with zones that have no upcoming runs, query `Controller.zones { scheduledRuns { runs { id } } }` — confirm it returns `[]` (not a 500). If safe, document that the bulk path is usable and update the fan-out strategy in `get_controller_schedule` accordingly; if not, keep the per-zone fan-out. Record the outcome.

## 2. GraphQL Queries

- [ ] 2.1 In `src/hydrawise/queries.ts`, define `ZONE_RUNS_BETWEEN_QUERY` — selects `Zone.runsBetween(from, until)` with the full `ScheduledZoneRun` shape. Reuse the existing `SCHEDULED_ZONE_RUN_FIELDS` fragment (already defined in `queries.ts`) rather than duplicating the field selection.
- [ ] 2.2 Define `ZONE_NEXT_RUN_QUERY` — selects `Zone.scheduledRuns { nextRun { ... } }` using the same `SCHEDULED_ZONE_RUN_FIELDS` fragment. If the live-API probe (task 1.1) shows this path is unsafe, implement using `ZONE_RUNS_BETWEEN_QUERY` with `until = now + 86400`, sort ascending by `startTime.value`, and take `[0]`. The sort is required because the API's return order for `runsBetween` is unspecified.
- [ ] 2.3 Add TypeScript types for `ScheduledZoneRun` and `ScheduledZoneRuns` in `queries.ts` to match the selected shape (if not already fully typed by the existing `SCHEDULED_ZONE_RUN_FIELDS` type).

## 3. API Wrapper

- [ ] 3.1 In `src/hydrawise/api.ts`, add `getZoneRunsBetween(zoneId: number, from: number, until: number): Promise<ScheduledZoneRun[]>`. If the upstream returns `null` for the zone (zone not found or unauthorized), throw `HydrawiseNotFoundError` — do NOT silently return `[]`.
- [ ] 3.2 Add `getZoneNextRun(zoneId: number): Promise<ScheduledZoneRun | null>`. If the upstream returns `null` for the zone itself (zone not found), throw `HydrawiseNotFoundError`. Return `null` only when the zone exists but has no `nextRun`.
- [ ] 3.3 Add `getControllerSchedule(controllerId: number, from: number, until: number): Promise<{ zoneId: number; zoneName: string; zoneNumber: number; runs: ScheduledZoneRun[] }[]>` — fans out per zone using the list from `getZones`. Use `Promise.all` (not `Promise.allSettled`): if any single zone query fails, the entire call fails with an `api_error`. Do NOT return a partial result with failing zones silently omitted as empty arrays.

## 4. Serializer

- [ ] 4.1 In `src/tools/serializers.ts` (or a new `schedule-reads.ts`), implement `serializeScheduledZoneRun(run: ScheduledZoneRun)` returning: `id`, `start_time` (unwrapped from `DateTime.value`), `end_time` (unwrapped), `normal_duration_minutes`, `duration_minutes`, `remaining_time_seconds`, `status` (`{ value, label }`). Note: `remaining_time_seconds` is `0` for future runs (not started yet); document this in the tool description so callers are not misled.
- [ ] 4.2 The `get_controller_schedule` tool result SHALL be an array of `{ zone_id, zone_name, zone_number, runs[] }` objects — NOT a keyed map. This matches the `api.ts` return type (task 3.3) and avoids JSON key-type ambiguity.
- [ ] 4.3 Confirm the lint-numeric-units test passes for the new field names.

## 5. Tool Handlers

- [ ] 5.1 Create `src/tools/schedule-reads.ts` with handlers for all three tools wrapped in `runTool`. Implement `from`/`until` defaulting (now, now+7d). Validate: if `from >= until` throw `ConfigError`. Also validate: if caller supplies only `until_epoch_seconds` and the defaulted `from = now` exceeds it, throw `ConfigError('until_epoch_seconds is in the past')`.
- [ ] 5.2 Register `get_zone_scheduled_runs`, `get_zone_next_run`, and `get_controller_schedule` on the `McpServer` in `server.ts` (following the existing pattern). Tool descriptions SHALL note that `remaining_time_seconds` is 0 for runs that have not yet started.

## 6. Tests

- [ ] 6.1 Unit test `serializeScheduledZoneRun` with a fixture covering all fields including `DateTime.value` unwrapping and a future run with `remaining_time_seconds: 0`.
- [ ] 6.2 Unit test `from/until` defaulting and validation: `from >= until` (error), `until_epoch_seconds` in the past (error), both omitted (defaults to now+7d window).
- [ ] 6.3 Integration test `get_zone_scheduled_runs`: zone with upcoming runs (non-empty array), zone with no upcoming runs (empty array), zone not found (api_error, not empty array).
- [ ] 6.4 Integration test `get_zone_next_run`: zone with a next run (returns object), zone with no next run (returns null), zone not found (api_error, not null). Also test: `scheduledRuns.nextRun: null` (zone exists, field null) is handled as null return, not crash.
- [ ] 6.5 Integration test `get_controller_schedule`: controller with multiple zones (some with runs, some without) — verify all zones appear in the array with correct `zone_id`, `zone_name`, `zone_number`; verify a zone with no runs has `runs: []`. Also test: one zone query returns an API error — assert the entire call returns `api_error` (not a partial result).
- [ ] 6.6 Integration test `from > until` on each tool — expect `config_error`. Also test `until_epoch_seconds` in the past for each tool — expect `config_error`.
- [ ] 6.7 Run `npm test` — all tests pass.

## 7. Documentation

- [ ] 7.1 In `CLAUDE.md` MCP tools section, add the three new tools under a new `### Schedule reads` heading (or similar).
- [ ] 7.2 In `CLAUDE.md` gotchas section, document: "`Zone.scheduledRuns` / `runsBetween` are the safe paths for upcoming run data. `Zone.status.nextRun` is declared `DateTime!` but null on zones with no history and causes 500s in bulk `Controller.zones` queries — do NOT select it inside `CONTROLLER_FIELDS`."
- [ ] 7.3 Archive the `expose-scheduled-runs` change with `/opsx:archive` once implementation is merged.
