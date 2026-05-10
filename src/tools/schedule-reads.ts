import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HydrawiseApi } from '../hydrawise/api.js';
import { ConfigError } from '../errors.js';
import type { Logger } from '../logger.js';
import { jsonResult, runTool } from './_helpers.js';
import { serializeUpcomingRun } from './serializers.js';

const SEVEN_DAYS_SECONDS = 7 * 86_400;

export function resolveWindow(
  fromArg: number | undefined,
  untilArg: number | undefined,
): { from: number; until: number } {
  const now = Math.floor(Date.now() / 1000);
  if (fromArg === undefined && untilArg !== undefined && untilArg <= now) {
    throw new ConfigError('until_epoch_seconds is in the past');
  }
  const from = fromArg ?? now;
  const until = untilArg ?? from + SEVEN_DAYS_SECONDS;
  if (from >= until) {
    throw new ConfigError('from_epoch_seconds must be before until_epoch_seconds');
  }
  return { from, until };
}

const windowInput = {
  from_epoch_seconds: z
    .number()
    .int()
    .optional()
    .describe('Start of window as Unix epoch seconds (default: now)'),
  until_epoch_seconds: z
    .number()
    .int()
    .optional()
    .describe('End of window as Unix epoch seconds (default: from + 7 days)'),
};

export function registerScheduleReadsTools(
  server: McpServer,
  api: HydrawiseApi,
  logger?: Logger,
): void {
  server.registerTool(
    'get_zone_scheduled_runs',
    {
      description:
        'Return upcoming scheduled runs for a single zone within a time window. ' +
        'from_epoch_seconds defaults to now; until_epoch_seconds defaults to from + 7 days. ' +
        'Returns an empty array when no runs are scheduled in the window. ' +
        'remaining_time_seconds is seconds until the run starts (0 once the run has begun).',
      inputSchema: {
        zone_id: z.number().int(),
        ...windowInput,
      },
    },
    async ({ zone_id, from_epoch_seconds, until_epoch_seconds }) =>
      runTool(
        async () => {
          const { from, until } = resolveWindow(from_epoch_seconds, until_epoch_seconds);
          const runs = await api.getZoneRunsBetween(zone_id, from, until);
          return jsonResult(runs.map(serializeUpcomingRun));
        },
        { logger, toolName: 'get_zone_scheduled_runs' },
      ),
  );

  server.registerTool(
    'get_zone_next_run',
    {
      description:
        'Return the single next scheduled run for a zone, or null if none is scheduled. ' +
        'Cheaper than get_zone_scheduled_runs — suitable for status checks and dashboards. ' +
        'remaining_time_seconds is seconds until the run starts (0 once the run has begun).',
      inputSchema: { zone_id: z.number().int() },
    },
    async ({ zone_id }) =>
      runTool(
        async () => {
          const run = await api.getZoneNextRun(zone_id);
          return jsonResult(run ? serializeUpcomingRun(run) : null);
        },
        { logger, toolName: 'get_zone_next_run' },
      ),
  );

  server.registerTool(
    'get_controller_schedule',
    {
      description:
        'Return upcoming scheduled runs for all zones on a controller within a time window. ' +
        'Returns an array of { zone_id, zone_name, zone_number, runs[] } — one entry per zone, ' +
        'even when a zone has no runs (runs will be []). ' +
        'from_epoch_seconds defaults to now; until_epoch_seconds defaults to from + 7 days. ' +
        'remaining_time_seconds per run is seconds until the run starts (0 once the run has begun). ' +
        'Uses a single bulk query; may be slow on controllers with many zones.',
      inputSchema: {
        controller_id: z.number().int(),
        ...windowInput,
      },
    },
    async ({ controller_id, from_epoch_seconds, until_epoch_seconds }) =>
      runTool(
        async () => {
          const { from, until } = resolveWindow(from_epoch_seconds, until_epoch_seconds);
          const zones = await api.getControllerSchedule(controller_id, from, until);
          if (zones.length === 0) {
            logger?.warn('get_controller_schedule: no zones returned for controller', {
              controller_id,
            });
          }
          return jsonResult(
            zones.map((z) => ({
              zone_id: z.zoneId,
              zone_name: z.zoneName,
              zone_number: z.zoneNumber,
              runs: z.runs.map(serializeUpcomingRun),
            })),
          );
        },
        { logger, toolName: 'get_controller_schedule' },
      ),
  );
}
