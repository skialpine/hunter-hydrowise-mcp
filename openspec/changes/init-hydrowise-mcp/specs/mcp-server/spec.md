## ADDED Requirements

### Requirement: Server runs over stdio transport

The server SHALL register as an MCP server using the official `mcp` Python SDK and SHALL serve over the stdio transport so it can be launched directly by an MCP client (Claude Desktop, Claude Code, etc.).

#### Scenario: Client launches the server

- **WHEN** an MCP client invokes the `hydrowise-mcp` console-script entry point on stdio
- **THEN** the server completes the MCP `initialize` handshake and responds to a subsequent `tools/list` request with the full tool catalog defined in the `irrigation-status` and `irrigation-control` capabilities

### Requirement: Required credentials must be supplied via environment variables

The server SHALL read `HYDRAWISE_USERNAME` and `HYDRAWISE_PASSWORD` from the process environment. If either variable is missing or empty, the server SHALL exit with a non-zero status code and an error message that names the missing variable.

#### Scenario: Both credentials are present

- **WHEN** the server starts with `HYDRAWISE_USERNAME` and `HYDRAWISE_PASSWORD` set to non-empty values
- **THEN** the server proceeds to serve MCP requests without contacting the Hydrawise API at startup

#### Scenario: A credential is missing

- **WHEN** the server starts with `HYDRAWISE_PASSWORD` unset
- **THEN** the server exits with a non-zero status code and prints an error identifying `HYDRAWISE_PASSWORD` as the missing variable, without printing the value of any other environment variable

### Requirement: Credentials must never be logged

The server SHALL NOT write `HYDRAWISE_USERNAME` or `HYDRAWISE_PASSWORD` values, the bearer token returned by Hydrawise, or any HTTP `Authorization` header to any log sink at any log level.

#### Scenario: Tool call produces logs

- **WHEN** any MCP tool defined by this change is invoked and the server emits log records (at any configured log level)
- **THEN** none of the emitted log records contain the username, password, bearer token, or `Authorization` header value

### Requirement: A single Hydrawise client is reused for the process lifetime

The server SHALL construct one Hydrawise API client lazily on first tool invocation and SHALL reuse it for all subsequent tool calls within the same process, allowing the underlying authenticator to cache and refresh its bearer token.

#### Scenario: Repeated tool calls reuse the client

- **WHEN** two MCP tool calls are made in succession during the same process lifetime
- **THEN** the second call uses the already-constructed Hydrawise client instance rather than constructing a new one

### Requirement: Upstream errors are surfaced to the MCP client

The server SHALL translate exceptions raised by the Hydrawise client into MCP tool errors. Mutation errors SHALL include the upstream `summary` string in the error message. Authentication failures and network errors SHALL be reported as distinct, identifiable error categories.

#### Scenario: Mutation rejected by Hydrawise

- **WHEN** a control tool (e.g. `start_zone`) is invoked and the Hydrawise API returns a non-OK status with summary `"Zone is already running"`
- **THEN** the MCP tool call returns an error whose message contains the text `"Zone is already running"`

#### Scenario: Authentication failure

- **WHEN** any tool is invoked and the Hydrawise API rejects the credentials
- **THEN** the MCP tool call returns an error categorized as an authentication failure, distinguishable by the client from a generic mutation failure

### Requirement: The package ships a console-script entry point

The packaged distribution SHALL expose a console-script `hydrowise-mcp` that, when executed with no arguments, starts the MCP server on stdio.

#### Scenario: Running the installed command

- **WHEN** the user runs `hydrowise-mcp` after `pip install` (or `uvx hydrowise-mcp`) with valid credentials in the environment
- **THEN** the process starts and serves MCP requests on stdio until stdin is closed
