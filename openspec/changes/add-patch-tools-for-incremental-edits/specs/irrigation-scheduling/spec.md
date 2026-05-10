## ADDED Requirements

### Requirement: Patch tools are preferred for incremental edits

The server SHALL document in its tool catalog that when making incremental, targeted changes (changing one zone's run time, adjusting a day pattern, updating cycle/soak settings, etc.) callers SHOULD prefer the focused patch tools (`update_zone_run_time_in_program`, `update_program_day_pattern`, `update_program_start_times`, `update_zone_cycle_soak`, `update_zone_watering_adjustment`) over the full-payload `update_*` tools. The full-payload tools (`update_standard_program`, `update_zone_settings`, `update_zone_standard`) SHALL remain available and are the correct choice for bulk updates, restore-recipe playback, and cases where patch tools do not cover the required fields.

#### Scenario: Tool catalog provides precedence guidance

- **WHEN** an MCP client requests `tools/list` and inspects the description of `update_zone_run_time_in_program`
- **THEN** the description includes `PHYSICAL ACTION:` prefix and indicates it is the preferred tool for single-zone run-time changes within a Standard program
