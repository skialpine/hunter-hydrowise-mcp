# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Node/TypeScript MCP server for the Hunter HydroWise (Hydrawise) cloud irrigation platform. It speaks the **Streamable HTTP** transport from MCP spec revision **2025-11-25** and exposes Hydrawise read/control operations as MCP tools.

## Stack

- Node **>=24** (ESM, `tsup` build to `dist/`)
- `@modelcontextprotocol/sdk@^1.29` (`McpServer` + `StreamableHTTPServerTransport`)
- Express 5 hosting the `/mcp` endpoint
- `graphql-request` against `https://app.hydrawise.com/api/v2/graph`
- Auth flow mirrors `Lake292/hunter_hydrawise` (`pydrawise.auth`) — OAuth password grant on `/api/v2/oauth/access-token`

## Common commands

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Run locally | `npm run dev` (tsx watch) or `npm start` (after build) |
| Build | `npm run build` (produces executable `dist/server.js`) |
| Test | `npm test` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |

After build, the binary is `dist/server.js` and is exposed as `npx hydrowise-mcp` once published.

## Required env vars

- `HYDRAWISE_USERNAME`, `HYDRAWISE_PASSWORD` — Hydrawise account credentials.

## Optional env vars

- `HYDRAWISE_MCP_HOST` (default `127.0.0.1`) — non-loopback requires `HYDRAWISE_MCP_AUTH_TOKEN`.
- `HYDRAWISE_MCP_PORT` (default `8765`).
- `HYDRAWISE_MCP_ALLOWED_ORIGINS` — comma-separated allowlist for the `Origin` header (defaults to any loopback origin).
- `HYDRAWISE_MCP_AUTH_TOKEN` — when set, every request must carry `Authorization: Bearer <token>`.
- `HYDRAWISE_MCP_SESSION_TTL` (default 3600 seconds) — idle session eviction.
- `HYDRAWISE_LOG_LEVEL` (`error|warn|info|debug`, default `warn`).

`.env` is loaded only when `process.stdin.isTTY` so MCP-client-managed env always wins in production.

## Project layout

```
src/
  server.ts            entry point (#!/usr/bin/env node)
  config.ts            Zod-validated env loader
  errors.ts            HydrawiseAuthError | HydrawiseAPIError | HydrawiseMutationError | ConfigError
  logger.ts            stderr logger + redactAuthHeader
  http/
    middleware.ts      originGuard, hostGuard, bearerGuard
    sessions.ts        SessionRegistry (TTL-evicted Map)
  hydrawise/
    auth.ts            OAuth password grant + refresh
    client.ts          graphql-request wrapper, error mapping
    queries.ts         hand-written GraphQL strings + types
    api.ts             HydrawiseApi typed wrappers
  tools/
    _helpers.ts        resolveUntil, runTool, jsonResult
    serializers.ts     normalize Hydrawise field names
    status.ts          read-only tools
    control.ts         control tools (PHYSICAL ACTION:)
tests/
  unit/                vitest unit tests
  integration/         supertest integration tests against buildApp()
openspec/              spec-driven workflow artifacts
```

## Testing

`npm test` runs vitest. Integration tests use `supertest` against an Express app built via `buildApp()` with a fake `HydrawiseApi`. Unit tests cover config parsing, the OAuth refresh flow, GraphQL client error mapping, helper validation, and credential-leak guards.
