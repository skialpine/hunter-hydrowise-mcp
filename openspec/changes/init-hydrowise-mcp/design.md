## Context

Hunter Hydrawise is a cloud-managed irrigation platform. Its v2 API is GraphQL at `https://app.hydrawise.com/api/v2/graph` and uses bearer-token auth obtained via an OAuth password grant at `https://app.hydrawise.com/api/v2/oauth/access-token` (form-encoded, with a public `client_id=hydrawise_app` / `client_secret`). The reference Home Assistant integration `Lake292/hunter_hydrawise` ships a Python client (`pydrawise`) that we use as the source of truth for the auth flow, the tool surface, and the GraphQL schema.

On the MCP side, the latest spec revision is **2025-11-25** ([changelog](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/changelog.mdx)). It refines the **Streamable HTTP** transport introduced in 2025-03-26: single `/mcp` endpoint with `POST`/`GET`/`DELETE`, JSON or SSE responses, stateful sessions via `MCP-Session-Id`, mandatory HTTP 403 on invalid `Origin` (previously only SHOULD), polling-friendly SSE (server may close the underlying connection without ending the stream), and resumption via `Last-Event-ID` on a GET. The published `@modelcontextprotocol/sdk@1.29.0` declares `LATEST_PROTOCOL_VERSION = '2025-11-25'` and exposes a `StreamableHTTPServerTransport` that handles session bookkeeping, framing, and resumption — we plug Express into it.

This repository starts with only a GPL-3 LICENSE and the OpenSpec scaffolding.

## Goals / Non-Goals

**Goals:**
- Ship a working MCP server speaking spec **2025-11-25** over **Streamable HTTP**, in TypeScript on Node **>=24**.
- Bind to `127.0.0.1` by default and validate `Origin`/`Host` headers, per the spec's local-server security guidance.
- Mirror the well-tested Hydrawise call surface from `Lake292/hunter_hydrawise` so we inherit its API correctness even though we re-implement the client.
- Make secrets handling explicit and obvious (env vars, `.env.example`, never logged).
- Stay easy to install — runnable via `npx hydrowise-mcp` without a global install; the binary starts the HTTP server and prints the URL the user pastes into their MCP client config.

**Non-Goals:**
- A stdio transport in v1 — single transport, single code path.
- OAuth 2.1 between client and server in v1 — we offer a static-bearer-token shortcut instead, with OAuth deferred until needed.
- A full GraphQL codegen pipeline — we hand-write the small set of operations we use.
- Webhooks or push from Hydrawise into the server — we poll on demand.
- Long-running schedule editing (creating programs, editing zone defaults). Only ad-hoc start/stop and suspend/resume in v1.
- Multi-account support. One credential set per server process.
- Caching beyond the natural per-call freshness — every tool call hits the API.
- Resource/prompt/sampling capabilities. Tools only in v1.

## Decisions

### Language & runtime: TypeScript on Node >=24
Node 24 is the current LTS line and is what the user runs. Targeting it lets us rely on stable native `fetch`, `node:test` (for SDK/internal use), top-level `await` in ESM, and the modern `node:http` improvements without polyfills or compatibility branches. **Alternative considered:** Python with `pydrawise` — saves writing the HTTP+OAuth client, but the MCP TypeScript SDK is the spec's reference implementation and gets `2025-11-25` features first.

### Protocol target: MCP 2025-11-25, no version negotiation work of our own
We pin `@modelcontextprotocol/sdk` to `^1.29.0`, which sets `LATEST_PROTOCOL_VERSION = '2025-11-25'`. The SDK negotiates protocol versions on `initialize` automatically; we just consume its `McpServer` and `StreamableHTTPServerTransport`. **Alternative considered:** the `2.0.0-alpha` monorepo split (`@modelcontextprotocol/server` + `@modelcontextprotocol/express` etc.) — more flexible, but alpha. Revisit when 2.x stabilizes.

### Transport: Streamable HTTP via `StreamableHTTPServerTransport` + Express
A single `app.all('/mcp', ...)` route delegates `POST`/`GET`/`DELETE` to `transport.handleRequest(req, res, body)`, which the SDK implements per spec. We use stateful sessions: each `initialize` request mints a new `StreamableHTTPServerTransport` (with `sessionIdGenerator: () => randomUUID()`), the SDK emits `MCP-Session-Id` on the response, and subsequent requests on that ID find the same transport in a process-local `Map<string, StreamableHTTPServerTransport>`. **Alternative considered:** stateless mode (one transport per request) — simpler, but loses server→client streaming during a single request and forces re-init on every call. **Alternative considered:** Hono / raw `node:http` — Hono is nicer ergonomically and there is an alpha `@modelcontextprotocol/hono` package, but the SDK's primary documented integration is Express; we follow the well-trodden path.

