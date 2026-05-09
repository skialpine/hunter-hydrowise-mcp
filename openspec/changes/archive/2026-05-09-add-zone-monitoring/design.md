## Context

Per the introspection probe (committed snapshot at `schema/hydrawise.live.graphql`), the live Hydrawise API has features the pydrawise reference cache didn't include — most relevantly:

- `Zone.monitoringSettings: ZoneMonitoringSettings!` (operating ranges + measured medians for water flow and electric current).
- `updateZone` is `@deprecated(reason: "Use UpdateZoneAdvanced instead.")` and `updateZoneAdvanced` is its replacement. Both currently accept four new monitoring args (`flowMonitoringMethod`, `currentMonitoringMethod`, `flowMonitoringValue`, `currentMonitoringValue`), but the Advanced version is the future-proof path.
- `setBaselineValues(zoneId, flowMonitoringMethod, currentMonitoringMethod, flowMonitoringValue?, currentMonitoringValue?): StatusCodeAndSummary` is a dedicated one-shot mutation.
- The whole `start*Zone*` family now accepts `learnCurrentFromNextRun` and `learnFlowFromNextRun` booleans for in-line learning during a run.

`MonitoringMethodEnum` has exactly two values: `MANUAL` (use the supplied baseline) and `LEARN_FROM_NEXT_RUN` (observe and remember on the next run).

## Goals / Non-Goals

**Goals:**
- Reach feature parity with the GUI's Advanced > Controller Insights tab for reads and writes.
- Support both ways the user can update baselines: as part of a full zone update (via the four new optional fields on `update_zone_settings`) and as a single-shot operation (`set_zone_baseline`).
- Add the per-run learn flags to the v1 start tools so an AI can say "run zone 3 for 10 minutes and learn the flow" and the server does both in one call.
- Keep all changes additive and optional — existing callers get exactly the same behavior unless they pass the new fields.

**Non-Goals:**
- Notes, issue muting, report schedules, ownership transfer, scheduling horizon — also surfaced by the probe but unrelated to this story.
- A separate "monitoring profile" abstraction. Each zone owns its own monitoring fields directly; that matches the GUI.
- Inferring or tweaking observed medians. Those are read-only telemetry from the controller.
- Migrating create paths to `createZoneAdvanced`. We don't expose zone create in any v0.x change yet.

## Decisions

### Switch `update_zone_settings` to `updateZoneAdvanced`
The pydrawise-cached `updateZone` still works against the live API, but it's marked deprecated, and the deprecation reason explicitly points at `updateZoneAdvanced`. We follow upstream guidance now to avoid a forced migration later. **Alternative considered:** stay on `updateZone` and just add the four new args. Rejected because Hydrawise has already telegraphed the deprecation path; if/when they retire `updateZone`, every user breaks.

### Argument-shape shifts that come with the switch
`updateZoneAdvanced` declares a few of its arguments differently from `updateZone`:
- `cycleSoakEnable`: `Int` → `Boolean`
- `runNextAvailableStartTime`: `Int` → `Boolean`

We update the writable Zod shape to match (booleans, not numbers). The `cycle_soak_enable: 1 | 0` we currently emit from `serializeZoneSettings` becomes `cycle_soak_enable: true | false`, derived the same way (whether `cycleAndSoakSettings` is non-null on read).

`currentMonitoringValue` is declared `Int` on `updateZoneAdvanced` and `Float` on `updateZone`. Going Int (the Advanced declaration is canonical). User-visible value is mA (e.g. 402), which is naturally an integer.

### `set_zone_baseline` is a thin tool

```
set_zone_baseline({
  zone_id: int,
  flow_monitoring_method: 'MANUAL' | 'LEARN_FROM_NEXT_RUN',
  current_monitoring_method: 'MANUAL' | 'LEARN_FROM_NEXT_RUN',
  flow_monitoring_value?: number,
  current_monitoring_value?: number,
  preview?: boolean,
})
```

Both `*_method` fields are required (the upstream signature says `MonitoringMethodEnum!`); the values are optional and only meaningful when the method is `MANUAL`. The tool description prefixes `PHYSICAL ACTION:` and supports `preview: true` matching the rest of the schedule write tools. **Alternative considered:** baking this into `update_zone_settings` only. Rejected because `setBaselineValues` is the upstream's dedicated short-form path and is a natural one-step "re-train" affordance — forcing the AI to send a full zone payload just to flip a baseline is wasteful.

