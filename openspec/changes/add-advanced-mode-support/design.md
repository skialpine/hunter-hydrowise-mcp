## Context

Hydrawise schema models programs as the union of two implementations of the `Program` interface:

```
interface Program {
  id, name, schedulingMethod, monthlyWateringAdjustments, appliesToZones, conditionalWateringAdjustments
}

type StandardProgram implements Program {
  ...interface fields,
  applications: [StandardProgramApplication]   # zone → runTimeGroup pairs
  startTimes: [Time]                           # ["19:00", "22:00", ...]
  timeRange: Unit { validFrom, validTo }
  ignoreRainSensor
  daysRun: [DaysOfWeekEnum]
  standardProgramDayPattern
  periodicity: { period, seriesStart }
}

type AdvancedProgram implements Program {
  ...interface fields,
  zoneSpecific: Boolean!                       # one program shared across zones, or per-zone?
  advancedProgramId: Int!                      # different from .id
  scope: AdvancedProgramScopeEnum              # CUSTOMER | CONTRACTOR
  wateringFrequency: ProgramWateringFrequency  # { period: WateringPeriodicity, label, description }
  runTimeGroup: RunTimeGroup                   # the run duration for this advanced program
}
```

ADVANCED-mode zones use `AdvancedWateringSettings`:
```
type AdvancedWateringSettings implements WateringSettings {
  fixedWateringAdjustment, cycleAndSoakSettings,
  advancedProgram: AdvancedProgram!            # the program this zone runs
  programStartTimes: [ProgramStartTime!]!      # zone-level start times
}
```

So per-zone schedule for ADVANCED is: `zone.wateringSettings.advancedProgram` + `zone.wateringSettings.programStartTimes`. The `Controller.programs(includeZoneSpecific: true)` query returns both `StandardProgram` and `AdvancedProgram` entries — but our existing `PROGRAMS_FULL_QUERY` only selects fields under the `... on StandardProgram` fragment, so AdvancedProgram fields are silently dropped from the response.

For **mutations**, ADVANCED mode is partially supported by existing tools:
- `updateZoneAdvanced` — covers all per-zone fields including the watering frequency selectors. ADVANCED-mode zones use `wateringFrequencyMode` + `fixed_watering_frequency` / `smart_watering_frequency` / `virtual_solar_sync_watering_frequency` fields. ✅ already in `update_zone_settings`.
- `createTimeBasedWateringProgram` / `updateTimeBasedWateringProgram` (and Smart, VSS variants) — for the watering program records that AdvancedProgram references. ✅ already in `create/update_watering_program`.
- `createProgramStartTime` / `updateProgramStartTime` — for the per-zone start times. ✅ already in `create/update_program_start_time`.
- `updateControllerProgramMode` — switches STANDARD ↔ ADVANCED. ✅ added in Phase 1.

So **no new mutations** are needed. The only schema gap on the write side is reading what's there to capture into the snapshot.

## Goals / Non-Goals

**Goals:**
- `get_program` tool transparently handles both `program_type: Standard` and `program_type: Advanced`, returning the full readable shape per the program type.
- `dump_controller_snapshot` produces a complete, restorable snapshot for ADVANCED-mode controllers — same restorability guarantee as the STANDARD-mode snapshot.
- Per-zone snapshot entries for ADVANCED-mode zones include the `advanced_program` reference, allowing restore to associate each zone with its program.

**Non-Goals:**
- Any new write mutations — existing mutations cover ADVANCED mode.
- Real-device validation against an ADVANCED controller — out of scope for this change. The schema-correct implementation is verifiable via unit tests; live validation is a follow-up.
- Migration from STANDARD to ADVANCED (data conversion). The user can switch modes via `update_controller_program_mode` (Phase 1), but the schema doesn't auto-convert programs between the two shapes; that's an explicit user-driven operation.

## Decisions

### `get_program` dispatches by `program_type`

