## 1. Zod schema changes (scheduling.ts)

- [x] 1.1 In `StandardProgramBaseShape`, rename `program_type: z.number().int()` to `scheduling_method: z.number().int()` and update `.describe()` to: `'Hydrawise scheduling-method int (e.g. 3 = Standard); matches the scheduling_method field returned by get_program.'`
- [x] 1.2 In `StandardProgramBaseShape`, change `interval_days` to `.nullable().optional()` and update `.describe()` to note it is only meaningful when `standard_program_day_pattern == "interval"`.
- [x] 1.3 In `StandardProgramBaseShape`, change `series_start_epoch_seconds` to `.nullable().optional()` and update `.describe()` to note it is only meaningful in `"interval"` mode.
- [x] 1.4 In `StandardProgramBaseShape`, change `valid_from_epoch_seconds` to `.nullable().optional()` and update `.describe()` to say `'Program valid-from date as Unix timestamp in seconds; null means no start bound.'`
- [x] 1.5 In `StandardProgramBaseShape`, change `valid_to_epoch_seconds` to `.nullable().optional()` and update `.describe()` to say `'Program valid-to date as Unix timestamp in seconds; null means no end bound.'`
- [x] 1.6 Append to the `get_program` tool description: `'Returns periodicity: null when standard_program_day_pattern is "dow", "odd", or "even" — periodicity is only meaningful in "interval" mode.'`

## 2. TypeScript interface changes (queries.ts)

- [x] 2.1 In `StandardProgramWritable`, rename `program_type: number` to `scheduling_method: number`.
- [x] 2.2 In `StandardProgramWritable`, change `interval_days: number | null` to `interval_days?: number | null`.
- [x] 2.3 In `StandardProgramWritable`, change `series_start_epoch_seconds: number | null` to `series_start_epoch_seconds?: number | null`.
- [x] 2.4 In `StandardProgramWritable`, change `valid_from_epoch_seconds: number | null` to `valid_from_epoch_seconds?: number | null`.
- [x] 2.5 In `StandardProgramWritable`, change `valid_to_epoch_seconds: number | null` to `valid_to_epoch_seconds?: number | null`.

## 3. GraphQL variable translator (api.ts)

- [x] 3.1 In `standardProgramToVars`, rename `programType: p.program_type` to `programType: p.scheduling_method`.
- [x] 3.2 In `standardProgramToVars`, coalesce optional fields: `interval: p.interval_days ?? null`, `seriesStart: p.series_start_epoch_seconds ?? null`, `validFrom: p.valid_from_epoch_seconds ?? null`, `validTo: p.valid_to_epoch_seconds ?? null`.

## 4. Recipe builder changes (restoreRecipe.ts)

- [x] 4.1 In `buildRestoreRecipe`, rename the recipe step arg from `program_type: null` to `scheduling_method: null` (the recipe emits null because the int is not in the snapshot; AI merges from `get_program`).
- [x] 4.2 Update the recipe step `notes` string: replace `"program_type"` with `"scheduling_method"` in the merge instructions.

## 5. Test updates

- [x] 5.1 In `tests/integration/snapshot-roundtrip.test.ts`, rename `program_type: 1` to `scheduling_method: 1` in the roundtrip test fixture that simulates the AI merging live state before calling `update_standard_program`.
- [x] 5.2 Search for any other test fixtures that pass `program_type` as an integer to `update_standard_program` or `create_standard_program` and rename to `scheduling_method`.
- [x] 5.3 Run `npm test` and confirm all tests pass.

## 6. Typecheck and lint

- [x] 6.1 Run `npm run typecheck` and fix any type errors from the rename.
- [x] 6.2 Run `npm run lint` and fix any lint warnings.
