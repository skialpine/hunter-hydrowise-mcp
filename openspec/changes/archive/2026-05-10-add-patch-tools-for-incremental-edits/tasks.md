## 1. Shared Infrastructure

- [x] 1.1 Create `src/tools/patch.ts` with the `PatchResult<T>` interface and any shared helpers (e.g. `buildPatchResult`, mode-detection utility)
- [x] 1.2 Add a `getZoneWithSettings` or reuse `api.getZoneSettings(zone_id)` to resolve `controller_id` + `program_mode` from a `zone_id` — confirm the existing API surface is sufficient and document the call path

## 2. update_zone_run_time_in_program

- [x] 2.1 Implement `update_zone_run_time_in_program(zone_id, program_id, run_duration_minutes, preview?)` in `patch.ts`
- [x] 2.2 Read zone via `api.getZone(zone_id)` to get `zone_number` and `controller_id`; read program via `api.getProgram(controller_id, program_id, "Standard")`; error if zone not in program
- [x] 2.3 Merge only the matching zone's `run_duration_minutes` in `zone_run_times`, dispatch `api.updateStandardProgram()` with the merged payload
- [x] 2.4 Return `PatchResult<{ run_duration_minutes: number }>` with `before`/`after`/`preview`/`planned_call`
- [x] 2.5 Register the tool in `src/server.ts`

## 3. update_program_day_pattern

- [x] 3.1 Implement `update_program_day_pattern(controller_id, program_id, standard_program_day_pattern, day_pattern, interval_days?, preview?)` in `patch.ts`
- [x] 3.2 Read program via `api.getProgram(controller_id, program_id, "Standard")`; validate `interval_days` required when mode is `"interval"`
- [x] 3.3 Merge `standard_program_day_pattern`, `day_pattern`, `interval_days` into the full program payload; dispatch `api.updateStandardProgram()`
- [x] 3.4 Return `PatchResult<{ standard_program_day_pattern: string; day_pattern: string }>` with diff
- [x] 3.5 Register the tool in `src/server.ts`

## 4. update_program_start_times

- [x] 4.1 Implement `update_program_start_times(controller_id, program_id, start_times, preview?)` in `patch.ts`
- [x] 4.2 Fetch program to enumerate zones; fetch existing `ProgramStartTime` records for each zone via `api.listProgramStartTimesForZone(zone_id)`
- [x] 4.3 Build the operation plan: update in-place (up to count), delete excess, create new ones; execute in order; propagate partial-failure context on error
- [x] 4.4 Return `PatchResult<{ start_times: string[] }>` with diff and (for preview) a `planned_call` listing all operations
- [x] 4.5 Register the tool in `src/server.ts`

## 5. update_zone_cycle_soak

- [x] 5.1 Implement `update_zone_cycle_soak(zone_id, cycle_soak_enable, cycle_custom_time_minutes?, soak_custom_time_minutes?, preview?)` in `patch.ts`
- [x] 5.2 Read zone settings via `api.getZoneSettings(zone_id)` to get full payload and detect `program_mode`; error with `ConfigError` if STANDARD mode and `icon` is absent from read result
- [x] 5.3 Merge cycle/soak fields into the appropriate payload; dispatch `api.updateZoneStandard()` or `api.updateZoneAdvanced()` based on `program_mode`
- [x] 5.4 Return `PatchResult<{ cycle_soak_enable: boolean; cycle_custom_time_minutes: number | null; soak_custom_time_minutes: number | null }>` with diff
- [x] 5.5 Register the tool in `src/server.ts`

## 6. update_zone_watering_adjustment

- [x] 6.1 Implement `update_zone_watering_adjustment(zone_id, watering_adjustment_percent, preview?)` in `patch.ts`; validate `watering_adjustment_percent` is 0–200 via Zod
- [x] 6.2 Read zone settings; detect mode; merge `watering_adjustment_percent` into the full payload; dispatch `api.updateZoneStandard()` or `api.updateZoneAdvanced()`
- [x] 6.3 Return `PatchResult<{ watering_adjustment_percent: number }>` with diff
- [x] 6.4 Register the tool in `src/server.ts`

## 7. Integration Tests

- [x] 7.1 Add `tests/integration/patch-tools.test.ts` covering `update_zone_run_time_in_program`: round-trip fidelity (only target zone changes), preview-without-dispatch, zone-not-in-program error
- [x] 7.2 Add integration tests for `update_program_day_pattern`: pattern change round-trip, interval-without-interval_days error, preview mode
- [x] 7.3 Add integration tests for `update_program_start_times`: single time replacement, partial-failure propagation, preview lists all operations
- [x] 7.4 Add integration tests for `update_zone_cycle_soak`: STANDARD mode (icon threaded through), ADVANCED mode, disable path, preview mode
- [x] 7.5 Add integration tests for `update_zone_watering_adjustment`: STANDARD mode, out-of-range rejection, preview mode

## 8. Documentation

- [x] 8.1 Update `CLAUDE.md` MCP tools section: add `### Patch tools — src/tools/patch.ts` subsection listing all 5 tools and the patch-vs-full-payload preference guidance
- [x] 8.2 Verify tool descriptions in `patch.ts` all carry `PHYSICAL ACTION:` prefix and mention the preferred-for-incremental guidance per spec
