# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Node/TypeScript MCP server for the Hunter HydroWise (Hydrawise) cloud irrigation platform. It speaks the **Streamable HTTP** transport from MCP spec revision **2025-11-25** and exposes Hydrawise read/control operations as MCP tools.

## Stack

- Node **>=24** (ESM, `tsup` build to `dist/`)
- `@modelcontextprotocol/sdk@^1.29` (`McpServer` + `StreamableHTTPServerTransport`)
- Express 5 hosting the `/mcp` endpoint
- `graphql-request@^7` against `https://app.hydrawise.com/api/v2/graph`
- `zod@^3` for all tool input validation
- Auth flow mirrors `Lake292/hunter_hydrawise` (`pydrawise.auth`) — OAuth password grant on `/api/v2/oauth/access-token`

## Common commands

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Run locally | `npm run dev` (tsx watch) or `npm start` (after build) |
| Build | `npm run build` (produces executable `dist/server.js`) |
| Test | `npm test` |
| Test (watch) | `npm run test:watch` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |

After build, the binary is `dist/server.js` and is exposed as `npx hydrowise-mcp` once published.

## Required env vars

- `HYDRAWISE_USERNAME`, `HYDRAWISE_PASSWORD` — Hydrawise account credentials.

## Optional env vars

- `HYDRAWISE_MCP_HOST` (default `127.0.0.1`) — non-loopback requires `HYDRAWISE_MCP_AUTH_TOKEN`.
- `HYDRAWISE_MCP_PORT` (default `8765`).
- `HYDRAWISE_MCP_ALLOWED_ORIGINS` — comma-separated allowlist for the `Origin` header (defaults to any loopback origin).
- `HYDRAWISE_MCP_AUTH_TOKEN` — when set, every request must carry `Authorization: Bearer <token>`. Required for non-loopback hosts.
- `HYDRAWISE_MCP_SESSION_TTL` (default 3600 seconds) — idle session eviction.
- `HYDRAWISE_LOG_LEVEL` (`error|warn|info|debug`, default `warn`).

`.env` is loaded only when `process.stdin.isTTY` so MCP-client-managed env always wins in production.

## Project layout

```
src/
  server.ts            entry point (#!/usr/bin/env node), builds Express app + MCP server
  config.ts            Zod-validated env loader
  errors.ts            HydrawiseAuthError | HydrawiseAPIError | HydrawiseMutationError | ConfigError
  logger.ts            stderr logger + redactAuthHeader (credentials never logged)
  http/
    middleware.ts      originGuard, hostGuard, bearerGuard
    sessions.ts        SessionRegistry (TTL-evicted Map)
  hydrawise/
    auth.ts            OAuth password grant + token refresh
    client.ts          graphql-request wrapper, error mapping
    queries.ts         hand-written GraphQL strings + TypeScript types
    api.ts             HydrawiseApi typed wrappers (one client per process lifetime)
  tools/
    _helpers.ts        resolveUntil, runTool, jsonResult, errorResult, previewOrApply
    serializers.ts     normalize Hydrawise field names + read→writable translation
    status.ts          read-only status tools
    control.ts         runtime control tools (start/stop/suspend/resume) — PHYSICAL ACTION
    scheduling.ts      schedule read+write tools — PHYSICAL ACTION with preview support
    patch.ts           focused read-merge-write patch tools (update one field, dispatch full payload)
    backup.ts          dump_controller_snapshot — versioned JSON snapshot
    reporting.ts       read-only reporting tools (watering report, run history, run summary)
    schedule-reads.ts  upcoming schedule tools (get_zone_scheduled_runs, get_zone_next_run, get_controller_schedule)
    sensors.ts         irrigation-sensors capability — read tools + PHYSICAL ACTION sensor + custom-sensor-type CRUD
tests/
  setup.ts             global vitest setup
  unit/                vitest unit tests
  integration/         supertest integration tests against buildApp()
schema/
  hydrawise.live.graphql  authoritative live API schema (introspection snapshot)
scripts/
  probe-schema.ts      run introspection + diff vs cached pydrawise schema
openspec/              spec-driven workflow artifacts (proposals, designs, tasks, canonical specs)
```

## MCP tools

### Status (read-only) — `src/tools/status.ts`
- `get_user`
- `list_controllers` — each entry now includes `hibernate_status`, `status_summary`, `status_icon`, `accumulated_water_savings`
- `get_controller` — now includes `hibernate_status` (boolean | null), `status_summary` (string), `status_icon` (filename string), `accumulated_water_savings` (int, unit is account-locale-dependent: gallons for US accounts, liters elsewhere)
- `list_zones`
- `get_zone`

### Control — `src/tools/control.ts` (PHYSICAL ACTION)
- `start_zone`, `stop_zone`, `start_all_zones`, `stop_all_zones`
- `suspend_zone`, `resume_zone`, `suspend_all_zones`, `resume_all_zones`

### Scheduling — `src/tools/scheduling.ts` (reads + PHYSICAL ACTION writes)
- `get_zone_settings`, `update_zone_settings` — **ADVANCED-mode controllers only**; wraps `updateZoneAdvanced` (~25 fields including `watering_mode`, `watering_type`, `watering_frequency_mode`, etc.)
- `update_zone_standard` — **STANDARD-mode controllers only**; wraps `updateZoneStandard` (~10 fields: name, number, icon, cycle/soak, watering adjustment, master valve override, sensor associations, monitoring baselines). Use this instead of `update_zone_settings` on STANDARD-mode controllers to avoid accidental mode flips. The `_restore_recipe` in `dump_controller_snapshot` automatically emits `update_zone_standard` for STANDARD-mode snapshots and `update_zone_settings` for ADVANCED-mode snapshots.
- `set_zone_baseline` — set flow/current monitoring baseline (`MANUAL` or `LEARN_FROM_NEXT_RUN`)
- `get_seasonal_adjustments`, `update_seasonal_adjustments` (exactly 12 monthly factors)
- `get_watering_triggers`, `update_watering_triggers`
- `list_programs`, `get_program`
- `list_program_start_times_for_zone`
- `create_program_start_time`, `update_program_start_time`, `delete_program_start_time`
- `create_standard_program`, `update_standard_program`, `delete_standard_program`
- `create_watering_program`, `update_watering_program`, `delete_watering_program`

