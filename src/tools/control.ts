import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HydrawiseApi } from '../hydrawise/api.js';
import type { Logger } from '../logger.js';
import { jsonResult, pickSuspendUntil, resolveUntil, runTool } from './_helpers.js';

const StartZoneInput = {
  zone_id: z.number().int(),
  minutes: z.number().int().min(0).optional(),
  learn_current_from_next_run: z.boolean().optional(),
  learn_flow_from_next_run: z.boolean().optional(),
};

const StopZoneInput = { zone_id: z.number().int() };

const StartAllZonesInput = {
  controller_id: z.number().int(),
  minutes: z.number().int().min(0).optional(),
  learn_current_from_next_run: z.boolean().optional(),
  learn_flow_from_next_run: z.boolean().optional(),
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

export function registerControlTools(server: McpServer, api: HydrawiseApi, logger?: Logger): void {
  const wrap = (toolName: string, fn: () => Promise<ReturnType<typeof jsonResult>>) =>
    runTool(fn, { logger, toolName });

  server.registerTool(
    'start_zone',
    {
      description: `${PHYSICAL} starts watering on a single zone. Optional 'minutes' (default: zone's configured run length). New runs are stacked behind any in-progress run. Optional 'learn_current_from_next_run' / 'learn_flow_from_next_run' tell the controller to observe and remember the zone's electrical current / water flow during this run.`,
      inputSchema: StartZoneInput,
    },
    async ({ zone_id, minutes, learn_current_from_next_run, learn_flow_from_next_run }) =>
      wrap('start_zone', async () => {
        const seconds = minutes && minutes > 0 ? minutes * 60 : 0;
        return jsonResult(
          await api.startZone(zone_id, {
            durationSeconds: seconds,
            learnCurrentFromNextRun: learn_current_from_next_run,
            learnFlowFromNextRun: learn_flow_from_next_run,
          }),
        );
      }),
  );

  server.registerTool(
    'stop_zone',
    {
      description: `${PHYSICAL} stops any in-progress run on a single zone.`,
      inputSchema: StopZoneInput,
    },
    async ({ zone_id }) =>
      wrap('stop_zone', async () => jsonResult(await api.stopZone(zone_id))),
  );

  server.registerTool(
    'start_all_zones',
    {
      description: `${PHYSICAL} starts every zone on the given controller. Optional 'minutes' applies to every zone (default: each zone's configured run length). Optional 'learn_current_from_next_run' / 'learn_flow_from_next_run' tell the controller to observe and remember per-zone electrical current / water flow during this run.`,
      inputSchema: StartAllZonesInput,
    },
    async ({ controller_id, minutes, learn_current_from_next_run, learn_flow_from_next_run }) =>
      wrap('start_all_zones', async () => {
        const seconds = minutes && minutes > 0 ? minutes * 60 : 0;
        return jsonResult(
          await api.startAllZones(controller_id, {
            durationSeconds: seconds,
            learnCurrentFromNextRun: learn_current_from_next_run,
            learnFlowFromNextRun: learn_flow_from_next_run,
          }),
        );
      }),
  );

  server.registerTool(
    'stop_all_zones',
    {
      description: `${PHYSICAL} stops any in-progress run on every zone of the given controller.`,
      inputSchema: StopAllZonesInput,
    },
    async ({ controller_id }) =>
      wrap('stop_all_zones', async () => jsonResult(await api.stopAllZones(controller_id))),
  );

  server.registerTool(
    'suspend_zone',
    {
      description: `${PHYSICAL} suspends the schedule for a single zone. Provide exactly one of 'days' (relative, days from now) or 'until' (absolute ISO-8601 timestamp).`,
      inputSchema: SuspendZoneInput,
    },
    async ({ zone_id, days, until }) =>
      wrap('suspend_zone', async () => {
        const target = resolveUntil(pickSuspendUntil(days, until));
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
      wrap('resume_zone', async () => jsonResult(await api.resumeZone(zone_id))),
  );

  server.registerTool(
    'suspend_all_zones',
    {
      description: `${PHYSICAL} suspends every zone on the given controller. Provide exactly one of 'days' or 'until'.`,
      inputSchema: SuspendAllZonesInput,
    },
    async ({ controller_id, days, until }) =>
      wrap('suspend_all_zones', async () => {
        const target = resolveUntil(pickSuspendUntil(days, until));
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
      wrap('resume_all_zones', async () => jsonResult(await api.resumeAllZones(controller_id))),
  );
}
