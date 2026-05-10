## 1. Schema & Query Layer

- [x] 1.1 Add `WATER_SAVING_SUMMARY_QUERY` to `src/hydrawise/queries.ts`: `Controller.reports.overviews.periodSummary(year, period, periodNumber).details.waterSavingSummary { normalDuration scheduledDuration }` — include TypeScript types for the response shape
- [x] 1.2 Add `ReportingPeriodEnum` TypeScript type (`'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR'`) alongside the query
- [x] 1.3 Add `getWaterSavingSummary(controllerId, year, period, periodNumber?)` typed method to `src/hydrawise/api.ts`; return `null` when `details` is null

## 2. accumulated_water_savings Wrapping (Issue #8)

- [x] 2.1 Add a `inferWaterVolumeUnit(country: string | null | undefined): 'gallons' | 'liters'` helper in `src/tools/serializers.ts` — returns `'gallons'` when country is `'US'`, `'liters'` otherwise
- [x] 2.2 Update `serializeController` in `src/tools/serializers.ts` to emit `accumulated_water_savings: { value, unit }` using `inferWaterVolumeUnit(controller.location?.country)` — replace the current bare-int pass-through
- [x] 2.3 Remove `accumulated_water_savings` from `IDENTIFIER_WHITELIST` in `src/tools/serializers.ts`
- [x] 2.4 Bump `SNAPSHOT_VERSION` to `8` in `src/tools/backup.ts`
- [x] 2.5 Verify `CONTROLLER_FIELDS` in `src/hydrawise/queries.ts` already selects `location { country }` (it should via the location block); add it if missing

## 3. get_water_saving_summary Tool

- [x] 3.1 Add Zod input schema in `src/tools/reporting.ts`: `controller_id` (Int), `year` (Int), `period` (enum WEEK | MONTH | QUARTER | YEAR), `period_number` (Int, optional)
- [x] 3.2 Add `config_error` guard: if `period` is `WEEK`, `MONTH`, or `QUARTER` and `period_number` is absent, throw `ConfigError`
- [x] 3.3 Add result serializer: compute `savings_minutes = normalDuration - scheduledDuration` and `savings_percent = normalDuration > 0 ? round((savings_minutes / normalDuration) * 100, 1) : null`
- [x] 3.4 Register `get_water_saving_summary` tool in `src/tools/reporting.ts` via `runTool`; return null-fields object (not error) when API returns null details
- [x] 3.5 Ensure the tool description is read-only (no `PHYSICAL ACTION:` prefix, no `preview` parameter)

## 4. Tests

- [x] 4.1 Unit test `inferWaterVolumeUnit` in `tests/unit/serializers.test.ts`: US → gallons, AU → liters, null → liters
- [x] 4.2 Unit test `serializeController` snapshot shape: `accumulated_water_savings` is `{ value, unit }` not bare int (add or update existing controller serializer test)
- [x] 4.3 Unit test `get_water_saving_summary` handler: normal period, zero-watering period (savings_percent null), missing period_number for WEEK (config_error), null details response
- [x] 4.4 Update `tests/unit/lint-numeric-units.test.ts` assertions: confirm `accumulated_water_savings` is no longer in `IDENTIFIER_WHITELIST`
- [x] 4.5 Update integration snapshot test in `tests/integration/snapshot-roundtrip.test.ts` if it asserts on `accumulated_water_savings` shape or `snapshot_version`

## 5. CLAUDE.md & Docs

- [x] 5.1 Update the `accumulated_water_savings` gotcha in `CLAUDE.md` to document the `{value, unit}` shape and country-based unit inference
- [x] 5.2 Add a new gotcha distinguishing `accumulated_water_savings` (lifetime counter, `{value, unit}`) from `get_water_saving_summary` (period-scoped, durations only — no water volume)
- [x] 5.3 Add `get_water_saving_summary` to the Reporting section of the MCP tools list in `CLAUDE.md`
- [x] 5.4 Update the Snapshot version history table in `CLAUDE.md` to include v8 (accumulated_water_savings wrapped as `{value, unit}`)
