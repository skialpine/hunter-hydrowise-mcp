## Why

After Phases 1–3, the snapshot captures everything needed to restore (controller config, zone settings, programs, sensors, notes, both STANDARD and ADVANCED modes). What's still missing is **the AI procedure** — the snapshot-to-restore choreography. Without explicit guidance, an AI restoring naively might:

- Apply mutations in the wrong order (e.g., reference a sensor before re-creating the custom sensor type that defines its model).
- Skip the `update_controller_program_mode` call when restoring an ADVANCED snapshot to a STANDARD-mode controller.
- Try to restore reusable schedule references that no longer exist on the account.
- Silently restore the readable fields and leave the writable-but-unreadable fields at their pre-existing values, producing a half-restored state without flagging the gap.
- Apply mutations directly without preview, surprising the user with a long sequence of physical actions.

This change adds three pieces:

1. **Embedded `_restore_recipe` block** in the snapshot envelope itself — an ordered list of the `update_*` (and `create_*`) calls the AI should make, with their full payloads pre-computed from the snapshot data. The AI's job becomes "execute this list with `preview: true` first, then ask the user, then execute with `preview: false`."
2. **A skill file** (`.claude/skills/restore-irrigation-backup.md`) — the Claude Code procedure that loads when the user asks to restore. Documents the workflow, the order, the conflict-handling rules, and what the AI should do when `_unreadable_fields` is non-empty.
3. **Round-trip integration tests** — capture a snapshot from a fake API state, replay every recipe step with `preview: true`, assert no drift. This catches gaps where the snapshot captures a field the matching `update_*` tool can't accept (or vice-versa).

## What Changes

- Snapshot envelope grows a top-level `_restore_recipe` array containing ordered restore steps. Each step has shape: `{ order: int, tool: string, args: { ... }, depends_on: [order...], notes: "optional rationale or caveat" }`.
- Snapshot envelope grows a top-level `_caveats` array — strings naming known restore limitations affecting this snapshot (e.g., "snapshot references reusable_schedule_id 17, which is account-managed; restore will fail if it no longer exists").
- New skill file: `.claude/skills/restore-irrigation-backup.md` — the AI procedure for orchestrating restore from a snapshot file.
- Round-trip integration test in `tests/integration/snapshot-roundtrip.test.ts`: stand up a fake API, capture a snapshot, replay each `_restore_recipe` step with `preview: true`, assert each step's planned variables match what the snapshot says.
- CLAUDE.md "Restore-from-backup" section expanded to document the recipe pattern and link to the skill.

## Capabilities

### Modified Capabilities
- `irrigation-backup`: snapshot envelope grows `_restore_recipe` and `_caveats` blocks at the top level.

## Impact

- `src/tools/backup.ts`: extend `dump_controller_snapshot` to compute and emit the recipe block. The recipe builder is a pure function over the captured snapshot data.
- `src/tools/serializers.ts`: a new `buildRestoreRecipe(snapshot)` helper that walks the snapshot and outputs the ordered tool-call list.
- `src/tools/backup.ts`: `_caveats` populated from a fixed checklist (reusable_schedule_id presence, custom sensor type presence, `_unreadable_fields` presence per zone, etc.).
- `.claude/skills/restore-irrigation-backup.md`: new file describing the AI workflow.
- `tests/integration/snapshot-roundtrip.test.ts`: new test file.
- `tests/unit/restoreRecipe.test.ts`: unit tests for the recipe builder.
- CLAUDE.md updated.
- No new MCP tools — the recipe is data the AI consumes, not a new interface.

This phase is the smallest of the four: ~½ day. It depends on Phases 1+2+3 being complete (the recipe needs to know about every restorable category).