### Security: localhost binding, Origin/Host validation, optional bearer
- Bind to `127.0.0.1` by default. Configurable via `HYDRAWISE_MCP_HOST`; binding to `0.0.0.0` requires the user to also set `HYDRAWISE_MCP_AUTH_TOKEN` or the server refuses to start.
- Validate `Origin` against an allowlist (`HYDRAWISE_MCP_ALLOWED_ORIGINS`, default permits any localhost / loopback origin). On mismatch, return **HTTP 403 Forbidden** with a JSON-RPC error body and no `id`, per the 2025-11-25 spec.
- Validate `Host` against the bound interface to defend against DNS rebinding even when the `Origin` header is absent.
- Optional `Authorization: Bearer <token>` check via `HYDRAWISE_MCP_AUTH_TOKEN`. When set, every request without a matching bearer gets HTTP 401. When unset, no client auth (acceptable on `127.0.0.1`).
- We do *not* implement OAuth 2.1 / OIDC discovery in v1; the spec's auth chapter is forward-compatible, so adding it later does not break existing clients.

### Session management
- One process-wide `McpServer` instance registers all tools.
- A `Map<sessionId, StreamableHTTPServerTransport>` holds active sessions. On `initialize` (no `MCP-Session-Id` header, body is an `InitializeRequest`), we create a new transport, wire `transport.onclose` to delete the entry, and `await server.connect(transport)`.
- Requests with an unknown `MCP-Session-Id` get HTTP 404, prompting the client to re-initialize, per spec §Session Management.
- `DELETE /mcp` with a valid `MCP-Session-Id` closes that transport and removes the entry.
- Sessions expire after `HYDRAWISE_MCP_SESSION_TTL` (default 1 hour) of inactivity to bound memory.

### Hydrawise client: hand-written, using `graphql-request` over native `fetch`
We implement two small modules: an `auth` module that handles the OAuth password grant + refresh, and a `client` module that wraps `graphql-request` with the `Authorization` header. We hand-write the ≈12 queries and mutations as plain GraphQL strings, with TypeScript interfaces for the response shapes. **Alternative considered:** GraphQL Code Generator — adds build complexity for a fixed surface; defer.

### Auth flow to Hydrawise: replicate `pydrawise.auth` exactly
- POST `application/x-www-form-urlencoded` to `https://app.hydrawise.com/api/v2/oauth/access-token`.
- Initial token: `client_id=hydrawise_app`, `client_secret=zn3CrjglwNV1`, `grant_type=password`, `scope=all`, `username=<user>`, `password=<pass>`.
- Refresh: `grant_type=refresh_token`, `refresh_token=<saved>` (plus the same client id/secret).
- Cache `access_token`, `refresh_token`, `token_type`, `expires_at`. Refresh when within 5 minutes of expiry.
- Use `Authorization: <token_type> <access_token>` on every GraphQL request.
- The `client_secret` is the public secret bundled in the Hydrawise mobile app and the upstream open-source client; we do not need to obscure it.

### Project layout: `src/` + `tsup` build to `dist/`
- `src/server.ts` — entry point with `#!/usr/bin/env node` shebang; `main()` loads config, builds the Express app, listens, prints the URL.
- `src/config.ts` — env-var loader.
- `src/http/middleware.ts` — Origin/Host validation, optional bearer auth.
- `src/http/sessions.ts` — `Map<string, StreamableHTTPServerTransport>` plus the routing logic for POST/GET/DELETE on `/mcp`.
- `src/hydrawise/auth.ts`, `src/hydrawise/client.ts`, `src/hydrawise/queries.ts`, `src/hydrawise/api.ts`.
- `src/tools/status.ts`, `src/tools/control.ts`, `src/tools/_helpers.ts`.
- `src/errors.ts`, `src/logger.ts`.

`package.json` declares `"bin": { "hydrowise-mcp": "dist/server.js" }` and `"engines": { "node": ">=24" }`. `tsup` produces a single bundled ESM file with the shebang preserved.

### Configuration
| Env var | Default | Required | Purpose |
| --- | --- | --- | --- |
| `HYDRAWISE_USERNAME` | — | yes | Hydrawise account login. |
| `HYDRAWISE_PASSWORD` | — | yes | Hydrawise account password. |
| `HYDRAWISE_MCP_HOST` | `127.0.0.1` | no | Bind address. Non-loopback values require `HYDRAWISE_MCP_AUTH_TOKEN`. |
| `HYDRAWISE_MCP_PORT` | `8765` | no | Listen port. |
| `HYDRAWISE_MCP_ALLOWED_ORIGINS` | (any localhost) | no | Comma-separated allowlist for the `Origin` header. |
| `HYDRAWISE_MCP_AUTH_TOKEN` | — | conditional | If set, every request must carry `Authorization: Bearer <token>`. Required when binding non-loopback. |
| `HYDRAWISE_MCP_SESSION_TTL` | `3600` | no | Idle session timeout in seconds. |
| `HYDRAWISE_LOG_LEVEL` | `warn` | no | `error\|warn\|info\|debug`. |

