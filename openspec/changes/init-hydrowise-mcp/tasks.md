## 1. Project scaffolding

- [ ] 1.1 Create `pyproject.toml` (PEP 621) declaring `hydrowise-mcp`, Python `>=3.11`, dependencies (`mcp`, `pydrawise` pinned to a specific version, `python-dotenv`), and dev dependencies (`pytest`, `pytest-asyncio`, `ruff`)
- [ ] 1.2 Add console-script entry point `hydrowise-mcp = hydrowise_mcp.server:main` to `pyproject.toml`
- [ ] 1.3 Create `src/hydrowise_mcp/__init__.py` and `src/hydrowise_mcp/__main__.py` so `python -m hydrowise_mcp` also works
- [ ] 1.4 Add `.gitignore` (Python defaults + `.env`, `.venv`, `dist/`, `build/`, `*.egg-info`)
- [ ] 1.5 Add `.env.example` listing `HYDRAWISE_USERNAME` and `HYDRAWISE_PASSWORD` with placeholder values
- [ ] 1.6 Add `ruff.toml` (or equivalent `[tool.ruff]` block in `pyproject.toml`) with line length 100 and standard rule set
- [ ] 1.7 Add `tests/` directory with empty `__init__.py` and a `conftest.py` that loads `.env.test` if present

## 2. Configuration & auth

- [ ] 2.1 Implement `src/hydrowise_mcp/config.py` with a `load_config()` function that reads `HYDRAWISE_USERNAME` and `HYDRAWISE_PASSWORD` from the environment and raises a clear `ConfigError` naming the missing variable
- [ ] 2.2 Optionally support a `.env` file via `python-dotenv` loaded in `main()` before `load_config()` is called
- [ ] 2.3 Implement `src/hydrowise_mcp/client.py` with a `get_client()` accessor that lazily constructs a single `pydrawise.Hydrawise(Auth(username, password))` instance and returns it on subsequent calls
- [ ] 2.4 Map `pydrawise.exceptions.MutationError` and auth/network errors to local exception classes (`HydrowiseAuthError`, `HydrowiseAPIError`) in `client.py`
- [ ] 2.5 Verify via a unit test that `logging` does not emit the password, username, or any `Authorization` header during a mocked tool call

## 3. Read-only tools (irrigation-status)

- [ ] 3.1 Create `src/hydrowise_mcp/server.py` and instantiate a `FastMCP("hydrowise-mcp")` server
- [ ] 3.2 Implement `get_user` tool returning `{id, email, name}` from `Hydrawise.get_user()`
- [ ] 3.3 Implement `list_controllers` tool returning a list of `{id, name, serial_number, online, ...}` from `Hydrawise.get_controllers()`
- [ ] 3.4 Implement `get_controller(controller_id: int)` tool returning a single controller from `Hydrawise.get_controller()`
- [ ] 3.5 Implement `list_zones(controller_id: int)` tool returning zones for that controller via `Hydrawise.get_zones()`
- [ ] 3.6 Implement `get_zone(zone_id: int)` tool returning a single zone from `Hydrawise.get_zone()`
- [ ] 3.7 Add a shared serializer that converts `pydrawise` dataclasses to plain `dict` payloads suitable for JSON-RPC transport

## 4. Control tools (irrigation-control)

- [ ] 4.1 Implement `start_zone(zone_id: int, minutes: int = 0)`; convert minutes to seconds, call `Hydrawise.start_zone(zone, custom_run_duration=seconds, stack_runs=True)`
- [ ] 4.2 Implement `stop_zone(zone_id: int)`
- [ ] 4.3 Implement `start_all_zones(controller_id: int, minutes: int = 0)`
- [ ] 4.4 Implement `stop_all_zones(controller_id: int)`
- [ ] 4.5 Implement a shared `_resolve_until(days: int | None, until: str | None) -> datetime` helper that validates exactly one is provided, parses ISO-8601 timestamps, and converts `days` to `datetime.now() + timedelta(days=...)`
- [ ] 4.6 Implement `suspend_zone(zone_id: int, days: int | None = None, until: str | None = None)` using the helper
- [ ] 4.7 Implement `resume_zone(zone_id: int)`
- [ ] 4.8 Implement `suspend_all_zones(controller_id: int, days: int | None = None, until: str | None = None)`
- [ ] 4.9 Implement `resume_all_zones(controller_id: int)`
- [ ] 4.10 Make sure each control tool docstring clearly states it changes physical state, so MCP clients can surface that to users

## 5. Server lifecycle & error mapping

- [ ] 5.1 Implement `main()` in `server.py`: load `.env`, call `load_config()`, then run the FastMCP server on stdio transport
- [ ] 5.2 Wrap every tool body so `MutationError` becomes an MCP tool error containing the upstream `summary` string
- [ ] 5.3 Distinguish auth failures from generic mutation/network failures in the returned error so clients can identify them
- [ ] 5.4 Configure `logging` with a default level of `WARNING`, overridable via `HYDRAWISE_LOG_LEVEL`, and ensure `pydrawise`/`gql` loggers do not leak credentials

## 6. Tests

- [ ] 6.1 Add unit tests for `_resolve_until` covering days-only, until-only, both-set (error), neither-set (error), and ISO-8601 parsing
- [ ] 6.2 Add unit tests for `load_config` covering present, missing-username, missing-password, and empty-string cases
- [ ] 6.3 Add tool tests using a fake `Hydrawise` (monkeypatched `get_client`) for each read tool, asserting the response shape matches the spec scenarios
- [ ] 6.4 Add tool tests for each control tool that assert the underlying `pydrawise` method is called with the expected arguments (including minutes→seconds conversion and stack_runs=True for `start_zone`)
- [ ] 6.5 Add an error-mapping test: when the fake client raises `MutationError("Zone is already running")`, the tool error message contains that text
- [ ] 6.6 Add a credential-leak test that captures all log records during a tool call and asserts the password/username/token never appears

## 7. Documentation

- [ ] 7.1 Replace the placeholder "Getting Started" section in `CLAUDE.md` with concrete commands: install with `pip install -e .` (dev) or `pipx install hydrowise-mcp`; run with `hydrowise-mcp`; test with `pytest`; lint with `ruff check`
- [ ] 7.2 Write `README.md` with: feature overview, prerequisites (Hydrawise account + credentials), install instructions, env-var setup, the full tool catalog, and example MCP-client config snippets for both Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`) and Claude Code (`.mcp.json` / `claude mcp add`)
- [ ] 7.3 Document the read-vs-control tool split in the README so users know which tools require confirmation prompts
- [ ] 7.4 Note the `pydrawise` version pin and the upstream issue tracker for API-related problems

## 8. Manual verification

- [ ] 8.1 Run `hydrowise-mcp` locally with real credentials and confirm `tools/list` returns every tool defined above
- [ ] 8.2 From an MCP client, call `list_controllers` and `list_zones` against the real account and verify the returned data matches the controllers visible in the Hydrawise app
- [ ] 8.3 From an MCP client, run `start_zone` for 1 minute on a test zone, then `stop_zone`, and verify the zone visibly turns on/off in the Hydrawise app
- [ ] 8.4 From an MCP client, `suspend_zone` for `days=1` on a test zone, then `resume_zone`, and verify the suspension appears and clears in the Hydrawise app
- [ ] 8.5 Run `openspec validate init-hydrowise-mcp` and confirm it passes
