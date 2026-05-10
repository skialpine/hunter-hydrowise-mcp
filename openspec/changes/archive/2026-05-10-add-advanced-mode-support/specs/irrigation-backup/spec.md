## MODIFIED Requirements

### Requirement: dump_controller_snapshot tool returns a per-controller snapshot as JSON

The snapshot envelope SHALL dispatch by `controller.programMode`. The shape extension introduced in `extend-snapshot-completeness` covers STANDARD-mode controllers. **For ADVANCED-mode controllers**, the snapshot SHALL additionally include `controller.advanced_programs[]` — an array of inlined `AdvancedProgram` details, one per program returned by `getPrograms` whose `__typename` is `AdvancedProgram`. Each per-zone settings entry that uses `AdvancedWateringSettings` SHALL additionally include an `advanced_program` reference object containing `id`, `name`, and `advanced_program_id` of the program governing that zone.

#### Scenario: Snapshot of an ADVANCED-mode controller

- **WHEN** an MCP client calls `dump_controller_snapshot` against a controller with `program_mode: 'ADVANCED'`
- **THEN** `controller.advanced_programs` is a non-empty array of inlined Advanced program details, and each per-zone entry includes an `advanced_program` reference

#### Scenario: Snapshot of a STANDARD-mode controller — unchanged

- **WHEN** an MCP client calls `dump_controller_snapshot` against a controller with `program_mode: 'STANDARD'`
- **THEN** `controller.advanced_programs` is absent (or empty array) and per-zone entries do not include `advanced_program`

#### Scenario: Snapshot for a controller mid-mode-switch

- **WHEN** the controller is `STANDARD` but has a residual AdvancedProgram from a prior mode (or vice-versa)
- **THEN** the snapshot reflects the current `program_mode` and only inlines the program type matching that mode; the residual is captured at the thin `programs[]` level via `__typename` so the AI can detect drift
