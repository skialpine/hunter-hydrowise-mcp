## Why

`get_controller` exposes only Wi-Fi connectivity (`online: true`) — it cannot distinguish a live controller from a hibernated one, making schedule-not-running diagnosis a multi-step dead end that always requires the GUI. The Hydrawise schema already exposes `Controller.settings.hibernateStatus` and `Controller.status.{summary, icon, accumulatedWaterSavings}` which fill this gap with zero upstream changes needed.

## What Changes

- Extend `CONTROLLER_FIELDS` in `src/hydrawise/queries.ts` to fetch `settings { hibernateStatus }` and `status { summary icon accumulatedWaterSavings }`.
- Serialize in `serializeController` as `hibernate_status` (boolean | null), `status_summary` (string), `status_icon` (string), and `accumulated_water_savings_<unit>` (int — unit to be verified against live API; likely gallons or liters; unit suffix required by the numeric naming convention).
- Update `dump_controller_snapshot` controller header to include the new fields so a hibernated snapshot is visibly distinct from an active one.
- Add a `_caveats` entry on snapshots captured while a controller is hibernated warning that live scheduling state may lag real-world behavior.
- Update the `CLAUDE.md` gotchas section to clarify that `online` / `hardware_status` describe Wi-Fi only, not scheduler state.
- Bump `SNAPSHOT_VERSION` to 7.

## Capabilities

### New Capabilities

_(none — all changes extend existing tools)_

### Modified Capabilities

- `irrigation-status`: `get_controller` gains `hibernate_status`, `status_summary`, `status_icon`, and `accumulated_water_savings_<unit>` fields.
- `irrigation-backup`: controller header in snapshot now includes the new status fields; snapshots captured while hibernated gain a dedicated `_caveats` entry.

## Impact

- `src/hydrawise/queries.ts` — `CONTROLLER_FIELDS` extended with two new sub-selections.
- `src/tools/serializers.ts` — `serializeController` gains four new fields; unit of `accumulatedWaterSavings` must be verified before finalizing the suffix.
- `src/tools/backup.ts` — snapshot builder adds the caveat for hibernated controllers.
- `openspec/specs/irrigation-status/spec.md` — delta requirement for new fields on `get_controller`.
- `openspec/specs/irrigation-backup/spec.md` — delta requirement for hibernation caveat in snapshot.
- `CLAUDE.md` — gotchas section updated.
- Tests — serializer unit tests extended; integration snapshot test updated to assert new fields.
