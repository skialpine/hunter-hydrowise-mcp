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
    backup.ts          dump_controller_snapshot — versioned JSON snapshot
    reporting.ts       read-only reporting tools (watering report, run history, run summary)
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
- `list_controllers`
- `get_controller`
- `list_zones`
- `get_zone`

### Control — `src/tools/control.ts` (PHYSICAL ACTION)
- `start_zone`, `stop_zone`, `start_all_zones`, `stop_all_zones`
- `suspend_zone`, `resume_zone`, `suspend_all_zones`, `resume_all_zones`

### Scheduling — `src/tools/scheduling.ts` (reads + PHYSICAL ACTION writes)
- `get_zone_settings`, `update_zone_settings`
- `set_zone_baseline` — set flow/current monitoring baseline (`MANUAL` or `LEARN_FROM_NEXT_RUN`)
- `get_seasonal_adjustments`, `update_seasonal_adjustments` (exactly 12 monthly factors)
- `get_watering_triggers`, `update_watering_triggers`
- `list_programs`, `get_program`
- `list_program_start_times_for_zone`
- `create_program_start_time`, `update_program_start_time`, `delete_program_start_time`
- `create_standard_program`, `update_standard_program`, `delete_standard_program`
- `create_watering_program`, `update_watering_program`, `delete_watering_program`

### Backup — `src/tools/backup.ts` (read-only)
- `dump_controller_snapshot` — versioned JSON snapshot (`snapshot_version: 2`). Captures: user; controller header (id, **device_id**, model, hardware, **location**, **time_zone**, **master_valve**, **expanders**, **modules**, **run_time_groups** catalog, **controller_notes**); zones with their writable settings (cycle/soak, monitoring observed values **with units preserved**, **master_valve_override**, **zone_notes**, plus a `_unreadable_fields` array listing writable-but-not-readable field names); programs (Standard programs are **inlined with full schedule detail** — start_times, days_run, periodicity, monthly_watering_adjustments, per-zone run-time groups, valid_from/to, conditional schedule adjustments); program start times per zone (empty for STANDARD-mode controllers); seasonal adjustments; watering triggers (with units captured per LocalizedValueType field). No telemetry or run-event history.

### Controller config — `src/tools/controllerConfig.ts` (PHYSICAL ACTION writes)
- `update_location` — set address and/or coordinates; needs `device_id` (distinct from `controller.id`, captured in the snapshot)
- `update_controller_master_valve` — assign master valve by zone number
- `update_controller_program_mode` — switch STANDARD ↔ ADVANCED (discards prior-mode schedule state)
- `hibernate_controller`, `wake_controller`
- `create_expander`, `update_expander`, `delete_expander`
- `create_zone`, `delete_zone` — wraps `createZoneAdvanced` / `deleteZone`. The deprecated `createZone` (Int cycleSoakEnable / runNextAvailableStartTime) is intentionally not wrapped.

### Notes — `src/tools/notes.ts` (reads + PHYSICAL ACTION writes)
- `list_controller_notes`, `list_zone_notes`
- `create_controller_note`, `update_controller_note`, `delete_controller_note`
- `create_zone_note`, `update_zone_note`, `delete_zone_note`
- All notes are typed (`fault | location | repair | comment`) with optional `pinned_to_top` flag.

### Reporting — `src/tools/reporting.ts` (read-only)
- `get_watering_report` — controller-level run log for a date range (`from`/`until` as ISO-8601 strings → Unix timestamps); returns scheduled vs. reported times, durations in seconds, water usage, stop reason per run event
- `get_zone_run_history` — past runs for a single zone (`last_run` + `runs[]`). Each entry has `normal_duration_minutes` (program default), `scheduled_duration_minutes` (what the controller was told to run), and `actual_elapsed_seconds` (computed from end−start; smaller than scheduled when a run was cancelled or stopped early)
- `get_run_summary` — aggregated normal vs. actual run time and water volume for a zone; `period` is one of `CURRENT_WEEK | WEEK | MONTH | YEAR` with period-specific numeric args

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

