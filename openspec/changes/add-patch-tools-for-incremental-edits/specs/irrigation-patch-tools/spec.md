## ADDED Requirements

### Requirement: update_zone_run_time_in_program tool changes one zone's run duration in a Standard program

The server SHALL expose an MCP tool named `update_zone_run_time_in_program` that takes `zone_id` (required Int), `program_id` (required Int), `run_duration_minutes` (required Int, unit: minutes), and an optional `preview` boolean. The tool SHALL internally call `api.getZone(zone_id)` to resolve the zone number and controller_id, then call `api.getProgram(controller_id, program_id)` to fetch the current program state, modify only the `run_duration_minutes` entry for the matching zone in the program's `zone_run_times`, and dispatch `api.updateStandardProgram()` with the merged payload. The tool description SHALL be prefixed with `PHYSICAL ACTION:`. The response SHALL include `{ before: { run_duration_minutes }, after: { run_duration_minutes }, preview: boolean }`, plus `planned_call: { tool, variables }` when `preview: true`.

#### Scenario: Change one zone's run time, other zones unchanged

- **WHEN** an MCP client calls `update_zone_run_time_in_program` with valid `zone_id`, `program_id`, and `run_duration_minutes: 30` and `preview: false`
- **THEN** the tool fetches the program, changes only the `run_duration_minutes` for the specified zone in `zone_run_times`, dispatches the merged `updateStandardProgram` mutation, and returns `{ before: { run_duration_minutes: <old_value> }, after: { run_duration_minutes: 30 }, preview: false }`; all other zone run times in the program are preserved unchanged

#### Scenario: Preview returns planned call without dispatching

- **WHEN** an MCP client calls `update_zone_run_time_in_program` with `preview: true`
- **THEN** the tool returns `{ before, after, preview: true, planned_call: { tool: "update_standard_program", variables: { ... } } }` and no mutation is dispatched to Hydrawise

#### Scenario: Zone not in program

- **WHEN** an MCP client calls `update_zone_run_time_in_program` with a `zone_id` that does not belong to the specified program
- **THEN** the tool returns an `isError: true` result explaining that the zone is not part of the program, and no mutation is dispatched

#### Scenario: Upstream rejects update (active zone constraint)

- **WHEN** `updateStandardProgram` returns a `business`-category error about active zone associations
- **THEN** the tool returns an `isError: true` result propagating the upstream error message verbatim

### Requirement: update_program_day_pattern tool changes a Standard program's day schedule

The server SHALL expose an MCP tool named `update_program_day_pattern` that takes `controller_id` (required Int), `program_id` (required Int), `standard_program_day_pattern` (required string enum: `"dow" | "even" | "odd" | "interval"`), `day_pattern` (required string, 7-char bitmap `"0"/"1"` for Sunday–Saturday), optional `interval_days` (Int, required when `standard_program_day_pattern` is `"interval"`), and optional `preview` boolean. The tool SHALL fetch the current program, update only `standard_program_day_pattern`, `day_pattern`, and `interval_days` in the merged payload, and dispatch `api.updateStandardProgram()`. The tool description SHALL be prefixed with `PHYSICAL ACTION:`. The response SHALL include `{ before: { standard_program_day_pattern, day_pattern }, after: { standard_program_day_pattern, day_pattern }, preview: boolean }`.

#### Scenario: Change to a specific weekday schedule

- **WHEN** an MCP client calls `update_program_day_pattern` with `standard_program_day_pattern: "dow"` and `day_pattern: "0010010"` and `preview: false`
- **THEN** the tool dispatches `updateStandardProgram` with the merged payload including `standardProgramDayPattern: "dow"` and `dayPattern: "0010010"`, and returns `{ before: { standard_program_day_pattern: "dow", day_pattern: "0001001" }, after: { standard_program_day_pattern: "dow", day_pattern: "0010010" }, preview: false }`

#### Scenario: Change to even days

- **WHEN** an MCP client calls `update_program_day_pattern` with `standard_program_day_pattern: "even"` and any `day_pattern` value
- **THEN** the tool dispatches `updateStandardProgram` with `standardProgramDayPattern: "even"`; Hydrawise ignores `dayPattern` for non-`dow` modes, so the bitmap value is passed through unchanged

#### Scenario: Preview mode

- **WHEN** an MCP client calls `update_program_day_pattern` with `preview: true`
- **THEN** the tool returns `{ before, after, preview: true, planned_call }` and no mutation is dispatched

#### Scenario: Interval mode requires interval_days

- **WHEN** an MCP client calls `update_program_day_pattern` with `standard_program_day_pattern: "interval"` and `interval_days` omitted
- **THEN** the tool returns an `isError: true` result naming the missing field

### Requirement: update_program_start_times tool bulk-replaces a Standard program's start times

The server SHALL expose an MCP tool named `update_program_start_times` that takes `controller_id` (required Int), `program_id` (required Int), `start_times` (required array of HH:MM strings), and optional `preview` boolean. The tool SHALL fetch the program to enumerate its zones, retrieve all existing `ProgramStartTime` records for those zones, and bulk-replace them so the resulting per-zone start times match `start_times` — updating existing records in-place, deleting excess records, and creating new ones as needed. All zones in the program will end up with the same set of start times. The tool description SHALL be prefixed with `PHYSICAL ACTION:` and SHALL note that this tool replaces ALL start times for ALL zones in the program. The response SHALL include `{ before: { start_times: string[] }, after: { start_times: string[] }, preview: boolean }`.

#### Scenario: Shift program to a new start time

