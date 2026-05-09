## Why

When we tested `update_zone_settings` against the live Hydrawise API, the GUI's "Advanced > Controller Insights" tab — flow/current baseline values, learn-from-next-run toggles, observed medians — wasn't reachable. A schema introspection of the live endpoint (now committed at `schema/hydrawise.live.graphql`) showed three things our cached pydrawise schema didn't have:

1. `Zone.monitoringSettings: ZoneMonitoringSettings!` (operating ranges + measured medians for water flow and electric current).
2. `updateZone` has been **deprecated** in favor of `updateZoneAdvanced`, and both expose `flowMonitoringMethod`, `currentMonitoringMethod`, `flowMonitoringValue`, `currentMonitoringValue` arguments.
3. A standalone `setBaselineValues(zoneId, ...)` mutation, plus `learnCurrentFromNextRun` / `learnFlowFromNextRun` boolean args added to every `start*Zone*` mutation.

This change closes that gap so the AI can read, plan against, and write the monitoring side of a zone — covering the full GUI editor.

## What Changes

- Migrate the underlying mutation behind `update_zone_settings` from `updateZone` → `updateZoneAdvanced`. Adjust the writable shape: `cycleSoakEnable` becomes `Boolean`, `runNextAvailableStartTime` becomes `Boolean` (matching the Advanced signature). All other fields stay.
- **Extend the writable zone payload** with four optional monitoring fields:
  - `flow_monitoring_method`: `'MANUAL' | 'LEARN_FROM_NEXT_RUN' | null`
  - `current_monitoring_method`: same enum
  - `flow_monitoring_value`: number or null
  - `current_monitoring_value`: number or null
- **Extend `get_zone_settings`** to return the same four fields as part of the writable view, plus a new `monitoring_observed` block with the read-only `operating_ranges` and `measured_medians` values.
- Add a new tool `set_zone_baseline(zone_id, flow_monitoring_method, current_monitoring_method, flow_monitoring_value?, current_monitoring_value?, preview?)` wrapping Hydrawise's `setBaselineValues` mutation. Returns the upstream `StatusCodeAndSummary`. Marked `PHYSICAL ACTION:`.
- **Extend the v1 start tools** (`start_zone`, `start_all_zones`) with optional booleans `learn_current_from_next_run` and `learn_flow_from_next_run`. When set, the tool passes them through to the upstream `startZone` / `startAllZones` mutations. The default remains a normal run with no learning behavior.
- Update the snapshot tool to include the monitoring read fields per zone.
- The `scripts/probe-schema.ts` and `schema/hydrawise.live.graphql` files added in the prior commit are referenced in `CLAUDE.md` as the authoritative schema source going forward.

## Capabilities

### New Capabilities
<!-- None — every change here lives in existing capabilities. -->

### Modified Capabilities
- `irrigation-scheduling`: extend `update_zone_settings` and `get_zone_settings` with the four monitoring fields; add the new `set_zone_baseline` tool.
- `irrigation-control`: add the optional `learn_current_from_next_run` and `learn_flow_from_next_run` arguments to `start_zone` and `start_all_zones`.

## Impact

- **No breaking changes for tool callers**: every new field and argument is optional. Existing callers continue to work; the AI just sees more fields when it reads, and can choose to set them on writes.
- **Underlying mutation switch** (`updateZone` → `updateZoneAdvanced`) is internal — the MCP tool surface is unchanged except for the new optional fields. The two arg-shape differences (`cycleSoakEnable` and `runNextAvailableStartTime` becoming `Boolean`) mean the writable Zod schema shifts those types. Documenting in design.md.
- **Tests**: extend the existing tool-list integration test (now needs `set_zone_baseline`); add a new unit test that asserts the `update_zone_settings` arguments map correctly to `updateZoneAdvanced`'s vars; verify learn-from-next-run flags are forwarded by `start_zone` / `start_all_zones`.
- **Docs**: README "Schedule editing" gets a short paragraph about flow/current monitoring; `CLAUDE.md` references `schema/hydrawise.live.graphql` as the source of truth and points contributors at `scripts/probe-schema.ts` for refreshing it.
- **Out of scope for this change**: notes (`createZoneNote` etc.), issue muting (`muteIssueUntil`), report schedules, ownership-transfer flow, and `ensureSchedulingHorizon`. All present in the live schema, none related to the user's expressed schedule-editing goals.
