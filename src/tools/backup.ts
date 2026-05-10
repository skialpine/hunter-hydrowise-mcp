import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { HydrawiseAPIError } from '../errors.js';
import type { HydrawiseApi } from '../hydrawise/api.js';
import type { ControllerNoteRead, ZoneNoteRead } from '../hydrawise/queries.js';
import type { Logger } from '../logger.js';
import {
  serializeAdvancedProgram,
  serializeController,
  serializeNote,
  serializeProgramStartTime,
  serializeSensor,
  serializeSensorZoneRefsForZone,
  serializeStandardProgram,
  serializeUser,
  serializeWateringTriggers,
  serializeZone,
  serializeZoneSettings,
} from './serializers.js';
import {
  buildRestoreCaveats,
  buildRestoreRecipe,
  type RestoreStep,
  type SnapshotForRecipe,
} from './restoreRecipe.js';
import { jsonResult, runTool } from './_helpers.js';

// Snapshot version bumped to 7 with controller-status fields (hibernate_status,
// status_summary, status_icon, accumulated_water_savings) added to the controller header.
// v6 applied the unit-suffix naming convention to all fixed-unit numeric fields. Every
// numeric field whose unit is fixed now carries the unit as a name suffix (e.g.
// cycle_custom_time_minutes, inter_zone_delay_seconds, interval_days). The _restore_recipe
// args use the same suffixed names so the recipe is self-consistent. v5-and-earlier
// snapshots remain readable for inspection but their _restore_recipe args use the old
// un-suffixed names and CANNOT be replayed by this server version — use the server version
// that captured the snapshot for replay.
//
// Version history (informational; no migration logic — older snapshots are still readable):
//   v2: STANDARD-mode complete + watering triggers + zone settings, no sensors, no Advanced
//   v3: + controller.sensors[] + per-zone sensors[] cross-references
//   v4: + controller.advanced_programs[] + per-zone advanced_program reference
//   v5: + _restore_recipe[] + _caveats[] at the envelope top level
//   v6: + unit-suffix renaming convention applied across all fixed-unit numeric fields
//   v7: + hibernate_status, status_summary, status_icon, accumulated_water_savings in controller header
//   v8: + accumulated_water_savings wrapped as {value, unit} (inferred from location.country) (this version)
export const SNAPSHOT_VERSION = 8;
const PACKAGE_VERSION = '0.3.0';

// The runtime `snapshot_version` field is the version contract — the type alias is NOT.
// Don't add a `ControllerSnapshotV<old>` alias on a version bump: an alias of the new
// type to an old name doesn't preserve old callers' invariants (it gives them the new
// shape under the old name), and the next bump that actually drops a field would
// silently break consumers reading the dropped key. Bump SNAPSHOT_VERSION + this
// interface together; consumers gate behavior on the runtime number.
//
// `_restore_recipe` is always emitted (empty array on a controller with nothing to restore),
// keeping the shape stable for AI consumers that don't want to special-case empty controllers.
// `_caveats` is similarly always emitted (empty array if no warnings apply).
export interface ControllerSnapshotV8 {
  snapshot_version: typeof SNAPSHOT_VERSION;
  captured_at: string;
  server_version: string;
  user: Record<string, unknown>;
  controller: Record<string, unknown> & {
    zones: Array<Record<string, unknown>>;
    programs: Array<Record<string, unknown>>;
    seasonal_adjustments: { monthly_adjustment_percents: number[] };
    watering_triggers: Record<string, unknown> | null;
    sensors: Array<Record<string, unknown>>;
    advanced_programs: Array<Record<string, unknown>>;
    controller_notes: Array<Record<string, unknown>>;
  };
  _restore_recipe: RestoreStep[];
  _caveats: string[];
}

// controllerNotes and zoneNotes are subscription-gated on Hydrawise's side. When
// included in the shared CONTROLLER_FIELDS / ZONE_FULL_QUERY they cause a business-
// level GraphQL error that nulls the entire parent, breaking all controller queries.
// These helpers fetch notes in isolation and degrade gracefully on free accounts:
// subscription errors return [] and emit a warning; all other errors propagate.
async function fetchControllerNotesSafe(
  api: HydrawiseApi,
  controllerId: number,
  logger?: Logger,
): Promise<ControllerNoteRead[]> {
  try {
    return await api.getControllerNotes(controllerId);
  } catch (err) {
    if (
      err instanceof HydrawiseAPIError &&
      err.message.includes('Feature is not available under your subscription')
    ) {
      logger?.warn(
        'snapshot: controller notes unavailable (subscription-gated), captured as []',
        { controller_id: controllerId, error: err.message },
      );
      return [];
    }
    throw err;
  }
}

