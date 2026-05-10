## ADDED Requirements

### Requirement: Snapshot controller header includes scheduler status fields

The `dump_controller_snapshot` tool SHALL include `hibernate_status`, `status_summary`, `status_icon`, and `accumulated_water_savings_<unit>` in the controller header block of the snapshot envelope.

#### Scenario: Snapshot from an active controller

- **WHEN** an MCP client calls `dump_controller_snapshot` on a controller that is not hibernated
- **THEN** the snapshot controller header contains `hibernate_status: false` (or null), a non-empty `status_summary`, and the `accumulated_water_savings_<unit>` value

#### Scenario: Snapshot from a hibernated controller

- **WHEN** an MCP client calls `dump_controller_snapshot` on a controller where `hibernate_status` is `true`
- **THEN** the snapshot controller header contains `hibernate_status: true` and the `status_summary` reflects the hibernated state

### Requirement: Snapshots captured while hibernated include a dedicated caveat

When a controller is hibernated at capture time, the `_caveats` array in the snapshot envelope SHALL contain a string warning that the scheduler was not running, that some live values may reflect a suspended baseline, and that the user should verify actual state after waking before restoring.

#### Scenario: Snapshot caveat present when hibernated

- **WHEN** `dump_controller_snapshot` runs against a controller with `hibernateStatus: true`
- **THEN** the `_caveats` array contains at least one string mentioning hibernation

#### Scenario: No hibernation caveat on active controller

- **WHEN** `dump_controller_snapshot` runs against a controller with `hibernateStatus: false` or `null`
- **THEN** the `_caveats` array does NOT contain a hibernation-specific caveat

## MODIFIED Requirements

### Requirement: Snapshot envelope is versioned

The snapshot JSON SHALL include `snapshot_version` as a top-level integer field as informational provenance. This change bumps the version to `7` to reflect the inclusion of scheduler status fields in the controller header.

#### Scenario: Snapshot version reflects the scheduler-status-bearing generation

- **WHEN** any client reads the JSON returned by `dump_controller_snapshot`
- **THEN** the `snapshot_version` field is present and equal to `7`