### Backup — `src/tools/backup.ts` (read-only)
- `dump_controller_snapshot` — versioned JSON snapshot (`snapshot_version: 7`). Captures: user; controller header (id, **device_id**, model, hardware, **location**, **time_zone**, **master_valve**, **expanders**, **modules**, **run_time_groups** catalog, **controller_notes**, **hibernate_status**, **status_summary**, **status_icon**, **accumulated_water_savings**); zones with their writable settings (cycle/soak, monitoring observed values **with units preserved**, **master_valve_override**, **zone_notes**, **per-zone sensor cross-references**, **per-zone `advanced_program` reference for ADVANCED-mode zones**, plus a `_unreadable_fields` array listing writable-but-not-readable field names); programs (BOTH Standard AND Advanced are **inlined with full subtype-specific detail**); program start times per zone; seasonal adjustments; watering triggers (with units captured); **`controller.sensors[]`** + per-zone `sensors[]` cross-references; **`controller.advanced_programs[]`** (empty on STANDARD-mode, populated on ADVANCED). The envelope additionally embeds **`_restore_recipe`** (ordered list of `{order, tool, args, depends_on, notes?}` restore steps the AI follows to apply this snapshot — preview each step, confirm with user, then execute) and **`_caveats`** (human-readable warnings about known restore limitations: unreadable fields, unit-pref drift, custom-type id reallocation, reusable schedule references, ADVANCED WateringProgram gaps, hardware re-wiring, hibernation state at capture). Use the `restore-irrigation-backup` skill in `.claude/skills/` to orchestrate the restore. No telemetry or run-event history.
  - The snapshot is now **restore-complete for BOTH STANDARD and ADVANCED-mode controllers**. ADVANCED-mode reads were validated against a live ADVANCED-mode controller (2026-05-10): `advanced_programs[]` populated with 4 programs, per-zone `advanced_program` cross-reference correct, 51 recipe steps generated. See the gotchas section for remaining caveats. The recipe builder explicitly skips Advanced programs (no createAdvancedProgram mutation) and emits per-zone steps that the skill workflow merges with live state for unreadable fields.
  - **Snapshot version history** (informational; no migration logic — older snapshots are still readable, just missing newer fields):
    - v2: STANDARD-mode complete + watering triggers + zone settings, no sensors, no Advanced
    - v3: + `controller.sensors[]` + per-zone `sensors[]` cross-references
    - v4: + `controller.advanced_programs[]` + per-zone `settings.advanced_program` reference
    - v5: + `_restore_recipe` + `_caveats` at the envelope top level
    - v6: + unit-suffix naming convention applied to all fixed-unit numeric fields
    - v7: + `hibernate_status`, `status_summary`, `status_icon`, `accumulated_water_savings` in controller header (current)

### Controller config — `src/tools/controllerConfig.ts` (PHYSICAL ACTION writes)
- `update_location` — set address and/or coordinates; takes `controller_id` only (the upstream `deviceId` is resolved server-side from the controller, so a stale device_id from another snapshot can't accidentally mutate the wrong controller)
- `update_controller_master_valve` — assign master valve by zone number. Per `Zone.masterValve` schema doc: `-1` accepts the controller's global default; `0` forces always-disabled (overrides global); any other integer designates that zone as the master valve
- `update_controller_program_mode` — switch STANDARD ↔ ADVANCED. The two modes use different schedule data structures, so switching may invalidate or hide prior-mode schedule data — verify with `list_programs` after switching and re-create as needed
- `hibernate_controller`, `wake_controller`
- `create_expander`, `update_expander`, `delete_expander`
- `create_zone`, `delete_zone` — wraps `createZoneAdvanced` / `deleteZone`. The deprecated `createZone` (Int cycleSoakEnable / runNextAvailableStartTime) is intentionally not wrapped.

### Notes — `src/tools/notes.ts` (reads + PHYSICAL ACTION writes)
- `list_controller_notes`, `list_zone_notes`
- `create_controller_note`, `update_controller_note`, `delete_controller_note`
- `create_zone_note`, `update_zone_note`, `delete_zone_note`
- All notes are typed (`fault | location | repair | comment`) with optional `pinned_to_top` flag.

### Sensors (irrigation-sensors) — `src/tools/sensors.ts` (reads + PHYSICAL ACTION writes)
- `list_sensors(controller_id)` — all sensors on a controller, writable shape (`id`, `name`, `model_id`, `input_number`, `zone_ids`) plus `_observed` block (model name, sensor_type LEVEL_OPEN | LEVEL_CLOSED | FLOW | THRESHOLD, mode_type START | STOP | REPORT, calibration fields, customer_id, category)
- `list_zone_sensors(zone_id)` — sensors guarding a single zone
- `list_sensor_models(controller_id)` — built-in + custom sensor model catalog. **`controller_id` is informational; the catalog is account-wide** because `Configuration.sensorCategories` is the only catalog path the live schema exposes (no per-controller filter). The argument is kept for tool-symmetry; the API method silently ignores it. If a future schema revision adds a per-controller filter, wiring the arg through changes observable behaviour — bump the snapshot version (sensors are captured by `controller_id` already, so a wider catalog filter could pick up models from sibling controllers) and update this section
- `create_sensor`, `update_sensor`, `delete_sensor` — `update_sensor`'s `zone_ids` is full-replace when supplied (Hydrawise's `updateSensor` overwrites the entire association set); pass `null` (or omit) to leave existing zone associations untouched
- `create_custom_sensor_type`, `update_custom_sensor_type`, `delete_custom_sensor_type` — `customer_id` is the account owner id (from `get_user`). Custom-type ids are reallocated on re-creation, so a restore that re-creates a custom type must reread the new id before passing it to `create_sensor`. `update_custom_sensor_type` requires both `customer_id` AND `controller_id` per the live schema. `delete_custom_sensor_type` returns `Int` upstream (deleted-row count) but is coerced to `true` on positive count, throws on 0/null

