import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HydrawiseApi } from '../hydrawise/api.js';
import { jsonResult, resolveUntil, runTool } from './_helpers.js';

const StartZoneInput = {
  zone_id: z.number().int(),
  minutes: z.number().int().min(0).optional(),
};

const StopZoneInput = { zone_id: z.number().int() };

const StartAllZonesInput = {
  controller_id: z.number().int(),
  minutes: z.number().int().min(0).optional(),
};

const StopAllZonesInput = { controller_id: z.number().int() };

const SuspendZoneInput = {
  zone_id: z.number().int(),
  days: z.number().int().min(1).optional(),
  until: z.string().optional(),
};

const ResumeZoneInput = { zone_id: z.number().int() };

const SuspendAllZonesInput = {
  controller_id: z.number().int(),
  days: z.number().int().min(1).optional(),
  until: z.string().optional(),
};

const ResumeAllZonesInput = { controller_id: z.number().int() };

const PHYSICAL = 'PHYSICAL ACTION:';

export function registerControlTools(server: McpServer, api: HydrawiseApi): void {
  server.registerTool(
    'start_zone',
    {
      description: `${PHYSICAL} starts watering on a single zone. Optional 'minutes' (default: zone's configured run length). New runs are stacked behind any in-progress run rather than replacing it.`,
      inputSchema: StartZoneInput,
    },
    async ({ zone_id, minutes }) =>
      runTool(async () => {
        const seconds = minutes && minutes > 0 ? minutes * 60 : 0;
        const result = await api.startZone(zone_id, { durationSeconds: seconds });
        return jsonResult(result);
      }),
  );

  server.registerTool(
    'stop_zone',
    {
      description: `${PHYSICAL} stops any in-progress run on a single zone.`,
      inputSchema: StopZoneInput,
    },
    async ({ zone_id }) =>
      runTool(async () => jsonResult(await api.stopZone(zone_id))),
  );

  server.registerTool(
    'start_all_zones',
    {
      description: `${PHYSICAL} starts every zone on the given controller. Optional 'minutes' applies to every zone (default: each zone's configured run length).`,
      inputSchema: StartAllZonesInput,
    },
    async ({ controller_id, minutes }) =>
      runTool(async () => {
        const seconds = minutes && minutes > 0 ? minutes * 60 : 0;
        const result = await api.startAllZones(controller_id, { durationSeconds: seconds });
        return jsonResult(result);
      }),
  );

  server.registerTool(
    'stop_all_zones',
    {
      description: `${PHYSICAL} stops any in-progress run on every zone of the given controller.`,
      inputSchema: StopAllZonesInput,
    },
    async ({ controller_id }) =>
      runTool(async () => jsonResult(await api.stopAllZones(controller_id))),
  );

  server.registerTool(
    'suspend_zone',
    {
      description: `${PHYSICAL} suspends the schedule for a single zone. Provide exactly one of 'days' (relative, days from now) or 'until' (absolute ISO-8601 timestamp).`,
      inputSchema: SuspendZoneInput,
    },
    async ({ zone_id, days, until }) =>
      runTool(async () => {
        const target = resolveUntil(days, until);
        return jsonResult(await api.suspendZone(zone_id, target));
      }),
  );

  server.registerTool(
    'resume_zone',
    {
      description: `${PHYSICAL} clears any active suspension on a single zone.`,
      inputSchema: ResumeZoneInput,
    },
    async ({ zone_id }) =>
      runTool(async () => jsonResult(await api.resumeZone(zone_id))),
  );

  server.registerTool(
    'suspend_all_zones',
    {
      description: `${PHYSICAL} suspends every zone on the given controller. Provide exactly one of 'days' or 'until'.`,
      inputSchema: SuspendAllZonesInput,
    },
    async ({ controller_id, days, until }) =>
      runTool(async () => {
        const target = resolveUntil(days, until);
        return jsonResult(await api.suspendAllZones(controller_id, target));
      }),
  );

  server.registerTool(
    'resume_all_zones',
    {
      description: `${PHYSICAL} clears any active suspension on every zone of the given controller.`,
      inputSchema: ResumeAllZonesInput,
    },
    async ({ controller_id }) =>
      runTool(async () => jsonResult(await api.resumeAllZones(controller_id))),
  );
}