- **`Zone.status.lastRun` / `nextRun` are declared `DateTime!` but actually null** for zones without run history. Selecting them inside `Controller.zones { ... }` causes the bulk fan-out to 500. `ZONES_QUERY` omits `status` for that reason; `ZONE_QUERY` (single-zone) keeps the same minimal shape for symmetry. `get_zone` and `list_zones` therefore return only `id/name/number`; richer per-zone state goes through `get_zone_settings` (single zone, full read via `ZONE_FULL_QUERY`).
- **`Controller.zones { ... }` is slow** on accounts with many zones — sometimes >30s, past Claude Desktop's tool timeout. The request usually succeeds on a second try. If a tool reliably times out on first call, retrying is the right move before debugging.
- **`updateZone` is `@deprecated`** in favor of `updateZoneAdvanced` (and `createZone` → `createZoneAdvanced`). The Advanced versions have **different argument shapes** for two fields: `cycleSoakEnable` and `runNextAvailableStartTime` are `Boolean` (not `Int`). They also accept four monitoring args (`flowMonitoringMethod`, `currentMonitoringMethod`, `flowMonitoringValue`, `currentMonitoringValue`). Always use Advanced for new write code.
- **`WateringSettings` is an interface** with two implementations: `AdvancedWateringSettings` (zones with per-zone `programStartTimes` and `advancedProgram`) and `StandardWateringSettings` (zones inside Standard programs, with `standardProgramApplications`). `fixedWateringAdjustment` and `cycleAndSoakSettings` are on the interface itself — no fragment needed for those. Other fields require `... on AdvancedWateringSettings` or `... on StandardWateringSettings` fragments.
- **`CycleAndSoakSettings` fields are `cycleDuration` / `soakDuration`** (not `cycleTime`/`soakTime` as the GUI labels might suggest), and they're bare `Int!` **minutes** (not wrapped objects).
- **`cycleSoakEnable` has no readable counterpart** — derive `true` from `wateringSettings.cycleAndSoakSettings != null`. The mutation accepts it as input, but reads don't expose the flag directly.
- **Unit inconsistency** between fields:
  - `RunTimeGroup.duration` (per-zone-per-program run time on Standard programs) is **minutes**.
  - `customRunDuration` on the `startZone*` mutations is **seconds**.
  - `cycleDuration` / `soakDuration` are **minutes**.
  - `ScheduledZoneRun.duration` is **scheduled** minutes — what the controller was told to run, NOT what actually elapsed. `serializeScheduledZoneRun` exposes this as `scheduled_duration_minutes` and adds `actual_elapsed_seconds` (computed from `endTime - startTime`) so cancelled / short-stopped runs are visible.
  - When in doubt, check what the GUI shows for the same field and confirm.
