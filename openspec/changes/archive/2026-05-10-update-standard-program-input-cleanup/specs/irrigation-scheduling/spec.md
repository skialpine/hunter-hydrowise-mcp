## MODIFIED Requirements

### Requirement: Standard programs support full read + CRUD

The `get_program` tool SHALL accept `program_type: 'Standard' | 'Advanced'`. For `program_type: 'Standard'`, the tool SHALL return the full StandardProgram detail (start times, day pattern, days run, monthly adjustments, periodicity expressed as `interval_days`, per-zone run-time groups, `valid_from_epoch_seconds`, `valid_to_epoch_seconds`, conditional adjustments). The tool description SHALL document that `periodicity` is `null` when `standard_program_day_pattern` is `"dow"`, `"odd"`, or `"even"` — periodicity is only meaningful in `"interval"` mode. **For `program_type: 'Advanced'`, the tool SHALL return the full AdvancedProgram detail** (`id`, `name`, `advanced_program_id`, `scope`, `zone_specific`, `monthly_adjustment_percents`, `scheduling_method`, `watering_frequency`, `run_time_group`, `applies_to_zones`). All numeric program fields with a fixed unit SHALL use the suffix convention.

The `create_standard_program` and `update_standard_program` write tools SHALL expose the writable StandardProgram payload with the following field requirements:

- The Hydrawise scheduling-method integer SHALL be accepted as `scheduling_method: number` (not `program_type`). The field description SHALL note it is the same integer returned by `get_program` under the `scheduling_method` field (e.g. `3` for Standard).
- `interval_days`, `series_start_epoch_seconds`, `valid_from_epoch_seconds`, and `valid_to_epoch_seconds` SHALL be nullable and optional (omitting is equivalent to passing `null`). Field descriptions SHALL call out when each is applicable: `interval_days` and `series_start_epoch_seconds` are only meaningful in `"interval"` day-pattern mode; `valid_from_epoch_seconds` and `valid_to_epoch_seconds` bound the program's active date range.

#### Scenario: Get an Advanced program by id

- **WHEN** an MCP client calls `get_program` with `controller_id`, `program_id`, and `program_type: 'Advanced'` for a program that exists
- **THEN** the response includes the AdvancedProgram fields including the `watering_frequency` object and `run_time_group` reference, with all numeric fields carrying unit suffixes

#### Scenario: Get a Standard program — interval expressed in days

- **WHEN** an MCP client calls `get_program` with `program_type: 'Standard'` for a program with periodicity "every 2 days"
- **THEN** the response field `interval_days` equals `2` (not `interval`), and timestamp fields are named `*_epoch_seconds`

#### Scenario: Get a Standard program in dow mode — periodicity is null

- **WHEN** an MCP client calls `get_program` with `program_type: 'Standard'` for a program whose `standard_program_day_pattern` is `"dow"`
- **THEN** the response field `periodicity` is `null` (not an error condition)

#### Scenario: Tool catalog input descriptions cite the unit

- **WHEN** an MCP client requests `tools/list` and inspects the input schemas for Standard program write tools
- **THEN** every numeric input field's description text contains the unit word matching its suffix

#### Scenario: Program type mismatch

- **WHEN** an MCP client calls `get_program` with `program_type: 'Advanced'` against a `program_id` that is actually a StandardProgram (or vice-versa)
- **THEN** the tool returns a `not_found`-class error indicating the program does not exist as the requested type

#### Scenario: Create standard program omitting interval fields in dow mode

- **WHEN** an MCP client calls `create_standard_program` with `standard_program_day_pattern: "dow"` and omits `interval_days`, `series_start_epoch_seconds`, `valid_from_epoch_seconds`, and `valid_to_epoch_seconds`
- **THEN** the tool does not return a validation error and dispatches `createStandardProgram` with those fields coalesced to `null`

#### Scenario: Write tool uses scheduling_method not program_type

- **WHEN** an MCP client calls `update_standard_program` with `scheduling_method: 3` (and does not pass `program_type`)
- **THEN** the tool accepts the call and dispatches `updateStandardProgram` with `programType: 3`

#### Scenario: Write tool rejects old program_type integer field

- **WHEN** an MCP client calls `update_standard_program` passing only `program_type: 3` (and not `scheduling_method`)
- **THEN** the tool returns a Zod validation error because `scheduling_method` is required
