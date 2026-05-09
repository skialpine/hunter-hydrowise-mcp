# mcp-server Specification

## Purpose
TBD - created by archiving change init-hydrowise-mcp. Update Purpose after archive.
## Requirements
### Requirement: Server speaks MCP 2025-11-25 over Streamable HTTP

The server SHALL register as an MCP server using the official `@modelcontextprotocol/sdk` TypeScript SDK at version `>=1.29.0` (which declares `LATEST_PROTOCOL_VERSION = '2025-11-25'`) and SHALL serve a single Streamable HTTP endpoint at the path `/mcp` that accepts HTTP `POST`, `GET`, and `DELETE` methods, conforming to the transport rules in MCP spec revision 2025-11-25.

#### Scenario: Client initializes a session

- **WHEN** an MCP client sends `POST /mcp` with an `Accept` header listing both `application/json` and `text/event-stream` and a body containing a JSON-RPC `initialize` request
- **THEN** the server responds with HTTP 200, includes an `MCP-Session-Id` header on the response, and returns either a JSON `InitializeResult` body or an SSE stream that delivers an `InitializeResult`

#### Scenario: Client lists tools on an established session

- **WHEN** an MCP client sends `POST /mcp` with the `MCP-Session-Id` header from a prior initialization and a JSON-RPC `tools/list` request body
- **THEN** the response contains every tool defined in the `irrigation-status` and `irrigation-control` capabilities

#### Scenario: Client closes a session

- **WHEN** an MCP client sends `DELETE /mcp` with a valid `MCP-Session-Id` header
- **THEN** the server invalidates the session, closes any associated SSE streams, and responds with HTTP 200 (or HTTP 405 if session termination is later disabled, which is not the v1 default)

### Requirement: Server binds to localhost by default and rejects non-loopback binds without authentication

The server SHALL read its bind address from `HYDRAWISE_MCP_HOST` (default `127.0.0.1`) and its port from `HYDRAWISE_MCP_PORT` (default `8765`). If the configured host is anything other than `127.0.0.1`, `::1`, or `localhost`, the server SHALL refuse to start unless `HYDRAWISE_MCP_AUTH_TOKEN` is also set.

#### Scenario: Default startup

- **WHEN** the server starts with no `HYDRAWISE_MCP_HOST` or `HYDRAWISE_MCP_PORT` configured
- **THEN** the server listens on `127.0.0.1:8765`

#### Scenario: Non-loopback bind without bearer token

- **WHEN** the server starts with `HYDRAWISE_MCP_HOST=0.0.0.0` and no `HYDRAWISE_MCP_AUTH_TOKEN`
- **THEN** the server exits with a non-zero status code and an error message explaining that non-loopback binds require `HYDRAWISE_MCP_AUTH_TOKEN`

### Requirement: Server validates Origin and Host headers

The server SHALL inspect the `Origin` header on every request and SHALL respond with **HTTP 403 Forbidden** when the origin is not in the allowlist, per the 2025-11-25 spec. The default allowlist permits any loopback origin (`http://127.0.0.1[:port]`, `http://localhost[:port]`, `http://[::1][:port]`); operators MAY override it via `HYDRAWISE_MCP_ALLOWED_ORIGINS` (a comma-separated list). The server SHALL also reject requests whose `Host` header does not match the bound interface, to defend against DNS rebinding when an `Origin` header is absent.

#### Scenario: Origin not in allowlist

- **WHEN** an HTTP request to `/mcp` carries `Origin: https://evil.example.com` and the allowlist permits only loopback
- **THEN** the server responds with HTTP 403 Forbidden and a JSON-RPC error body whose `id` is null

#### Scenario: Loopback origin allowed

- **WHEN** an HTTP request to `/mcp` carries `Origin: http://127.0.0.1:8765`
- **THEN** the server processes the request normally

#### Scenario: Host header mismatch

- **WHEN** an HTTP request to `/mcp` carries a `Host` header that does not match the bound host:port
- **THEN** the server responds with HTTP 403 Forbidden

### Requirement: Server enforces a static bearer token when configured

When `HYDRAWISE_MCP_AUTH_TOKEN` is set, the server SHALL require every request to `/mcp` to carry an `Authorization: Bearer <token>` header whose token matches in constant time. Requests without a matching bearer SHALL be rejected with **HTTP 401 Unauthorized**. When `HYDRAWISE_MCP_AUTH_TOKEN` is unset, no client-to-server auth is enforced.

#### Scenario: Bearer required, request missing it

- **WHEN** the server is configured with `HYDRAWISE_MCP_AUTH_TOKEN=abc` and a request arrives without an `Authorization` header
- **THEN** the response is HTTP 401 Unauthorized

#### Scenario: Bearer required, request matches

- **WHEN** the server is configured with `HYDRAWISE_MCP_AUTH_TOKEN=abc` and a request arrives with `Authorization: Bearer abc`
- **THEN** the request is processed normally

#### Scenario: Bearer not required