### Reporting — `src/tools/reporting.ts` (read-only)
- `get_watering_report` — controller-level run log for a date range (`from`/`until` as ISO-8601 strings → Unix timestamps); returns scheduled vs. reported times, durations in seconds, water usage, stop reason per run event
- `get_zone_run_history` — past runs for a single zone (`last_run` + `runs[]`). Each entry has `normal_duration_minutes` (program default), `scheduled_duration_minutes` (what the controller was told to run), and `actual_elapsed_seconds` (computed from end−start; smaller than scheduled when a run was cancelled or stopped early)
- `get_run_summary` — aggregated normal vs. actual run time and water volume for a zone; `period` is one of `CURRENT_WEEK | WEEK | MONTH | YEAR` with period-specific numeric args. `total_normal_run_time_minutes` and `total_actual_run_time_minutes` are `null` when the API returns no data for the period (distinguishable from a genuine zero-minute result)

### Patch tools — `src/tools/patch.ts` (PHYSICAL ACTION, STANDARD-mode only for zone tools)

Focused read-merge-write tools. Each one reads the current state, mutates one targeted field, and dispatches the full payload — the caller only supplies the field being changed. **Prefer these for incremental edits** over the full-payload `update_*` tools. Use full-payload tools for bulk updates, restore-recipe playback, or fields not covered here.

All tools return `{ before, after, preview }` and support `preview: true` to inspect the planned mutation payload without dispatching.

- `update_zone_run_time_in_program(controller_id, program_id, zone_id, run_duration_minutes, preview?)` — change one zone's run time in a Standard program; errors if zone not in program
- `update_program_day_pattern(controller_id, program_id, standard_program_day_pattern, day_pattern, interval_days?, preview?)` — change a Standard program's day schedule (`dow` / `even` / `odd` / `interval`); `interval_days` required when mode is `interval`
- `update_program_start_times(controller_id, program_id, start_times, preview?)` — bulk-replace ALL start times for a Standard program (replaces `start_times` array on the program)
- `update_zone_cycle_soak(controller_id, zone_id, cycle_soak_enable, cycle_custom_time_minutes?, soak_custom_time_minutes?, preview?)` — STANDARD-mode only; fetches current zone settings (resolves `icon`), merges cycle/soak fields, dispatches `updateZoneStandard`; omit duration args to preserve current values
- `update_zone_watering_adjustment(controller_id, zone_id, watering_adjustment_percent, preview?)` — STANDARD-mode only; range 0–200; fetches current zone settings (resolves `icon`) and dispatches `updateZoneStandard`

Note: zone-level patch tools (`update_zone_cycle_soak`, `update_zone_watering_adjustment`) are STANDARD-mode only. For ADVANCED-mode zones, use `update_zone_settings` directly (which accepts the full ~25-field payload including the unreadable fields like `watering_mode` that must be supplied explicitly).

### Schedule reads (upcoming) — `src/tools/schedule-reads.ts` (read-only)
- `get_zone_scheduled_runs(zone_id, from_epoch_seconds?, until_epoch_seconds?)` — wraps `Zone.runsBetween(from, until)`. Default window: now → now+7d. Returns `[]` for zones with no upcoming runs in the window. `remaining_time_seconds` per run is seconds until the run starts; it is `0` once the run has begun.
- `get_zone_next_run(zone_id)` — returns the single next scheduled run from `Zone.scheduledRuns.nextRun`, or `null` if none is scheduled. Lightweight; suitable for status checks.
- `get_controller_schedule(controller_id, from_epoch_seconds?, until_epoch_seconds?)` — bulk query via `Controller.zones { runsBetween(from, until) }`. Returns an array of `{ zone_id, zone_name, zone_number, runs[] }` — one entry per zone, even when `runs` is empty. Default window: now → now+7d. `remaining_time_seconds` is `0` once a run has begun. Validation: `from_epoch_seconds >= until_epoch_seconds` → `config_error`; `until_epoch_seconds` in the past with no `from_epoch_seconds` → `config_error`.

## Key patterns

### `runTool`
All tool handlers are wrapped in `runTool(async () => ...)`. It catches `HydrawiseError` subtypes and maps `err.kind` to error results (`config_error`, `auth_error`, `api_error`, `mutation_error`). Unknown exceptions become `internal_error`.

### `previewOrApply`
Every write tool accepts a `preview` boolean. When `preview=true`, the mutation variables are returned as JSON (`{ preview: true, operation, variables }`) without executing. When `preview=false/undefined`, the mutation runs and the result is returned. Errors in payload assembly still propagate regardless of preview mode.

### PHYSICAL ACTION label
All mutation tools include `PHYSICAL ACTION:` in their description to signal clients to show confirmation prompts before executing.

### Zod input validation
Tool input schemas are defined with Zod. The MCP framework validates inputs before the handler runs; tools do not re-validate manually.

### Serializer null strategy
`serializeZoneSettings` deliberately returns `null` for fields the mutation expects but the read schema doesn't expose (e.g. `watering_mode`, `global_master_valve`). This forces the caller to supply them explicitly rather than silently defaulting. Read-only observed data (e.g. `monitoring_observed` with `operating_ranges` and `measured_medians`) is included alongside writable nulls.

