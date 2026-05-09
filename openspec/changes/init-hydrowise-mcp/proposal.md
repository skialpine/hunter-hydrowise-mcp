## Why

The Hunter HydroWise (Hydrawise) cloud platform exposes a GraphQL API for controlling smart sprinkler controllers, but there is no MCP server that lets Claude (or other MCP clients) read controller state or trigger watering on the user's behalf. This change bootstraps an MCP server so the user can ask Claude things like "run the front yard for 10 minutes" or "suspend all zones until next week" from any MCP-aware client.

## What Changes

- Add a Python MCP server package (`hydrowise_mcp`) exposing the Hydrawise API as MCP tools.
- Authenticate to the Hydrawise GraphQL endpoint (`https://app.hydrawise.com/api/v2/graph`) using a username/password supplied via environment variables, with the token cached in-process.
- Provide read-only tools: `get_user`, `list_controllers`, `get_controller`, `list_zones`, `get_zone`.
- Provide control tools: `start_zone`, `stop_zone`, `start_all_zones`, `stop_all_zones`.
- Provide schedule tools: `suspend_zone`, `resume_zone`, `suspend_all_zones`, `resume_all_zones`.
- Bundle a project skeleton: `pyproject.toml`, console-script entry point (`hydrowise-mcp`), `README.md` with install/run instructions, lint/test config, `.env.example`.
- Document setup steps (Claude Desktop / Claude Code MCP config snippets) in `README.md`.

## Capabilities

### New Capabilities
- `mcp-server`: process lifecycle, transport (stdio), configuration loading, and authentication for the Hydrawise GraphQL client.
- `irrigation-status`: read-only MCP tools that surface user, controller, and zone state from the Hydrawise API.
- `irrigation-control`: state-changing MCP tools that start/stop runs and suspend/resume schedules for a single zone or all zones on a controller.

### Modified Capabilities
<!-- None — this is the initial change for a fresh repository. -->

## Impact

- **New code**: `src/hydrowise_mcp/` package (server entry point, tool definitions, Hydrawise client wrapper, config loader), `tests/`, project scaffolding (`pyproject.toml`, `README.md`, `.env.example`, `.gitignore`, `ruff`/`pytest` config).
- **Dependencies**: `mcp` (official Python MCP SDK), `pydrawise` (or vendored equivalent of the GraphQL client used by `Lake292/hunter_hydrawise`), `pydantic`/`python-dotenv` as needed.
- **External systems**: outbound HTTPS calls to `app.hydrawise.com`. No inbound exposure — stdio transport only.
- **Secrets**: requires `HYDRAWISE_USERNAME` and `HYDRAWISE_PASSWORD` env vars; documented but never logged.
- **CLAUDE.md**: update the "Getting Started" placeholders with the install/run/test commands once the scaffolding lands.
