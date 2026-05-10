## 1. Live API Verification

- [x] 1.1 Query the live API for `controller { status { accumulatedWaterSavings } }` on an account with non-zero water savings; cross-reference the GUI to determine the unit (gallons or liters). Record the result — the field name in serializers and specs depends on it. If the dev account shows zero savings, probe the Hydrawise mobile app's API traffic to read the unit from the response envelope.
  **OUTCOME**: `accumulatedWaterSavings = 100` on dev account (Heller Tufts). No flow sensor data available to cross-reference with `reportedWaterUsage`. No GUI access. Unit **assumed gallons** for this US-based account — documented as a caveat in CLAUDE.md. Metric accounts may receive liters. Field named `accumulated_water_savings_gallons`; revisit if a flow-sensor-equipped or metric account becomes available. The lint test enforces the suffix.
- [x] 1.2 Inspect a live `status { icon }` value to determine whether it is a URL, SVG path, or a token string (e.g. `"moon"`). Document any known values in `CLAUDE.md`.
  **OUTCOME**: `status.icon = "ok.png"` — a **filename string** (e.g. `ok.png`). Not a URL (no `http`), not SVG markup. Likely matches filename convention (other values might be `moon.png`, `fault.png`, etc.). Documented in CLAUDE.md.
- [x] 1.3 On a controller with older firmware (if accessible), verify whether `Controller.settings` returns `null` (whole object missing) or `{ hibernateStatus: null }` (object present, field null). These are different null-safety paths in the serializer. If only one dev account is available, document the observed behavior and note which path is untested.
  **OUTCOME**: `settings` is non-null on dev account; `hibernateStatus = false` (concrete boolean). Only the non-null-settings/concrete-boolean path observed. Null-settings path (older firmware) is theoretically possible per schema (`settings: ControllerSettings` is nullable) but untested here. Serializer uses `settings?.hibernateStatus ?? null` to cover both null-parent and null-field paths.

## 2. GraphQL Query

- [x] 2.1 In `src/hydrawise/queries.ts` extend `CONTROLLER_FIELDS` to add `settings { hibernateStatus }` and `status { summary icon accumulatedWaterSavings }` alongside the existing top-level `status { online }` sub-selection. Note: `Controller.online: Boolean` (top-level, nullable) and `ControllerStatus.online: Boolean!` (inside `status`, non-null) are distinct fields — do NOT move the existing top-level `online` selection inside the `status` block; add `status { ... }` as a new sub-selection.
- [x] 2.2 Update the `Controller` TypeScript interface in `queries.ts` to include the `status` sub-object: `status: { online: boolean; summary: string; icon: string; accumulatedWaterSavings: number }` and `settings?: { hibernateStatus: boolean | null } | null`.

## 3. Serializer

- [x] 3.1 In `src/tools/serializers.ts`, extend `serializeController` to map: `settings?.hibernateStatus` → `hibernate_status` (boolean | null — use optional chaining for the `settings` parent, which may be null on older firmware; do NOT coerce null to false); `status.summary` → `status_summary` (no optional chaining — `ControllerStatus` is non-null per schema); `status.icon` → `status_icon`; `status.accumulatedWaterSavings` → `accumulated_water_savings_<verified-unit>` (int).
- [x] 3.2 The new suffixed field `accumulated_water_savings_<unit>` does not require any `IDENTIFIER_WHITELIST` entry — the unit suffix is what the lint test looks for, and a correctly suffixed field name already satisfies it. `hibernate_status`, `status_summary`, and `status_icon` are not numeric and are not subject to the unit-suffix lint at all. No changes to `IDENTIFIER_WHITELIST` are needed.

## 4. Snapshot

- [x] 4.1a In `src/tools/restoreRecipe.ts`, extend the `SnapshotForRecipe` interface's `controller` block to add `hibernate_status?: boolean | null`. This step MUST be done before the caveat check below — without it, TypeScript will produce a compile error on `snapshot.controller.hibernate_status` that an implementer might suppress with a cast, making the caveat silently never fire. Complete this step and verify it compiles before continuing.
- [x] 4.1b In `src/tools/restoreRecipe.ts`, update `buildRestoreCaveats()` to append a hibernation warning string when `snapshot.controller.hibernate_status === true`.
- [x] 4.2 Bump `SNAPSHOT_VERSION` from 6 to 7 in `src/tools/backup.ts`. Also rename the `ControllerSnapshotV6` interface (and its three usage sites — declaration plus two type annotations) to `ControllerSnapshotV7`.
- [x] 4.3 Verify that `dump_controller_snapshot` output contains the new controller header fields (no code changes needed if `serializeController` is called by the snapshot builder; confirm by inspection).

## 5. Tests

- [x] 5.1 In `tests/unit/serializers.test.ts`, create a new describe block for `serializeController` with a fixture where `hibernateStatus: true` and assert `hibernate_status: true`, `status_summary`, `status_icon`, and `accumulated_water_savings_<unit>` are present.
- [x] 5.2 Add two null-path fixtures: (a) `settings: null` (whole object missing → `hibernate_status: null`); (b) `settings: { hibernateStatus: null }` (object present, field null → `hibernate_status: null`). Assert both serialize to `null`, not `false`. These are different code paths.
- [x] 5.3 In `tests/integration/snapshot.test.ts`, verify that a hibernated-controller snapshot includes the hibernation caveat string in `_caveats`.
- [x] 5.4 Verify that a non-hibernated controller snapshot does NOT include the hibernation caveat.
- [x] 5.5 Run `npm test` — all tests pass (including lint-numeric-units).

## 6. Documentation

- [x] 6.1 In `CLAUDE.md`, add a gotcha: "`Controller.online` (top-level, nullable) describes Wi-Fi connectivity. `ControllerStatus.online` (inside `status { }`, non-null) is a different field. Neither indicates scheduler state. To check whether schedules are running, read `hibernate_status` (boolean) and `status_summary` (string) from `get_controller` or the snapshot."
- [x] 6.2 Update the Snapshot version history table in `CLAUDE.md`: add `v7: + hibernate_status, status_summary, status_icon, accumulated_water_savings_<unit> in controller header`.
- [ ] 6.3 Archive the `expose-controller-hibernation-status` change with `/opsx:archive` once implementation is merged.

