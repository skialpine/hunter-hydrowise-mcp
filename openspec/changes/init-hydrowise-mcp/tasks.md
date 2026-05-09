## 1. Project scaffolding

- [ ] 1.1 Create `package.json` with `name: hydrowise-mcp`, `type: module`, `engines.node: ">=24"`, `license: GPL-3.0-or-later`, scripts (`build`, `dev`, `start`, `test`, `lint`, `typecheck`), and `bin: { "hydrowise-mcp": "dist/server.js" }`
- [ ] 1.2 Add runtime deps: `@modelcontextprotocol/sdk@^1.29.0`, `express@^5`, `graphql`, `graphql-request`, `zod`, `dotenv`
- [ ] 1.3 Add dev deps: `typescript`, `tsup`, `vitest`, `@types/node@^24`, `@types/express`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `prettier`, `supertest` (for HTTP integration tests)
- [ ] 1.4 Create `tsconfig.json` (target `ES2024`, `module: NodeNext`, `moduleResolution: NodeNext`, `strict: true`, `outDir: dist`, `rootDir: src`, `lib: ["ES2024"]`)
- [ ] 1.5 Configure `tsup` (entry `src/server.ts`, format `esm`, `target: node24`, `shims: false`, `banner: { js: "#!/usr/bin/env node" }`, `clean: true`); ensure the output file is `chmod +x` after build
- [ ] 1.6 Add `.eslintrc.cjs` and `.prettierrc` with conservative defaults
- [ ] 1.7 Add `vitest.config.ts` (node environment, no coverage by default, includes `tests/**/*.test.ts`)
- [ ] 1.8 Update `.gitignore` to also exclude `dist/`, `node_modules/`, and `coverage/`
- [ ] 1.9 Add `.env.example` listing every supported env var: `HYDRAWISE_USERNAME`, `HYDRAWISE_PASSWORD`, `HYDRAWISE_MCP_HOST`, `HYDRAWISE_MCP_PORT`, `HYDRAWISE_MCP_ALLOWED_ORIGINS`, `HYDRAWISE_MCP_AUTH_TOKEN`, `HYDRAWISE_MCP_SESSION_TTL`, `HYDRAWISE_LOG_LEVEL`
- [ ] 1.10 Create `tests/setup.ts` that loads `.env.test` if present

## 2. Configuration, errors, logging

- [ ] 2.1 Implement `src/config.ts` exporting `loadConfig()` returning a fully-validated config object (Zod-parsed) with defaults from the table in `design.md`
- [ ] 2.2 In `loadConfig`, throw a clear `ConfigError` naming the missing variable when a required env var is missing or empty
- [ ] 2.3 In `loadConfig`, refuse to start when `host` is non-loopback and `authToken` is unset; emit an error message that names both env vars
- [ ] 2.4 In `src/server.ts`, call `dotenv.config()` only when `process.stdin.isTTY` so MCP-client-supplied env vars take precedence
- [ ] 2.5 Implement `src/errors.ts` defining `HydrawiseAuthError`, `HydrawiseAPIError`, `HydrawiseMutationError`, `ConfigError`, all extending `Error` with a `kind` discriminator
- [ ] 2.6 Implement `src/logger.ts` — a thin stderr logger honoring `HYDRAWISE_LOG_LEVEL`, with a `redactAuthHeader` helper used wherever request metadata is logged

## 3. Hydrawise auth + GraphQL client

- [ ] 3.1 Implement `src/hydrawise/auth.ts` with an `Auth` class that POSTs form-encoded credentials to `https://app.hydrawise.com/api/v2/oauth/access-token` with `client_id=hydrawise_app`, `client_secret=zn3CrjglwNV1`, `grant_type=password`, `scope=all`
- [ ] 3.2 In `Auth`, cache `accessToken`, `refreshToken`, `tokenType`, and `expiresAt`; on `getAuthHeader()` refresh when within 5 minutes of expiry using `grant_type=refresh_token`
- [ ] 3.3 In `Auth`, raise `HydrawiseAuthError` when the token endpoint returns a JSON body containing `error` or a non-2xx HTTP status
- [ ] 3.4 Implement `src/hydrawise/client.ts` exporting `getClient()` that returns a singleton wrapping `graphql-request`'s `GraphQLClient` for `https://app.hydrawise.com/api/v2/graph`, injecting `Authorization` from `Auth.getAuthHeader()` on each call
- [ ] 3.5 In `client.ts`, wrap each call in a helper that maps `graphql-request` errors to `HydrawiseAPIError` and inspects `StatusCodeAndSummary` responses to raise `HydrawiseMutationError` when the status is not `OK` or `WARNING`
- [ ] 3.6 Implement `src/hydrawise/queries.ts` with hand-written GraphQL strings for: `me`, `controllers`, `controller(controllerId)`, `controller(controllerId).zones`, `zone(zoneId)`, `startZone`, `stopZone`, `startAllZones`, `stopAllZones`, `suspendZone`, `resumeZone`, `suspendAllZones`, `resumeAllZones`
- [ ] 3.7 Define TypeScript interfaces for the response shapes in `queries.ts` so call sites get typed results without codegen
- [ ] 3.8 Implement `src/hydrawise/api.ts` exposing typed wrappers (`getUser`, `getControllers`, `getController(id)`, `getZones(controllerId)`, `getZone(zoneId)`, `startZone(zoneId, durationSeconds?)`, etc.) that callers in the tools layer use

