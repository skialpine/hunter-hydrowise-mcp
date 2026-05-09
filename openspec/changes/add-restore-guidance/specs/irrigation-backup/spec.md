## MODIFIED Requirements

### Requirement: dump_controller_snapshot tool returns a per-controller snapshot as JSON

The snapshot envelope SHALL additionally include a top-level `_restore_recipe` array and a top-level `_caveats` array. The `_restore_recipe` array SHALL contain ordered restore steps, each with shape `{ order: int, tool: string, args: object, depends_on: int[], notes?: string }`. The list SHALL cover every restorable category present in the snapshot (controller config, sensors, programs, zone settings, notes), in dependency order, with each step's `args` pre-computed from the captured snapshot data. The `_caveats` array SHALL contain strings describing known restore limitations affecting the snapshot.

#### Scenario: Snapshot includes a restore recipe

- **WHEN** an MCP client calls `dump_controller_snapshot` against any populated controller
- **THEN** the response includes `_restore_recipe` as a non-empty array of step objects, each with `order`, `tool`, `args`, `depends_on`

#### Scenario: Recipe encodes dependency ordering

- **WHEN** a snapshot includes a sensor that references a custom sensor type
- **THEN** the recipe step that creates the sensor SHALL have a `depends_on` entry pointing at the order of the step that creates the custom sensor type

#### Scenario: Recipe references only registered tool names

- **WHEN** any step in `_restore_recipe` is inspected
- **THEN** the `tool` field SHALL match the name of an MCP tool registered by this server

#### Scenario: Caveats document known limitations

- **WHEN** a snapshot's zone entries have non-empty `_unreadable_fields`
- **THEN** the top-level `_caveats` array contains a string explicitly describing this limitation and recommending the AI handle it (e.g., "supply values explicitly or accept live values at restore time")

#### Scenario: Snapshot for an empty/minimal controller still emits recipe

- **WHEN** `dump_controller_snapshot` runs against a controller with no zones, no programs, no sensors
- **THEN** `_restore_recipe` is `[]` and `_caveats` is `[]` (consistent shape, no special-casing for the AI consumer)

### Requirement: Snapshot envelope is versioned

The snapshot JSON SHALL include `snapshot_version` as a top-level integer field as informational provenance. This change bumps the version to `3` to reflect the inclusion of the `_restore_recipe` and `_caveats` blocks.

#### Scenario: Snapshot version reflects the recipe-bearing generation

- **WHEN** any client reads the JSON returned by `dump_controller_snapshot`
- **THEN** the `snapshot_version` field is present and equal to `3`