- **WHEN** an MCP client calls `update_program_start_times` with `start_times: ["06:00"]` and `preview: false`
- **THEN** the tool updates (or creates/deletes as needed) `ProgramStartTime` records for each zone in the program so they all have exactly `time: "06:00"`, and returns `{ before: { start_times: ["05:00"] }, after: { start_times: ["06:00"] }, preview: false }`

#### Scenario: Preview returns planned operations

- **WHEN** an MCP client calls `update_program_start_times` with `preview: true`
- **THEN** the tool returns `{ before, after, preview: true, planned_call: { tool: "update_program_start_times", variables: { operations: [...] } } }` describing each create/update/delete operation, and no mutations are dispatched

#### Scenario: Partial failure is reported with context

- **WHEN** one `update_program_start_time` mutation in the sequence fails
- **THEN** the tool returns an `isError: true` result that names the failing operation, the zone it was applied to, and which prior operations already succeeded

### Requirement: update_zone_cycle_soak tool sets cycle-and-soak settings for a zone

The server SHALL expose an MCP tool named `update_zone_cycle_soak` that takes `zone_id` (required Int), `cycle_soak_enable` (required boolean), `cycle_custom_time_minutes` (optional Int, unit: minutes), `soak_custom_time_minutes` (optional Int, unit: minutes), and optional `preview` boolean. The tool SHALL read the full zone settings via `api.getZoneSettings(zone_id)`, detect whether the controller is STANDARD or ADVANCED mode, merge the cycle/soak fields into the appropriate full payload, and dispatch either `updateZoneStandard` (STANDARD mode) or `updateZoneAdvanced` (ADVANCED mode). For STANDARD-mode dispatch the tool SHALL include the zone's current `icon` from the read result (required upstream); if `icon` is absent in the read result the tool SHALL throw a `ConfigError` with a clear message. The tool description SHALL be prefixed with `PHYSICAL ACTION:`. The response SHALL include `{ before: { cycle_soak_enable, cycle_custom_time_minutes, soak_custom_time_minutes }, after: { ... }, preview: boolean }`.

#### Scenario: Enable cycle/soak on a STANDARD-mode zone

- **WHEN** an MCP client calls `update_zone_cycle_soak` with `zone_id` on a STANDARD-mode controller, `cycle_soak_enable: true`, `cycle_custom_time_minutes: 5`, `soak_custom_time_minutes: 10`, and `preview: false`
- **THEN** the tool reads zone settings (obtaining `icon`), dispatches `updateZoneStandard` with the merged payload including `cycleSoakEnable: true`, `cycleDuration: 5`, `soakDuration: 10`, and the zone's existing `icon`; returns `{ before: { cycle_soak_enable: false, cycle_custom_time_minutes: null, soak_custom_time_minutes: null }, after: { cycle_soak_enable: true, cycle_custom_time_minutes: 5, soak_custom_time_minutes: 10 }, preview: false }`

#### Scenario: Enable cycle/soak on an ADVANCED-mode zone

- **WHEN** an MCP client calls `update_zone_cycle_soak` with `zone_id` on an ADVANCED-mode controller, `cycle_soak_enable: true`, `cycle_custom_time_minutes: 3`, `soak_custom_time_minutes: 7`, and `preview: false`
- **THEN** the tool dispatches `updateZoneAdvanced` with the merged payload; `icon` handling is not required for ADVANCED mode

#### Scenario: Disable cycle/soak

- **WHEN** an MCP client calls `update_zone_cycle_soak` with `cycle_soak_enable: false` and omits `cycle_custom_time_minutes` / `soak_custom_time_minutes`
- **THEN** the tool passes `cycleSoakEnable: false` to the mutation and preserves the existing cycle/soak duration values from the read result (or passes `null` if absent)

#### Scenario: Preview mode

- **WHEN** an MCP client calls `update_zone_cycle_soak` with `preview: true`
- **THEN** the tool returns `{ before, after, preview: true, planned_call }` and no mutation is dispatched

### Requirement: update_zone_watering_adjustment tool sets a zone's watering adjustment percentage

The server SHALL expose an MCP tool named `update_zone_watering_adjustment` that takes `zone_id` (required Int), `watering_adjustment_percent` (required Int, unit: percent, range 0–200), and optional `preview` boolean. The tool SHALL read the full zone settings, detect STANDARD or ADVANCED mode, merge the watering adjustment into the full payload, and dispatch the appropriate mutation. For STANDARD-mode dispatch the tool SHALL include the zone's current `icon`. The tool description SHALL be prefixed with `PHYSICAL ACTION:`. The response SHALL include `{ before: { watering_adjustment_percent }, after: { watering_adjustment_percent }, preview: boolean }`.

#### Scenario: Reduce zone watering on a STANDARD-mode controller

- **WHEN** an MCP client calls `update_zone_watering_adjustment` with `zone_id`, `watering_adjustment_percent: 75`, and `preview: false` on a STANDARD-mode controller
- **THEN** the tool reads zone settings, dispatches `updateZoneStandard` with `wateringAdjustment: 75` and other fields unchanged, and returns `{ before: { watering_adjustment_percent: 100 }, after: { watering_adjustment_percent: 75 }, preview: false }`

#### Scenario: Preview mode

- **WHEN** an MCP client calls `update_zone_watering_adjustment` with `preview: true`
- **THEN** the tool returns `{ before, after, preview: true, planned_call }` and no mutation is dispatched

#### Scenario: Out-of-range percent is rejected client-side

- **WHEN** an MCP client calls `update_zone_watering_adjustment` with `watering_adjustment_percent: 250`
- **THEN** the tool returns an `isError: true` Tool Execution Error before contacting Hydrawise