## 4. HTTP plumbing & sessions

- [ ] 4.1 Implement `src/http/middleware.ts` with three middlewares: `originGuard` (allowlist check, returns 403 + JSON-RPC error on mismatch), `hostGuard` (rejects mismatched `Host` with 403), and `bearerGuard` (constant-time compare; returns 401 when `authToken` is configured and missing/wrong)
- [ ] 4.2 Default the origin allowlist to any of `http://127.0.0.1`, `http://localhost`, `http://[::1]` (with optional `:port`), parse `HYDRAWISE_MCP_ALLOWED_ORIGINS` as a comma-separated list when set
- [ ] 4.3 Implement `src/http/sessions.ts` exposing a `SessionRegistry` class that wraps `Map<string, StreamableHTTPServerTransport>`, generates session IDs with `randomUUID()`, evicts after the configured TTL, and exposes `get`, `set`, `delete`, `has`
- [ ] 4.4 Wire `transport.onclose` to remove the entry from the registry; restart the idle timer on every successful request through that transport

## 5. MCP server bootstrap & tool registration

- [ ] 5.1 In `src/server.ts`, instantiate one process-wide `McpServer({ name: "hydrowise-mcp", version, protocolVersion: "2025-11-25" })` from `@modelcontextprotocol/sdk/server/mcp.js`
- [ ] 5.2 Register all status tools (Section 6) and control tools (Section 7) on the single `McpServer` instance
- [ ] 5.3 Build the Express app: JSON body parser, `originGuard`, `hostGuard`, `bearerGuard`, then a single `app.all('/mcp', handler)` route
- [ ] 5.4 The handler routes by method:
  - `POST` with no `MCP-Session-Id` AND body is `initialize` → create a new `StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, onsessioninitialized })`, register it in the `SessionRegistry`, `await server.connect(transport)`, then `await transport.handleRequest(req, res, req.body)`
  - `POST` with `MCP-Session-Id` matching a registered transport → call `transport.handleRequest(req, res, req.body)`
  - `POST` with unknown `MCP-Session-Id` → respond HTTP 404
  - `GET` with `MCP-Session-Id` → delegate to that transport's `handleRequest` (handles SSE resumption via `Last-Event-ID`)
  - `DELETE` with `MCP-Session-Id` → close + delete the transport, respond HTTP 200
- [ ] 5.5 In `main()`: load `.env` (TTY-only), call `loadConfig()`, build the app, listen on `host:port`, print `http://<host>:<port>/mcp` to stderr
- [ ] 5.6 Handle `SIGINT`/`SIGTERM` to gracefully close all active transports, then exit
- [ ] 5.7 Wire global handlers for `unhandledRejection` and `uncaughtException` that log to stderr and exit non-zero

## 6. Read-only tools (irrigation-status)

- [ ] 6.1 Register `get_user` (no input) returning `{id, email, name}` via `api.getUser()`
- [ ] 6.2 Register `list_controllers` (no input) returning `[{id, name, serial_number, online, ...}]`
- [ ] 6.3 Register `get_controller` with Zod input `{ controller_id: z.number().int() }`
- [ ] 6.4 Register `list_zones` with Zod input `{ controller_id: z.number().int() }`
- [ ] 6.5 Register `get_zone` with Zod input `{ zone_id: z.number().int() }`
- [ ] 6.6 Add a shared serializer that normalizes Hydrawise field names (`serialNumber` → `serial_number`, etc.) for tool output
- [ ] 6.7 Wrap every tool body in an adapter that converts thrown `HydrawiseAuthError` / `HydrawiseAPIError` / `HydrawiseMutationError` into MCP `{ isError: true, content: [...] }` responses with a `kind: ...` prefix

## 7. Control tools (irrigation-control)

- [ ] 7.1 Implement `_resolveUntil(days?: number, until?: string): Date` in `src/tools/_helpers.ts` — validates exactly one is provided, parses ISO-8601, converts `days` to `new Date(Date.now() + days * 86400000)`
- [ ] 7.2 Build a Zod schema for the suspend tools using `.refine()` to enforce "exactly one of `days` or `until`"; on failure return an `isError: true` Tool Execution Error per the 2025-11-25 spec (NOT a JSON-RPC protocol error)
- [ ] 7.3 Register `start_zone` `{ zone_id, minutes? }`; convert minutes → seconds, call `api.startZone(zoneId, seconds, { stackRuns: true })`
- [ ] 7.4 Register `stop_zone` `{ zone_id }`
- [ ] 7.5 Register `start_all_zones` `{ controller_id, minutes? }`
- [ ] 7.6 Register `stop_all_zones` `{ controller_id }`
- [ ] 7.7 Register `suspend_zone` `{ zone_id, days?, until? }` with the helper + refinement
- [ ] 7.8 Register `resume_zone` `{ zone_id }`
- [ ] 7.9 Register `suspend_all_zones` `{ controller_id, days?, until? }` with the helper + refinement
- [ ] 7.10 Register `resume_all_zones` `{ controller_id }`
- [ ] 7.11 Each control tool's `description` clearly states it changes physical state, so MCP clients can surface that to users