### Watering program subtype dispatch
`create_watering_program` / `update_watering_program` dispatch to three different mutations based on `program_type`:
- Time-based → `updateTimeBasedWateringProgram` (requires `fixed_watering_*` fields)
- Smart → `updateSmartBasedWateringProgram` (requires `smart_watering_*` fields)
- VirtualSolarSync → `updateVirtualSolarSyncWateringProgram` (requires `virtual_solar_sync_*` fields)

`validateWateringProgramSubtype()` throws `ConfigError` on field/type mismatch.

### `resolveUntil`
Used by suspend tools. Accepts XOR of `days` (relative) or `until` (absolute ISO-8601 timestamp). Throws `ConfigError` if both or neither are provided, or if `days ≤ 0`.

## Testing

`npm test` runs vitest. Unit tests cover:
- Config parsing and env validation
- OAuth token refresh flow
- GraphQL client error mapping
- `resolveUntil` / `previewOrApply` helper validation
- Credential-leak guards (nothing auth-sensitive appears in logs or tool output)
- `serializeZoneSettings` edge cases (cycle/soak, monitoring nulls, operating ranges)
- Watering program subtype dispatch routing

Integration tests use `supertest` against `buildApp()` with a fake `HydrawiseApi`.

## Hydrawise API gotchas (learned the hard way)

These bit us during real-account testing and aren't obvious from the schema alone.

