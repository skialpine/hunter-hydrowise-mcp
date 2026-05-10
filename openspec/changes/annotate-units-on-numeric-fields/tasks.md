## 1. Verify ambiguous units before committing the rename

- [x] 1.1 Probe `interZoneDelay` on the live Heller Tufts controller: set to a known value (e.g. `120`) via the Hydrawise GUI, run `dump_controller_snapshot`, observe whether the captured value is `120` (seconds) or `2` (minutes if upstream stores minutes). Record the result. **→ VERIFIED seconds** (GUI "Edit Valve Delays" screenshot, 2026-05-09)
- [x] 1.2a Probe `MasterValve.delay`. **→ VERIFIED seconds** (GUI "Edit Valve Delays" screenshot, 2026-05-09)
- [ ] 1.2b Probe `MasterValve.postTimer`. **→ PENDING** — field not shown in "Edit Valve Delays" screenshot; may require a controller with post-timer configured or a different GUI path.
- [x] 1.3 Probe `Sensor.delay` and `Sensor.offTimer` against the existing rain sensor. Record both units. **→ VERIFIED seconds** (GUI "Add Custom Sensor Type" shows seconds-default dropdown + helper text "Minimum number of seconds", 2026-05-09)
- [x] 1.4 Probe `StandardProgram.interval` (set "every 3 days" in GUI, observe the snapshot value). Confirm the unit is days. **→ VERIFIED days** (GUI "Interval watering" dropdown shows "days" unit label; `get_program` returns `periodicity.period: 3` for a 3-day interval, 2026-05-09)
- [ ] 1.5 Probe `fixedWateringFrequency` and `virtualSolarSyncWateringFrequency` defaults — set known values via GUI and observe. (`smartWateringFrequency` default `86400` is already high-confidence seconds; no probe needed.)
- [x] 1.6 Update `design.md`'s "Decision 5" probe table with the verified units; lock in the suffix names. For any field that resists verification, mark its rename as DEFERRED in `tasks.md` and leave the un-suffixed name in place (the lint test will whitelist it pending verification).

## 2. Build the unit-suffix infrastructure

- [x] 2.1 In `src/tools/serializers.ts`, add `UNIT_SUFFIXES` and `IDENTIFIER_WHITELIST` constants.
- [x] 2.2 Write `tests/unit/lint-numeric-units.test.ts` that parses every `src/tools/*.ts` file for `z.number()` field names, checks unit-suffix compliance, and verifies suffixed fields have `.describe()` mentioning the unit word (task 4.5 folded in).
- [ ] 2.3 N/A — lint was written after renames; test passes clean on current codebase.

## 3. Rename serializer outputs (read side)

- [x] 3.1 In `src/tools/serializers.ts`, rename in `serializeZoneSettings`: `cycle_custom_time` → `cycle_custom_time_minutes`, `soak_custom_time` → `soak_custom_time_minutes`, `run_time` → `run_time_minutes`, `watering_adjustment` → `watering_adjustment_percent`, `factors` → `monthly_adjustment_percents`, `fixed_watering_frequency` → `fixed_watering_frequency_minutes`, `smart_watering_frequency` → `smart_watering_frequency_seconds`, `virtual_solar_sync_watering_frequency` → `virtual_solar_sync_watering_frequency_minutes`.
- [x] 3.2 In `serializeController`, rename `inter_zone_delay` → `inter_zone_delay_seconds`.
- [x] 3.3 In the master-valve serializer, rename `delay` → `delay_seconds`, `post_timer` → `post_timer_seconds`.
- [x] 3.4 In the sensor `_observed` serializer, rename `delay` → `delay_seconds`, `off_timer` → `off_timer_seconds`.
- [x] 3.5 In `serializeStandardProgram`, rename `interval` → `interval_days`, `valid_from` → `valid_from_epoch_seconds`, `valid_to` → `valid_to_epoch_seconds`, `series_start` → `series_start_epoch_seconds`.
- [x] 3.6 Update `tests/unit/serializers.test.ts` and any fixture files in `tests/` to expect the new field names.
- [x] 3.7 Run `npm test` and fix downstream test failures from the rename until green.

