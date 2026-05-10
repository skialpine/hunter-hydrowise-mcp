# hydrowise-mcp

MCP server for the **Hunter Hydrawise** cloud irrigation platform.

Lets an AI agent (Claude Desktop, Claude Code, or any MCP-compatible client) **read, diagnose, and edit** your Hydrawise irrigation system through natural language — controllers, zones, programs, schedules, sensors, watering history, weather triggers, and full backup/restore.

Speaks **Streamable HTTP** transport per MCP spec revision 2025-11-25. Hosts a single `/mcp` endpoint on Express. Built in TypeScript on Node 24+, uses `@modelcontextprotocol/sdk@^1.29`.

## What you can do with it

```
"Why did zone 7 not run last night?"
"Switch the Lawn program to Wed + Sat for the new drought rules."
"Increase Patio Hill's soak time — too much runoff."
"Show me how much water we used last July, by zone."
"Back up the controller and save it locally."
"Restore from this morning's snapshot — last night's change broke things."
```

The model can drive read-only diagnostics freely. Every write tool is prefixed `PHYSICAL ACTION:` so MCP clients can prompt for confirmation, and supports a `preview: true` flag that returns the exact GraphQL variables that *would* be sent — without dispatching them.

## Prerequisites

- Node.js **>= 24**
- A Hydrawise account (the username/password you use to log in at [app.hydrawise.com](https://app.hydrawise.com))

## Install & run

```bash
git clone <this repo>
cd hunter-hydrowise-mcp
npm install
npm run build

# run with credentials in env
HYDRAWISE_USERNAME=you@example.com \
HYDRAWISE_PASSWORD=*** \
npm start
```

The server prints `hydrowise-mcp listening on http://127.0.0.1:8765/mcp (MCP 2025-11-25)` on stderr and waits for MCP clients to connect.

For development: `npm run dev` (tsx watch).

Once published to npm: `npx hydrowise-mcp`.

## Configure your MCP client

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on Windows/Linux:

```json
{
  "mcpServers": {
    "hydrowise": {
      "url": "http://127.0.0.1:8765/mcp"
    }
  }
}
```

Make sure the server process is running before launching Claude Desktop.

### Claude Code

```bash
claude mcp add --transport http hydrowise http://127.0.0.1:8765/mcp
```

Or edit `.mcp.json` (project-scoped) / `~/.claude.json` (user-scoped) directly:

```json
{
  "mcpServers": {
    "hydrowise": {
      "type": "http",
      "url": "http://127.0.0.1:8765/mcp"
    }
  }
}
```

## Tool catalog

All write tools are prefixed `PHYSICAL ACTION:` and accept `preview: true` to dry-run.

### Status (read-only)

| Tool | Purpose |
| --- | --- |
| `get_user` | Authenticated user `{id, name, email}` |
| `list_controllers` | Each controller with `id`, `name`, `online`, `serial_number`, `last_contact_time`, `hibernate_status`, `status_summary`, `status_icon`, `accumulated_water_savings` |
| `get_controller` | Single controller with full header + location + master valve + expanders + modules + hibernation/status fields |
| `list_zones` | Zones on a controller (id, name, number) |
| `get_zone` | Single zone |

### Schedule reads (upcoming runs)

| Tool | Purpose |
| --- | --- |
| `get_zone_scheduled_runs` | Upcoming runs for one zone in a window (default: now → now+7d). Surfaces post-queue start times when programs overlap. |
| `get_zone_next_run` | The single next scheduled run for a zone, or null. Cheap status check. |
| `get_controller_schedule` | All zones, all upcoming runs in a window. The whole-controller calendar view. |

### Reporting (read-only history)

| Tool | Purpose |
| --- | --- |
| `get_watering_report` | Run log for a controller over a date range — scheduled vs. reported start/end times, durations, water usage, stop reasons |
| `get_zone_run_history` | Recent runs for one zone (normal vs. scheduled vs. actual minutes per run) |
| `get_run_summary` | Aggregated normal + actual run minutes for a zone over a period (CURRENT_WEEK / WEEK / MONTH / YEAR) |
| `get_water_saving_summary` | Controller-level water-savings report (matches the GUI's "Reported Water Savings" tab) |

### Control (PHYSICAL ACTION — runtime)

| Tool | Effect |
| --- | --- |
| `start_zone` | Run one zone, optional minutes + learn-from-next-run flags |
| `stop_zone` | Stop one zone |
| `start_all_zones` | Run every zone on a controller |
| `stop_all_zones` | Stop every zone on a controller |
| `suspend_zone` | Suspend a zone's schedule (`days` or `until`) |
| `resume_zone` | Clear a suspension |
| `suspend_all_zones` | Suspend every zone |
| `resume_all_zones` | Clear suspensions on every zone |

### Scheduling — full-payload writes (PHYSICAL ACTION)

| Tool | Effect |
| --- | --- |
| `get_zone_settings` | Current zone settings in the writable shape (with `_unreadable_fields` annotations) |
| `update_zone_settings` | **ADVANCED-mode only.** Wraps `updateZoneAdvanced` (~25 fields) |
| `update_zone_standard` | **STANDARD-mode only.** Wraps `updateZoneStandard` (~10 fields). Use this on STANDARD controllers to avoid mode flips. |
| `set_zone_baseline` | Set flow/current monitoring baselines (`MANUAL` or `LEARN_FROM_NEXT_RUN`) |
| `get_seasonal_adjustments` / `update_seasonal_adjustments` | 12-month adjustment factor array |
| `get_watering_triggers` / `update_watering_triggers` | Rain/temperature/humidity/wind triggers |
| `list_programs` / `get_program` | List or fetch a program (Standard or Advanced detail) |
| `list_program_start_times_for_zone` | Start times associated with a single zone |
| `create_program_start_time` / `update_program_start_time` / `delete_program_start_time` | Program start time CRUD |
| `create_standard_program` / `update_standard_program` / `delete_standard_program` | Standard program CRUD |
| `create_watering_program` / `update_watering_program` / `delete_watering_program` | Time / Smart / VirtualSolarSync watering program CRUD |

### Patch tools (PHYSICAL ACTION — preferred for incremental edits)

The full-payload `update_*` tools above require the AI to send the entire program/zone payload to change one field. The patch tools wrap a read-merge-write internally so the caller supplies only the field being changed. **Prefer these for everyday edits.**

| Tool | What it changes |
| --- | --- |
| `update_zone_run_time_in_program` | One zone's run time within one Standard program |
| `update_program_day_pattern` | A Standard program's day pattern (`dow` / `even` / `odd` / `interval`) |
| `update_program_start_times` | Bulk-replace all start times for a Standard program |
| `update_zone_cycle_soak` | A zone's cycle/soak settings (STANDARD-mode only) |
| `update_zone_watering_adjustment` | A zone's watering-adjustment percent (STANDARD-mode only) |

All patch tools return `{ before, after, preview }` and support `preview: true` to inspect the planned mutation without dispatching.

### Controller config (PHYSICAL ACTION)

| Tool | Effect |
| --- | --- |
| `update_location` | Set address and/or coordinates (required for Virtual Solar Sync to look up local weather) |
| `update_controller_master_valve` | Assign master valve by zone number |
| `update_controller_program_mode` | Switch STANDARD ↔ ADVANCED |
| `hibernate_controller` / `wake_controller` | Sleep/wake the scheduler |
| `create_expander` / `update_expander` / `delete_expander` | Hardware expander CRUD |
| `create_zone` / `delete_zone` | Zone CRUD (wraps `createZoneAdvanced` — the deprecated `createZone` is intentionally not wrapped) |

### Notes (reads + PHYSICAL ACTION writes)

| Tool | Purpose |
| --- | --- |
| `list_controller_notes` / `list_zone_notes` | Read user-written notes |
| `create_controller_note` / `update_controller_note` / `delete_controller_note` | Controller note CRUD |
| `create_zone_note` / `update_zone_note` / `delete_zone_note` | Zone note CRUD |

All notes are typed (`fault | location | repair | comment`) with optional `pinned_to_top`. **Note: subscription-gated by Hydrawise** — free-tier accounts see an empty list rather than an error.

### Sensors (reads + PHYSICAL ACTION writes)

| Tool | Purpose |
| --- | --- |
| `list_sensors` | All sensors on a controller (writable shape + `_observed` block with model details) |
| `list_zone_sensors` | Sensors guarding a single zone |
| `list_sensor_models` | Built-in + custom sensor model catalog (account-wide) |
| `create_sensor` / `update_sensor` / `delete_sensor` | Sensor CRUD |
| `create_custom_sensor_type` / `update_custom_sensor_type` / `delete_custom_sensor_type` | Custom sensor type definitions |

### Backup (read-only)

| Tool | Purpose |
| --- | --- |
| `dump_controller_snapshot` | Versioned JSON snapshot (`snapshot_version: 8`). See "Backup and restore" below. |

## Backup and restore

`dump_controller_snapshot(controller_id)` walks one controller and returns a versioned JSON document that captures **everything needed to fully restore the controller**:

- User reference
- Controller header (id, device_id, model, hardware, location, timezone, master valve, expanders, modules, run-time-group catalog, hibernate status, accumulated water savings, controller notes)
- All zones with writable settings (cycle/soak, monitoring observed values with units preserved, master-valve override, zone notes, sensor cross-references, per-zone `advanced_program` reference for ADVANCED-mode zones)
- Programs (BOTH Standard AND Advanced inlined with full subtype-specific detail)
- Program start times per zone
- Seasonal adjustments
- Watering triggers (with units captured to detect unit-pref drift between capture and restore)
- Sensors (`controller.sensors[]` with full detail, per-zone `sensors[]` denormalized cross-references)
- Advanced programs (`controller.advanced_programs[]`, empty on STANDARD-mode, populated on ADVANCED)

The envelope additionally embeds:

- **`_restore_recipe`** — an ordered list of `{ order, tool, args, depends_on, notes? }` steps that an AI follows to apply the snapshot. Each step is a pre-built MCP tool call. Dependencies between steps (e.g. `create_sensor` depends on `create_custom_sensor_type`) are encoded in `depends_on`.
- **`_caveats`** — human-readable warnings about known restore limitations specific to this snapshot (unreadable fields, custom-sensor-type id reallocation, reusable-schedule references that may have been removed, ADVANCED WateringProgram gaps, hardware re-wiring out-of-band, hibernation state at capture, unit-pref drift).

The server never writes to disk. Persist the snapshot externally — typical patterns:

- **Use the `capture-irrigation-snapshot` skill** below (writes to `snapshots/` automatically, plus accumulates watering-history deltas)
- **Filesystem MCP**: have your AI write the JSON to `~/hydrowise-backups/<date>.json`
- **Copy-paste**: copy the JSON out of the chat
- **External cron**: shell pipeline like `curl ... dump_controller_snapshot ... > ~/backups/$(date -I).json`

For a multi-controller account, call `dump_controller_snapshot` once per `controller_id`.

There is intentionally **no monolithic `restore_from_backup` MCP tool** — restore is the AI's choreography of `update_*` / `create_*` calls gated by `preview: true` confirmation. The recipe is the playbook; the skill is the executor.

### Skill-driven workflows

This repo ships two Claude Code skills in `.claude/skills/` that orchestrate the full workflows. Users who **clone this repo and open it as a project in Claude Code** (with the project trusted) get the skills as project-scope automatically. If you installed the MCP server via `npx hydrowise-mcp` from a different MCP client, copy the two skill directories to your personal `~/.claude/skills/`:

- **`capture-irrigation-snapshot`** — Triggered by phrases like "back up my irrigation" or "snapshot my controller". Calls `dump_controller_snapshot`, writes JSON to `snapshots/<name>-<id>-<ISO>.json`, AND captures the watering-report delta since the last capture into `snapshots/history/<id>-<from>_to_<until>.json`. The history files build permanent multi-year coverage that survives Hydrawise's ~1-year report retention.
- **`restore-irrigation-backup`** — Triggered by phrases like "restore my irrigation backup" or "apply this snapshot". Loads the snapshot, verifies the target controller, presents `_caveats` for acknowledgement, and walks `_restore_recipe` step-by-step: previewing each mutation, asking for confirmation, then applying. Fail-fast on errors. Recommends capturing a fresh "savepoint" snapshot first so partial-restore failures are recoverable.

## Schedule editing workflow

Hydrawise's GraphQL read shape and write shape are different — reads return rich objects (`SelectedOption { value, label }`, `LocalizedValueType { value, unit }`), while mutations take flat scalars. The MCP normalizes this:

- **Reads return data in the writable shape.** Pass it back almost as-is.
- **Writes accept the complete writable payload.** Most updates are full-payload-replace at the GraphQL layer.
- **The patch tools above wrap read-merge-write for common single-field edits** — the LLM only supplies the changed field.

The natural workflow:

1. **Snapshot first** — `dump_controller_snapshot` as a rollback point. Save the JSON.
2. **Read what you're about to change** — `get_zone_settings`, `get_program`, `get_watering_triggers`, etc.
3. **Preview** — call the matching `update_*` (or patch tool) with `preview: true`. The response contains the GraphQL operation name and the variables that would be sent. Review with the user.
4. **Apply** — call again with `preview: false` (or omit `preview`).
5. **Snapshot after** — another `dump_controller_snapshot` records the new desired state for future diffs.

### Numeric field naming convention

Every numeric field in this MCP carries its unit in the field name (`_minutes`, `_seconds`, `_days`, `_percent`, `_epoch_seconds`) — applied to both snapshot output AND tool inputs. Account-locale-dependent values (temperature, wind, rainfall, water flow, electric current) are wrapped as `{value, unit}` instead. A lint test (`tests/unit/lint-numeric-units.test.ts`) enforces the convention.

### Standard programs use a 7-character day-pattern bitmap

For `update_standard_program` with `standard_program_day_pattern: "dow"`, the `day_pattern` string is a 7-character ASCII bitmap, position 0 = Sunday through position 6 = Saturday, `'1'` = run, `'0'` = skip. Examples:

- `"0001001"` — Wednesday + Saturday (Denver Water Stage 1 odd-address compliance)
- `"0111110"` — weekdays only
- `"1010100"` — Sunday + Tuesday + Thursday
- `"1111111"` — every day

For non-`dow` modes Hydrawise still requires the field but ignores the value. Pass `"1111111"` as a neutral placeholder.

### Flow / current monitoring

Each zone has flow and electrical-current baselines (the GUI's "Advanced > Controller Insights" tab):

- `*_monitoring_method`: `MANUAL` (use a supplied baseline) or `LEARN_FROM_NEXT_RUN` (observe the next run and remember the result)
- `*_monitoring_value`: the baseline number (mA for current; the rate unit for flow). Only meaningful when method is `MANUAL`.

Three ways to set:

1. As part of `update_zone_settings` / `update_zone_standard` (full-payload write)
2. Via the dedicated `set_zone_baseline` tool (one-shot)
3. Inline at run-time by passing `learn_current_from_next_run: true` (or `learn_flow_from_next_run: true`) to `start_zone` / `start_all_zones`

`get_zone_settings` and `dump_controller_snapshot` also return a `monitoring_observed` block per zone with the read-only `operating_ranges` and `measured_medians`.

## Configuration

| Env var | Default | Required | Purpose |
| --- | --- | --- | --- |
| `HYDRAWISE_USERNAME` | — | yes | Hydrawise account login |
| `HYDRAWISE_PASSWORD` | — | yes | Hydrawise account password |
| `HYDRAWISE_MCP_HOST` | `127.0.0.1` | no | Bind address. Non-loopback values require `HYDRAWISE_MCP_AUTH_TOKEN` |
| `HYDRAWISE_MCP_PORT` | `8765` | no | Listen port |
| `HYDRAWISE_MCP_ALLOWED_ORIGINS` | (any loopback) | no | Comma-separated allowlist for the `Origin` header |
| `HYDRAWISE_MCP_AUTH_TOKEN` | — | conditional | If set, every request must carry `Authorization: Bearer <token>`. Required for non-loopback binds. |
| `HYDRAWISE_MCP_SESSION_TTL` | `3600` | no | Idle session timeout in seconds |
| `HYDRAWISE_LOG_LEVEL` | `warn` | no | `error \| warn \| info \| debug` |

A `.env` file is loaded automatically only when stdin is a TTY, so env supplied by your MCP client config always wins in production.

## Remote / shared use

By default the server binds to `127.0.0.1` and accepts only loopback origins. To expose it on a network:

```bash
HYDRAWISE_MCP_HOST=0.0.0.0 \
HYDRAWISE_MCP_AUTH_TOKEN="$(openssl rand -hex 32)" \
HYDRAWISE_MCP_ALLOWED_ORIGINS=https://my-other-host.example \
npm start
```

Then add `"headers": { "Authorization": "Bearer ..." }` to the MCP client config and front the server with TLS (e.g. via Caddy, nginx, or Tailscale).

## Security

Per MCP spec 2025-11-25 §Streamable HTTP / Security Warning:

- Binds to `127.0.0.1` by default; refuses to start on a non-loopback host without an auth token
- Validates the `Origin` header on every request; returns **HTTP 403** when not on the allowlist
- Validates the `Host` header against the bound interface to defend against DNS rebinding when no `Origin` is present
- Optional constant-time `Authorization: Bearer` check
- Credentials and bearer tokens are never written to logs (covered by a unit test)

## Development

```bash
npm run dev           # tsx watch
npm run build         # bundle to dist/server.js with shebang
npm test              # vitest (unit + supertest integration)
npm run lint
npm run typecheck
```

Schema source of truth: `schema/hydrawise.live.graphql` — captured directly from the live Hydrawise API via introspection. Refresh with:

```bash
HYDRAWISE_USERNAME=... HYDRAWISE_PASSWORD=... npx tsx scripts/probe-schema.ts
```

The script also diffs against the cached pydrawise schema and prints what's new.

## Acknowledgements

Auth flow and tool surface modeled on [`Lake292/hunter_hydrawise`](https://github.com/Lake292/hunter_hydrawise) (Home Assistant integration, Apache 2.0). The Hydrawise GraphQL endpoints and the public bundled `client_id`/`client_secret` pair are from that reference (the client_secret is the public bundled secret of the Hydrawise mobile app, not an account credential).

## License

GPL-3.0-or-later (matching the repository LICENSE).
