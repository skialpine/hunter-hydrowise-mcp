import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { HydrawiseAPIError } from '../errors.js';
import type { HydrawiseApi } from '../hydrawise/api.js';
import type { Logger } from '../logger.js';
import {
  serializeAdvancedProgram,
  serializeController,
  serializeProgramStartTime,
  serializeSensor,
  serializeSensorZoneRefsForZone,
  serializeStandardProgram,
  serializeUser,
  serializeWateringTriggers,
  serializeZone,
  serializeZoneSettings,
} from './serializers.js';
import { jsonResult, runTool } from './_helpers.js';

// Snapshot version bumped to 4 with ADVANCED-mode program capture: controller.advanced_programs[]
// (full inlined AdvancedProgram details — id, advanced_program_id, scope, watering_frequency,
// run_time_group, applies_to_zones) for ADVANCED-mode controllers, plus per-zone advanced_program
// reference inside settings. Combined with v3's sensor capture and v2's full STANDARD-mode coverage,
// v4 is the first restore-complete snapshot for both controller modes.
//
// Version history (informational; no migration logic — older snapshots are still readable, just
// missing newer fields):
//   v2: STANDARD-mode complete + watering triggers + zone settings, no sensors, no Advanced
//   v3: + controller.sensors[] + per-zone sensors[] cross-references
//   v4: + controller.advanced_programs[] + per-zone advanced_program reference (this version)
export const SNAPSHOT_VERSION = 4;
const PACKAGE_VERSION = '0.3.0';

// The runtime `snapshot_version` field is the version contract — the type alias is NOT.
// Don't add a `ControllerSnapshotV<old>` alias on a version bump: an alias of the new
// type to an old name doesn't preserve old callers' invariants (it gives them the new
// shape under the old name), and the next bump that actually drops a field would
// silently break consumers reading the dropped key. Bump SNAPSHOT_VERSION + this
// interface together; consumers gate behavior on the runtime number.
//
// `advanced_programs` is optional — STANDARD-mode controllers omit it (or emit empty []);
// ADVANCED-mode controllers populate it with the inlined AdvancedProgram details. Per-zone
// settings include an `advanced_program` reference only when the zone uses
// AdvancedWateringSettings (ADVANCED-mode); STANDARD-mode zones get `advanced_program: null`.
export interface ControllerSnapshotV4 {
  snapshot_version: typeof SNAPSHOT_VERSION;
  captured_at: string;
  server_version: string;
  user: Record<string, unknown>;
  controller: Record<string, unknown> & {
    zones: Array<Record<string, unknown>>;
    programs: Array<Record<string, unknown>>;
    seasonal_adjustments: { factors: number[] };
    watering_triggers: Record<string, unknown> | null;
    sensors: Array<Record<string, unknown>>;
    advanced_programs: Array<Record<string, unknown>>;
  };
}

const Input = { controller_id: z.number().int() };

export function registerBackupTools(server: McpServer, api: HydrawiseApi, logger?: Logger): void {
  server.registerTool(
    'dump_controller_snapshot',
    {
      description:
        'Snapshot one controller as a versioned JSON document (snapshot_version: 4). Captures: user, controller header (id, device_id, model, hardware, location, timezone, master valve, expanders, modules, run-time-group catalog, controller notes), zones with their writable settings (cycle/soak, monitoring observed values with units, master-valve override, zone notes, sensor cross-references, per-zone advanced_program reference for ADVANCED-mode zones, plus a _unreadable_fields array listing writable-but-not-readable field names), programs (BOTH Standard AND Advanced are now inlined with full subtype-specific detail — Standard: start_times, days_run, periodicity, per-zone run-time groups; Advanced: scope, watering_frequency, run_time_group, applies_to_zones), program start times per zone (empty for STANDARD-mode controllers; populated for ADVANCED), seasonal adjustments, watering triggers (with units captured), sensors (controller.sensors[] with full model + input + zone-association detail; per-zone sensors[] denormalised cross-references), and advanced_programs (controller.advanced_programs[] — empty on STANDARD-mode, populated on ADVANCED with inlined AdvancedProgram details). Read-only; no mutations.',
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

          const enrichedZones = zones.map((z) => {
            const summary = serializeZone(z);
            const full = settingsByZone.get(z.id);
            return {
              ...summary,
              settings: full ? serializeZoneSettings(full) : null,
              program_start_times: startsByZone.get(z.id) ?? [],
              // Per-zone sensors are derived from the controller-level sensors list rather
              // than calling getZoneSensors per-zone — same data, no extra round-trips.
              sensors: serializeSensorZoneRefsForZone(controllerSensors, z.id),
            };
          });

          const snapshot: ControllerSnapshotV4 = {
            snapshot_version: SNAPSHOT_VERSION,
            captured_at: new Date().toISOString(),
            server_version: PACKAGE_VERSION,
            user: serializeUser(user),
            controller: {
              ...serializeController(controller),
              zones: enrichedZones,
              programs: inlinedPrograms as unknown as Array<Record<string, unknown>>,
              seasonal_adjustments: { factors: seasonalAdjustments },
              watering_triggers: wateringTriggers ? serializeWateringTriggers(wateringTriggers) : null,
              sensors: controllerSensors.map(serializeSensor),
              // Empty array on STANDARD-mode controllers (no Advanced programs); populated
              // on ADVANCED-mode. Always emitted (not omitted) so consumers can rely on the
              // key existing — convention matches sensors[] above.
              advanced_programs: advancedProgramsInlined,
            },
          };
          return jsonResult(snapshot);
        },
        { logger, toolName: 'dump_controller_snapshot' },
      ),
  );
}
