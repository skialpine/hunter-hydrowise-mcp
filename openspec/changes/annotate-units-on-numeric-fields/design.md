## Context

The MCP server's primary consumer is an LLM that picks tool calls from a generated catalog and reads snapshot JSON cold. The LLM does not see `CLAUDE.md`, hand-written gotcha docs, or the upstream Hydrawise GraphQL schema. Today the codebase has three different conventions for conveying numeric units, applied inconsistently:

| Convention | Where it's used today | Conveys unit? |
|---|---|---|
| Field-name suffix (`_minutes`, `_seconds`) | `RunTimeGroup.duration_minutes`, watering report durations, run-history durations | ✓ |
| `{value, unit}` wrapper via `serializeUnitValue` | `LocalizedValueType` fields: temp, wind, rain, water flow rate, electric current | ✓ |
| Bare `int`, no annotation | `cycle_custom_time`, `soak_custom_time`, `inter_zone_delay`, `master_valve.{delay, post_timer}`, sensor `_observed.{delay, off_timer}`, `program.interval`, `program.{valid_from, valid_to, series_start}`, `factors[]`, `watering_adjustment`, `run_time`, `*_watering_frequency` triplet | ✗ |

The third row is the bug surface. The trigger for this change was an Explore agent reading a fresh snapshot, seeing `cycle_custom_time: 30`, and reporting "30 seconds" — when the upstream Hydrawise schema explicitly documents the field as `"""Watering cycle duration in minutes"""` (line 454 of `schema/hydrawise.live.graphql`). The user verified the GUI shows 30 *minutes*. The cycle/soak setup is well-tuned for clay soil; the tool layer simply lost the unit on the way out.

The MCP is brand new (no published clients, no external schema dependents). The user has explicitly waived backward compatibility to optimize for AI consumers.

## Goals / Non-Goals

**Goals:**
- Every numeric field that leaves or enters this server carries its unit, visible at the data layer (without consulting external docs).
- The unit-bearing field name is identical on read (snapshot, tool result), write (Zod input), and inside the restore recipe — so the recipe builder needs no translation.
- A future contributor cannot re-introduce a bare-int unit-ambiguous field without a CI failure.
- `LocalizedValueType` fields keep their existing `{value, unit}` wrapping (the unit genuinely varies per user account preference, so the value-time pairing is correct).

**Non-Goals:**
- Backward compatibility for old field names. The user explicitly waived this; the MCP has no external consumers.
- Migrating the cached snapshot files in `snapshots/`. Old snapshots remain readable for inspection (the JSON keys are still there, just stale); they cannot be replayed by the new restore recipe and will need to be re-captured.
- Localizing fixed-unit fields (cycle/soak duration, intervals, delays) to user preference. Hydrawise documents them as fixed minutes/seconds; localization is incorrect for these fields.
- Changing the upstream Hydrawise GraphQL schema (out of our control).

## Decisions

### Decision 1: Field-name suffix (not `{value, unit}` wrapping) for fixed-unit fields

For fields whose unit is documented and immutable (per Hydrawise schema or our knowledge), encode the unit as a suffix in the field name:
- `cycle_custom_time` → `cycle_custom_time_minutes`
- `inter_zone_delay` → `inter_zone_delay_seconds`
- `program.interval` → `program.interval_days`

**Why suffix instead of `{value, unit}` wrapping:**
- Suffixes are 4 ASCII bytes per field vs. ~25 for `{value: N, unit: "X"}` — meaningful in a 124KB snapshot.
- Suffix is greppable, type-friendly, and matches the existing `RunTimeGroup.duration_minutes` precedent.
- `{value, unit}` exists for a reason: when the unit varies (account preference). For fixed units, the wrapper adds cognitive overhead without information.
- An LLM reading `"cycle_custom_time_minutes": 30` parses it correctly without prompting; an LLM reading `"cycle_custom_time": {"value": 30, "unit": "minutes"}` parses it correctly too but burns more tokens and is less consistent with sibling fields in the same response.

