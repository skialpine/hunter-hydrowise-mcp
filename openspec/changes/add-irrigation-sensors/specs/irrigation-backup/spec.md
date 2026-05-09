## MODIFIED Requirements

### Requirement: dump_controller_snapshot tool returns a per-controller snapshot as JSON

The snapshot envelope (extended in `extend-snapshot-completeness`) SHALL additionally include `controller.sensors` — an array of sensor objects, each containing `id`, `name`, `model_id`, `input_number`, `zone_ids`, and an `_observed` block (model_name, sensor_type, mode_type, divisor, flow_rate). Per-zone entries SHALL include a denormalized `sensors: [{ id, name }]` array referencing which controller-level sensors guard that zone.

#### Scenario: Snapshot includes a controller-level sensor list

- **WHEN** an MCP client calls `dump_controller_snapshot` against a controller that has at least one sensor
- **THEN** `controller.sensors` is a non-empty array; each entry has the writable shape plus an `_observed` block

#### Scenario: Per-zone sensors cross-reference

- **WHEN** an MCP client inspects a zone entry in the snapshot
- **THEN** the entry contains a `sensors` array of `{ id, name }` references for each sensor that guards that zone (denormalized from the controller-level list for AI scanning convenience)

#### Scenario: Snapshot for a controller with no sensors

- **WHEN** an MCP client calls `dump_controller_snapshot` against a controller without sensors
- **THEN** `controller.sensors` is an empty array `[]`, and per-zone `sensors` arrays are also empty