- **WHEN** the server starts with no `HYDRAWISE_MCP_AUTH_TOKEN`
- **THEN** requests without an `Authorization` header are processed normally

### Requirement: Sessions are stateful and bound to MCP-Session-Id

The server SHALL maintain one `StreamableHTTPServerTransport` per active session in a process-local map keyed by `MCP-Session-Id`. A new session SHALL be created only on a JSON-RPC `initialize` request with no `MCP-Session-Id`. Requests bearing an unknown `MCP-Session-Id` SHALL receive **HTTP 404 Not Found**, prompting the client to re-initialize. Idle sessions SHALL be evicted after `HYDRAWISE_MCP_SESSION_TTL` seconds (default 3600).

#### Scenario: Unknown session id

- **WHEN** a `POST /mcp` carries an `MCP-Session-Id` not in the active session map
- **THEN** the response is HTTP 404 Not Found

#### Scenario: Session eviction on idle timeout

- **WHEN** a session has received no requests for longer than `HYDRAWISE_MCP_SESSION_TTL`
- **THEN** the server closes the transport, removes it from the session map, and a subsequent request bearing that `MCP-Session-Id` receives HTTP 404 Not Found

### Requirement: Required Hydrawise credentials must be supplied via environment variables

The server SHALL read `HYDRAWISE_USERNAME` and `HYDRAWISE_PASSWORD` from the process environment. If either variable is missing or empty, the server SHALL exit with a non-zero status code and an error message that names the missing variable.

#### Scenario: Both credentials are present

- **WHEN** the server starts with `HYDRAWISE_USERNAME` and `HYDRAWISE_PASSWORD` set to non-empty values
- **THEN** the server proceeds to listen for HTTP requests without contacting the Hydrawise API at startup

#### Scenario: A credential is missing

- **WHEN** the server starts with `HYDRAWISE_PASSWORD` unset
- **THEN** the server exits with a non-zero status code and prints an error identifying `HYDRAWISE_PASSWORD` as the missing variable, without printing the value of any other environment variable

### Requirement: Credentials must never be logged

The server SHALL NOT write `HYDRAWISE_USERNAME`, `HYDRAWISE_PASSWORD`, `HYDRAWISE_MCP_AUTH_TOKEN`, the bearer token returned by Hydrawise, or any HTTP `Authorization` header value to any log sink at any log level. All logs SHALL be written to stderr.

#### Scenario: Tool call produces logs

- **WHEN** any MCP tool defined by this change is invoked and the server emits log records (at any configured log level)
- **THEN** none of the emitted log records contain the username, password, the configured static auth token, the Hydrawise bearer/refresh tokens, or any `Authorization` header value

### Requirement: A single Hydrawise client is reused for the process lifetime

The server SHALL construct one Hydrawise API client lazily on first tool invocation and SHALL reuse it across all sessions and all subsequent tool calls within the same process, allowing the underlying authenticator to cache and refresh its bearer token.

#### Scenario: Repeated tool calls reuse the client

- **WHEN** two MCP tool calls are made in succession during the same process lifetime (whether on the same session or different sessions)
- **THEN** the second call uses the already-constructed Hydrawise client instance rather than constructing a new one

### Requirement: Upstream errors are surfaced to the MCP client

The server SHALL translate exceptions raised by the Hydrawise client into MCP tool errors. Mutation errors SHALL include the upstream `summary` string in the error message. Authentication failures and network errors SHALL be reported as distinct, identifiable error categories. Per the 2025-11-25 spec, **input validation errors** SHALL be returned as Tool Execution Errors (`isError: true` content) rather than JSON-RPC protocol errors so the model can self-correct.

#### Scenario: Mutation rejected by Hydrawise

- **WHEN** a control tool (e.g. `start_zone`) is invoked and the Hydrawise API returns a non-OK status with summary `"Zone is already running"`
- **THEN** the MCP tool call returns an `isError: true` result whose message contains the text `"Zone is already running"`

#### Scenario: Authentication failure

- **WHEN** any tool is invoked and the Hydrawise API rejects the credentials
- **THEN** the MCP tool call returns an `isError: true` result categorized as an authentication failure, distinguishable by the client from a generic mutation failure

#### Scenario: Invalid tool input

- **WHEN** a tool is invoked with arguments that fail Zod validation (e.g. `suspend_zone` with both `days` and `until`)
- **THEN** the response is an `isError: true` Tool Execution Error explaining the validation failure, not a JSON-RPC protocol error

### Requirement: The package ships an executable bin entry

The packaged distribution SHALL expose an executable command `hydrowise-mcp` (declared via the `bin` field in `package.json`, with `engines.node >= 24`) that, when executed with no arguments, starts the Streamable HTTP server and prints the listen URL to stderr.

#### Scenario: Running the installed command

- **WHEN** the user runs `npx hydrowise-mcp` (or invokes the linked binary after `npm install -g hydrowise-mcp`) with valid credentials in the environment
- **THEN** the process starts an HTTP server on the configured host and port, prints the URL `http://<host>:<port>/mcp` to stderr, and serves MCP requests until the process is signalled to exit