### Read shape: include monitoring on `get_zone_settings`
We extend the Zod-driven response of `get_zone_settings` so the writable view carries the four mutation-shape fields, plus a separate `monitoring_observed` sub-object with the read-only telemetry from `Zone.monitoringSettings`:

```
{
  ...existing zone fields...,
  flow_monitoring_method: 'MANUAL' | 'LEARN_FROM_NEXT_RUN' | null,
  current_monitoring_method: 'MANUAL' | 'LEARN_FROM_NEXT_RUN' | null,
  flow_monitoring_value: number | null,
  current_monitoring_value: number | null,
  monitoring_observed: {
    operating_ranges: { water_flow_rate: number | null, electric_current: number | null },
    measured_medians: { water_flow_rate: number | null, electric_current: number | null },
  } | null,
}
```

`LocalizedValueType.value` is unwrapped to a bare number per our serializer convention (consistent with how we handle `WateringTriggers`).

There's a subtlety: the **method** and **value** that an `update*` mutation accepts aren't directly exposed by `Zone.monitoringSettings` — only the resulting operating ranges and measured medians are. So `flow_monitoring_method` and friends in the get_zone_settings response are best-effort: we report `null` when we can't determine them from the read schema, with the AI expected to set them explicitly when calling `update_zone_settings` or `set_zone_baseline` rather than trying to round-trip them blindly. We document this in the tool description.

### Snapshot tool picks up the new fields automatically
`dump_controller_snapshot` calls the same `getZoneFull` path; once `serializeZoneSettings` returns the new fields, the snapshot envelope contains them. No separate work in `tools/backup.ts`.

### `start_zone` / `start_all_zones`: learn flags pass through transparently
The Zod input gains:
```
learn_current_from_next_run?: boolean
learn_flow_from_next_run?: boolean
```
These map to upstream args of the same names (camelCase). When omitted, the tool passes `null` (matching the upstream default = no learning). The existing `minutes` → seconds conversion and `stack_runs: true` behavior is unchanged.

`start_zone_zones` and `start_zones_with_program*` are not exposed by us, so they don't need updates here.

### Schema-source-of-truth lives in the repo
The committed `schema/hydrawise.live.graphql` becomes the canonical reference for any future hand-written queries/mutations. CLAUDE.md is updated to point contributors at it (and at `scripts/probe-schema.ts` to refresh it). The cached pydrawise schema at `/tmp/hydrawise.graphql` remains a useful comparison reference but is no longer authoritative.

## Risks / Trade-offs

- **[Risk] Switching to `updateZoneAdvanced` breaks something subtle** → Mitigation: the live schema's `updateZoneAdvanced` declaration accepts the same arguments as `updateZone` plus the four monitoring ones, with two shape differences (`cycleSoakEnable`, `runNextAvailableStartTime` becoming Boolean). We change the Zod accept-shape to match. Test against the user's real account before merging.
- **[Risk] `flow_monitoring_method` / `current_monitoring_method` aren't directly readable** → Mitigation: explicitly document that `get_zone_settings` may return `null` for the methods, and that an AI doing a round-trip should treat them as "set explicitly when changing."
- **[Risk] `learn_current_from_next_run` mis-fires (user starts a routine zone, gets baseline silently overwritten)** → Mitigation: defaults are `null` (no learning); the AI must explicitly set the flag, and `start_zone` is already labelled `PHYSICAL ACTION:` so the MCP client confirmation prompt covers it.
- **[Trade-off] `set_zone_baseline` and `update_zone_settings` overlap in capability** → Acceptable; `update_zone_settings` is the structural write, `set_zone_baseline` is the one-shot. The AI picks the cheaper path.
- **[Trade-off] Schema migration is silent** → We don't snapshot the cached schema in the repo (only the new live one). If we ever revert this change, the next contributor sees only the live SDL — which is what we want.

## Migration Plan

Additive; no breaking changes. New version bump to `0.3.0` to mark the new tool surface.

Rollback: `git revert` the implementation commit. The previous build (where `update_zone_settings` calls `updateZone`) continues to work since `updateZone` is deprecated, not removed.

## Open Questions

- Should `set_zone_baseline` accept method strings as `MANUAL | LEARN_FROM_NEXT_RUN` (matching the GraphQL enum) or in a more user-friendly form like `manual | learn_from_next_run`? Default: match the enum verbatim — easier to grep, no client-side translation, no second source of truth.
- Once the AI knows about `learn_*_from_next_run`, will it use it appropriately? We're trusting the model here; the tool description spells out what each flag does. Worth observing in real use.
