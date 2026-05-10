## ADDED Requirements

### Requirement: Controller-level numeric fields carry their unit in the name

Every numeric input or output field on `update_controller_master_valve`, `create_zone`, `update_zone_settings`, `create_expander`, `update_expander`, and the controller-level fields exposed by `get_controller` / `dump_controller_snapshot` (specifically `inter_zone_delay`, `master_valve.delay`, `master_valve.post_timer`) whose underlying Hydrawise type is a fixed-unit `Int` SHALL carry the unit as a name suffix. Identifier-class fields (`zone_number`, `controller_id`, `expander_id`) are exempt.

#### Scenario: Inter-zone delay is exposed in seconds

- **WHEN** an MCP client reads `controller.inter_zone_delay_seconds` from `get_controller` or `dump_controller_snapshot`
- **THEN** the field name ends in `_seconds` and the value is the integer count of seconds

#### Scenario: Master-valve timer fields carry the seconds suffix

- **WHEN** an MCP client inspects `controller.master_valve` in any read
- **THEN** the writable timer fields are named `delay_seconds` and `post_timer_seconds`, not bare `delay` / `post_timer`

#### Scenario: create_zone uses the same suffixed names as update_zone_settings

- **WHEN** an MCP client invokes `create_zone` with a writable-zone payload
- **THEN** the input field names match `update_zone_settings` exactly — `cycle_custom_time_minutes`, `soak_custom_time_minutes`, `run_time_minutes`, `watering_adjustment_percent`, etc. (so a snapshot value passes through without renaming)

#### Scenario: Tool description cites the unit source

- **WHEN** an MCP client requests `tools/list` and inspects any numeric input on these tools
- **THEN** the field's `.describe()` text names the unit and cites either the Hydrawise schema docstring, an inferred-from-default note, or "verified empirically against live controller"