async function fetchZoneNotesSafe(
  api: HydrawiseApi,
  zoneId: number,
  logger?: Logger,
): Promise<ZoneNoteRead[]> {
  try {
    return await api.getZoneNotes(zoneId);
  } catch (err) {
    if (
      err instanceof HydrawiseAPIError &&
      err.message.includes('Feature is not available under your subscription')
    ) {
      logger?.warn(
        'snapshot: zone notes unavailable (subscription-gated), captured as []',
        { zone_id: zoneId, error: err.message },
      );
      return [];
    }
    throw err;
  }
}

const Input = { controller_id: z.number().int() };

export function registerBackupTools(server: McpServer, api: HydrawiseApi, logger?: Logger): void {
  server.registerTool(
    'dump_controller_snapshot',
    {
      description:
        'Snapshot one controller as a versioned JSON document (snapshot_version: 8). Captures: user, controller header (id, device_id, model, hardware, location, timezone, master valve, expanders, modules, run-time-group catalog, controller notes), zones with their writable settings (cycle/soak, monitoring observed values with units, master-valve override, zone notes, sensor cross-references, per-zone advanced_program reference for ADVANCED-mode zones, plus a _unreadable_fields array listing writable-but-not-readable field names), programs (BOTH Standard AND Advanced are now inlined with full subtype-specific detail), program start times per zone, seasonal adjustments, watering triggers (with units captured), sensors (controller.sensors[] with full detail; per-zone sensors[] denormalised cross-references), and advanced_programs (empty on STANDARD-mode, populated on ADVANCED with inlined AdvancedProgram details). The envelope additionally embeds `_restore_recipe` (an ordered list of {order, tool, args, depends_on, notes} restore steps the AI follows to apply this snapshot — preview each step, confirm with user, then execute) and `_caveats` (string warnings about known restore limitations: unreadable fields, custom-type id reallocation, reusable schedule references, hardware re-wiring, unit-pref drift). Use the .claude/skills/restore-irrigation-backup skill to orchestrate the restore. Read-only; no mutations.',
      inputSchema: Input,
    },
    async ({ controller_id }) =>
      runTool(
        async () => {
          const user = await api.getUser();
          const controller = await api.getController(controller_id);
          const zones = await api.getZones(controller_id);

          const [
            zoneSettings,
            programsList,
            seasonalAdjustments,
            wateringTriggers,
            startTimesByZone,
            controllerSensors,
            controllerNotes,
            zoneNotesByZone,
          ] = await Promise.all([
            Promise.all(
              zones.map(async (z) => ({ zone_id: z.id, settings: await api.getZoneFull(z.id) })),
            ),
            api.getPrograms(controller_id, true),
            api.getSeasonalAdjustments(controller_id),
            api.getWateringTriggers(controller_id),
            Promise.all(
              zones.map(async (z) => ({
                zone_id: z.id,
                start_times: (await api.getProgramStartTimesForZone(z.id)).map(
                  serializeProgramStartTime,
                ),
              })),
            ),
            // Single controller-scoped sensor fetch — per-zone sensors[] cross-references
            // are derived from this same array, so no N+1 zone-fan-out.
            api.getControllerSensors(controller_id),
            // Notes are subscription-gated; fetched separately so a business-error on
            // one field doesn't null the entire controller or zone. Subscription errors
            // fall back to []; all other errors propagate.
            fetchControllerNotesSafe(api, controller_id, logger),
            Promise.all(
              zones.map(async (z) => ({
                zone_id: z.id,
                notes: await fetchZoneNotesSafe(api, z.id, logger),
              })),
            ),
          ]);

          // Inline full program details — dispatch on program_type. Standard programs use
          // serializeStandardProgram; Advanced programs use serializeAdvancedProgram. Unknown
          // __typename values fall through to the thin list entry but emit a logger.warn so
          // a future schema addition (e.g. a third Program implementer) doesn't silently
          // produce incomplete snapshots — see CLAUDE.md note that the cached pydrawise
          // schema has historically lagged the live schema.
          //
          // The integrity check for both known subtypes: getPrograms reported this program as
          // type X, so the matching getXProgram MUST return non-null. A null means upstream
          // lied (rename mid-fetch? race?) — fail the snapshot rather than silently downgrade
          // to a thin entry the AI would mistake for "this program has no schedule details."
          // HydrawiseAPIError categorises as api_error (upstream contract violation) rather
          // than internal_error (our bug). Both messages include controller_id so users with
          // multiple controllers can pinpoint which one failed.
          const inlinedDetails = await Promise.all(
            programsList.map(async (p) => {
              if (p.program_type === 'Standard') {
                const full = await api.getStandardProgram(controller_id, p.id);
                if (!full) {
                  throw new HydrawiseAPIError(
                    `Snapshot integrity violation on controller ${controller_id}: program ${p.id} ("${p.name}") appears in list_programs as Standard but getStandardProgram returned null. The snapshot would be incomplete.`,
                  );
                }
                return { kind: 'standard' as const, payload: serializeStandardProgram(full) };
              }
              if (p.program_type === 'Advanced') {
                const full = await api.getAdvancedProgram(controller_id, p.id);
                if (!full) {
                  throw new HydrawiseAPIError(
                    `Snapshot integrity violation on controller ${controller_id}: program ${p.id} ("${p.name}") appears in list_programs as Advanced but getAdvancedProgram returned null. The snapshot would be incomplete.`,
                  );
                }
                return { kind: 'advanced' as const, payload: serializeAdvancedProgram(full) };
              }
              // Unknown program subtype — silently downgrading to thin entry would defeat the
              // integrity-guard rationale above. Warn (don't throw — partial info is better
              // than no snapshot for a brand-new schema addition the user can't avoid) so the
              // operator sees the gap in stderr and can file a tracking issue.
              logger?.warn('snapshot dump_controller_snapshot: unknown program_type, falling back to thin entry', {
                controller_id,
                program_id: p.id,
                program_name: p.name,
                program_type: p.program_type,
              });
              return null;
            }),
          );

          // controller.programs[] continues to mix Standard + Advanced inlined entries
          // (with thin fallback for unknown subtypes); controller.advanced_programs[] is
          // the dedicated Advanced-only list per the spec, useful for AI consumers that
          // want to scan just one subtype without filtering.
          const inlinedPrograms = programsList.map((thin, i) => {
            const detail = inlinedDetails[i];
            return detail?.payload ?? thin;
          });

          const advancedProgramsInlined = inlinedDetails
            .filter((d): d is { kind: 'advanced'; payload: Record<string, unknown> } => d?.kind === 'advanced')
            .map((d) => d.payload);

          const settingsByZone = new Map(zoneSettings.map((s) => [s.zone_id, s.settings]));
          const startsByZone = new Map(startTimesByZone.map((s) => [s.zone_id, s.start_times]));
          const notesByZone = new Map(zoneNotesByZone.map((r) => [r.zone_id, r.notes]));

          const enrichedZones = zones.map((z) => {
            const summary = serializeZone(z);
            const full = settingsByZone.get(z.id);
            const settings = full ? serializeZoneSettings(full) : null;
            return {
              ...summary,
              settings: settings
                ? {
                    ...settings,
                    zone_notes: (notesByZone.get(z.id) ?? []).map(serializeNote),
                  }
                : null,
              program_start_times: startsByZone.get(z.id) ?? [],
              // Per-zone sensors are derived from the controller-level sensors list rather
              // than calling getZoneSensors per-zone — same data, no extra round-trips.
              sensors: serializeSensorZoneRefsForZone(controllerSensors, z.id),
            };
          });

          const baseEnvelope: Omit<ControllerSnapshotV8, '_restore_recipe' | '_caveats'> = {
            snapshot_version: SNAPSHOT_VERSION,
            captured_at: new Date().toISOString(),
            server_version: PACKAGE_VERSION,
            user: serializeUser(user),
            controller: {
              ...serializeController(controller),
              controller_notes: controllerNotes.map(serializeNote),
              zones: enrichedZones,
              programs: inlinedPrograms as unknown as Array<Record<string, unknown>>,
              seasonal_adjustments: { monthly_adjustment_percents: seasonalAdjustments },
              watering_triggers: wateringTriggers ? serializeWateringTriggers(wateringTriggers) : null,
              sensors: controllerSensors.map(serializeSensor),
              // Empty array on STANDARD-mode controllers (no Advanced programs); populated
              // on ADVANCED-mode. Always emitted (not omitted) so consumers can rely on the
              // key existing — convention matches sensors[] above.
              advanced_programs: advancedProgramsInlined,
            },
          };

          // Compute the restore recipe + caveats as pure functions of the assembled
          // snapshot. The recipe is the AI's playbook for applying this snapshot to a
          // controller; the caveats surface known restore-side limitations that the
          // recipe can't encode mechanically (unit-pref drift, custom-type id
          // reallocation, etc.). Both are always emitted (empty arrays if nothing
          // applies) so consumers don't have to special-case missing keys.
          // The cast to SnapshotForRecipe narrows the envelope's Record-typed fields
          // — the recipe builder reads only the fields it needs and treats the rest
          // as opaque.
          const recipe = buildRestoreRecipe(baseEnvelope as unknown as SnapshotForRecipe);
          const caveats = buildRestoreCaveats(baseEnvelope as unknown as SnapshotForRecipe);

          const snapshot: ControllerSnapshotV8 = {
            ...baseEnvelope,
            _restore_recipe: recipe,
            _caveats: caveats,
          };
          return jsonResult(snapshot);
        },
        { logger, toolName: 'dump_controller_snapshot' },
      ),
  );
}