## 4. Rename Zod inputs (write side)

- [x] 4.1 In `src/tools/scheduling.ts`, rename Zod input fields on `update_zone_settings`, `set_zone_baseline`, `update_seasonal_adjustments`, `update_watering_program`, etc.
- [x] 4.2 In `src/tools/controllerConfig.ts`, rename Zod input fields on `create_zone` and related shapes.
- [x] 4.3 In `src/tools/sensors.ts`, rename Zod input fields: `delay` → `delay_seconds`, `off_timer` → `off_timer_seconds`.
- [x] 4.4 Add `.describe('<semantic>, in <unit> (<source citation>).')` to every numeric Zod input in scheduling, controllerConfig, sensors, and control.
- [x] 4.5 Folded into 2.2: lint test verifies each numeric Zod input has a `.describe()` whose text contains the unit word matching its suffix.
- [x] 4.6 Run `npm test` and fix integration-test failures from the renames until green.

## 5. Rename the GraphQL boundary mapping

- [x] 5.1 In `src/hydrawise/api.ts`, update `updateZoneAdvanced` mapping blocks to translate suffixed MCP-side names to upstream camelCase Hydrawise names.
- [x] 5.2 Sensor API methods updated: `createCustomSensorType` / `updateCustomSensorType` now read `delay_seconds` / `off_timer_seconds` from payload.
- [x] 5.3 Verify every field rename produces no upstream wire-format change — all integration tests pass.

## 6. Rename the restore recipe

- [x] 6.1 In `src/tools/restoreRecipe.ts`, update the recipe-builder to emit `args` keys using suffixed snapshot field names.
- [x] 6.2 Update `tests/integration/snapshot-roundtrip.test.ts` to expect the new field names.

## 7. Bump snapshot version

- [x] 7.1 In `src/tools/backup.ts`, bump `SNAPSHOT_VERSION` from `5` to `6`.
- [x] 7.2 Updated the doc comment to document v6 as the unit-suffix generation.
- [x] 7.3 Added `_caveat` in recipe builder warning that v5-and-earlier snapshots cannot be replayed by the current MCP.

## 8. Refresh CLAUDE.md

- [x] 8.1 Replace the "Unit inconsistency between fields" gotcha with a "Numeric field naming convention" section.
- [x] 8.2 Update the snapshot version-history bullet list to add `v6: + unit-suffix renaming convention applied across all numeric fields`.
- [x] 8.3 Spot-check every existing CLAUDE.md mention of `cycle_custom_time` / `soak_custom_time` / `inter_zone_delay` / `factors` / `interval` and update to the suffixed names.

## 9. Re-capture the user's snapshot under v6

- [ ] 9.1 Invoke `dump_controller_snapshot` against the Heller Tufts controller using the new code; save via the `capture-irrigation-snapshot` skill into `snapshots/`.
- [ ] 9.2 Spot-verify the captured JSON: `cycle_custom_time_minutes`, `soak_custom_time_minutes`, `inter_zone_delay_seconds`, `interval_days`, `monthly_adjustment_percents`, etc. all present with correct values; `snapshot_version: 6`; `_restore_recipe` args use the suffixed names.

## 10. Final validation

- [x] 10.1 Run `npm run build && npm run typecheck && npm run lint && npm test` — all green.
- [ ] 10.2 Restart the MCP server (user's responsibility per project memory). Restart Claude Desktop so the tool catalog refreshes. Spot-test one read tool (`get_zone_settings`) and one write tool in `preview` mode (`update_zone_settings` with a single field changed) to confirm the renamed fields appear correctly in the catalog and accept input.
- [x] 10.3 Run `openspec validate annotate-units-on-numeric-fields --strict` to confirm the change package is internally consistent.
