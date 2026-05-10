## Why

Three Zod-schema papercuts in `update_standard_program` / `create_standard_program` were discovered while empirically testing `dayPattern` against the live API (issue #5): four mode-irrelevant fields are unconditionally required, the `program_type` write field conflicts in name and type with the identically-named read discriminator, and `get_program` is silent about when `periodicity` is legitimately null.  Fixing these now makes the round-trip read → write workflow reliable for LLM callers without adding complexity.

## What Changes

- **Nit 1 — optional scheduling fields**: `interval_days`, `series_start_epoch_seconds`, `valid_from_epoch_seconds`, and `valid_to_epoch_seconds` become `.nullable().optional()` (omitting them is equivalent to passing `null`). Describe annotations call out conditional applicability.
- **Nit 2 — rename `program_type` write field**: rename the write-side integer field from `program_type` to `scheduling_method` in `StandardProgramBaseShape` (both `create_standard_program` and `update_standard_program`). The read-side field of the same name is a string discriminator (`"Standard"` / `"Advanced"`); the write side is an opaque int (e.g. `3`). The new name matches the read field that carries the same integer value.
- **Nit 3 — document null periodicity**: add a note to the `get_program` tool description that `periodicity` is `null` when `standard_program_day_pattern` is `"dow"`, `"odd"`, or `"even"` — only meaningful in `"interval"` mode.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `irrigation-scheduling`: requirements for `create_standard_program` / `update_standard_program` input schema change (optional fields, renamed field), and `get_program` description requirement changes (null periodicity documentation).

## Impact

- `src/tools/scheduling.ts` — `StandardProgramBaseShape` field optionality + rename
- `src/hydrawise/api.ts` — coalesce optional fields to `null`/omit at GraphQL boundary (no upstream behavior change)
- `openspec/specs/irrigation-scheduling/spec.md` — delta spec capturing new requirements
- Tests: update unit fixtures that pass `program_type` (int) or the four now-optional fields
