## 1. Live API Verification

- [ ] 1.1 Query the live API for `controller { status { accumulatedWaterSavings } }` on an account with non-zero water savings; cross-reference the GUI to determine the unit (gallons or liters). Record the result — the field name in serializers and specs depends on it.
- [ ] 1.2 Inspect a live `status { icon }` value to determine whether it is a URL, SVG path, or a token string (e.g. `"moon"`). Document any known values in `CLAUDE.md`.

## 2. GraphQL Query

- [ ] 2.1 In `src/hydrawise/queries.ts` extend `CONTROLLER_FIELDS` to add `settings { hibernateStatus }` and `status { summary icon accumulatedWaterSavings }` to the existing `status { online }` sub-selection.

## 3. Serializer

- [ ] 3.1 In `src/tools/serializers.ts`, extend `serializeController` to map: `settings?.hibernateStatus` → `hibernate_status` (boolean | null); `status.summary` → `status_summary`; `status.icon` → `status_icon`; `status.accumulatedWaterSavings` → `accumulated_water_savings_<verified-unit>` (int).
- [ ] 3.2 Add `hibernate_status`, `status_summary`, `status_icon`, and `accumulated_water_savings_<unit>` to the `IDENTIFIER_WHITELIST` or numeric suffix list in `src/tools/serializers.ts` as appropriate so the lint test passes.

## 4. Snapshot

- [ ] 4.1 In `src/tools/backup.ts`, update `buildRestoreCaveats()` (or the caveat-generation site) to append a hibernation warning string when the serialized controller has `hibernate_status === true`.
- [ ] 4.2 Bump `SNAPSHOT_VERSION` from 6 to 7 in `src/tools/backup.ts`.
- [ ] 4.3 Verify that `dump_controller_snapshot` output contains the new controller header fields (no code changes needed if `serializeController` is called; confirm by inspection).

## 5. Tests

- [ ] 5.1 In `tests/unit/serializers.test.ts`, add a fixture for `serializeController` with `hibernateStatus: true` and assert the `hibernate_status: true`, `status_summary`, `status_icon`, and `accumulated_water_savings_<unit>` fields are present.
- [ ] 5.2 Add a fixture with `hibernateStatus: null` (older firmware) and assert `hibernate_status: null` — not `false`.
- [ ] 5.3 In the snapshot integration test (or `tests/unit/backup.test.ts`), verify that a hibernated-controller snapshot includes the hibernation caveat string in `_caveats`.
- [ ] 5.4 Verify that a non-hibernated controller snapshot does NOT include the hibernation caveat.
- [ ] 5.5 Run `npm test` — all tests pass (including lint-numeric-units).

## 6. Documentation

- [ ] 6.1 In `CLAUDE.md`, add a gotcha: "`Controller.online` and `hardware_status` describe Wi-Fi connectivity, NOT scheduler state. To check whether schedules are running, read `hibernate_status` (boolean) and `status_summary` (string) from `get_controller` or the snapshot."
- [ ] 6.2 Update the Snapshot version history table in `CLAUDE.md`: add `v7: + hibernate_status, status_summary, status_icon, accumulated_water_savings_<unit> in controller header`.
- [ ] 6.3 Archive the `expose-controller-hibernation-status` change with `/opsx:archive` once implementation is merged.
