## Why

The v1 server lets the model read controller/zone state and trigger ad-hoc runs, but it can't help the user *change the actual watering schedule* — adjusting run durations, frequencies, program start times, or seasonal factors all require dropping back into the Hydrawise app. This change adds the read+write tool pairs needed for an MCP-aware AI to read a snapshot of the account, propose schedule changes in natural language ("water the front yard every other day for 12 minutes through summer"), and apply them. As a side benefit, the same expanded read surface gives us a real **account snapshot** (backup) tool the user has been asking for.

## What Changes

- Add a new `dump_controller_snapshot(controller_id)` MCP tool that returns a single JSON document containing every readable controller, zone, watering-settings, program, program-start-time, seasonal-adjustment, and watering-trigger field for **one** controller. The user (or another MCP) can persist that JSON to disk for reference / diffing. Per-controller scope keeps the payload tight on multi-controller accounts and matches the Hydrawise UI's mental model.
- Expand the read surface so a snapshot can capture schedule state (today we only read basic zone status):
  - `get_zone_settings(zone_id)` → full `Zone.wateringSettings` (run duration, frequency mode/value, cycle+soak, etc.)
  - `list_programs(controller_id)` → standard programs and watering programs on the controller, with a `program_type` discriminator
  - `get_program(program_id, program_type)` → full configuration for a single program
  - `list_program_start_times(controller_id)` → configured start times with day-of-week pattern
  - `get_seasonal_adjustments(controller_id)` → 12-month factor array
  - `get_watering_triggers(controller_id)` → rain/temperature/humidity/wind suspension and extension thresholds
- Add **paired write tools** that mirror those reads, so an AI can read → reason → apply:
  - `update_zone_settings(...)` wraps `updateZone`
  - `update_seasonal_adjustments(controller_id, factors)`
  - `update_program_start_time(start_time_id, ...)` / `create_program_start_time(...)` / `delete_program_start_time(id)`
  - `update_standard_program(program_id, ...)` / `create_standard_program(controller_id, ...)` / `delete_standard_program(program_id)`
  - `update_watering_program(program_id, program_type, ...)` covering all three subtypes (Time-based, Smart-based, Virtual-Solar-Sync) via a discriminator + `create_watering_program(...)` / `delete_watering_program(program_id)`
  - `update_watering_triggers(controller_id, ...)`
- Every write tool accepts an optional `preview: true` argument that returns the GraphQL request body the tool *would* send, without executing it. The AI can use this to confirm a planned change with the user before committing.
- Wire each new write tool's description with a `PHYSICAL ACTION:` prefix (matching the v1 control tools) so MCP clients prompt for confirmation.
- Document the read+write pairing pattern in the README — the snapshot tool is *not* paired with a monolithic `restore_from_backup`. Restore is something the orchestrating AI does by diffing the snapshot against current state and calling the matching `update_*` tool per category.

## Capabilities

### New Capabilities
- `irrigation-backup`: tool that exports the account's readable state as a single JSON snapshot, intended for reference, diff, and AI-driven restore workflows.
- `irrigation-scheduling`: read+write tool pairs that let the AI inspect and modify zone watering settings, seasonal adjustments, program start times, and watering triggers, with an optional preview mode.

### Modified Capabilities
<!-- None: the new tools live in new capabilities; the v1 capabilities (`mcp-server`, `irrigation-status`, `irrigation-control`) are unchanged. -->

## Impact

- **New code**: schedule-related GraphQL queries and mutations in `src/hydrawise/queries.ts`, new `HydrawiseApi` methods, new `src/tools/scheduling.ts` and `src/tools/backup.ts` modules, registration wiring in `src/server.ts`.
- **No new external dependencies** — same stack (`graphql-request`, `zod`, `@modelcontextprotocol/sdk`).
- **No breaking changes** to existing tools or MCP wire shape; this is purely additive.
- **Tests**: unit coverage for the snapshot serializer, dry-run preview for each write tool, and argument-validation tests; integration coverage at the HTTP layer for `dump_account_snapshot` and at least one preview round-trip.
- **Docs**: README gains a "Schedule editing" section explaining the read+write pairing and how the AI orchestrates diff-based restore; a "Backup" section documenting the snapshot format.
- **Out of scope (explicit non-goals for this change)**: zone create/delete (`createZone`, `deleteZone` — too risky, can be added later), sensor/weather-station mutations, contractor-level operations, server-side scheduled snapshots (use external `cron` + `curl`), and a monolithic `restore_from_backup` tool.