Rather than adding a separate `get_advanced_program` tool, extend the existing `get_program` to accept `program_type: 'Standard' | 'Advanced'` (already accepts both literals; today it errors on Advanced). The Standard branch is unchanged. The Advanced branch calls `getAdvancedProgram` and serializes via `serializeAdvancedProgram`.

**Alternative considered:** separate tools (`get_standard_program`, `get_advanced_program`). Rejected because the user's mental model is "get me program N" — the underlying type is an implementation detail. The existing tool already pretends to support Advanced (the enum is in its Zod schema).

### `dump_controller_snapshot` branches by `programMode`

Because the STANDARD and ADVANCED program shapes are substantively different (different field sets, different relationships to zones), the snapshot envelope branches at the controller level:

```json
{
  "controller": {
    "program_mode": "ADVANCED",
    "programs": [...thin entries from list_programs, same as today...],
    "advanced_programs": [...inlined AdvancedProgram details...],
    "zones": [
      {
        "advanced_program": { "id": ..., "name": ..., "advanced_program_id": ... }
        // ...other zone fields
      }
    ]
  }
}
```

vs. for STANDARD:

```json
{
  "controller": {
    "program_mode": "STANDARD",
    "programs": [...inlined StandardProgram details, same as Phase 1...]
    // no `advanced_programs` field
    // zone entries do not have `advanced_program`
  }
}
```

**Alternative considered:** single `programs` array containing a mix of types with a discriminator. Rejected because the inlined detail differs so much that branching is clearer for the AI consumer; a mixed array would mean every reader has to type-discriminate on each element.

### Per-zone `advanced_program` is a reference, not the full inlined record

Rather than embedding the full `AdvancedProgram` under each zone (which would massively duplicate data, since one Advanced program can govern many zones), the zone-level entry has a small `advanced_program: { id, name, advanced_program_id }` reference. The full detail lives under `controller.advanced_programs[]`. The AI restoring follows the reference.

**Alternative considered:** embed the full record. Rejected — same reasoning as the snapshot already follows for sensors (Phase 2): denormalized references for fast lookup, full record once at the controller level.

### Schema-correct without live ADVANCED testing

This change can't be tested against a real ADVANCED controller during implementation (the dev account is STANDARD). The shipped result is schema-correct (matches the live SDL) and unit-tested with fixtures derived from the schema. We document this as a known limitation and recommend the next user with an ADVANCED controller run a real-device validation pass.

**Alternative considered:** wait until a real ADVANCED account is available. Rejected because the read path is straightforward translation of the existing STANDARD path with different field selections; the risk of getting it wrong is bounded.

## Risks / Trade-offs

- **No live validation**: an ADVANCED-mode field could be implemented incorrectly in a way unit tests don't catch (e.g., `wateringFrequency.period` selecting `WateringPeriodicity` correctly but the actual upstream returning a different shape). Mitigation: integration test with a fixture matching the schema, plus a CLAUDE.md note that "the next ADVANCED controller user is encouraged to run a snapshot and verify against the GUI."
- **`AdvancedProgram.advancedProgramId` vs `AdvancedProgram.id`**: the schema has both. Their relationship is unclear from the schema alone (is `advancedProgramId` a stable cross-reference? a deprecated duplicate? something else?). Will need to either probe a real account or ask Hydrawise. Capture both in the snapshot for now.
- **Per-zone `programStartTimes` already work** for ADVANCED zones (the `... on AdvancedWateringSettings` fragment in the existing query selects them). Snapshot already populates them — but only for Advanced; STANDARD zones return `[]` because the fragment doesn't match. This is correct behavior per CLAUDE.md.
- **No `createAdvancedProgram` mutation found**: AdvancedProgram records appear to be derived from per-zone configuration rather than created directly. This means restore can't "create a new advanced program" — it can only set per-zone watering frequency + watering program references, and Hydrawise derives the AdvancedProgram view. This is consistent with what the schema exposes; we document it.
