## Why

`update_zone_settings` wraps `updateZoneAdvanced`, which is designed for ADVANCED-mode controllers and carries ~25 mode-specific fields that don't apply to STANDARD-mode zones. Using it on a STANDARD-mode zone risks a silent mode flip or partial state corruption — a failure mode that has already caused real data loss (a Drip program disappeared after an inadvertent mode-switch earlier in this project). STANDARD-mode users need a safe, mode-appropriate mutation path.

## What Changes

- Add new `update_zone_standard` tool wrapping the upstream `updateZoneStandard` mutation (~10 fields, no mode-specific args).
- Update `update_zone_settings` description to clarify it targets ADVANCED-mode zones.
- Update the `_restore_recipe` builder in `dump_controller_snapshot` to emit `update_zone_standard` steps for STANDARD-mode zones and `update_zone_settings` steps for ADVANCED-mode zones (currently always emits `update_zone_settings`).
- Update CLAUDE.md to document the Standard vs. Advanced tool split.

## Capabilities

### New Capabilities

- `update-zone-standard`: A write tool that updates per-zone settings on STANDARD-mode controllers via `updateZoneStandard`, covering name, number, icon, cycle/soak, watering adjustment percentage, global master valve override, sensor associations, and flow/current monitoring baselines.

### Modified Capabilities

- `irrigation-scheduling`: The restore-recipe builder must select `update_zone_standard` vs `update_zone_settings` based on the controller's `program_mode`; existing spec behavior for ADVANCED-mode zones is unchanged.

## Impact

- `src/tools/scheduling.ts` — new `update_zone_standard` tool + `updateZoneStandard` mutation string.
- `src/hydrawise/queries.ts` — add `UPDATE_ZONE_STANDARD_MUTATION`.
- `src/tools/backup.ts` — recipe builder dispatch on `program_mode`.
- `src/tools/serializers.ts` — no new fields; reuses existing `serializeZoneSettings` or a lighter read-only variant for the preview shape.
- `tests/unit/` — new unit tests for Zod input validation, preview mode, mutation dispatch.
- `tests/integration/snapshot-roundtrip.test.ts` — STANDARD-mode recipe must reference `update_zone_standard`.
- CLAUDE.md — document the split.