- **`Controller.online` (top-level, nullable) describes Wi-Fi connectivity. `ControllerStatus.online` (inside `status { }`, non-null) is a different field.** Neither indicates whether the scheduler is running. To check scheduler state, read `hibernate_status` (boolean — `true` means hibernated, `false` means active, `null` means unknown/older firmware) and `status_summary` (human-readable string, e.g. `"All good!"` or `"Sleeping"`) from `get_controller` or the snapshot. **Do NOT confuse `Controller.online` with `ControllerStatus.online`** — adding `status { online }` to `CONTROLLER_FIELDS` is correct and already done; the top-level `online` field must remain selected separately (it's a distinct nullable `Boolean` on the `Controller` type).
- **`status.icon` is a filename string** (e.g. `"ok.png"`, `"moon.png"`), not a URL, SVG markup, or token enum. Probed on dev account: `"ok.png"`. Known values likely include `moon.png` (hibernated), `fault.png` (fault), etc. The exact set is not documented by Hydrawise.
- **`accumulatedWaterSavings` unit is account-preference-dependent** (gallons for US accounts, liters elsewhere). The schema declares it as bare `Int!` without a unit envelope (`LocalizedValueType`), so the API returns a raw number in the user's preferred unit. Serialized as `accumulated_water_savings` (no unit suffix — unit is not fixed; whitelisted in `IDENTIFIER_WHITELIST`). Probed on US dev account: value=100. Revisit if a metric or flow-sensor-equipped account becomes available for cross-reference.
- **`Zone.status.lastRun` / `nextRun` are declared `DateTime!` but actually null** for zones without run history. Selecting them inside `Controller.zones { ... }` causes the bulk fan-out to 500. `ZONES_QUERY` omits `status` for that reason; `ZONE_QUERY` (single-zone) keeps the same minimal shape for symmetry. `get_zone` and `list_zones` therefore return only `id/name/number`; richer per-zone state goes through `get_zone_settings` (single zone, full read via `ZONE_FULL_QUERY`). **Do NOT select `Zone.status.nextRun` inside `CONTROLLER_FIELDS` or any bulk fan-out.** Use `Zone.scheduledRuns { nextRun }` or `Zone.runsBetween(from, until)` instead — both are safe in bulk and return `null` / `[]` for zones with no upcoming runs.
- **`Zone.scheduledRuns` / `runsBetween` are the safe paths for upcoming run data.** Both were probed on a live account with 22 zones (including zones with no upcoming runs) and returned correctly without 500s. `runsBetween` returns `[]` for zones with no runs in the window. `get_zone_next_run` uses `Zone.scheduledRuns { nextRun }` (single query, returns `null` when no run scheduled). `get_controller_schedule` uses a single bulk `Controller.zones { runsBetween(from, until) }` query — no N per-zone fan-out needed.
- **`Controller.zones { ... }` is slow** on accounts with many zones — sometimes >30s, past Claude Desktop's tool timeout. The request usually succeeds on a second try. If a tool reliably times out on first call, retrying is the right move before debugging.
- **`updateZone` is `@deprecated`** in favor of `updateZoneAdvanced` (and `createZone` → `createZoneAdvanced`). The Advanced versions have **different argument shapes** for two fields: `cycleSoakEnable` and `runNextAvailableStartTime` are `Boolean` (not `Int`). They also accept four monitoring args (`flowMonitoringMethod`, `currentMonitoringMethod`, `flowMonitoringValue`, `currentMonitoringValue`). Always use Advanced for new write code.
- **`WateringSettings` is an interface** with two implementations: `AdvancedWateringSettings` (zones with per-zone `programStartTimes` and `advancedProgram`) and `StandardWateringSettings` (zones inside Standard programs, with `standardProgramApplications`). `fixedWateringAdjustment` and `cycleAndSoakSettings` are on the interface itself — no fragment needed for those. Other fields require `... on AdvancedWateringSettings` or `... on StandardWateringSettings` fragments.
- **`CycleAndSoakSettings` fields are `cycleDuration` / `soakDuration`** (not `cycleTime`/`soakTime` as the GUI labels might suggest), and they're bare `Int!` **minutes** (not wrapped objects).
- **`cycleSoakEnable` has no readable counterpart** — derive `true` from `wateringSettings.cycleAndSoakSettings != null`. The mutation accepts it as input, but reads don't expose the flag directly.
- **Numeric field naming convention.** Every numeric field with a fixed unit carries the unit as a name suffix: `_minutes`, `_seconds`, `_days`, `_percent` / `_percents`, `_epoch_seconds`. Fields whose unit varies by user account preference use `{value, unit}` wrapping (`serializeUnitValue`) instead of suffixes. Every Zod `.number()` input with a unit suffix must also carry a `.describe()` mentioning the unit word. Enforcement: `tests/unit/lint-numeric-units.test.ts` (imports `UNIT_SUFFIXES` and `IDENTIFIER_WHITELIST` from `src/tools/serializers.ts`). The upstream GraphQL field names are camelCase without suffixes (`cycleDuration`, `wateringAdjustment`, etc.); `api.ts` is the single translation layer.
- **Read shapes don't match write shapes.** Reads return `SelectedOption { value, label, options }` and `LocalizedValueType { value, unit }` wrappers; mutations take bare `Int`/`Float`. The `tools/serializers.ts` layer unwraps on read; the AI is expected to send unwrapped values on write. **Don't try to round-trip** a raw read result into a mutation — it won't validate.
- **Snapshot preserves the `unit` string from every LocalizedValueType field**, but mutations take bare numbers. The unit goes into the snapshot envelope so the restore workflow can detect a unit-pref change between capture and restore (97°F captured → 97 restored as °C = scorched lawn). When calling `update_watering_triggers` / `update_zone_settings` from a snapshot, the AI extracts the bare `value` from the `{value, unit}` object and supplies it as a Float; the unit never reaches the mutation.
- **`MonitoringMethodEnum`** has exactly two values: `MANUAL` (use the supplied baseline) and `LEARN_FROM_NEXT_RUN` (observe and remember on the next zone run). The matching `*MonitoringValue` fields are only meaningful when the method is `MANUAL`.
- **`Controller.deviceId` ≠ `Controller.id`.** The location mutations (`updateLocation`, `updateLocationCoordinates`) take `deviceId`, not `controllerId`. The `update_location` MCP tool resolves device_id from the supplied `controller_id` server-side (via `getController`), so callers don't pass device_id directly — eliminates the "wrong controller via copy-pasted device_id" footgun.
- **`Module.id` is `Long!` (a custom scalar), not Int.** Serialized as a string in the snapshot to avoid JS Int53 surprises.
- **No standalone CRUD for `RunTimeGroup`.** The schema doesn't expose `createRunTimeGroup` / `updateRunTimeGroup`. Run-time groups are created/updated implicitly via `createStandardProgram` / `updateStandardProgram` through their `zoneRunTimes[]` argument. The snapshot's `controller.run_time_groups` catalog is captured for inspection / cross-reference, not for direct mutation.
- **No standalone CRUD for reusable schedule adjustments.** The `schedule_adjustment_ids` field references account-managed records that have no exposed mutations. Snapshot captures the IDs in use; if a snapshot's referenced ID has been removed from the account between capture and restore, the restore will fail at the `update_zone_settings` call. Document as `_caveat` and reconcile manually.
- **The pydrawise cached schema at `/tmp/hydrawise.graphql` is outdated.** The live SDL at `schema/hydrawise.live.graphql` is the source of truth; the cached one is missing newer features (`updateZoneAdvanced`, `setBaselineValues`, `learn*FromNextRun` start args, controller notes, ownership transfer, issue muting, etc.). When you suspect the cached schema, run `scripts/probe-schema.ts` to compare.
- **`Time` is a true scalar** (`scalar Time` in the live SDL), unlike `DateTime`. Do NOT add `{ value }` sub-selections to `Time` fields — that would cause a server-side GraphQL error. `ProgramStartTime.time: Time!` is selected as bare `time` in `PROGRAM_START_TIMES_QUERY` and deserializes as a plain `"HH:MM"` string. `ProgramStartTimeRead.time` is typed `string | null` to match (null retained defensively despite the upstream `!`).
- **`DateTime` is an object type, not a scalar.** It has `{ value: String!, timestamp: Int!, largeTimestamp: Float!, timeZone: TimeZone!, relativeTime: String! }`. Any field typed `DateTime` or `DateTime!` in the schema **requires a sub-selection** (e.g. `startTime { value }`). Omitting it gives "Field X of type DateTime must have a sub selection." All reporting timestamp fields (`startTime`, `endTime`, `normalStartTime`, `reportedStartTime`, etc.) are `DateTime` objects — select `{ value }` and unwrap in the serializer.
- **Sensor model catalog lives at `Configuration.sensorCategories[].models[]`, not `Controller.sensorModels`.** The catalog is **account-wide**; the schema does not accept a controller scope. `list_sensor_models(controller_id)` accepts the arg for tool-symmetry / forward-compat but does not pass it through to GraphQL. To map a snapshot's `sensor.model.name` back to a current `model.id` at restore time, fetch the catalog once and lookup by name.
- **`updateSensor`'s `zoneIds` is `[Int]` (nullable), but `createSensor`'s is `[Int]!` (non-null).** Passing `null` to `updateSensor` leaves existing zone associations untouched; passing an array **replaces** them (full-replace semantics, NOT merge). The `update_sensor` MCP tool exposes `zone_ids` as optional+nullable to mirror this.
- **`deleteCustomSensorType` returns `Int` (deleted-row count), not `Boolean`.** The api.ts wrapper coerces `> 0` to `true` and throws on `0` / `null` / non-number — callers see a uniform success/failure boolean.
- **Custom sensor type ids are reallocated on re-creation.** A restore that re-creates a custom type via `create_custom_sensor_type` gets a fresh `id`; the AI must use that new id when subsequently calling `create_sensor` for any sensor that referenced the old custom-type id in the snapshot. The Phase 4 restore skill encodes this dependency ordering.
- **Hardware re-wiring is out-of-band.** The snapshot captures `input_number` (e.g. 1 = SEN-1) — what the sensor was wired to **at capture time**. If the user has since moved the rain sensor from SEN-1 to SEN-2, restoring the snapshot will write `input_number: 1` and the controller will look at the wrong physical pin. The MCP server cannot detect re-wiring — it's the user's responsibility to verify physical wiring matches the snapshot before restore, or to edit the snapshot's `input_number` first.
- **`AdvancedProgram` has no direct `createAdvancedProgram` / `updateAdvancedProgram` mutation** — its state is *derived* from per-zone watering frequency configuration plus the referenced `WateringProgram` (Time/Smart/VSS) record. Restore is therefore: (1) `update_zone_settings` to set each zone's `watering_frequency_mode` + `*_watering_frequency` field; (2) `create/update_watering_program` for the WateringProgram subtype the AdvancedProgram references via `advancedProgramId`. The AdvancedProgram view that `get_program(..., "Advanced")` returns is read-only — the writes happen at the zone and WateringProgram layers, and Hydrawise rebuilds the AdvancedProgram aggregate.
- **`AdvancedProgram.id` ≠ `AdvancedProgram.advancedProgramId`.** The schema exposes both Int fields. `id` is the Program-interface identifier (the same field StandardProgram has). `advancedProgramId` is the cross-reference to the `WateringProgram` (Time/Smart/VSS) subtype record that defines this Advanced program's frequency/duration. Both are captured in the snapshot for forward compat — the relationship is not fully documented in the schema, so the AI restoring should preserve both verbatim.
- **`AdvancedProgram.runTimeGroup` is nullable** (unlike `StandardProgram.applications.runTimeGroup` which is non-null per-application). An ADVANCED-mode program with no associated run-time group is a valid state; the snapshot emits `run_time_group: null` and the AI restoring must not assume a value.
- **`StandardProgram.dayPattern` encoding.** The `dayPattern` field is a 7-character ASCII bitmap: position 0 = Sunday, 1 = Monday, …, 6 = Saturday; `'1'` = run on that day, `'0'` = skip. It is only meaningful (and non-null) when `standardProgramDayPattern = "dow"` — for `even`, `odd`, and `interval` modes Hydrawise still requires the field in mutations but ignores its value. Confirmed empirically (2026-05-10) against the live API using the `xxx` test program (id 8621589): `dayPattern: "0001001"` → `daysRun: ["WEDNESDAY","SATURDAY"]`; `"0010010"` → `["TUESDAY","FRIDAY"]`. The `AdvancedProgramDayPatternEnum` string format (`"WEDNESDAY,SATURDAY"`) does **not** work — it parses to `daysRun: []`. **Read path**: `PROGRAMS_FULL_QUERY` selects `dayPattern`; `serializeStandardProgram` surfaces it as `day_pattern`; the snapshot captures it. For even/odd/interval programs `day_pattern` is `null` on read and should be passed as `"1111111"` (or the read-back value, if non-null) when calling `create_standard_program` / `update_standard_program`.
- **`updateTimeBasedWateringProgram` (and the Smart/VSS equivalents) rejects updates when the program has active zone associations.** Hydrawise returns a `business`-category error: "This Watering Schedule is used by the following zones: … Please remove the zones using these watering schedules first." To modify a live WateringProgram you must detach all its zones first (or create a new one and re-point zones to it). This constraint does not apply to `createTimeBasedWateringProgram` — new programs have no zone associations.
- **ADVANCED-mode reads were validated against a live ADVANCED-mode controller (2026-05-10).** `advanced_programs[]` was populated with 4 programs, per-zone `advanced_program` cross-references were correct, and 51 recipe steps were generated. The implementation is schema-correct, unit-tested with fixtures, and confirmed against a real ADVANCED account.
- **The OAuth `client_secret` (`zn3CrjglwNV1`)** is the public bundled secret of the Hydrawise mobile app — not a credential we own. Fine to commit.
- **`controllerNotes` and `zoneNotes` are subscription-gated.** Hydrawise returns a `business`-category GraphQL error (`"Feature is not available under your subscription."`) for these fields on free accounts. Because both fields are declared non-null in the schema (`[ControllerNote]!` / `[ZoneNote]!`), the error propagates upward and **nulls the entire parent object** (`controller` / `zone`). This means embedding either field in `CONTROLLER_FIELDS` or `ZONE_FULL_QUERY` would break `list_controllers`, `get_controller`, `get_zone_settings`, and `dump_controller_snapshot` for all free-tier users. **Fix:** both fields are fetched in dedicated standalone queries (`CONTROLLER_NOTES_QUERY`, `ZONE_NOTES_QUERY`) called separately from the main controller/zone queries, with a try/catch in `backup.ts` that falls back to `[]` on subscription error. The `list_controller_notes` and `list_zone_notes` tools use these same dedicated methods via `api.getControllerNotes()` / `api.getZoneNotes()` rather than embedding notes in broader queries. **Do NOT re-embed these fields in `CONTROLLER_FIELDS` or `ZONE_FULL_QUERY`.**
- **`updateZoneStandard` rejects null `icon` with a `business`-category error "Missing icon".** The GraphQL schema declares `$icon: Int` (nullable/optional), but the upstream API always requires a valid icon id. Confirmed on 2026-05-10 (zone 2063156, cycle/soak update without icon → "Missing icon"). **Fix:** `icon` is now required (non-null `Int`) in the Zod schema for `update_zone_standard`; Zod catches a missing icon before the request reaches the upstream. When the caller does not intend to change the icon, fetch the current value from `get_zone_settings` and pass it through. The `_restore_recipe` captures `icon` from the snapshot; the recipe builder adds a note when `icon` is null in the snapshot so the AI knows to merge from live state before applying.
- **`ZoneIcon` has two icon paths: built-in templates (`icon`) and custom uploaded images (`iconFileId`).** `ZoneIcon` has `id: Int` (the relevant ID) and `customImage: File` (non-null when the zone uses a custom uploaded image, null for built-in templates). `ZONE_FULL_QUERY` now selects `icon { id, customImage { id } }`. When `customImage` is non-null, the zone uses a custom image and the ID must be passed as `$iconFileId`; when `customImage` is null, the ID is a built-in template and goes in `$icon`. **Fix (2026-05-10):** `extractIconFields()` in `patch.ts` and `serializeZoneSettings()` in `serializers.ts` now route the ID to the correct field. If a custom image is deleted from Hydrawise, the zone's icon state becomes 0 (internal server error on mutation). **Recovery:** pass any valid built-in icon ID (e.g. `icon: 10`) to restore the zone to a writable state; the icon can then be corrected through the Hydrawise app. Confirmed on 2026-05-10 (zone 2062869, `ZoneIcon.id = 890232`, custom image deleted by passing it as `$icon` instead of `$iconFileId`).
- **`updateZoneStandard` 500s when `sensorIds` is passed as `null`.** The schema declares `sensorIds: [Int] = []`, but the GraphQL default only applies when the variable is **omitted entirely** — explicitly passing `null` overrides the default and causes a server 500. **Fix:** the `updateZoneStandard` API wrapper conditionally includes `sensorIds` in the variables object only when `payload.sensor_ids != null`. **Omitting `sensorIds` entirely does NOT affect sensor associations.** Confirmed on 2026-05-10 (zone 2062869): `list_sensors` showed rain sensor still associated with all 22 zones after an `updateZoneStandard` call with `sensorIds` omitted. The `zone_ids: []` returned by `list_zone_sensors` was pre-existing (sensors are associated at the sensor level via `update_sensor`, not at the zone level via `updateZoneStandard`). **Safe to omit `sensorIds` in `updateZoneStandard` calls** — the sensor-side zone list is authoritative and unaffected. `sensor_ids` is in `_unreadable_fields` for most zones, so the recipe builder emits it as `null` and relies on the `notes` merge step.
- **`SensorModel.mode` causes an internal server error on Hydrawise's side for at least one sensor model type (Rain Sensor / normally closed wire, model id 3318).** The field `mode: CustomSensorModeTypeEnum!` is a duplicate of `modeType: CustomSensorModeTypeEnum!` — same type, same value — and is apparently unimplemented or broken server-side for built-in models. **Fix:** `mode` was removed from `SENSOR_MODEL_FIELDS`; use `modeType` exclusively. The surviving `modeType` field is serialized as `mode_type` in the `_observed` block. Do not re-add `mode` to any sensor query.
- **Hydrawise serializes overlapping programs (queue, never parallel) and pre-computes the queue in the schedule.** When two Standard programs are scheduled with overlapping run windows on the same controller, Hydrawise queues the later program behind the earlier one. The post-queue start time is reflected in `Zone.runsBetween` / `Zone.scheduledRuns` BEFORE either program runs — the schedule API surfaces the queued (post-shift) start time, not the program's nominal start_time. Confirmed empirically (2026-05-10) using the `xxx` test program: scheduled xxx with one zone (Z23, 20-min run = ~50-min wall time including cycle/soak) starting 21:30; Lawn was already scheduled at 22:00; `get_zone_scheduled_runs` for Z1 (Lawn's first zone) showed start_time **22:15** instead of 22:00 — exactly when xxx's last cycle ends. No skip, no parallel run, no controller error. **Implication:** callers can pre-validate program-overlap impact via `get_controller_schedule` / `get_zone_scheduled_runs` before applying schedule changes; no need to wait for runtime to discover queueing behavior.

