## MODIFIED Requirements

### Requirement: dump_controller_snapshot tool returns a per-controller snapshot as JSON

The server SHALL expose an MCP tool named `dump_controller_snapshot` that takes a required integer `controller_id` and returns a single JSON object representing that controller's readable state. The object SHALL include `snapshot_version` (integer), `captured_at` (ISO-8601 timestamp), `server_version` (string), `user`, and `controller` (singular). The `controller` value SHALL include the controller's basic fields (id, name, online, serial_number, last_contact_time, software_version, program_mode, hardware_status, installation_time, model) **plus**:

- `location` — `{ latitude, longitude, address, country, state, locality }` or `null` if unset
- `time_zone` — `{ id, name }` from `Controller.settings.timeZone`
- `master_valve` — `{ zone_number, delay, post_timer }` from `Controller.masterZone`
- `inter_zone_delay` — integer seconds between sequential zone runs
- `expanders` — array of `{ id, name, number, model_id, firmware }`
- `modules` — array of `{ id, name, serial_number, module_type, firmware_version }`
- `run_time_groups` — array of `{ id, name, duration_minutes }` (the catalog of named run-time groups referenced by Standard programs)
- `controller_notes` — array of `{ id, note, type, pinned_to_top, last_updated_at }`
- `zones` — array of zone entries (see modified zone shape below)
- `programs` — array of program entries with **full schedule detail inlined** (start_times, days_run, periodicity, monthly_watering_adjustments, ignore_rain_sensor, scheduling_method, applies_to_zones, per_zone_run_times, valid_from, valid_to, conditional_watering_adjustments) — not just id/name/zone-IDs
- `seasonal_adjustments` — `{ factors: [12 ints] }`
- `watering_triggers` — full writable triggers payload

Each `zone` entry SHALL include the zone's basic fields plus `settings` (the readable watering settings), `program_start_times` (which is `[]` for STANDARD-mode controllers; populated for ADVANCED), `master_valve_override` (the per-zone `Zone.masterValve` integer), `zone_notes` (array), and `_unreadable_fields` (an array of writable-field names that the read API does not expose, listed verbatim for the AI to reference at restore time).

#### Scenario: Snapshot inlines full StandardProgram detail

- **WHEN** an MCP client calls `dump_controller_snapshot` against a STANDARD-mode controller
- **THEN** each entry in `controller.programs[]` includes `start_times` (array of `HH:MM` strings), `days_run` (array of `DaysOfWeekEnum`), `periodicity` (object or null), `monthly_watering_adjustments` (12-int array), `ignore_rain_sensor` (boolean), and `per_zone_run_times` (array of `{ zone_id, zone_number, run_time_group_id, run_time_group_name, duration_minutes }`)

#### Scenario: Snapshot includes controller location

- **WHEN** the controller has a configured location
- **THEN** `controller.location` is an object containing `latitude`, `longitude`, `address`, `country`, `state`, and `locality` fields

#### Scenario: Snapshot includes the run-time-group catalog

- **WHEN** an MCP client calls `dump_controller_snapshot`
- **THEN** `controller.run_time_groups` is an array of `{ id, name, duration_minutes }`, allowing the AI to cross-reference `programs[].per_zone_run_times[].run_time_group_id` against the catalog

#### Scenario: Snapshot includes zone notes

- **WHEN** any zone has user-written notes attached
- **THEN** the corresponding zone entry's `zone_notes` array contains one object per note with `id`, `note`, `type` (one of `fault | location | repair | comment`), `pinned_to_top`, and `last_updated_at`

#### Scenario: Snapshot lists writable-but-unreadable zone fields

- **WHEN** an MCP client inspects any zone entry in the snapshot
- **THEN** the entry contains a `_unreadable_fields` array listing the field names whose values are written via `update_zone_settings` but not surfaced by any read query, so the AI restoring knows which fields cannot be inferred from this snapshot alone

### Requirement: Snapshot envelope is versioned

The snapshot JSON SHALL include `snapshot_version` as a top-level integer field as informational provenance. The version SHALL increment whenever the snapshot shape changes substantively. **The version field is not a stable wire-format contract**: the AI is the sole consumer at restore time, and may tolerate any shape it understands. This change bumps the version to `2`.

#### Scenario: Snapshot version is current generator's version

- **WHEN** any client reads the JSON returned by `dump_controller_snapshot`
- **THEN** the `snapshot_version` field is present and equal to `2` for this generation
