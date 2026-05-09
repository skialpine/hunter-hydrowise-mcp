import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HydrawiseApi } from '../hydrawise/api.js';
import {
  serializeController,
  serializeProgramStartTime,
  serializeUser,
  serializeWateringTriggers,
  serializeZone,
  serializeZoneSettings,
} from './serializers.js';
import { jsonResult, runTool } from './_helpers.js';

const SNAPSHOT_VERSION = 1;
const PACKAGE_VERSION = '0.2.0';

const Input = { controller_id: z.number().int() };

export function registerBackupTools(server: McpServer, api: HydrawiseApi): void {
  server.registerTool(
    'dump_controller_snapshot',
    {
      description:
        'Snapshot one controller as a versioned JSON document — user, controller header, zones with ' +
        'their writable settings, programs (with `program_type` discriminator), program start times ' +
        'per zone, seasonal adjustments, and watering triggers. Read-only; no mutations.',
      inputSchema: Input,
    },
    async ({ controller_id }) =>
      runTool(async () => {
        const user = await api.getUser();
        const controller = await api.getController(controller_id);
        if (!controller) {
          return jsonResult({ error: `controller ${controller_id} not found` });
        }

        const zones = await api.getZones(controller_id);

        const [zoneSettings, programs, seasonalAdjustments, wateringTriggers, startTimesByZone] =
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

        return jsonResult({
          snapshot_version: SNAPSHOT_VERSION,
          captured_at: new Date().toISOString(),
          server_version: PACKAGE_VERSION,
          user: serializeUser(user),
          controller: {
            ...serializeController(controller),
            zones: enrichedZones,
            programs,
            seasonal_adjustments: { factors: seasonalAdjustments },
            watering_triggers: wateringTriggers ? serializeWateringTriggers(wateringTriggers) : null,
          },
        });
      }),
  );
}
