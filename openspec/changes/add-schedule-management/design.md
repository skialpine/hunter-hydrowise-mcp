## Context

The v1 server (change `init-hydrowise-mcp`, shipped) exposes 13 tools — read-only status plus runtime control (start/stop) and suspensions. It does *not* let the user change the actual schedule (run durations, frequencies, start times, seasonal modifiers). The user wants two things in this change:

1. A **snapshot/backup** tool that exports their account state to a JSON document.
2. The ability to **rewrite their schedule** through MCP — i.e., have an AI read current state, propose changes ("water 20% less while we're traveling"), and apply them.

We previously discussed and agreed: **don't build a monolithic `restore_from_backup` tool**. Instead, expose the schedule state as paired `get_*` / `update_*` tools so the AI can diff a backup against current state and call the matching write tool per category. This is more LLM-native, reduces the failure surface (no opaque "restore everything" path), and the same write tools support both restore and ad-hoc rewrite use cases.

Hydrawise's GraphQL schema supports this directly: `updateZone`, `updateSeasonalAdjustments`, `updateProgramStartTime`, `updateWateringTriggers` all exist with full-replace semantics. We do **not** have to invent a delta layer — we just expose typed wrappers.

## Goals / Non-Goals

**Goals:**
- Ship one new MCP tool, `dump_controller_snapshot`, that takes a `controller_id` and returns a complete-as-possible JSON snapshot of that controller's readable state.
- Add read tools for the schedule artifacts a snapshot needs (zone watering settings, programs list, individual program detail, program start times, seasonal adjustments, watering triggers).
- Add the matching write tools — full CRUD for the things an AI can sensibly rewrite end-to-end:
  - `update_zone_settings`
  - `update_seasonal_adjustments`
  - Program start times: `create_*`, `update_*`, `delete_*`
  - Standard programs: `create_*`, `update_*`, `delete_*`
  - Watering programs (Time / Smart / Virtual-Solar-Sync): `create_*` (subtype-specific or discriminated), `update_*`, `delete_*`
  - `update_watering_triggers`
- Every write tool supports a `preview` mode that returns the GraphQL it would send, without executing.
- Mark every write tool's description with `PHYSICAL ACTION:` so MCP clients prompt the user.

**Non-Goals:**
- A `restore_from_backup` MCP tool. Restore is an AI workflow, not a server primitive.
- Creating or deleting zones (`createZone` / `deleteZone`). Big blast radius for what is fundamentally a wiring concern; defer.
- Sensor, weather-station, contractor, and customer-level mutations.
- Server-side scheduled snapshots. External orchestration (cron + curl, or an MCP-aware AI on a schedule) covers the use case.
- Strict client-side validation of program payload shape — we trust the upstream API to enforce constraints and surface its `summary` text to the AI on rejection.

## Decisions

### Snapshot is per-controller, returned as one JSON document
`dump_controller_snapshot(controller_id)` makes one round of API calls scoped to that controller (controller header, zones with full watering settings, programs, program start times, seasonal adjustments, watering triggers) plus a top-level `user` reference and returns the assembled object as the tool result. The AI persists it (filesystem MCP, copy-paste, etc.); the server never writes to disk. **Alternatives considered:**
- Whole-account aggregate snapshot — rejected because it conflates multiple controllers' configs in a single payload, makes diffing harder, and the Hydrawise UI itself works per-controller. AIs that need a multi-controller backup can call once per `controller_id`.
- Server writing the file under a configured path — rejected because that adds a side-effect surface, requires path validation, and conflicts with the LLM-native pattern.

### Snapshot format
A versioned envelope:
```json
{
  "snapshot_version": 1,
  "captured_at": "2026-05-09T15:00:00.000Z",
  "server_version": "0.2.0",
  "user": { "id": 356180, "name": "...", "email": "..." },
  "controller": {
    "id": 317416,
    "name": "...",
    "online": true,
    "serial_number": "...",
    "last_contact_time": "...",
    "zones": [{ "id": ..., "name": ..., "settings": { ... } }],
    "programs": [{ "id": ..., "program_type": "Standard|Time|Smart|VirtualSolarSync", ... }],
    "program_start_times": [...],
    "seasonal_adjustments": { "factors": [12 ints] },
    "watering_triggers": { ... }
  }
}
```
Note the singular `controller` (not an array). `snapshot_version: 1` lets future tools detect format and migrate. The AI uses field names (snake_case, matching our serializer convention) verbatim when calling write tools.