A `.env` file is loaded only when `process.stdin.isTTY` so MCP-client-managed env always wins in production.

### Tool surface: minimal pass-through, no orchestration
One MCP tool per upstream operation. Tool input schemas use Zod and are converted to the wire JSON Schema by the SDK (which now defaults to JSON Schema 2020-12 per the 2025-11-25 spec). Tool outputs are plain dicts; we normalize Hydrawise's `serialNumber` → `serial_number` and similar in a single serializer.

### IDs, durations, suspensions — unchanged from the prior design
Integer `controller_id` / `zone_id` accepted verbatim. `start_zone` accepts `minutes` (0 → use the zone's default), converts to seconds, and always sets `stackRuns: true`. Suspensions accept exactly one of `days` (relative) or `until` (ISO-8601 absolute), enforced by a Zod refinement.

### Error handling: discriminated error types, surface upstream `summary`
Three error classes (`HydrawiseAuthError`, `HydrawiseAPIError`, `HydrawiseMutationError`). Tool wrapper maps each to an MCP `{ isError: true, content: [...] }` with a `kind: ...` prefix in the message so the client can distinguish them. The 2025-11-25 spec clarifies that **input validation errors should be returned as Tool Execution Errors** (not protocol errors) so the model can self-correct — Zod parse failures inside a tool handler therefore return an `isError: true` content rather than a JSON-RPC error.

### Logging: stderr only, redacted credentials
All logs go to stderr (the spec was clarified in 2025-11-25 that stdio servers may use stderr for any log type — applies even though we are HTTP, for habit). Default level `warn`. `Authorization` headers are redacted in any log line that mentions request metadata. A unit test asserts that a full token-fetch + tool-call flow never emits the password, refresh token, or access token.

## Risks / Trade-offs

- **[Risk] Hydrawise API changes break our hand-written queries** → Mitigation: keep the `pydrawise` reference linked in the README; mirror upstream changes when they happen.
- **[Risk] Credentials accidentally logged** → Mitigation: never log env-var values, redact `Authorization` headers, and add a unit test that asserts password/token never appear in any log record produced during a tool call.
- **[Risk] Public `client_secret` becomes invalid** → Mitigation: low — it has been stable in the upstream client for years; if it changes we mirror the upstream fix in `auth.ts`.
- **[Risk] DNS rebinding / cross-origin attack on the local server** → Mitigation: localhost-only bind by default; `Origin` and `Host` validation; HTTP 403 on mismatch (per spec); refusal to bind non-loopback without a bearer token.
- **[Risk] Session map grows unbounded** → Mitigation: idle TTL eviction (`HYDRAWISE_MCP_SESSION_TTL`) plus `transport.onclose` cleanup on disconnect.
- **[Risk] Destructive tool calls (`start_all_zones`) triggered casually by the model** → Mitigation: tool descriptions clearly mark which tools change physical state; rely on the MCP client's user-confirmation UX to gate them.
- **[Trade-off] No caching** → Acceptable for v1; Hydrawise data needs to be fresh.
- **[Trade-off] Hand-written GraphQL strings instead of codegen** → Some risk of drift if upstream evolves; we accept it for build simplicity.
- **[Trade-off] HTTP-only transport** → Slightly higher setup cost than stdio (user runs a daemon and pastes a URL), but matches the user's stated preference and the spec's modern direction.
- **[Trade-off] Static bearer instead of OAuth 2.1** → Adequate for a local single-user server; revisit if remote / multi-user is needed.

## Migration Plan

Greenfield repo, no prior server to migrate. Rollback is `git revert` of the implementation commits. Users uninstall by stopping the server process and removing the entry from their MCP client config.

## Open Questions

- Should we expose `delete_zone_suspension` as an MCP tool in v1? Leaning **no** — covered by `resume_zone`.
- Do we want a `dry_run` mode (env var) that logs intended mutations without sending them, for first-time setup? Defer until requested.
- Publish to npm, or install-from-Git only? Defer until manual verification works end-to-end.
- Should the binary support an `--inspect` subcommand that prints the merged config and exits, for users debugging Origin/Host rejections? Probably yes, defer to a follow-up.
