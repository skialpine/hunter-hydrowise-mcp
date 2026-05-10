## Context

Hydrawise mutations are full-payload-replace. There are no PATCH semantics upstream — changing one field in a `StandardProgram` means re-sending `zoneRunTimes[]` for every zone, the day pattern, the program name, and all other fields. The existing MCP tools (`update_standard_program`, `update_zone_settings`, `update_zone_standard`) faithfully reflect this: callers supply the complete payload.

For LLM-driven workflows, this creates three costs (from the issue):

1. **Permission-gate suspicion** — a 200-field mutation looks like a wholesale rewrite, not a targeted change, so confirmation prompts fire repeatedly.
2. **Display artifact noise** — permission UIs render nested objects as `[object Object]`, which looks broken even when JSON is correct.
3. **Clobber risk** — a mis-read, mis-counted, or stale payload silently corrupts adjacent settings.

The full-payload tools must stay — the restore-recipe playbook depends on them. The patch tools sit above them as the preferred LLM-facing API for incremental edits.

## Goals / Non-Goals

**Goals:**

- 5 new patch tools that each internalize the read-merge-write cycle
- Each tool exposes only the field(s) the caller cares about
- Each tool returns `{ before, after }` for the modified field(s)
- Preview support (`preview: true`) consistent with existing write tools
- Both STANDARD-mode and ADVANCED-mode zones handled automatically for zone-level tools
- Integration tests cover round-trip fidelity, preview-without-dispatch, and error propagation

**Non-Goals:**

- No new GraphQL queries or schema changes — patch tools reuse existing api methods
- No changes to existing `update_*` tools
- No tool-to-tool MCP calls — patch tools call `HydrawiseApi` methods directly
- No exhaustive patch coverage for every field — only the 5 high-value cases from the issue

## Decisions

### 1. Single new file `src/tools/patch.ts`

All 5 patch tools live in one file. They share the `PatchResult` response shape and the get-merge-write helper pattern. Keeping them separate from `scheduling.ts` avoids growing that file further and makes the boundary explicit: `scheduling.ts` = full-payload tools, `patch.ts` = focused incremental tools.

Alternatives considered: adding to `scheduling.ts` directly (would grow the file past ~700 lines and mix abstraction levels), or one file per tool (too granular for 5 closely-related tools).

### 2. Response shape: `PatchResult`

```typescript
interface PatchResult<T> {
  before: T;
  after: T;
  preview: boolean;
  planned_call?: { tool: string; variables: Record<string, unknown> };
}
```

`before` and `after` contain only the field(s) the patch tool modified — not the full payload. `planned_call` is included when `preview: true`, matching the pattern `previewOrApply` already uses. Callers can verify intent by inspecting `before` and `after` without reading a 200-field object.

### 3. Read-merge-write uses api methods directly

Patch tools call `api.getProgram()`, `api.getZoneSettings()`, etc. directly — not by invoking other MCP tools. Tool-to-tool calls create coupling, error-propagation ambiguity, and don't work in the preview path (which short-circuits before dispatch). The `HydrawiseApi` instance is already accessible in the tool registration closure.

### 4. Mode detection for zone-level patch tools

`update_zone_cycle_soak` and `update_zone_watering_adjustment` must dispatch to either `updateZoneAdvanced` (ADVANCED mode) or `updateZoneStandard` (STANDARD mode). The dispatch key is `controller.programMode`. Both tools will:

1. Read zone full settings via `api.getZoneSettings(zone_id)` — this returns a controller-annotated response including `program_mode`.
2. Dispatch to the appropriate mutation based on `program_mode`.
3. For STANDARD-mode dispatch: the `icon` field is required upstream. The serialized zone settings include `icon`; if somehow absent the tool throws `ConfigError` with a clear message rather than passing `null` (which would trigger a `business` error from Hydrawise).

This eliminates the mode-awareness burden from callers entirely.

### 5. `update_zone_run_time_in_program` takes `zone_id`, not `zone_number`

The issue's draft used `zone_number`, but `zone_id` is unambiguous and lets the implementation resolve both the zone number (for `zone_run_times` key lookup) and the controller_id in a single `api.getZone()` call. Controllers are scoped by `controller_id` in `api.getProgram()`, so both IDs are needed; deriving them from `zone_id` is cleaner than requiring callers to supply three identifiers.

### 6. `update_program_start_times` scope is per-program bulk-replace

The tool reads all existing `ProgramStartTime` records for every zone in the program, then updates them so the resulting set of start times matches the supplied `start_times: string[]` list. Existing records are updated in-place (up to the count of supplied times); excess existing records are deleted; missing records are created. This full-replace semantics is called out in the tool description to avoid surprises.

### 7. `update_program_day_pattern` requires both day-pattern args

The caller supplies `standard_program_day_pattern` (the mode enum: `"dow"`, `"even"`, `"odd"`, `"interval"`) and `day_pattern` (the 7-char bitmap for `"dow"` mode, ignored by the API for other modes). Both are required to avoid the tool having to infer or preserve one from the stale read — the tool still reads the full program to get the unchanged fields, but the caller is explicit about both pattern fields.

## Risks / Trade-offs

**Read-then-write race** → Any write that occurs between the patch tool's read and write call could be silently overwritten. This is inherent to the full-payload-replace API and is the same risk the full-payload tools carry. Mitigation: the before/after diff in the response lets callers verify the mutation matched intent; callers can retry if needed.

**`getZoneSettings` cost for zone-level tools** → Each zone-level patch call reads the full zone settings (one GraphQL query) before writing. For the common single-zone case this is negligible. Mitigation: document in tool descriptions that a read occurs before each write.

**`update_program_start_times` complexity** → The bulk start-time replacement requires multiple mutations (update + potentially create/delete per zone). If any mutation in the sequence fails, state is partially applied. Mitigation: the tool runs preview first (callers are encouraged to use `preview: true`), and the failure message reports which operation failed and which zones were already updated.

**`updateStandardProgram` rejects active-zone programs** → This is the same constraint the full-payload tool carries. `update_zone_run_time_in_program` inherits it. Mitigation: propagate the upstream error message verbatim so callers know why.

## Migration Plan

No migration required. Patch tools are additive; existing tools and their schemas are unchanged. Registration in `server.ts` is additive.

## Open Questions

None blocking implementation.