## 8. Tests (vitest + supertest)

- [ ] 8.1 Unit test `_resolveUntil` covering days-only, until-only, both-set (error), neither-set (error), and ISO-8601 parsing
- [ ] 8.2 Unit test `loadConfig` covering present, missing-username, missing-password, empty strings, non-loopback host without authToken (error), non-loopback host with authToken (ok)
- [ ] 8.3 Unit test `Auth` against a mocked `fetch`: initial token fetch, near-expiry refresh, error response → `HydrawiseAuthError`
- [ ] 8.4 Unit test the GraphQL client wrapper: `MutationError`-shaped response → `HydrawiseMutationError` with the upstream `summary` text; transport failure → `HydrawiseAPIError`
- [ ] 8.5 Unit tests for each read tool using a mocked `api` module, asserting response shape
- [ ] 8.6 Unit tests for each control tool that assert the underlying `api` method is called with the expected arguments (including minutes→seconds conversion and `stackRuns: true` for `start_zone`)
- [ ] 8.7 HTTP integration test (supertest): `POST /mcp` with an `initialize` body returns 200 + `MCP-Session-Id`; subsequent `tools/list` with that header returns the full tool catalog
- [ ] 8.8 HTTP integration test: `POST /mcp` with an unknown `MCP-Session-Id` returns 404
- [ ] 8.9 HTTP integration test: `DELETE /mcp` with a valid session id returns 200 and the session id stops working afterwards
- [ ] 8.10 HTTP integration test: `Origin: https://evil.example.com` returns 403 with a JSON-RPC error body whose `id` is null
- [ ] 8.11 HTTP integration test: when `HYDRAWISE_MCP_AUTH_TOKEN=secret` is set, requests without `Authorization: Bearer secret` return 401; matching requests pass
- [ ] 8.12 HTTP integration test: `Host` header mismatch returns 403
- [ ] 8.13 Credential-leak test: capture all stderr writes during a full token-fetch + tool-call flow and assert the password / `access_token` / `Authorization` header value / `HYDRAWISE_MCP_AUTH_TOKEN` value never appears
- [ ] 8.14 Spec-version test: assert that the `McpServer` instance reports protocol version `2025-11-25` on initialize

## 9. Documentation

- [ ] 9.1 Replace the placeholder "Getting Started" section in `CLAUDE.md` with concrete commands: install with `npm install` (dev) or `npx hydrowise-mcp` (run); build with `npm run build`; test with `npm test`; lint with `npm run lint`; required Node version `>=24`
- [ ] 9.2 Write `README.md` with: feature overview, prerequisites (Hydrawise account + Node 24+), install instructions (`npx` and global), env-var table, the full tool catalog, MCP-client config snippets pointing at `http://127.0.0.1:8765/mcp` for both Claude Desktop and Claude Code, and a section on enabling remote access (set `HYDRAWISE_MCP_HOST` + `HYDRAWISE_MCP_AUTH_TOKEN`)
- [ ] 9.3 Document the read-vs-control tool split in the README so users know which tools require confirmation prompts
- [ ] 9.4 Note the upstream `pydrawise` reference for API behavior questions, the Hydrawise endpoints we depend on, and the MCP spec revision (`2025-11-25`) we target

## 10. Manual verification

- [ ] 10.1 `npm run build` produces `dist/server.js` with the shebang and executable bit; `node dist/server.js` (with valid env vars) listens on `127.0.0.1:8765` and prints the URL
- [ ] 10.2 `curl -X POST http://127.0.0.1:8765/mcp -H 'Content-Type: application/json' -H 'Accept: application/json,text/event-stream' --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}'` returns 200 with an `MCP-Session-Id` header
- [ ] 10.3 `curl -H 'Origin: https://evil.example.com' ...` against `/mcp` returns HTTP 403
- [ ] 10.4 From an MCP client configured with `http://127.0.0.1:8765/mcp`, confirm `tools/list` returns every tool defined above
- [ ] 10.5 Call `list_controllers` and `list_zones` against the real account and verify the returned data matches the controllers visible in the Hydrawise app
- [ ] 10.6 Run `start_zone` for 1 minute on a test zone, then `stop_zone`, and verify the zone visibly turns on/off in the Hydrawise app
- [ ] 10.7 `suspend_zone` for `days=1` on a test zone, then `resume_zone`, and verify the suspension appears and clears in the Hydrawise app
- [ ] 10.8 `openspec validate init-hydrowise-mcp` passes
