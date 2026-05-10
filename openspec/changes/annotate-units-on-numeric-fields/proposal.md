## Why

A snapshot field `cycle_custom_time: 30` was misread by an AI agent as 30 seconds when the upstream Hydrawise schema actually documents it as 30 minutes. The unit is invisible in both the snapshot output and the MCP tool input schema — it lives only in `CLAUDE.md` gotchas and a GraphQL doc comment. Several other numeric fields share the same problem (`inter_zone_delay`, `master_valve.delay`, `program.interval`, the `*_watering_frequency` triplet, etc.). The MCP server's primary consumer is an AI that sees the tool catalog and the snapshot but does NOT see CLAUDE.md, so unit semantics MUST travel with every value. This change makes that contract explicit and enforced.

## What Changes

- **BREAKING**: Rename every numeric field with a fixed unit to carry the unit as a name suffix, applied to BOTH serializer outputs (snapshot, tool results) AND Zod tool inputs. Examples: `cycle_custom_time` → `cycle_custom_time_minutes`, `inter_zone_delay` → `inter_zone_delay_seconds`, `program.interval` → `program.interval_days`. Same name on read and write so the restore recipe needs no translation.
- **BREAKING**: `SNAPSHOT_VERSION` bumps 5 → 6. Stored snapshots remain readable for inspection but cannot be applied by the new restore recipe (acceptable per user direction — MCP is brand new, no external consumers).
- Add `.describe('...')` to every numeric Zod input echoing the suffix and citing the schema source, so the MCP tool catalog the LLM picks from shows the unit before any call is made.
- Add a lint test (`tests/unit/lint-numeric-units.test.ts`) that fails CI if any numeric field name in `src/tools/*.ts` Zod schemas or `src/tools/serializers.ts` outputs lacks a registered unit suffix, isn't whitelisted (ids/indices/counts/lat-lng), and isn't wrapped in the `{value, unit}` LocalizedValueType pattern.
- Probe each schema-silent field on a live controller before committing to a suffix, so the convention enshrines the correct unit (not a best-guess).
- Replace the "units are confusing" subsection of the Hydrawise gotchas in `CLAUDE.md` with a single rule statement and a pointer to the lint test.

Keep `{value, unit}` wrapping (existing `serializeUnitValue` helper) for `LocalizedValueType` fields — temperature, wind, rain, water flow rate, electric current — because those vary by user account preference. Only fixed-unit fields get suffix renamed.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `irrigation-scheduling`: Zod input field names rename with unit suffixes; tool descriptions reference units inline.
- `irrigation-backup`: snapshot envelope keys rename; `SNAPSHOT_VERSION` 5 → 6; restore recipe args use the new suffixed names.
- `irrigation-controller-config`: `inter_zone_delay`, `master_valve.{delay, post_timer}` rename in both inputs and outputs.
- `irrigation-sensors`: sensor `_observed.{delay, off_timer}` rename in outputs.

(`irrigation-control` requires no spec change — its user-facing input is already named `minutes`; the `customRunDuration` rename happens entirely inside the `src/hydrawise/api.ts` mapping layer. `irrigation-status`, `irrigation-reporting`, `irrigation-notes`, `mcp-server` already conform — no changes needed.)

## Impact

- `src/tools/serializers.ts` — rename output keys; add unit-suffix helper or constant set.
- `src/tools/scheduling.ts`, `controllerConfig.ts`, `control.ts`, `sensors.ts` — rename Zod input fields; add `.describe()` on every numeric input.
- `src/tools/backup.ts` — bump `SNAPSHOT_VERSION` to 6.
- `src/tools/restoreRecipe.ts` — emit suffixed field names in recipe args.
- `src/hydrawise/api.ts` — single mapping table at the GraphQL boundary translating suffixed MCP-side names to upstream Hydrawise camelCase (the only place the wire format is allowed to diverge).
- `src/hydrawise/queries.ts` — TypeScript types mirror upstream and stay as-is (only the serialized shape changes).
- New test: `tests/unit/lint-numeric-units.test.ts`.
- Update `tests/unit/serializers.test.ts` and the existing integration tests to expect the new field names.
- `openspec/specs/irrigation-{scheduling,backup,controller-config,sensors,control}/spec.md` — capability spec text updated to use the new field names.
- `CLAUDE.md` — replace the unit-inconsistency gotchas with the single rule statement.
- No new dependencies. No upstream Hydrawise schema changes (out of our control).

Non-goals:
- Backward compatibility for old field names (user explicitly waived).
- Migrating stored snapshot files in `snapshots/` (user explicitly waived).
- Localizing fixed-unit fields to user preference (Hydrawise documents them as fixed; localization only applies to `LocalizedValueType`).
