## MODIFIED Requirements

### Requirement: Standard programs support full read + CRUD

The `get_program` tool SHALL accept `program_type: 'Standard' | 'Advanced'`. For `program_type: 'Standard'`, the tool SHALL return the full StandardProgram detail (start times, day pattern, days run, monthly adjustments, periodicity, per-zone run-time groups, valid_from, valid_to, conditional adjustments) as before. **For `program_type: 'Advanced'`, the tool SHALL now return the full AdvancedProgram detail** (`id`, `name`, `advanced_program_id`, `scope`, `zone_specific`, `monthly_watering_adjustments`, `scheduling_method`, `watering_frequency`, `run_time_group`, `applies_to_zones`).

#### Scenario: Get an Advanced program by id

- **WHEN** an MCP client calls `get_program` with `controller_id`, `program_id`, and `program_type: 'Advanced'` for a program that exists
- **THEN** the response includes the AdvancedProgram fields including the `watering_frequency` object and `run_time_group` reference

#### Scenario: Get a Standard program — unchanged behavior

- **WHEN** an MCP client calls `get_program` with `program_type: 'Standard'`
- **THEN** the response shape is identical to the prior behavior (start_times, days_run, periodicity, per_zone_run_times, etc.)

#### Scenario: Program type mismatch

- **WHEN** an MCP client calls `get_program` with `program_type: 'Advanced'` against a `program_id` that is actually a StandardProgram (or vice-versa)
- **THEN** the tool returns a `not_found`-class error indicating the program does not exist as the requested type
