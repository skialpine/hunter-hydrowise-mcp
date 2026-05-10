## Why

Hydrawise mutations are full-payload-replace — changing one zone's run time requires sending the entire program payload back. When an LLM sends a 200-field mutation to change one value, permission gates can't distinguish targeted intent from wholesale rewrite, causing repeated confirmation friction and raising the risk of accidentally clobbering adjacent settings.

## What Changes

- Add 5 new patch tools to `irrigation-scheduling` that each perform a focused read-merge-write internally, exposing only the fields the caller cares about
- Each patch tool returns a `{ before, after }` diff for the modified field(s) so the AI and user can verify intent
- All patch tools support `preview: true` consistent with existing write-tool conventions
- The full-payload `update_*` tools are unchanged — they remain necessary for restore-recipe playback

## Capabilities

### New Capabilities

- `irrigation-patch-tools`: Focused read-merge-write patch tools for common incremental edits — `update_zone_run_time_in_program`, `update_program_day_pattern`, `update_program_start_times`, `update_zone_cycle_soak`, `update_zone_watering_adjustment`

### Modified Capabilities

- `irrigation-scheduling`: Tool catalog gains the 5 patch tools described above; description conventions and preview behavior already established there apply here too

## Impact

- New file: `src/tools/patch.ts` (patch tools implementation)
- `src/server.ts` registers the new tools from `patch.ts`
- CLAUDE.md updated with patch-vs-full-payload distinction
- New integration tests in `tests/integration/`
- No schema changes, no new GraphQL queries beyond what existing tools already use
