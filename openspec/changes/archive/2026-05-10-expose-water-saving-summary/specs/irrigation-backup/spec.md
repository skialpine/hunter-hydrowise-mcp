## MODIFIED Requirements

### Requirement: Snapshot controller header includes scheduler status fields

The `dump_controller_snapshot` tool SHALL include `hibernate_status`, `status_summary`, `status_icon`, and `accumulated_water_savings` in the controller header block of the snapshot envelope. `accumulated_water_savings` SHALL be serialized as `{ value: number, unit: string }` where `unit` is `"gallons"` when the controller's location country is `"US"` and `"liters"` otherwise.

#### Scenario: Snapshot from a US-locale controller

- **WHEN** an MCP client calls `dump_controller_snapshot` on a controller whose `location.country` is `"US"`
- **THEN** the snapshot controller header contains `accumulated_water_savings: { value: <number>, unit: "gallons" }`

#### Scenario: Snapshot from a non-US controller

- **WHEN** an MCP client calls `dump_controller_snapshot` on a controller whose `location.country` is not `"US"` (e.g., `"AU"`, `"NZ"`)
- **THEN** the snapshot controller header contains `accumulated_water_savings: { value: <number>, unit: "liters" }`

#### Scenario: Snapshot from an active controller

- **WHEN** an MCP client calls `dump_controller_snapshot` on a controller that is not hibernated
- **THEN** the snapshot controller header contains `hibernate_status: false` (or null), a non-empty `status_summary`, and an `accumulated_water_savings` object with `value` and `unit`

#### Scenario: Snapshot from a hibernated controller

- **WHEN** an MCP client calls `dump_controller_snapshot` on a controller where `hibernate_status` is `true`
- **THEN** the snapshot controller header contains `hibernate_status: true` and the `status_summary` reflects the hibernated state

### Requirement: Snapshot envelope is versioned

The snapshot JSON SHALL include `snapshot_version` as a top-level integer field as informational provenance. This change bumps the version to `8` to reflect the `accumulated_water_savings` field shape change from bare `Int` to `{value, unit}`.

#### Scenario: Snapshot version reflects the wrapped-savings generation

- **WHEN** any client reads the JSON returned by `dump_controller_snapshot`
- **THEN** the `snapshot_version` field is present and equal to `8`

#### Scenario: Older snapshots remain readable

- **WHEN** a stored snapshot file with `snapshot_version: 7` (or earlier) is loaded for inspection
- **THEN** the file is still readable as JSON; the `accumulated_water_savings` field in the older snapshot is a bare integer

### Requirement: accumulated_water_savings is excluded from the unit-suffix whitelist

The `accumulated_water_savings` field SHALL NOT appear in `IDENTIFIER_WHITELIST` in `src/tools/serializers.ts`. It is instead a `LocalizedValueType`-style wrapped object `{value, unit}` and is therefore exempt from the unit-suffix requirement by virtue of being a wrapped type, not a suffixed bare number.

#### Scenario: Lint test enforces the removal

- **WHEN** the unit-naming lint test runs against `src/tools/serializers.ts`
- **THEN** `accumulated_water_savings` is not present in `IDENTIFIER_WHITELIST`, confirming the field is wrapped rather than whitelisted

### Requirement: Snapshots captured while hibernated include a dedicated caveat

When a controller is hibernated at capture time, the `_caveats` array in the snapshot envelope SHALL contain a string warning that the scheduler was not running, that some live values may reflect a suspended baseline, and that the user should verify actual state after waking before restoring.

#### Scenario: Snapshot caveat present when hibernated

- **WHEN** `dump_controller_snapshot` runs against a controller with `hibernateStatus: true`
- **THEN** the `_caveats` array contains at least one string mentioning hibernation

#### Scenario: No hibernation caveat on active controller

- **WHEN** `dump_controller_snapshot` runs against a controller with `hibernateStatus: false` or `null`
- **THEN** the `_caveats` array does NOT contain a hibernation-specific caveat
