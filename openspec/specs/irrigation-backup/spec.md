# irrigation-backup Specification

## Purpose
TBD - created by archiving change add-schedule-management. Update Purpose after archive.
## Requirements
### Requirement: dump_controller_snapshot tool returns a per-controller snapshot as JSON

The snapshot envelope SHALL additionally include a top-level `_restore_recipe` array and a top-level `_caveats` array. The `_restore_recipe` array SHALL contain ordered restore steps, each with shape `{ order: int, tool: string, args: object, depends_on: int[], notes?: string }`. The list SHALL cover every restorable category present in the snapshot (controller config, sensors, programs, zone settings, notes), in dependency order, with each step's `args` pre-computed from the captured snapshot data. The `args` keys SHALL match the snapshot field names exactly (no translation); since the snapshot uses unit-suffixed field names (e.g. `cycle_custom_time_minutes`), the recipe args use the same names, and the receiving tool inputs accept those same names. The `_caveats` array SHALL contain strings describing known restore limitations affecting the snapshot.

#### Scenario: Snapshot includes a restore recipe

- **WHEN** an MCP client calls `dump_controller_snapshot` against any populated controller
- **THEN** the response includes `_restore_recipe` as a non-empty array of step objects, each with `order`, `tool`, `args`, `depends_on`

#### Scenario: Recipe args use unit-suffixed field names

- **WHEN** any step in `_restore_recipe` whose `tool` is `update_zone_settings` is inspected
- **THEN** the `args` object contains `cycle_custom_time_minutes`, `soak_custom_time_minutes`, `run_time_minutes`, `watering_adjustment_percent`, etc. — the exact same field names that appear in the snapshot's `zones[].settings` block

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

The snapshot JSON SHALL include `snapshot_version` as a top-level integer field as informational provenance. This change bumps the version to `6` to reflect the unit-suffix renaming convention (every numeric field with a fixed unit now carries that unit as a name suffix; `LocalizedValueType` fields keep their `{value, unit}` wrapping; the `_restore_recipe` args use the same suffixed names so no translation is needed).

#### Scenario: Snapshot version reflects the unit-suffix generation

- **WHEN** any client reads the JSON returned by `dump_controller_snapshot`
- **THEN** the `snapshot_version` field is present and equal to `6`

#### Scenario: Older snapshots are not auto-migrated

- **WHEN** a stored snapshot file with `snapshot_version: 5` (or earlier) is loaded for inspection
- **THEN** the file is still readable as JSON, but the `_restore_recipe` (if present) cannot be replayed against the current MCP server because args use the old un-suffixed field names; the user must re-capture the snapshot under v6 to obtain a replayable recipe

### Requirement: Snapshot numeric fields carry their unit in the field name

Every numeric field in the snapshot envelope (top-level, nested, or inside `_restore_recipe.args`) whose underlying Hydrawise type is a fixed-unit `Int` or `Float` SHALL have a name ending in one of the registered unit suffixes: `_minutes`, `_seconds`, `_days`, `_percent`, `_epoch_seconds`. Numeric fields whose type is `LocalizedValueType` (i.e. unit varies per user account preference) SHALL be wrapped as `{value: number|null, unit: string|null}` rather than suffixed. Identifier-class numeric fields (`*_id`, `*_number`, `*_count`, `latitude`, `longitude`) are exempt from the suffix rule and from the wrapper.

#### Scenario: Cycle/soak fields carry the minutes suffix

- **WHEN** an MCP client inspects any zone in `zones[].settings` of a v6+ snapshot
- **THEN** the keys `cycle_custom_time_minutes` and `soak_custom_time_minutes` appear (not the un-suffixed `cycle_custom_time` / `soak_custom_time` names from earlier snapshot versions)

#### Scenario: Inter-zone delay carries the seconds suffix

- **WHEN** an MCP client inspects `controller.inter_zone_delay_seconds` in a v6+ snapshot
- **THEN** the field name ends in `_seconds` and the value is the integer count of seconds

#### Scenario: Program interval carries the days suffix

- **WHEN** an MCP client inspects a Standard-mode program in `controller.programs[]` of a v6+ snapshot
- **THEN** the periodicity is exposed as `interval_days` (an integer count of days), not `interval`

#### Scenario: Watering trigger temperature stays wrapped

- **WHEN** an MCP client inspects `controller.watering_triggers.suspend_water_temperature` in a v6+ snapshot
- **THEN** the field is a `{value, unit}` object (e.g. `{value: 49.99999, unit: "°F"}`), NOT a suffixed bare number — because `LocalizedValueType` units depend on user account preference

#### Scenario: Lint test fails on un-suffixed numeric output

- **WHEN** the unit-naming lint test runs against `src/tools/serializers.ts`
- **THEN** any numeric output field whose name lacks a registered unit suffix and is not on the identifier whitelist and is not a `LocalizedValueType` wrapping causes the test to fail with a message identifying the offending field

### Requirement: Snapshot is read-only and side-effect-free

The `dump_controller_snapshot` tool SHALL NOT issue any GraphQL mutations and SHALL NOT write to the local filesystem. The server SHALL NOT cache, persist, or otherwise retain the returned snapshot beyond the lifetime of the MCP tool response.

#### Scenario: Snapshot does not modify state

- **WHEN** `dump_controller_snapshot` is invoked
- **THEN** the only outbound calls are GraphQL queries (no mutations) and no file writes occur on the server host

### Requirement: Snapshot scope is configuration, not telemetry

The snapshot SHALL include the user reference, the controller header, zones with their watering settings, programs, program start times, seasonal adjustments, and watering triggers. The snapshot SHALL NOT include sensors, weather stations, gateways, alerts, run-event histories, weather observations, or any other telemetry-class data.

#### Scenario: Telemetry fields are absent

- **WHEN** an MCP client inspects the snapshot JSON
- **THEN** there are no top-level or nested fields named `sensors`, `weather_stations`, `gateways`, `alerts`, `run_events`, or `weather_observations`