- **Read shapes don't match write shapes.** Reads return `SelectedOption { value, label, options }` and `LocalizedValueType { value, unit }` wrappers; mutations take bare `Int`/`Float`. The `tools/serializers.ts` layer unwraps on read; the AI is expected to send unwrapped values on write. **Don't try to round-trip** a raw read result into a mutation — it won't validate.
- **Snapshot preserves the `unit` string from every LocalizedValueType field**, but mutations take bare numbers. The unit goes into the snapshot envelope so the restore workflow can detect a unit-pref change between capture and restore (97°F captured → 97 restored as °C = scorched lawn). When calling `update_watering_triggers` / `update_zone_settings` from a snapshot, the AI extracts the bare `value` from the `{value, unit}` object and supplies it as a Float; the unit never reaches the mutation.
- **`MonitoringMethodEnum`** has exactly two values: `MANUAL` (use the supplied baseline) and `LEARN_FROM_NEXT_RUN` (observe and remember on the next zone run). The matching `*MonitoringValue` fields are only meaningful when the method is `MANUAL`.
- **`Controller.deviceId` ≠ `Controller.id`.** The location mutations (`updateLocation`, `updateLocationCoordinates`) take `deviceId`, not `controllerId`. Restore must use `device_id` from the snapshot.
- **`Module.id` is `Long!` (a custom scalar), not Int.** Serialized as a string in the snapshot to avoid JS Int53 surprises.
- **No standalone CRUD for `RunTimeGroup`.** The schema doesn't expose `createRunTimeGroup` / `updateRunTimeGroup`. Run-time groups are created/updated implicitly via `createStandardProgram` / `updateStandardProgram` through their `zoneRunTimes[]` argument. The snapshot's `controller.run_time_groups` catalog is captured for inspection / cross-reference, not for direct mutation.
- **No standalone CRUD for reusable schedule adjustments.** The `schedule_adjustment_ids` field references account-managed records that have no exposed mutations. Snapshot captures the IDs in use; if a snapshot's referenced ID has been removed from the account between capture and restore, the restore will fail at the `update_zone_settings` call. Document as `_caveat` and reconcile manually.
- **The pydrawise cached schema at `/tmp/hydrawise.graphql` is outdated.** The live SDL at `schema/hydrawise.live.graphql` is the source of truth; the cached one is missing newer features (`updateZoneAdvanced`, `setBaselineValues`, `learn*FromNextRun` start args, controller notes, ownership transfer, issue muting, etc.). When you suspect the cached schema, run `scripts/probe-schema.ts` to compare.
- **`DateTime` is an object type, not a scalar.** It has `{ value: String!, timestamp: Int!, largeTimestamp: Float!, timeZone: TimeZone!, relativeTime: String! }`. Any field typed `DateTime` or `DateTime!` in the schema **requires a sub-selection** (e.g. `startTime { value }`). Omitting it gives "Field X of type DateTime must have a sub selection." All reporting timestamp fields (`startTime`, `endTime`, `normalStartTime`, `reportedStartTime`, etc.) are `DateTime` objects — select `{ value }` and unwrap in the serializer.
- **The OAuth `client_secret` (`zn3CrjglwNV1`)** is the public bundled secret of the Hydrawise mobile app — not a credential we own. Fine to commit.

## Programming modes (Standard vs Advanced)

Hydrawise controllers run in one of two modes — `Controller.programMode: STANDARD | ADVANCED` — and the data model differs significantly:

| | Standard | Advanced |
| --- | --- | --- |
| Where the schedule lives | `StandardProgram` (start times, day pattern, `zoneRunTimes` map) | Per-zone (`AdvancedWateringSettings.programStartTimes`, `advancedProgram`) |
| To change one zone's run time | Edit the program's `zoneRunTimes` entry for that zone | Edit the zone directly |
| Read tool that exposes the full schedule | `get_program(controller_id, program_id, "Standard")` | (not yet implemented; would need an Advanced equivalent) |
| Mutations that target it | `updateStandardProgram`, `update*WateringProgram` | `updateZoneAdvanced` (+ per-zone start-time CRUD) |

Most accounts (including the dev account this project was built against) are Standard. Advanced support is partial: per-zone settings work, but the per-zone schedule edit path isn't fully wired.

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

## GraphQL schema source of truth

`schema/hydrawise.live.graphql` is captured directly from the live Hydrawise API via introspection. Treat it as authoritative when adding or editing hand-written queries/mutations. The cached pydrawise schema (Lake292 reference) is a useful comparison but is NOT the source of truth — it lags the live API.

To refresh:

```bash
HYDRAWISE_USERNAME=... HYDRAWISE_PASSWORD=... npx tsx scripts/probe-schema.ts
```

The script also prints what's new (types / mutations / arguments) vs the cached pydrawise schema at `/tmp/hydrawise.graphql`, useful when investigating GUI features the MCP doesn't yet support.
