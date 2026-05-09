# hydrowise-mcp

MCP server for the **Hunter HydroWise (Hydrawise)** cloud irrigation platform.

Speaks the **Streamable HTTP** transport from MCP spec revision **2025-11-25**, exposing read and control operations on your Hydrawise controllers and zones as MCP tools. Built in TypeScript on Node 24+, uses `@modelcontextprotocol/sdk@^1.29`, hosts a single `/mcp` endpoint via Express.

## Prerequisites

- Node.js **>= 24**
- A Hydrawise account (the username/password you use to log in at [app.hydrawise.com](https://app.hydrawise.com))

## Install & run

```bash
# clone / cd to this repo
npm install
npm run build

# run with credentials in env
HYDRAWISE_USERNAME=you@example.com \
HYDRAWISE_PASSWORD=*** \
node dist/server.js
```

The server prints `hydrowise-mcp listening on http://127.0.0.1:8765/mcp (MCP 2025-11-25)` on stderr and waits for MCP clients to connect.

For development you can use `npm run dev` (tsx watch).

Once published to npm you'll be able to skip the clone with `npx hydrowise-mcp`.

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

Read-only tools (safe; the model can call freely):

| Tool | Args | Returns |
| --- | --- | --- |
| `get_user` | — | `{id, name, email}` for the authenticated user |
| `list_controllers` | — | array of controllers with `id`, `name`, `online`, `serial_number`, `last_contact_time` |
| `get_controller` | `controller_id` | a single controller |
| `list_zones` | `controller_id` | zones on the controller with `id`, `name`, `number`, `suspended_until`, `last_run`, `next_run` |
| `get_zone` | `zone_id` | a single zone |

Control tools (these change physical state — descriptions are prefixed `PHYSICAL ACTION:` so MCP clients can prompt for confirmation):

| Tool | Args | Effect |
| --- | --- | --- |
| `start_zone` | `zone_id`, optional `minutes` | Starts a zone. New runs are stacked behind any in-progress run. |
| `stop_zone` | `zone_id` | Stops the zone. |
| `start_all_zones` | `controller_id`, optional `minutes` | Starts every zone on the controller. |
| `stop_all_zones` | `controller_id` | Stops every zone on the controller. |
| `suspend_zone` | `zone_id`, exactly one of `days` or `until` | Suspends the zone's schedule. `until` is ISO-8601. |
| `resume_zone` | `zone_id` | Clears any active suspension on the zone. |
| `suspend_all_zones` | `controller_id`, exactly one of `days` or `until` | Suspends every zone on the controller. |
| `resume_all_zones` | `controller_id` | Clears active suspensions on every zone. |

Schedule reads (added in v0.2):

| Tool | Args | Returns |
| --- | --- | --- |
| `get_zone_settings` | `zone_id` | Zone watering settings in the writable shape used by `update_zone_settings` |
| `list_programs` | `controller_id` | Programs on the controller with a `program_type` discriminator |
| `list_program_start_times_for_zone` | `zone_id` | Program start times associated with a single zone |
| `get_seasonal_adjustments` | `controller_id` | 12-element factor array |
| `get_watering_triggers` | `controller_id` | Rain/temp/humidity/wind triggers in the writable shape |

Schedule writes (`PHYSICAL ACTION:`; every tool accepts `preview: true` to dry-run and return the planned GraphQL):

| Tool | Args | Effect |
| --- | --- | --- |
| `update_zone_settings` | full writable zone payload | Apply `updateZone` mutation |
| `update_seasonal_adjustments` | `controller_id`, 12-int `factors` | Replace seasonal adjustment factors |
| `update_watering_triggers` | `controller_id` + every trigger field | Apply `updateWateringTriggers` |
| `create_program_start_time` | `controller_id` + full payload | Create a new program start time |
| `update_program_start_time` | `id` + full payload | Replace an existing program start time |
| `delete_program_start_time` | `id`, `controller_id` | Delete a program start time |
| `create_standard_program` | `controller_id` + full payload | Create a new standard program |
| `update_standard_program` | `program_id` + full payload | Replace an existing standard program |
| `delete_standard_program` | `program_id`, `controller_id` | Delete a standard program |
| `create_watering_program` | `program_type` (`Time`/`Smart`/`VirtualSolarSync`) + subtype-specific payload | Create a watering program |
| `update_watering_program` | `program_id`, `program_type` + subtype-specific payload | Replace a watering program |
| `delete_watering_program` | `program_id` | Remove a watering program |

Backup:

| Tool | Args | Returns |
| --- | --- | --- |
| `dump_controller_snapshot` | `controller_id` | Versioned JSON envelope `{ snapshot_version, captured_at, server_version, user, controller: { ..., zones, programs, seasonal_adjustments, watering_triggers } }` |

## Backup

`dump_controller_snapshot(controller_id)` walks one controller and returns a single JSON document with the user reference, controller header, zones with writable settings, programs (Standard/Advanced via the `Program` interface), program start times per zone, seasonal adjustments, and watering triggers.

The server never writes to disk. Persist the snapshot externally — typical patterns:

- **Filesystem MCP**: have your AI write the JSON to `~/hydrowise-backups/<date>.json` via a filesystem-capable MCP.
- **Copy-paste**: copy the JSON out of the chat and save it.
- **External cron**: shell pipeline like `curl ... dump_controller_snapshot ... > ~/backups/$(date -I).json`.

For a multi-controller account, call `dump_controller_snapshot` once per `controller_id`.

## Schedule editing

Hydrawise's GraphQL read shape and write shape are different — reads return rich objects (`SelectedOption { value, label }`, `LocalizedValueType { value, unit }`), while mutations take flat scalars. So in this server, **reads return data in the writable shape**, and **writes accept the complete writable payload**. There is no "change just one field" partial-update path; the AI is expected to read the current values (via a `get_*` tool or a recent snapshot), modify the fields it wants, and submit the full payload.

The natural workflow:

1. **Snapshot first** — `dump_controller_snapshot` as a rollback point. Save the JSON.
2. **Read what you're about to change** — `get_zone_settings`, `get_watering_triggers`, etc.
3. **Preview** — call the matching `update_*` with `preview: true`. The response contains the GraphQL operation name and the variables that would be sent. Review with the user.
4. **Apply** — call again with `preview: false` (or omit `preview`).
5. **Snapshot after** — another `dump_controller_snapshot` records the new desired state for future diffs.

There is no `restore_from_backup` tool. Restore is an AI workflow: the model diffs an old snapshot against current state and calls the matching `update_*` tool per category.

## Configuration

| Env var | Default | Required | Purpose |
| --- | --- | --- | --- |
| `HYDRAWISE_USERNAME` | — | yes | Hydrawise account login. |
| `HYDRAWISE_PASSWORD` | — | yes | Hydrawise account password. |
| `HYDRAWISE_MCP_HOST` | `127.0.0.1` | no | Bind address. Non-loopback values require `HYDRAWISE_MCP_AUTH_TOKEN`. |
| `HYDRAWISE_MCP_PORT` | `8765` | no | Listen port. |
| `HYDRAWISE_MCP_ALLOWED_ORIGINS` | (any loopback) | no | Comma-separated allowlist for the `Origin` header. |
| `HYDRAWISE_MCP_AUTH_TOKEN` | — | conditional | If set, every request must carry `Authorization: Bearer <token>`. Required for non-loopback binds. |
| `HYDRAWISE_MCP_SESSION_TTL` | `3600` | no | Idle session timeout in seconds. |
| `HYDRAWISE_LOG_LEVEL` | `warn` | no | `error \| warn \| info \| debug`. |

A `.env` file is loaded automatically only when stdin is a TTY, so env supplied by your MCP client config always wins in production.

## Remote / shared use

By default the server binds to `127.0.0.1` and accepts only loopback origins. To expose it on a network:

```bash
HYDRAWISE_MCP_HOST=0.0.0.0 \
HYDRAWISE_MCP_AUTH_TOKEN="$(openssl rand -hex 32)" \
HYDRAWISE_MCP_ALLOWED_ORIGINS=https://my-other-host.example \
node dist/server.js
```

Then add `"headers": { "Authorization": "Bearer ..." }` to the MCP client config and front the server with TLS (e.g. via Caddy, nginx, or Tailscale).

## Security

Per MCP spec 2025-11-25 §Streamable HTTP / Security Warning:

- Binds to `127.0.0.1` by default; refuses to start on a non-loopback host without an auth token.
- Validates the `Origin` header on every request and returns **HTTP 403** when it isn't on the allowlist.
- Validates the `Host` header against the bound interface to defend against DNS rebinding when no `Origin` is present.
- Optional constant-time `Authorization: Bearer` check.
- Credentials and bearer tokens are never written to logs (covered by a unit test).

## Development

```bash
npm run dev           # tsx watch
npm run build         # bundle to dist/server.js with shebang
npm test              # vitest (unit + supertest integration)
npm run lint
npm run typecheck
```

## Acknowledgements

Auth flow and tool surface modeled on [`Lake292/hunter_hydrawise`](https://github.com/Lake292/hunter_hydrawise) (the Home Assistant integration, Apache 2.0). The Hydrawise GraphQL endpoints and the public `client_id`/`client_secret` pair are from that reference.

## License

GPL-3.0-or-later (matching the repository LICENSE).
