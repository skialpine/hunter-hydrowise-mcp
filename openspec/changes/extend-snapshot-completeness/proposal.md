## Why

The shipped `dump_controller_snapshot` is incomplete for restore. Live verification against the Heller Tufts controller revealed the snapshot lacks the data needed to recreate state from scratch:

- For STANDARD-mode controllers, the watering schedule lives on each `StandardProgram` (start_times, day_pattern, periodicity, **per-zone run-time minutes**). The snapshot only captures program id/name/zone-assignments, not the schedule itself — so without an out-of-band `get_program` call per program, the snapshot cannot be restored.
- The snapshot omits controller location (lat/lng/address), timezone, master valve config, expanders, hardware modules, and run-time-group catalog — all needed for Solar Sync to work and for the schedule to land on the right zones.
- It omits `Zone.masterValve` (per-zone master-valve override) and the `wateringDays` field on program start times.
- It omits user-written notes (controller and per-zone) which carry institutional knowledge users want preserved.

The user's stated requirement is "complete backup so we can restore everything." Closing this gap is the precondition for every restore workflow.

The snapshot format is mutable (the AI is the sole consumer at restore time), so we can re-shape the envelope freely without migration cost.

## What Changes

- **Extend `dump_controller_snapshot`** to inline the full StandardProgram detail for every program, plus controller location, timezone, master valve, expanders, modules, controller notes, run-time groups; per-zone master-valve override and zone notes.
- **Capture units on every `LocalizedValueType` field** (watering triggers, monitoring observed values, etc.) so a unit-pref change between snapshot and restore can't silently rewrite °F as °C. The serializer emits `{ value, unit }` pairs instead of bare numbers; the restore recipe verifies unit match before applying.
- **Add `update_location`** tool — wraps `updateLocation` + `updateLocationCoordinates` mutations for restoring controller geolocation.
- **Add `update_controller_master_valve`** tool — wraps `updateControllerMasterValve` for restoring the master-valve zone assignment.
- **Add `update_controller_program_mode`** tool — wraps `updateControllerProgramMode` for switching STANDARD↔ADVANCED (precondition for Phase 3 Advanced restore).
- **Add `hibernate_controller` and `wake_controller`** tools — wrap `hibernateController` / `wakeController`.
- **Add zone CRUD** — `create_zone`, `delete_zone` tools wrapping `createZoneAdvanced` / `deleteZone`. Without these, restore can't recreate a controller from scratch (it can only update zones that already exist).
- **Add note CRUD** — `create/update/delete_zone_note`, `create/update/delete_controller_note`.
- **Add expander CRUD** — `create/update/delete_expander`.
- **Bump snapshot generator version** marker (informational only — not a wire-format contract).

## Capabilities

### Modified Capabilities
- `irrigation-backup`: snapshot envelope expands to include the new fields and inlines program details. The `program_start_times` array per zone is documented as STANDARD-empty (start times live on programs in STANDARD mode).
- `irrigation-status`: `get_controller` exposes location and timezone fields.

### New Capabilities
- `irrigation-controller-config`: tools that mutate controller-level settings (location, master valve, program mode, hibernate/wake, expanders) — the write path needed for restore.
- `irrigation-notes`: read + write tools for `ZoneNote` and `ControllerNote` types.

### Modified Capabilities (continued)
- `irrigation-status`: also gains `create_zone` and `delete_zone` tools (zones are status-adjacent infrastructure, not scheduling).

## Impact

- `src/hydrawise/queries.ts`: extend `ZONE_FULL_QUERY`, `CONTROLLER_FIELDS`, add new mutation strings for the new tools.
- `src/hydrawise/api.ts`: extend existing read methods, add new methods for each new mutation.
- `src/tools/serializers.ts`: extend `serializeZoneSettings` and `serializeController` to surface the new fields. Add serializers for notes, location, expanders.
- `src/tools/backup.ts`: rewrite `dump_controller_snapshot` to inline `getStandardProgram` per program and capture all the new fields. Update `ControllerSnapshotV1` (or rename to v2) interface.
- New tool registration files or extend `src/tools/scheduling.ts` for the new write tools.
- New spec capability files: `irrigation-controller-config` and `irrigation-notes`.
- All new write tools follow the project's `runTool` + `previewOrApply` + `PHYSICAL ACTION:` conventions.
- Tests: serializer unit tests for the new fields; integration tests for each new write tool's preview path.
- No breaking changes to existing tools' input schemas (the `dump_controller_snapshot` output shape changes, but the snapshot format is mutable per design decision).