### Reads return the *writable* shape; writes accept the full payload
The Hydrawise GraphQL schema's read shape and write shape don't align: reads return rich objects (`SelectedOption { value, label, options }`, `LocalizedValueType { value, unit }`, the `WateringSettings` interface with deeply-nested `AdvancedProgram`), while mutations like `updateZone` / `updateWateringTriggers` / `update*WateringProgram` take flat scalars (`number: Int`, `suspendWaterRain: Float`, `fixedWateringRunTime: Int`). A "fetch current → merge user's partial → dispatch full mutation" approach inside each tool would require maintaining bi-directional translation tables between the two shapes — a quiet, brittle layer that's easy to get wrong and impossible to test exhaustively.

Instead:
- The snapshot and per-thing `get_*` tools return values in **the writable shape**, translated from the API's read shape by `src/tools/serializers.ts`. So `get_zone_settings` returns `{ number: 3, run_time: 600, ... }` not `{ number: { value: 3, label: "..." }, ... }`.
- Each `update_*` / `create_*` tool takes the **complete writable payload** as its arguments — every field its upstream mutation requires. Tools do not fetch-and-merge; they validate, optionally `preview`, and dispatch.
- The AI's workflow is: call `get_*` (or read from a snapshot it already has), copy the writable object, change the fields it wants, call `update_*` with the resulting full object. The merging happens in the model's context where the AI is already reading values, not in our code.