## Programming modes (Standard vs Advanced)

Hydrawise controllers run in one of two modes — `Controller.programMode: STANDARD | ADVANCED` — and the data model differs significantly:

| | Standard | Advanced |
| --- | --- | --- |
| Where the schedule lives | `StandardProgram` (start times, day pattern, `zoneRunTimes` map) | Per-zone (`AdvancedWateringSettings.programStartTimes`, `advancedProgram`) plus the referenced `WateringProgram` (Time/Smart/VSS) record |
| To change one zone's run time | Edit the program's `zoneRunTimes` entry for that zone | Edit the zone directly via `update_zone_settings`, plus the referenced `WateringProgram` via `update_watering_program` for the run-duration |
| Read tool that exposes the full schedule | `get_program(controller_id, program_id, "Standard")` | `get_program(controller_id, program_id, "Advanced")` (returns scope, zone_specific, advanced_program_id, watering_frequency, run_time_group, applies_to_zones — start times are per-zone, fetch via `list_program_start_times_for_zone`) |
| Mutations that target it | `updateStandardProgram`, `update*WateringProgram` | `updateZoneAdvanced` (+ per-zone `create/update_program_start_time`) plus `create/update_watering_program` for the Time/Smart/VSS subtype the zone references |
| Snapshot coverage | Full — `controller.programs[]` inlines `StandardProgram` details | Full (v4) — `controller.advanced_programs[]` inlines `AdvancedProgram` details; per-zone `settings.advanced_program` is the `{id, name, advanced_program_id}` cross-reference |

