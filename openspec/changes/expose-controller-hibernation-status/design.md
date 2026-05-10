## Context

`get_controller` currently returns only fields from `CONTROLLER_FIELDS` in `queries.ts`. That set deliberately excludes `settings` and omits most of `status` — only `online: Boolean!` was wired. The result is that `hibernate_status` (Boolean, nullable), `status_summary` (human-readable e.g. "Sleeping"), `status_icon`, and `accumulated_water_savings` are invisible to MCP callers, even though they're available in the same GraphQL query at no extra round-trip cost.

`dump_controller_snapshot` builds the controller header from `serializeController` output, so any new fields wired there appear in the snapshot automatically with one caveat exception: the hibernation-caveat logic must be added explicitly to `buildRestoreCaveats()` in `backup.ts`.

The `annotate-units-on-numeric-fields` change landed (v6 snapshot) before this one. All fixed-unit numeric fields must carry a unit suffix; `accumulatedWaterSavings` is `Int!` in the schema with no unit annotation — the live API must be probed before finalizing the field name.

## Goals / Non-Goals

**Goals:**
- Wire `settings { hibernateStatus }` and `status { summary icon accumulatedWaterSavings }` into `CONTROLLER_FIELDS` so they appear in `get_controller` and `list_controllers` output.
- Serialize with the project naming convention (`hibernate_status`, `status_summary`, `status_icon`, `accumulated_water_savings_<verified-unit>`).
- Propagate automatically to the snapshot controller header via the existing `serializeController` call in `backup.ts`.
- Add a conditional caveat string when the snapshot is captured on a hibernated controller.
- Bump `SNAPSHOT_VERSION` to 7.
- Update `CLAUDE.md` gotchas.

**Non-Goals:**
- Adding a `hibernate_controller` / `wake_controller` shortcut (already exists in `controllerConfig.ts`).
- Exposing `actualWaterTime` / `normalWaterTime` (additional `ControllerStatus` sub-objects of uncertain utility — defer).
- Exposing `ControllerOfflineSettings` sub-fields (notification, seasonal adjustments — separate concern).
- Any migration of existing snapshot consumers (v6 snapshots remain readable; `snapshot_version` is informational).

## Decisions

### Unit of `accumulatedWaterSavings`

**Decision**: Probe the live API (query `controller { status { accumulatedWaterSavings } }` on an account with non-zero savings), then check whether the value correlates with gallons or liters in the GUI. Name accordingly: `accumulated_water_savings_gallons` or `accumulated_water_savings_liters`. If the unit can't be determined before implementation, block on `TODO(unit-verify)` in a follow-up rather than shipping an unsuffixed field.

**Rationale**: The naming-convention lint test (`lint-numeric-units.test.ts`) will fail on an unsuffixed `Int` field, preventing accidental shipping.

### `hibernateStatus` nullability

**Decision**: Serialize as `boolean | null` and document that `null` means "unknown / not applicable" (e.g., older firmware). Do not coerce null to false.

**Rationale**: The schema declares `hibernateStatus: Boolean` (nullable) — treating null as false would silently misrepresent the state of older controllers.

### Snapshot caveat scope

**Decision**: Add a single caveat string when `hibernate_status === true` at capture time: "Controller was hibernated when this snapshot was captured. The scheduler was not running; some live values (seasonal adjustments, sensor states) may reflect a suspended baseline. Verify actual state after waking before restoring."

**Rationale**: This is the only user-visible risk unique to hibernated captures; it's computable as a pure function of the snapshot data (no extra query needed).

## Risks / Trade-offs

- **`accumulatedWaterSavings` unit unknown** → Probe live API before naming; lint test enforces the suffix, so the build fails fast if skipped.
- **`settings { hibernateStatus }` is nullable at the type level** → If an older controller omits the field entirely, the query returns `null` not an error; serializer must not crash on null parent.
- **Adding `settings` to `CONTROLLER_FIELDS` pulls the whole `ControllerSettings` object** → Only `hibernateStatus` is selected inside `settings { ... }`, keeping the payload minimal.
- **Snapshot version bump (6 → 7)** → No migration needed; older snapshots remain readable, newer snapshots simply have additional fields and `snapshot_version: 7`.

## Open Questions

- **Exact unit of `accumulatedWaterSavings`**: must be verified against a live account that shows a non-zero water savings value in the GUI. Field name blocked until resolved.
- **`status_icon` format**: the schema says `String!` — is this an SVG path, an icon name token, a URL? Inspect a live value to confirm what callers receive. If it's a URL, the field is still useful as-is; if it's a token (e.g., `"moon"`) document the known values.
