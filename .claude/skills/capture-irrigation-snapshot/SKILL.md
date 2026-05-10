---
name: capture-irrigation-snapshot
description: Capture a Hydrawise controller snapshot plus the watering-history delta since the last capture. Use when the user says "back up my irrigation", "snapshot my controller", "capture irrigation state", "back up controller", or any phrasing indicating they want to persist the current Hydrawise state and accumulate watering history. Builds permanent multi-year history from per-snapshot deltas because Hydrawise itself only retains ~1 year of report data.
---

# Capture an irrigation snapshot

Persist the current Hydrawise state for one controller plus the watering-report delta since the last capture. Snapshots go into `snapshots/`; report-history deltas go into `snapshots/history/`. The combined files build permanent multi-year coverage that survives Hydrawise's ~1-year report retention.

## Trigger phrases

- "back up my irrigation"
- "snapshot my controller"
- "capture irrigation state"
- "back up controller `<id>`"
- "save the current state of controller `<id>`"

## Inputs

- **Required**: `controller_id` (the integer Hydrawise controller id; from `list_controllers`).
- **Optional**: `output_dir` (default `snapshots/` relative to repo root or current working directory).

If the user didn't specify a controller_id, call `list_controllers` first; if there's exactly one controller, use it; if multiple, ask which.

## Workflow

### 1. Capture the snapshot

- Call `dump_controller_snapshot(controller_id)`.
- The snapshot envelope (`snapshot_version: 5` or higher) embeds `_restore_recipe` and `_caveats` automatically.

### 2. Determine output paths

- Read the snapshot's `controller.name` and `controller.id` for filename composition.
- ISO timestamp: `new Date().toISOString().replace(/[:.]/g, '-')` → e.g. `2026-05-09T19-44-30-123Z`. Sortable lexically.
- Snapshot file path: `<output_dir>/<sanitized-controller-name>-<controller-id>-<ISO-timestamp>.json`
- Sanitize the controller name: lowercase, spaces → hyphens, drop non-`[a-z0-9-]` chars.
- Multi-controller accounts: the `<controller-id>` namespacing in the filename keeps captures from different controllers from colliding.

### 3. Write the snapshot

- `mkdir -p` the output directory if it doesn't exist.
- Write the snapshot JSON pretty-printed (2-space indent) for readability.

### 4. Determine the report-history delta range

- Look at `<output_dir>/history/` for prior report files matching this controller. The filename pattern is `<controller-id>-<from-date>_to_<until-date>.json`.
- If a prior file exists: the new `from` is the prior file's `until` date. The new `until` is now (today, ISO date).
- If no prior file exists: the new `from` is `1 year ago` (Hydrawise's max retention; older data is gone). The new `until` is now.
- Report-history dates use `YYYY-MM-DD` granularity (no time component) for filename readability.
- If `from >= until` (the prior history is current), skip steps 5–6 and tell the user "history is up to date".

### 5. Capture the report delta

- Call `get_watering_report(controller_id, from, until)` with ISO date strings.
- This returns the watering run log for the date range.

### 6. Write the report delta

- `mkdir -p <output_dir>/history` if it doesn't exist.
- File path: `<output_dir>/history/<controller-id>-<from-date>_to_<until-date>.json`
- Write the report JSON pretty-printed.

### 7. Report what was captured

Tell the user:

- Snapshot file path + size (bytes / KB).
- Number of `_restore_recipe` steps and `_caveats` warnings (so the user knows whether restoring this snapshot will require user attention).
- Report delta date range and number of run events captured.
- Total accumulated history coverage (sum of all `<from>_to_<until>` ranges from `<output_dir>/history/`, deduplicated; show as "X months of run history captured").
- A reminder that `snapshots/` is gitignored and lives only on this machine — they should consider syncing it to a backup location they control.

## Filename conventions (recap)

```
<output_dir>/
  <name>-<id>-<ISO-timestamp>.json                    # snapshot
  history/
    <id>-<YYYY-MM-DD>_to_<YYYY-MM-DD>.json            # report deltas
```

Sortable lexically; no collisions between controllers; ISO timestamp survives across timezone changes.

## Rationale (why this skill exists)

- **Hydrawise only retains ~1 year of watering-report data.** Beyond that, history is gone — there's no historical-archive endpoint.
- **The user wants permanent multi-year history.** Per-snapshot delta capture, accumulated locally, builds it.
- **The user explicitly rejected scheduled / cron capture.** This skill is manual, AI-mediated, and shows the user what's being captured each time. The trade-off: the user must remember to run it (suggest monthly cadence in your final report).
- **Capture before restore = savepoint.** The `restore-irrigation-backup` skill recommends running THIS skill first, so the pre-restore live state is preserved as a recovery point.

## Rules

- NEVER write outside `<output_dir>` or its `history/` subdirectory.
- NEVER overwrite an existing file. The ISO-timestamp + date-range filenames make collisions structurally impossible, but verify with `ls` before writing.
- ALWAYS pretty-print JSON (2-space indent). The files are meant to be human-inspectable.
- ALWAYS report the captured coverage so the user knows what was added.

## What this skill is NOT

- **Not the snapshot tool itself.** That's `dump_controller_snapshot`, an MCP tool. This skill orchestrates the snapshot tool plus the file-writing and the history-delta logic.
- **Not a scheduled job.** Each invocation is user-triggered.
- **Not multi-controller batch.** One controller per invocation; loop manually if you need several.