Most accounts (including the dev account this project was built against) are Standard. ADVANCED-mode support is now read-complete and restore-complete, and the read paths were validated against a live ADVANCED-mode controller on 2026-05-10 (`advanced_programs[]` populated with 4 programs, per-zone `advanced_program` cross-reference correct, 51 recipe steps generated). The implementation is schema-correct and unit-tested with fixtures derived from `schema/hydrawise.live.graphql`.

## Per-session McpServer architecture

The MCP TypeScript SDK's `McpServer.connect(transport)` throws if called twice on the same instance. We therefore create a **new** `McpServer` per Streamable HTTP session via a `serverFactory: () => McpServer` passed into `buildApp(...)`. The shared `HydrawiseApi` (and its singleton `Auth` + GraphQL client) is captured by closure and reused across sessions, so per-session server creation is just tool-registration overhead — cheap.

**Do NOT call `sessionServer.close()` from `transport.onclose`** — `Server.close()` calls `transport.close()` which fires `onclose`, leading to infinite recursion. Let GC reclaim the server when the closure unwinds.

## MCP client caching / restart workflow

When iterating on tools against a live Claude Desktop session:

1. **After changing tool behavior or adding new tools**: restart the server (`Ctrl-C`, `npm run build && npm start`). Claude Desktop's `mcp-remote` shim auto-reconnects — but **the cached tool catalog only refreshes when Claude Desktop itself reconnects**, not when the underlying server restarts.
2. **After changing a tool's input schema** (e.g. adding a new arg): restart Claude Desktop fully. Otherwise the cached schema rejects calls with the new arg client-side before the request even reaches our server.
3. **After adding a new tool**: also requires a Claude Desktop restart for the new tool name to appear in the catalog.

