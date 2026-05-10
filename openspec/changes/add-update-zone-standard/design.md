## Context

`update_zone_settings` wraps `updateZoneAdvanced` — the upstream mutation for per-zone config on ADVANCED-mode controllers. It takes ~25 fields, many of which are meaningless (or dangerous) on STANDARD-mode zones: `watering_mode`, `watering_type`, `watering_frequency_mode`, `schedule_adjustment_ids`, `run_time_minutes`, etc. The upstream schema already provides a clean, 10-field `updateZoneStandard` mutation for STANDARD-mode use. The MCP has never exposed it.

The `_restore_recipe` builder in `restoreRecipe.ts` always emits `update_zone_settings` for zone steps — regardless of the controller's `program_mode`. On STANDARD-mode controllers this is wrong: the recipe should use `update_zone_standard` instead.

`controller.program_mode` is already captured in the snapshot (serialized by `serializeController` in `serializers.ts`) and is read by the recipe builder at `c.program_mode`. The dispatch point is the per-zone settings loop (step 4, around line 488 of `restoreRecipe.ts`).

## Goals / Non-Goals

**Goals:**
- Add `update_zone_standard` tool wrapping `updateZoneStandard` with proper Zod schema, preview support, and `PHYSICAL ACTION:` prefix.
- Update `update_zone_settings` description to clarify it is for ADVANCED-mode zones only.
- Update the recipe builder's per-zone loop to dispatch `update_zone_standard` (with a STANDARD-appropriate arg subset) when `c.program_mode === 'STANDARD'`, and keep `update_zone_settings` for ADVANCED and unknown modes.
- Unit tests for the new tool's input schema and preview mode.
- Integration test: STANDARD-mode snapshot recipe must reference `update_zone_standard`.

**Non-Goals:**
- Changing `get_zone_settings` read shape (read path is unaffected).
- Migrating existing ADVANCED-mode restore logic.
- Adding `updateZoneStandard` to `create_zone` (which already uses `createZoneAdvanced` — no Standard equivalent exists in the schema).

## Decisions

### Where to add the tool

Add `update_zone_standard` to `src/tools/scheduling.ts` alongside `update_zone_settings`. Alternatives: a separate file (`zoneStandard.ts`) — rejected, the existing `scheduling.ts` is the right home for all per-zone write tools and the file is not oversized.

### Input schema shape for `update_zone_standard`

The `updateZoneStandard` mutation takes:
```
zoneId, icon, iconFileId, name!, number!, globalMasterValve!, wateringAdjustment!,
cycleSoakEnable!, cycleCustomTime, soakCustomTime, sensorIds,
flowMonitoringMethod, currentMonitoringMethod, flowMonitoringValue, currentMonitoringValue
```

The MCP tool's Zod schema follows the project's suffixed naming convention:
- `watering_adjustment_percent` (Int! — required)
- `global_master_valve` (Int! — required; -1 = controller default, 0 = always disabled, N = zone N is master)
- `cycle_soak_enable` (Boolean! — required)
- `cycle_custom_time_minutes` (Int? — optional)
- `soak_custom_time_minutes` (Int? — optional)
- `sensor_ids` ([Int]? — optional, full-replace when supplied)
- `flow_monitoring_method`, `current_monitoring_method` (optional enum)
- `flow_monitoring_value` (Float?), `current_monitoring_value` (Int?)
- `name` (String! — required), `number` (Int! — required), `icon` (Int? — optional), `icon_file_id` (Int? — optional)

All required non-null fields in the mutation are required in the Zod schema. Optional fields are `.nullable().optional()`.

### Recipe builder dispatch

At the per-zone settings loop (step 4 in `buildRestoreRecipe`), branch on `c.program_mode`:

- `'STANDARD'` → emit `update_zone_standard` with only the fields that mutation accepts (name, number, icon, global_master_valve, watering_adjustment_percent, cycle_soak_enable, cycle_custom_time_minutes, soak_custom_time_minutes, sensor_ids, flow_monitoring_method, current_monitoring_method, flow_monitoring_value, current_monitoring_value). Omit all ADVANCED-only fields (watering_mode, watering_type, frequency fields, schedule_adjustment_ids, etc.).
- `'ADVANCED'` or unknown → emit `update_zone_settings` (existing behavior).

The notes block on each STANDARD-mode zone step should warn about the same _unreadable_fields caveat that currently applies to `update_zone_settings` steps — the field list is a subset, but `global_master_valve` is still unreadable for STANDARD zones.

### Mutation string location

Add `UPDATE_ZONE_STANDARD_MUTATION` to `src/hydrawise/queries.ts` alongside the existing `UPDATE_ZONE_ADVANCED_MUTATION`. Add the corresponding `updateZoneStandard` method to `HydrawiseApi`.

## Risks / Trade-offs

- **Unreadable fields still exist for STANDARD zones.** `global_master_valve` is in the mutation but not in the read schema — the recipe emits `null` and the AI must merge. This is identical to the existing `update_zone_settings` situation; the merge notes cover it.
- **`icon_file_id` is in the mutation but not captured in the snapshot.** The snapshot doesn't capture `iconFileId`. Recipe builder omits it (null/omitted); the live zone's existing icon is preserved because the mutation only updates what's supplied. Not a regression — same gap exists in `update_zone_settings` today.
- **STANDARD zones with no `settings` block** (e.g. zones created after snapshot) are skipped by the recipe builder — no change from current behavior.

## Migration Plan

No migration needed — no data model changes, no breaking API changes. Existing snapshots (STANDARD-mode controllers) already have `program_mode: "STANDARD"` in the controller block, so the recipe builder dispatch just starts working correctly when the code ships. Older snapshots without `program_mode` (pre-v1 edge case) fall through to the ADVANCED branch, preserving backward compatibility.