**Alternatives considered:**
- *Wrap everything in `{value, unit}`*: rejected — breaks parallelism with `RunTimeGroup.duration_minutes` (already shipped) and bloats the snapshot.
- *Add a sibling `_units` map at the envelope level (`{cycle_custom_time: 30, _units: {cycle_custom_time: "minutes"}}`)*: rejected — keeps the field-name short but moves the unit far from the value, making prompt-window scans more error-prone.
- *Use a JSON Schema with `format: "minutes"` annotations*: rejected — MCP tool catalogs don't propagate JSON-Schema custom formats reliably, and the LLM still sees the bare field name in tool descriptions.

### Decision 2: Apply rename to BOTH inputs and outputs (symmetric naming)

The same field name appears on:
- Snapshot output (`dump_controller_snapshot`)
- Read-tool output (`get_zone_settings`)
- Write-tool input (Zod schema for `update_zone_settings`)
- Restore-recipe args (the AI-replayable plan embedded in the snapshot)

**Why symmetric:**
- The restore recipe is the AI's "plan to apply this snapshot." It pulls fields from the snapshot and passes them as tool args. If snapshot field is `cycle_custom_time_minutes` and the tool input is `cycle_custom_time`, the recipe builder needs a translation map. With symmetric naming, the recipe is just `{tool, args}` where `args` keys = snapshot keys = tool input keys. One less place to drift.
- Tools the LLM sees in the catalog show input fields that match the names it just read in the snapshot — no mental translation required.

**Trade-off:** Symmetric naming means renaming Zod input fields, which is a breaking change to the MCP tool catalog. Acceptable per user direction.

### Decision 3: Add `.describe()` on every numeric Zod input

Even with the suffix in the field name, add a `.describe('Cycle duration, in minutes (Hydrawise CycleAndSoakSettings.cycleDuration doc).')`. The MCP tool catalog surfaces the description, and citing the upstream source helps a future contributor verify the unit hasn't changed when they refresh the schema.

**Convention for the description string:**
```
"<Field semantic>, in <unit> (<source citation>)."
```
where `<source citation>` is one of:
- "Hydrawise schema docstring" — when the schema has a doc comment
- "Hydrawise schema default = N implies <unit>" — when inferred from default value
- "Verified empirically against live controller MM/YYYY" — when probed
- "Project convention" — for our own derived fields

### Decision 4: Lint test enforces the convention

A new `tests/unit/lint-numeric-units.test.ts` scans:
- Every Zod schema in `src/tools/*.ts` for `z.number()` / `z.number().int()` field names
- Every output key in `src/tools/serializers.ts` whose value is `number | null`

Fails CI if any name doesn't either:
- End in a registered unit suffix (`_minutes`, `_seconds`, `_days`, `_percent`, `_epoch_seconds`)
- Appear in a small whitelist of unit-less identifiers (`*_id`, `*_number`, `*_count`, `latitude`, `longitude`, `divisor`, `flow_rate` — fields that genuinely have no unit or are reserved for the LocalizedValueType wrapping)
- Be wrapped in the `{value, unit}` shape (detected by the field name appearing in `serializeUnitValue` output context)

The whitelist is short and the failure message points to this design doc.

### Decision 5: Probe ambiguous units before committing the suffix

Several fields lack documentation in the upstream schema:

| Field | Likely unit | Confidence | Verification path |
|---|---|---|---|
| `interZoneDelay` (Int!) | seconds | **VERIFIED** | GUI "Edit Valve Delays" labels field "seconds"; confirmed 2026-05-09 |
| `MasterValve.delay` | seconds | **VERIFIED** | GUI "Edit Valve Delays" labels field "seconds"; confirmed 2026-05-09 |
| `MasterValve.postTimer` | seconds | medium | Not shown in "Edit Valve Delays" screenshot; pending probe |
| `Sensor.delay`, `Sensor.offTimer` | seconds | **VERIFIED** | "Add Custom Sensor Type" GUI shows seconds dropdown (default) + helper text "Minimum number of seconds"; confirmed 2026-05-09 |
| `StandardProgram.interval` | days | high | GUI labels "every N days" |
| `StandardProgram.{validFrom, validTo, seriesStart}` | epoch seconds | high | Hydrawise's other timestamp pattern |
| `fixedWateringFrequency` (default 60) | minutes? | medium | Probe + cross-check `WateringFrequency.label` |
| `virtualSolarSyncWateringFrequency` (default 60) | minutes? | medium | Same |

The user has live controller access. The implementation tasks include a probe step that BLOCKS the rename of these specific fields until the unit is verified. Better to ship six confirmed renames and leave one as `field_name` (with a TODO) than enshrine a wrong unit.

`smartWateringFrequency` (default 86400 = 24×3600) is high-confidence seconds and does not need a probe.

## Risks / Trade-offs

- **[Risk] Wrong unit enshrined in the suffix** → committed worse outcome than today (an LLM that previously asked about ambiguity may now blindly trust `_minutes` when the value is actually seconds). Mitigation: probe step before committing each schema-silent field; lint test allows un-suffixed names that appear in a TODO whitelist for fields awaiting verification.

- **[Risk] Snapshot-replay tests break across the version bump** → integration tests that load fixture snapshots have to be regenerated. Mitigation: regeneration is a one-line task (`npm test` updates fixtures); test names stay stable.

- **[Risk] CLAUDE.md and the new convention drift apart** → the lint test catches new violations, but not stale prose. Mitigation: tasks include a single-pass rewrite of the CLAUDE.md "units are confusing" section, and a comment in the lint test pointing at this design doc.

- **[Trade-off] Restore recipe replays from snapshots stop working across the version bump** → users with v5 snapshots can no longer replay them via the new recipe. Acceptable per user direction (MCP is brand new; they have a fresh snapshot).

- **[Trade-off] Naming verbosity** → `current_monitoring_value_amps` is longer than `current_monitoring_value`. Net positive: longer names are still cheaper than the cost of a misinterpretation that pumps water for the wrong duration.

## Migration Plan

There is no live consumer to migrate. The migration plan inside the implementation:

1. Probe each ambiguous-unit field on a live controller; lock in the unit.
2. Rename serializer outputs (snapshot, read-tool results) — failing tests reveal what's renamed.
3. Rename Zod inputs to match — failing tests reveal callers.
4. Rename `restoreRecipe` args to match the snapshot.
5. Bump `SNAPSHOT_VERSION` to 6.
6. Update capability spec files.
7. Add lint test; verify it fails cleanly on a deliberate mis-named field, then passes against the renamed code.
8. Rewrite the "units are confusing" section of `CLAUDE.md`.
9. Re-capture the user's snapshot under v6 (manual step; the user invokes `dump_controller_snapshot` and saves via the `capture-irrigation-snapshot` skill).

Rollback strategy: revert the commit; the v5 snapshot format and old field names return.

## Open Questions

- **`fixed_watering_adjustment` vs `watering_adjustment`** — the schema has both, with `wateringAdjustment` deprecated. Should the renamed field be `watering_adjustment_percent` (carrying the deprecated path forward) or `fixed_watering_adjustment_percent` (new convention)? Lean: rename the active field only; let the deprecated one keep its old name and sunset.
- **Per-zone `factors[]`** — the array is 12 integers representing month-1 through month-12 percentages. Does it become `factor_percents[]` (array of values) or `monthly_adjustment_percents[]` (more semantic)? Lean: `monthly_adjustment_percents[]` if the spec test agrees; otherwise keep `factor_percents[]` for the smaller diff.
- **Should the lint test also enforce description text on numeric inputs?** Lean: yes — `.describe()` is required for any `z.number()` whose name carries a unit suffix; check that the description string contains the suffix's unit word.
