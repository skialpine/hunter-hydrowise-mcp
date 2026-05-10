## Context

`update_standard_program` and `create_standard_program` share a `StandardProgramBaseShape` Zod object in `src/tools/scheduling.ts` that maps to `StandardProgramWritable` in `src/hydrawise/queries.ts`, which is then translated to GraphQL variables by `standardProgramToVars` in `src/hydrawise/api.ts`.

Three problems discovered during live testing (issue #5):

1. `interval_days`, `series_start_epoch_seconds`, `valid_from_epoch_seconds`, `valid_to_epoch_seconds` are required in the Zod schema even though only `interval_days` and `series_start_epoch_seconds` are meaningful in `"interval"` mode, and the valid-from/to pair is optional at the Hydrawise level.
2. The write-side field `program_type: z.number().int()` collides in name with the read-side discriminator `program_type: "Standard" | "Advanced"`, breaking the read→write round-trip for LLM callers.
3. `get_program` does not document that `periodicity` is null in non-interval modes, so callers can't distinguish "read failed" from "field not applicable."

The changes are confined to the tool layer (`scheduling.ts`), the shared TypeScript interface (`queries.ts`), and the GraphQL variable translator (`api.ts`).  No mutations or queries change.

## Goals / Non-Goals

**Goals:**
- Make `interval_days`, `series_start_epoch_seconds`, `valid_from_epoch_seconds`, `valid_to_epoch_seconds` optional/nullable so they can be omitted when not applicable.
- Rename the write-side integer field from `program_type` to `scheduling_method` in `StandardProgramBaseShape`, `StandardProgramWritable`, and the `standardProgramToVars` translator.
- Document `periodicity: null` behavior in the `get_program` tool description.
- Update all unit/integration test fixtures affected by the rename.

**Non-Goals:**
- Changing the upstream GraphQL mutation variable name (`programType`) — that is an opaque int and is unchanged.
- Validating the *meaning* of the `scheduling_method` integer (e.g. refusing unknown ints) — Hydrawise's API contract, not ours to enforce.
- Modifying other write tools (`create_watering_program`, `update_watering_program`) — their `program_type` is a string enum discriminator with correct semantics.

## Decisions

### D1 — Optional via `.nullable().optional()`, not union/default

The four conditionally-relevant fields become `z.number().int().nullable().optional()`. Omission and explicit `null` are both valid; in `standardProgramToVars` they coalesce to `null` (passed through unchanged — the upstream `createStandardProgram` and `updateStandardProgram` mutations accept `null` for these).

Alternative considered: `.default(null)` makes the Zod type non-optional but auto-fills on omission. Rejected — it silently masks callers who forget the field entirely vs. callers who consciously omit it. `.nullable().optional()` keeps the intent explicit.

### D2 — Rename to `scheduling_method`, not a union type

The `program_type: z.number().int()` write field is renamed to `scheduling_method: z.number().int()` to match the read-side field that carries the same integer value (exposed as `scheduling_method` in `get_program`'s Standard output shape).

Alternative considered (issue #5 Option B): accept both the int and the string `"Standard"` / `"Advanced"` with a `.transform()`. Rejected — it adds complexity and hides that the integer and the discriminator string are conceptually different. Renaming to match the read field is cleaner and more honest; it also makes the `.describe()` self-documenting ("from get_program response field of the same name").

The rename flows through three layers:
- `StandardProgramBaseShape` in `scheduling.ts` (Zod key rename)
- `StandardProgramWritable` in `queries.ts` (interface field rename)
- `standardProgramToVars` in `api.ts` (`p.program_type` → `p.scheduling_method`)

### D3 — Description-only fix for null periodicity

`get_program` already returns `periodicity: null` in dow/even/odd modes; no code change is needed. The fix is a single sentence appended to the tool description in `scheduling.ts`:
> "Returns `periodicity: null` when `standard_program_day_pattern` is `"dow"`, `"odd"`, or `"even"` — periodicity is only meaningful in `"interval"` mode."

## Risks / Trade-offs

- **Snapshot compatibility**: existing snapshots captured before this change carry `program_type` (int) in their `_restore_recipe` step args for `create_standard_program` / `update_standard_program`. After the rename those step args will fail validation. Mitigation: the `_restore_recipe` is regenerated on each `dump_controller_snapshot` call, so any fresh snapshot will use `scheduling_method`. Stale snapshots are a known limitation; the recipe builder's `_caveats` note should mention field-rename incompatibility for snapshots captured before v8 if we bump the snapshot version. For now this is a minor edge case (no production users of old snapshots).
- **Existing callers**: any direct caller that passes `program_type` as an integer key to `update_standard_program` will get a Zod validation error after the rename. This is the desired outcome — it surfaces the ambiguity rather than silently accepting a now-wrong field name.

## Open Questions

None — all three fixes have clear, agreed-upon implementations per issue #5.
