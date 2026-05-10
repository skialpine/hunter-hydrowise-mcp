## 1. GraphQL mutation + API wrapper

- [x] 1.1 Add `UPDATE_ZONE_STANDARD_MUTATION` string to `src/hydrawise/queries.ts` with all 16 args from `updateZoneStandard`
- [x] 1.2 Add `ZoneStandardUpdateInput` TypeScript type to `src/hydrawise/queries.ts` (camelCase, matching the mutation args)
- [x] 1.3 Add `updateZoneStandard(input: ZoneStandardUpdateInput): Promise<Zone>` method to `HydrawiseApi` in `src/hydrawise/api.ts`

## 2. MCP tool

- [x] 2.1 Add `UpdateZoneStandardInput` Zod schema in `src/tools/scheduling.ts` with all required + optional fields, suffixed naming convention, and `.describe()` annotations for every numeric field
- [x] 2.2 Register `update_zone_standard` tool in `src/tools/scheduling.ts` using `runTool` / `previewOrApply`, dispatching `api.updateZoneStandard()`
- [x] 2.3 Update `update_zone_settings` description to clarify it is for ADVANCED-mode controllers only and reference `update_zone_standard`

## 3. Restore recipe builder

- [x] 3.1 In `src/tools/restoreRecipe.ts` per-zone settings loop (step 4), branch on `c.program_mode === 'STANDARD'` to emit `update_zone_standard` args (STANDARD-field subset only)
- [x] 3.2 Ensure the ADVANCED / fallback branch continues to emit `update_zone_settings` unchanged
- [x] 3.3 Update `ALL_TOOL_NAMES` list in `restoreRecipe.ts` (or equivalent exhaustive list) to include `'update_zone_standard'`

## 4. Unit tests

- [x] 4.1 Add unit test: `update_zone_standard` Zod schema accepts all required fields and preview mode returns `{ preview: true, operation: "updateZoneStandard", variables: {...} }`
- [x] 4.2 Add unit test: Zod rejects ADVANCED-only fields (`watering_mode`, `watering_type`, `watering_frequency_mode`)
- [x] 4.3 Add unit test: `buildRestoreRecipe` — STANDARD-mode snapshot produces `update_zone_standard` zone steps; ADVANCED-mode produces `update_zone_settings` zone steps

## 5. Integration test

- [x] 5.1 In `tests/integration/snapshot-roundtrip.test.ts`, add a STANDARD-mode fixture (or parameterize existing) so the recipe round-trip asserts `tool === 'update_zone_standard'` for zone steps when `program_mode === 'STANDARD'`

## 6. Documentation

- [x] 6.1 Update CLAUDE.md `### Scheduling` tool list to include `update_zone_standard` and note the STANDARD vs ADVANCED tool split
- [x] 6.2 Update `### Controller config` or the Gotchas section if any relevant notes arise during implementation
