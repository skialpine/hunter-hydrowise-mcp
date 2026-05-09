import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HydrawiseApi } from '../hydrawise/api.js';
import type { Logger } from '../logger.js';
import {
  serializeController,
  serializeProgramStartTime,
  serializeStandardProgram,
  serializeUser,
  serializeWateringTriggers,
  serializeZone,
  serializeZoneSettings,
} from './serializers.js';
import { jsonResult, runTool } from './_helpers.js';

export const SNAPSHOT_VERSION = 2;
const PACKAGE_VERSION = '0.3.0';

export interface ControllerSnapshotV2 {
  snapshot_version: typeof SNAPSHOT_VERSION;
  captured_at: string;
  server_version: string;
  user: Record<string, unknown>;
  controller: Record<string, unknown> & {
    zones: Array<Record<string, unknown>>;
    programs: Array<Record<string, unknown>>;
    seasonal_adjustments: { factors: number[] };
    watering_triggers: Record<string, unknown> | null;
  };
}

const Input = { controller_id: z.number().int() };

export function registerBackupTools(server: McpServer, api: HydrawiseApi, logger?: Logger): void {
  server.registerTool(
    'dump_controller_snapshot',
    {
      description:
        'Snapshot one controller as a versioned JSON document. Captures: user, controller header (id, device_id, model, hardware, location, timezone, master valve, expanders, modules, run-time-group catalog, controller notes), zones with their writable settings (cycle/soak, monitoring observed values with units, master-valve override, zone notes, plus a _unreadable_fields array listing writable-but-not-readable field names), programs (Standard programs are inlined with full schedule detail — start_times, days_run, periodicity, monthly_watering_adjustments, per-zone run-time groups, valid_from/to, conditional schedule adjustments), program start times per zone (empty for STANDARD-mode controllers; populated for ADVANCED), seasonal adjustments, and watering triggers (with units captured). Read-only; no mutations.',
      inputSchema: Input,
    },
    async ({ controller_id }) =>
      runTool(
        async () => {
          const user = await api.getUser();
          const controller = await api.getController(controller_id);
          const zones = await api.getZones(controller_id);

          const [zoneSettings, programsList, seasonalAdjustments, wateringTriggers, startTimesByZone] =
            await Promise.all([
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
            ]);

          // Inline StandardProgram details for every Standard program. ADVANCED programs are returned as the thin list entry only — Phase 3 will dispatch on programMode and add Advanced inlining.
          const standardPrograms = await Promise.all(
            programsList.map(async (p) => {
              if (p.program_type !== 'Standard') return null;
              const full = await api.getStandardProgram(controller_id, p.id);
              if (!full) {
                // Snapshot integrity invariant: every program returned by getPrograms with
                // program_type 'Standard' must be fetchable via getStandardProgram. A null
                // here means upstream lied (race? renamed __typename?) — fail the snapshot
                // rather than silently downgrade to a thin entry the AI would mistake for
                // "this program has no schedule details."
                throw new Error(
                  `Snapshot integrity violation: program ${p.id} ("${p.name}") appears in list_programs as Standard but getStandardProgram returned null. The snapshot would be incomplete.`,
                );
              }
              return serializeStandardProgram(full);
            }),
          );

          const inlinedPrograms = programsList.map((thin, i) => {
            const full = standardPrograms[i];
            return full ?? thin;
          });

          const settingsByZone = new Map(zoneSettings.map((s) => [s.zone_id, s.settings]));
          const startsByZone = new Map(startTimesByZone.map((s) => [s.zone_id, s.start_times]));

          const enrichedZones = zones.map((z) => {
            const summary = serializeZone(z);
            const full = settingsByZone.get(z.id);
            return {
              ...summary,
              settings: full ? serializeZoneSettings(full) : null,
              program_start_times: startsByZone.get(z.id) ?? [],
            };
          });

          const snapshot: ControllerSnapshotV2 = {
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
            },
          };
          return jsonResult(snapshot);
        },
        { logger, toolName: 'dump_controller_snapshot' },
      ),
  );
}
