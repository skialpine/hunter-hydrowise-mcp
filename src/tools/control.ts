import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HydrawiseApi } from '../hydrawise/api.js';
import type { Logger } from '../logger.js';
import { pickSuspendUntil, previewOrApply, resolveUntil, runTool } from './_helpers.js';

const PreviewInput = { preview: z.boolean().optional() };

const StartZoneInput = {
  zone_id: z.number().int(),
  minutes: z.number().int().min(0).optional(),
  learn_current_from_next_run: z.boolean().optional(),
  learn_flow_from_next_run: z.boolean().optional(),
  ...PreviewInput,
};

const StopZoneInput = { zone_id: z.number().int(), ...PreviewInput };

const StartAllZonesInput = {
  controller_id: z.number().int(),
  minutes: z.number().int().min(0).optional(),
  learn_current_from_next_run: z.boolean().optional(),
  learn_flow_from_next_run: z.boolean().optional(),
  ...PreviewInput,
};

const StopAllZonesInput = { controller_id: z.number().int(), ...PreviewInput };

const SuspendZoneInput = {
  zone_id: z.number().int(),
  days: z.number().int().min(1).optional(),
  until: z.string().optional(),
  ...PreviewInput,
};

const ResumeZoneInput = { zone_id: z.number().int(), ...PreviewInput };

const SuspendAllZonesInput = {
  controller_id: z.number().int(),
  days: z.number().int().min(1).optional(),
  until: z.string().optional(),
  ...PreviewInput,
};

const ResumeAllZonesInput = { controller_id: z.number().int(), ...PreviewInput };

const PHYSICAL = 'PHYSICAL ACTION:';

export function registerControlTools(server: McpServer, api: HydrawiseApi, logger?: Logger): void {
  const wrap = (toolName: string, fn: () => ReturnType<typeof previewOrApply>) =>
    runTool(fn, { logger, toolName });

  server.registerTool(
    'start_zone',
    {
      description: `${PHYSICAL} starts watering on a single zone. Optional 'minutes' (default: zone's configured run length). New runs are stacked behind any in-progress run. Optional 'learn_current_from_next_run' / 'learn_flow_from_next_run' tell the controller to observe and remember the zone's electrical current / water flow during this run. Pass \`preview: true\` to dry-run.`,
      inputSchema: StartZoneInput,
    },
    async ({ zone_id, minutes, learn_current_from_next_run, learn_flow_from_next_run, preview }) =>
      wrap('start_zone', async () => {
        const seconds = minutes && minutes > 0 ? minutes * 60 : 0;
        const variables = {
          zoneId: zone_id,
          markRunAsScheduled: false,
          stackRuns: true,
          customRunDuration: seconds > 0 ? seconds : null,
          learnCurrentFromNextRun: learn_current_from_next_run ?? null,
          learnFlowFromNextRun: learn_flow_from_next_run ?? null,
        };
        return previewOrApply('startZone', variables, preview, async () =>
          api.startZone(zone_id, {
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
      description: `${PHYSICAL} stops any in-progress run on a single zone. Pass \`preview: true\` to dry-run.`,
      inputSchema: StopZoneInput,
    },
    async ({ zone_id, preview }) =>
      wrap('stop_zone', async () =>
        previewOrApply('stopZone', { zoneId: zone_id }, preview, async () => api.stopZone(zone_id)),
      ),
  );

  server.registerTool(
    'start_all_zones',
    {
      description: `${PHYSICAL} starts every zone on the given controller. Optional 'minutes' applies to every zone (default: each zone's configured run length). Optional 'learn_current_from_next_run' / 'learn_flow_from_next_run' tell the controller to observe and remember per-zone electrical current / water flow during this run. Pass \`preview: true\` to dry-run.`,
      inputSchema: StartAllZonesInput,
    },
    async ({ controller_id, minutes, learn_current_from_next_run, learn_flow_from_next_run, preview }) =>
      wrap('start_all_zones', async () => {
        const seconds = minutes && minutes > 0 ? minutes * 60 : 0;
        const variables = {
          controllerId: controller_id,
          markRunAsScheduled: false,
          customRunDuration: seconds > 0 ? seconds : null,
          learnCurrentFromNextRun: learn_current_from_next_run ?? null,
          learnFlowFromNextRun: learn_flow_from_next_run ?? null,
        };
        return previewOrApply('startAllZones', variables, preview, async () =>
          api.startAllZones(controller_id, {
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
      description: `${PHYSICAL} stops any in-progress run on every zone of the given controller. Pass \`preview: true\` to dry-run.`,
      inputSchema: StopAllZonesInput,
    },
    async ({ controller_id, preview }) =>
      wrap('stop_all_zones', async () =>
        previewOrApply('stopAllZones', { controllerId: controller_id }, preview, async () =>
          api.stopAllZones(controller_id),
        ),
      ),
  );

  server.registerTool(
    'suspend_zone',
    {
      description: `${PHYSICAL} suspends the schedule for a single zone. Provide exactly one of 'days' (relative, days from now) or 'until' (absolute ISO-8601 timestamp). Pass \`preview: true\` to dry-run.`,
      inputSchema: SuspendZoneInput,
    },
    async ({ zone_id, days, until, preview }) =>
      wrap('suspend_zone', async () => {
        const target = resolveUntil(pickSuspendUntil(days, until));
        return previewOrApply(
          'suspendZone',
          { zoneId: zone_id, until: target.toISOString() },
          preview,
          async () => api.suspendZone(zone_id, target),
        );
      }),
  );

  server.registerTool(
    'resume_zone',
    {
      description: `${PHYSICAL} clears any active suspension on a single zone. Pass \`preview: true\` to dry-run.`,
      inputSchema: ResumeZoneInput,
    },
    async ({ zone_id, preview }) =>
      wrap('resume_zone', async () =>
        previewOrApply('resumeZone', { zoneId: zone_id }, preview, async () =>
          api.resumeZone(zone_id),
        ),
      ),
  );

  server.registerTool(
    'suspend_all_zones',
    {
      description: `${PHYSICAL} suspends every zone on the given controller. Provide exactly one of 'days' or 'until'. Pass \`preview: true\` to dry-run.`,
      inputSchema: SuspendAllZonesInput,
    },
    async ({ controller_id, days, until, preview }) =>
      wrap('suspend_all_zones', async () => {
        const target = resolveUntil(pickSuspendUntil(days, until));
        return previewOrApply(
          'suspendAllZones',
          { controllerId: controller_id, until: target.toISOString() },
          preview,
          async () => api.suspendAllZones(controller_id, target),
        );
      }),
  );

  server.registerTool(
    'resume_all_zones',
    {
      description: `${PHYSICAL} clears any active suspension on every zone of the given controller. Pass \`preview: true\` to dry-run.`,
      inputSchema: ResumeAllZonesInput,
    },
    async ({ controller_id, preview }) =>
      wrap('resume_all_zones', async () =>
        previewOrApply('resumeAllZones', { controllerId: controller_id }, preview, async () =>
          api.resumeAllZones(controller_id),
        ),
      ),
  );
}
