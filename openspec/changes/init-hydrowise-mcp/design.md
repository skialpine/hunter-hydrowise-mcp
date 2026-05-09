## Context

Hunter Hydrawise is a cloud-managed irrigation platform. Its v2 API is GraphQL at `https://app.hydrawise.com/api/v2/graph` and uses bearer-token auth obtained from a username/password login. The reference Home Assistant integration `Lake292/hunter_hydrawise` ships a vendored `pydrawise` library (built on `gql` + `aiohttp`) that already implements every operation we need: list/get controllers and zones, start/stop runs (single and all), suspend/resume schedules (single and all), and delete suspensions.

This repository is empty apart from `CLAUDE.md` and `openspec/`. The user wants an MCP server they can wire into Claude Desktop / Claude Code to read state and trigger watering. There is no existing tech-stack constraint — we are picking one.

## Goals / Non-Goals

**Goals:**
- Ship a working MCP server (stdio transport) that authenticates to Hydrawise and exposes all common read and control operations as MCP tools.
- Keep the codebase small, idiomatic, and easy to install (`pipx install` or `uvx`-runnable).
- Mirror the well-tested Hydrawise call surface from `Lake292/hunter_hydrawise` so we inherit its API correctness.
- Make secrets handling explicit and obvious (env vars, `.env.example`, never logged).

**Non-Goals:**
- Re-implementing the Hydrawise GraphQL schema or building our own client from scratch — we depend on a maintained library.
- Webhooks, push notifications, or any inbound transport (HTTP/SSE) for the MCP server in v1 — stdio only.
- Long-running schedule editing (creating programs, editing zone defaults). Only ad-hoc start/stop and suspend/resume in v1.
- Multi-account support. One credential set per server process.
- Caching beyond the natural per-call freshness — every tool call hits the API.

## Decisions

### Language & runtime: Python 3.11+
Python is the language of the reference client (`pydrawise`) and has a first-class MCP SDK (`mcp` on PyPI). Reusing `pydrawise` directly avoids re-deriving the GraphQL DSL and DateTime serialization the Home Assistant integration already validated. **Alternative considered:** TypeScript/Node — would require porting the client to `graphql-request`, doubling scope.

### Hydrawise client: depend on the published `pydrawise` PyPI package
The maintained upstream (`dknowles2/pydrawise`) is the canonical fork the Lake292 integration is based on. We `pip install pydrawise` rather than vendoring. **Alternative considered:** vendoring the Lake292 copy — rejected because it freezes us at one snapshot and we would own a GraphQL client we did not write. If upstream ever lags behind the API, we revisit.

### MCP framework: official `mcp` Python SDK with `FastMCP`
`FastMCP` decorators (`@mcp.tool()`) keep tool definitions colocated with their handlers and auto-generate input schemas from type hints, which is exactly the ergonomic we want for ~12 tools. **Alternative considered:** raw `Server` class — more boilerplate for no benefit at this size.

### Project layout: `src/` with `pyproject.toml`
Standard `src/hydrowise_mcp/` layout, console-script entry point `hydrowise-mcp = hydrowise_mcp.server:main`. Ships a single command users add to their MCP client config. **Alternative considered:** flat layout — works but `src/` prevents accidental imports of the in-tree package during tests.

### Configuration: env vars only, with `.env` loaded by the entry point
`HYDRAWISE_USERNAME` and `HYDRAWISE_PASSWORD` are required; the server fails fast at startup with a clear error if either is missing. Optional `HYDRAWISE_LOG_LEVEL` for debugging. **Alternative considered:** a JSON/YAML config file — overkill for two values, and MCP clients already pass env via their config.

### Auth lifetime: one `Hydrawise` client per process, lazily constructed
The bundled `Auth` class caches the bearer token; we wrap a single instance behind a module-level accessor and let `pydrawise` handle refresh. We do NOT pre-fetch on startup so the server starts fast even if the network is briefly down. **Alternative considered:** validate creds at startup — slower start, fails the whole MCP server when the API is briefly unreachable.

### Tool surface: minimal pass-through, no orchestration
One MCP tool per upstream operation. No "convenience" tools that stitch multiple calls together in v1; we let the model do that. **Alternative considered:** a single `hydrawise_query` mega-tool with an action enum — harder for the model to discover and validate per-action arguments.

### IDs: integer controller_id / zone_id, surfaced verbatim
Hydrawise uses integer IDs for controllers and zones. Tools accept those directly. The model is expected to call `list_controllers` / `list_zones` first to discover IDs. **Alternative considered:** name-based resolution inside each tool — adds ambiguity (two zones can share a name across controllers) and a hidden extra API call per tool invocation.

### Durations: tools accept `minutes` (int), convert to seconds internally
Matches how a person talks ("run for 10 minutes"). The Hydrawise API takes seconds; conversion happens in the tool wrapper. `0` means "use the zone's configured default duration", matching upstream semantics.

### Suspensions: tools accept either `days` (int) OR an ISO-8601 `until` timestamp, exactly one
`days` is the natural human input ("suspend for 3 days"); `until` lets the model honor a specific date when the user says "until next Monday". The tool validates exactly one is provided. Internally both produce a `datetime` passed to `pydrawise.suspend_*`.

### Error handling: convert `pydrawise` exceptions to MCP tool errors with the upstream `summary`
`pydrawise` raises `MutationError(summary)` for non-OK GraphQL responses. We surface the summary string in the MCP error so the user sees the real cause ("Zone is already running", "Controller offline") rather than a generic failure. Network/auth errors are returned as separate, distinguishable error types.

## Risks / Trade-offs

- **[Risk] Upstream `pydrawise` breaks or lags the API** → Mitigation: pin a specific version in `pyproject.toml`, document the version, and keep the option to vendor open if upstream goes stale. The Lake292 vendored copy is our fallback reference.
- **[Risk] Credentials accidentally logged** → Mitigation: never log env-var values; `pydrawise`'s `gql_log` is already set to ERROR; add a unit test that asserts password does not appear in any log record produced during a tool call.
- **[Risk] Rate limiting / API abuse from a chatty model** → Mitigation: document the polling interval used by the reference HA integration (30s) in the README and rely on per-call latency to dampen loops; do not add automatic retries that could amplify load.
- **[Risk] Destructive tool calls (start_all_zones) triggered casually by the model** → Mitigation: tool descriptions clearly mark which tools change physical state; rely on the MCP client's user-confirmation UX (Claude Desktop / Claude Code prompt before calling tools).
- **[Trade-off] No caching means every list call hits the API** → Acceptable for v1; Hydrawise data changes (a zone is running, a suspension was added) need to be fresh, and we have at most a handful of controllers/zones per account.
- **[Trade-off] stdio-only transport** → Cannot run as a remote/shared service in v1, but matches how Claude Desktop / Claude Code launch MCP servers and avoids exposing credentials over a network.

## Migration Plan

Not applicable — greenfield repo, no prior server to migrate. Rollback is `git revert` of the initial commit. Users uninstall via `pip uninstall hydrowise-mcp` and remove the entry from their MCP client config.

## Open Questions

- Should we expose `delete_zone_suspension` as an MCP tool in v1? It requires the suspension's `id`, which is awkward for a model to discover. Leaning **no** — covered by `resume_zone` for the common case.
- Do we want a `dry_run` mode (e.g., env var) that logs intended mutations without sending them, for first-time setup? Defer until requested.