If a tool call fails with `Input validation error` for a field you know exists in the new code, the cached schema is stale — restart Claude Desktop.

(Until MCP clients reliably honor `notifications/tools/list_changed`, the restart dance above is the safe default.)

## Restore-from-backup is intentionally an AI workflow

The snapshot tool (`dump_controller_snapshot`) is read-only and per-controller. There is **no** `restore_from_backup` tool — the design (in `openspec/changes/archive/2026-05-09-add-schedule-management/design.md`) calls for the AI to diff a snapshot against current state and call the matching `update_*` tool per category. This is the LLM-native pattern: the AI sees every field it's about to change rather than relying on an opaque server-side merge. Don't reintroduce a monolithic restore tool without revisiting that decision.

### `_restore_recipe` and `_caveats`

The snapshot envelope (current version per `SNAPSHOT_VERSION` in backup.ts) embeds two top-level blocks computed at capture time as pure functions of the snapshot data:

- **`_restore_recipe`**: an ordered list of `{ order, tool, args, depends_on, notes? }` steps the AI executes to apply the snapshot. Each step's `tool` is the MCP tool name (e.g. `update_zone_settings`); `args` is the snake_case payload pre-built from snapshot data; `depends_on` references prior step `order` numbers (e.g. `create_sensor` depends on the matching `create_custom_sensor_type`); optional `notes` flags fields the AI must merge from live state (e.g. `update_zone_settings` step has nulls for unreadable fields like `watering_mode` — the AI fetches via `get_zone_settings` and merges).
- **`_caveats`**: human-readable strings describing known restore limitations specific to this snapshot — unit-pref drift between capture and restore, custom-sensor-type id reallocation, reusable schedule-id references that may have been removed, ADVANCED-mode WateringProgram subtype gaps, hardware re-wiring out-of-band, etc.

The recipe is **not** a server-side restore — it's a playbook. The AI follows it via the `restore-irrigation-backup` skill (in `.claude/skills/`): for each step, call `tool({ ...args, preview: true })` first, show the user the planned variables, get confirmation, then call again with `preview: false`. Fail-fast on first error. Capture a fresh "savepoint" snapshot first via the `capture-irrigation-snapshot` skill so partial-restore failures are recoverable.

### Skills (in repo, ship to users automatically)

`.claude/skills/restore-irrigation-backup/SKILL.md` — orchestrates the restore workflow. Triggered by phrases like "restore my irrigation backup", "apply this snapshot".

`.claude/skills/capture-irrigation-snapshot/SKILL.md` — orchestrates capture: runs `dump_controller_snapshot`, writes the JSON to `snapshots/<name>-<id>-<ISO>.json`, and ALSO captures the watering-report delta since the last capture into `snapshots/history/<id>-<from>_to_<until>.json`. The history files build permanent multi-year coverage that survives Hydrawise's ~1-year report retention. Triggered by phrases like "back up my irrigation", "snapshot my controller".

Both skills live in the project's `.claude/skills/`. Users who **clone the repo and open it in Claude Code** (the project root, with the project trusted) get them as project-scope skills automatically. Users who install the MCP server via `npx hydrowise-mcp` from a different MCP client (Claude Desktop, etc.) get the MCP **tools** but NOT the skills — they would need to copy the skill files to their personal `~/.claude/skills/` directory if they want the orchestration workflow.

### Testing the recipe

`tests/integration/snapshot-roundtrip.test.ts` exercises the round-trip: capture a snapshot from a fakeApi, then for each step in `_restore_recipe`, call the named tool with `preview: true` and assert the planned variables match. Catches: tool name typos, args shape drift, missing tools. The test deliberately skips `update_zone_settings` (which has documented nulls for unreadable fields the AI must merge) — that gap is asserted by the recipe builder's `notes` field, not by Zod-passing args.

## GraphQL schema source of truth

`schema/hydrawise.live.graphql` is captured directly from the live Hydrawise API via introspection. Treat it as authoritative when adding or editing hand-written queries/mutations. The cached pydrawise schema (Lake292 reference) is a useful comparison but is NOT the source of truth — it lags the live API.

To refresh:

```bash
HYDRAWISE_USERNAME=... HYDRAWISE_PASSWORD=... npx tsx scripts/probe-schema.ts
```

The script also prints what's new (types / mutations / arguments) vs the cached pydrawise schema at `/tmp/hydrawise.graphql`, useful when investigating GUI features the MCP doesn't yet support.