This is more honest with the underlying API (mutations *are* full-replace), more transparent to the AI (it sees every field it's about to write), and slightly safer (no hidden translation can corrupt unspecified fields). **Alternative considered:** the original fetch-then-merge approach — rejected after schema inspection during `/opsx:apply` revealed the read/write shape mismatch makes it more complex than helpful.

### Reads are surface-level only, not deeply nested
We do not chase every relation. Sensors, gateways, alerts, weather observations, run-event histories — none of those go in the snapshot. They aren't part of "the schedule" and they explode the payload. The snapshot is for *configuration*, not telemetry. The user can still query state via the v1 status tools.

### Every write tool has a `preview: true` mode
Argument shape: every `update_*` tool accepts an optional `preview: boolean` (default `false`). When `true`, the tool resolves the full payload (fetching current values to fill any unspecified fields), constructs the GraphQL request body, and returns it as the tool result *without* executing the mutation. The AI is expected to show this to the user, get confirmation, and re-call with `preview: false` (or `preview` omitted). **Alternative considered:** a separate `preview_update_zone_settings` tool — rejected because it doubles the tool count and forces the AI to remember a parallel naming scheme.

### `update_zone_settings` requires the full writable payload
`updateZone` requires every field, and the tool reflects that honestly: callers must pass every writable field. The expected workflow is `get_zone_settings(zone_id)` → modify in-context → `update_zone_settings({ zone_id, ...full_payload })`. Zod schemas mark each field required (with sensible types) so a missing field is surfaced as a Tool Execution Error before we contact Hydrawise.

### Field naming: snake_case at the tool boundary, camelCase at the GraphQL boundary
Same convention as v1 (`serial_number`, `last_run`). The serializer module gains entries for the new schedule fields. We stay consistent so the snapshot JSON looks uniform and the AI doesn't have to translate.

### Programs: read + full CRUD in this change
We expose `list_programs(controller_id)` (returns the unified program list with a `program_type` discriminator) and `get_program(program_id, program_type)` for full detail on one program. For writes we cover all four upstream program shapes:

- **Standard programs** — single mutation set: `create_standard_program`, `update_standard_program`, `delete_standard_program` mirroring `createStandardProgram` / `updateStandardProgram` / `deleteStandardProgram`.
- **Watering programs** (the older API path with three subtypes — Time-based, Smart-based, Virtual-Solar-Sync) — exposed as a discriminated set:
  - `update_watering_program({ program_id, program_type, ...partial })` dispatches to one of `updateTimeBasedWateringProgram` / `updateSmartBasedWateringProgram` / `updateVirtualSolarSyncWateringProgram` based on `program_type`. The tool reads the current program first to fill missing fields (full-replace semantics, same pattern as `update_zone_settings`).
  - `create_watering_program({ program_type, ...payload })` dispatches similarly to one of the three `create*WateringProgram` mutations.
  - `delete_watering_program({ program_id })` calls `removeWateringProgram`.
- **Program start times** — `create_program_start_time`, `update_program_start_time`, `delete_program_start_time` covering the full CRUD upstream surface.

This is a wide write surface and the highest-blast-radius part of the change. The mitigation is the existing safety stack: `preview: true`, `PHYSICAL ACTION:` descriptions, and the README's "snapshot first" recommendation. We do not build special validation for program payloads — Hydrawise rejects bad shapes with a `summary` we surface verbatim, and the AI can self-correct.

**Alternative considered:** keeping programs read-only and adding writes in a follow-up. Rejected per user direction: "rewriting my schedule" is the primary goal of this change, and the schedule lives in programs.

### Errors keep the v1 discipline
Every new tool routes through the same `runTool` adapter from v1. `HydrawiseAuthError` / `HydrawiseAPIError` / `HydrawiseMutationError` get surfaced as `isError: true` Tool Execution Errors with the upstream `summary` text. Zod validation failures on the new tools also become Tool Execution Errors per the 2025-11-25 spec, same as today.

### Snapshot tool also routes through `runTool`
A network failure halfway through a snapshot returns a partial-snapshot error rather than a half-populated object. We don't try to recover or retry; the AI can call again.

## Risks / Trade-offs

- **[Risk] Buggy `update_*` tool clobbers a real schedule** → Mitigation: `preview: true` mode, clear `PHYSICAL ACTION:` descriptions, and the explicit recommendation in the README to take a snapshot before any change session. We also gate any non-trivial-shape mutation (programs) behind a follow-up change with real-account validation.
- **[Risk] Read-then-write race** → If two clients edit the same zone concurrently, the second write may overwrite the first's intermediate state. Mitigation: low priority — Hydrawise has a single-user assumption per account; we document the race in the README and accept it for v2.
- **[Risk] Snapshot payload size grows unbounded with many zones/programs** → Mitigation: the snapshot stays surface-level (no deep relation traversal); we cap reads to one-controller-deep. A 16-zone home account fits comfortably in a single MCP message.
- **[Risk] Hydrawise upstream changes a mutation's required fields** → Mitigation: same as v1 — pin the upstream `pydrawise` reference in code comments, surface the API's `summary` verbatim in errors so the AI can self-correct.
- **[Risk] AI applies a destructive change without `preview`** → Mitigation: tool descriptions strongly recommend the preview flow; MCP client confirmation prompts on `PHYSICAL ACTION:` tools provide a second gate; the user can always rollback by re-applying the snapshot's prior values.
- **[Trade-off] No program editing in this change** → Limits "schedule rewrite" to per-zone settings + start times + seasonal factors. Most realistic adjustments fit; full program restructuring (changing which zones are in which program) is a follow-up.
- **[Trade-off] Preview returns the GraphQL request body, not a human-readable diff** → The AI can read GraphQL fine and translate it for the user; building a richer diff format would be over-engineering for v1.
- **[Trade-off] AI must send the full writable payload on every `update_*` call** → A few extra fields per call. The AI already has them in context from a recent `get_*` or snapshot; the cost is negligible and the transparency is a feature.

## Migration Plan

Additive change with no breaking modifications. New tools live in two new capabilities (`irrigation-backup`, `irrigation-scheduling`). No env-var changes, no transport changes. Bumping `package.json` version to `0.2.0` to signal the new tool surface. Rollback: `git revert` the implementation commits; the v1 13 tools continue to work.

## Open Questions

- ~~Full program editing in this change?~~ **Yes** — covered by the program-CRUD section above.
- ~~Per-controller vs. whole-account snapshot?~~ **Per-controller** — `dump_controller_snapshot(controller_id)`.
- ~~Server-side scheduled snapshots?~~ **No** — defer; external `cron` + `curl` (or an AI on a schedule) handles this.
- For watering programs, the upstream schema has both `WateringProgram` (three subtypes) and `StandardProgram`. Real-account inspection during `/opsx:apply` will determine which subtype(s) the user actually uses; if only Standard, we ship the watering-program write tools but mark them less-tested in the README.
- Should `update_zone_settings` reject when the requested change would push a value into a clearly-invalid range (e.g. `runTime > 24h`)? Default: no — let upstream validate and surface its error verbatim. Avoids us getting validation rules wrong.
