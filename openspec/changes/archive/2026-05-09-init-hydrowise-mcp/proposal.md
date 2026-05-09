## Why

The Hunter HydroWise (Hydrawise) cloud platform exposes a GraphQL API for controlling smart sprinkler controllers, but there is no MCP server that lets Claude (or other MCP clients) read controller state or trigger watering on the user's behalf. This change bootstraps an MCP server so the user can ask Claude things like "run the front yard for 10 minutes" or "suspend all zones until next week" from any MCP-aware client.

## What Changes

- Add a Node/TypeScript MCP server package (`hydrowise-mcp`) exposing the Hydrawise API as MCP tools.
- Speak the **Streamable HTTP** transport from MCP spec revision **2025-11-25** (single `/mcp` endpoint, `POST`/`GET`/`DELETE`, optional SSE stream on responses, stateful sessions via the `MCP-Session-Id` header, HTTP 403 on invalid `Origin`). No stdio fallback in v1.
- Target Node **>=24** (modern `node:http`, native `fetch`, top-level `await`, `--watch` and `node:test` available for dev).
- Run as a long-running HTTP server bound to `127.0.0.1` by default with `Origin` and `Host` header validation; expose an optional `Authorization: Bearer` check (`HYDRAWISE_MCP_AUTH_TOKEN`) for users who want client-to-server auth.
- Obtain a bearer token from Hydrawise via OAuth password grant at `https://app.hydrawise.com/api/v2/oauth/access-token`, refresh it before expiry, and use it for GraphQL calls to `https://app.hydrawise.com/api/v2/graph`.
- Provide read-only tools: `get_user`, `list_controllers`, `get_controller`, `list_zones`, `get_zone`.
- Provide control tools: `start_zone`, `stop_zone`, `start_all_zones`, `stop_all_zones`.
- Provide schedule tools: `suspend_zone`, `resume_zone`, `suspend_all_zones`, `resume_all_zones`.
- Bundle a project skeleton: `package.json` with an `npx`-runnable `bin` that starts the HTTP server and prints its URL, `tsconfig.json`, `tsup` build, `README.md` with install/run instructions, lint/test config, `.env.example`.
- Document setup steps (Claude Desktop / Claude Code MCP config snippets pointing at the HTTP URL) in `README.md`.

## Capabilities

### New Capabilities
- `mcp-server`: process lifecycle, transport (stdio), configuration loading, and authentication for the Hydrawise GraphQL client.
- `irrigation-status`: read-only MCP tools that surface user, controller, and zone state from the Hydrawise API.
- `irrigation-control`: state-changing MCP tools that start/stop runs and suspend/resume schedules for a single zone or all zones on a controller.

### Modified Capabilities
<!-- None — this is the initial change for a fresh repository. -->

## Impact

- **New code**: `src/` TypeScript package (server entry point, tool definitions, Hydrawise auth + GraphQL client, config loader), `tests/`, project scaffolding (`package.json`, `tsconfig.json`, `README.md`, `.env.example`, ESLint/Prettier config, build output to `dist/`).
- **Dependencies**: `@modelcontextprotocol/sdk` (>=1.29 for `2025-11-25` support), `express` (HTTP plumbing the SDK transport plugs into), `graphql-request` + `graphql`, `zod` for input validation; dev: `typescript`, `tsup`, `vitest`, `@types/node`, `@types/express`, `eslint`, `prettier`.
- **External systems**: outbound HTTPS calls to `app.hydrawise.com` (OAuth token endpoint and GraphQL endpoint); inbound HTTP on `127.0.0.1` only by default.
- **Secrets**: requires `HYDRAWISE_USERNAME` and `HYDRAWISE_PASSWORD` env vars; documented but never logged.
- **CLAUDE.md**: update the "Getting Started" placeholders with the install/run/test commands once the scaffolding lands.
