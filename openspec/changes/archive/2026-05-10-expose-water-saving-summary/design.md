## Context

Two related gaps around water savings data, addressed together since they share the locale/unit concern:

1. **`accumulated_water_savings` is a bare `Int`** emitted by `serializeController` without a unit annotation. The upstream schema (`Controller.status.accumulatedWaterSavings: Int!`) has no `LocalizedValueType` wrapper — the raw number is whatever the account's unit preference is. The field is currently in `IDENTIFIER_WHITELIST` in `serializers.ts`, which exempts it from the lint test but leaves it ambiguous.

2. **No period-scoped savings report exists**. The schema exposes `Controller.reports.overviews.periodSummary(year, period, periodNumber).details.waterSavingSummary` which returns a `WaterSavingSummary { normalDuration: Int!, scheduledDuration: Int! }` aggregate — exactly the per-period delta the GUI's "Reported Water Savings" view shows.

The two fixes are bundled because they both require deciding how to communicate the volume unit to consumers, and the period-scoped savings tool has the same unit concern for any derived water-volume field.

## Goals / Non-Goals

**Goals:**
- Wrap `accumulated_water_savings` as `{value, unit}` using country-based unit inference; remove from `IDENTIFIER_WHITELIST`; bump snapshot version to 8
- Add `get_water_saving_summary(controller_id, year, period, period_number?)` read-only tool
- Return `normal_duration_minutes`, `scheduled_duration_minutes`, `savings_minutes`, `savings_percent` (computed) from `WaterSavingSummary`
- Document the distinction between lifetime savings and period-scoped savings in CLAUDE.md

**Non-Goals:**
- Per-zone breakdown — `WaterSavingSummary` has no zone-level fields; this is not a schema gap we can work around
- Water volume saved — `WaterSavingSummary` exposes durations only, not volume; the GUI's volume figures come from flow-sensor telemetry not exposed by this path
- `CURRENT_WEEK` period — `ReportingPeriodEnum` is `WEEK | MONTH | QUARTER | YEAR`; there is no current-week variant under this query path (unlike `ZoneRunSummary`)
- Changing the existing `get_run_summary` tool interface

## Decisions

### Unit inference for bare-Int water fields

**Decision**: Use `Controller.location.country` to infer the volume unit at serialization time. If `country === 'US'`, emit `'gallons'`; otherwise emit `'liters'`.

**Alternatives considered**:
- `User.units: UnitsSummary!` is already on the `me` query and has fields like `rainUnit`, `temperatureUnit`, etc. — but no explicit `waterVolumeUnit`. The field names suggest temperature/rainfall/wind; using `rainUnit` ("in" vs "mm") as a proxy for volume unit works but is indirect and surprising to future maintainers.
- A dedicated `LocalizedValueType` water-volume field fetched alongside — requires an extra API call or joining with a run summary query that may not be in scope for a status query.

Country inference is transparent (readable), already available in `CONTROLLER_FIELDS`, and matches the documented fallback in issue #8. The CLAUDE.md gotcha will document the limitation (some US accounts opt into metric; the API doesn't expose a dedicated water-volume unit field).

### `get_water_saving_summary` period interface

**Decision**: Accept `year: Int!`, `period: WEEK | MONTH | QUARTER | YEAR`, and optional `period_number: Int`. The caller supplies `period_number` for WEEK (1–53), MONTH (1–12), and QUARTER (1–4); omit for YEAR.

**Alternatives considered**: Mirroring `get_run_summary`'s per-period named args (`start_week`, `end_week`, `start_month`, etc.) — but `periodSummary` takes a single `(year, period, periodNumber)` triple, so named per-period args would just get re-mapped to `periodNumber` anyway. A single `period_number` is simpler and maps 1:1 to the upstream schema.

### Savings percent computation

**Decision**: Compute `savings_percent` in the serializer: `round((normalDuration - scheduledDuration) / normalDuration * 100, 1)`. Return `null` when `normalDuration === 0` (avoid division by zero; indicates no normal watering scheduled for the period).

**Alternatives considered**: Leave percent to the caller — but every caller would have to handle the zero-denominator case independently.

### No `water_saved` volume field

`WaterSavingSummary` returns durations only. The schema provides no volume-saved field at this query path. Do not fabricate a volume figure. The tool explicitly omits a `water_saved` field and the CLAUDE.md notes that volume savings are not available through this path.

## Risks / Trade-offs

- **Country inference is imperfect**: A US account that has opted into metric will get `'gallons'` when the true unit is liters. No fully-correct inference is possible without a dedicated `waterVolumeUnit` field from Hydrawise. Risk is low (rare account config) and documented. If the schema gains a proper unit field later, the wrapping logic in `serializeController` can be updated without a snapshot version bump.
- **`periodSummary` may return null**: `ReportPeriodSummary.details` is nullable (`details: Details` without `!`). The tool should handle null details gracefully (return `null` or a not-available result rather than an API error).
- **`WaterSavingSummary` may return zeroes for fresh controllers**: A newly installed controller with no watering history will have `normalDuration: 0`, producing `savings_percent: null` per our convention.

## Migration Plan

- Snapshot version 8 is additive — `accumulated_water_savings` shape changes from `Int` to `{value, unit}`. Older snapshots (v7 and below) remain readable as JSON; the `_restore_recipe` in older snapshots doesn't reference `accumulated_water_savings` (it's informational, not a restore-step arg), so no recipe replay breakage.
- The `IDENTIFIER_WHITELIST` removal triggers the lint test to enforce the wrapper — confirms the fix lands correctly at CI time.
- No rollback needed; the new tool is additive and the wrapping change only affects snapshot output, not control tools.

## Open Questions

- Does `User.units` have a field that gives water volume unit more reliably than country inference? Not currently visible in the schema; worth probing on a metric account if one becomes available.
- Is `ReportingPeriodEnum.QUARTER` supported on all plan tiers, or gated behind a subscription? Not tested; add a note in CLAUDE.md if confirmed subscription-gated.
