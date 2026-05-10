import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ConfigError } from '../errors.js';
import { RUN_SUMMARY_PERIODS, WATER_SAVING_PERIODS, type HydrawiseApi } from '../hydrawise/api.js';
import type { WaterSavingSummaryRead } from '../hydrawise/queries.js';
import type { Logger } from '../logger.js';
import { jsonResult, parseUnixTimestamp, runTool, validateRunSummaryArgs } from './_helpers.js';
import { serializeRunEvent, serializeRunSummaryDetails, serializeScheduledZoneRun } from './serializers.js';

function serializeWaterSavingSummary(summary: WaterSavingSummaryRead | null): Record<string, unknown> {
  if (!summary) {
    return {
      normal_duration_minutes: null,
      scheduled_duration_minutes: null,
      savings_minutes: null,
      savings_percent: null,
    };
  }
  const { normalDuration, scheduledDuration } = summary;
  const savings_minutes = normalDuration - scheduledDuration;
  const savings_percent =
    normalDuration > 0 ? Math.round((savings_minutes / normalDuration) * 1000) / 10 : null;
  return {
    normal_duration_minutes: normalDuration,
    scheduled_duration_minutes: scheduledDuration,
    savings_minutes,
    savings_percent,
  };
}

const ControllerIdInput = { controller_id: z.number().int() };
const ZoneIdInput = { zone_id: z.number().int() };

export function registerReportingTools(server: McpServer, api: HydrawiseApi, logger?: Logger): void {
  server.registerTool(
    'get_watering_report',
    {
      description:
        'Return the watering run log for a controller over a date range. ' +
        'Each entry includes zone, program, scheduled vs. reported start/end times, ' +
        'durations (seconds), water usage, and stop reason. ' +
        'Accepts ISO-8601 date strings for from/until (e.g. "2026-05-01").',
      inputSchema: {
        ...ControllerIdInput,
        from: z.string().describe('Start of range (ISO-8601 date or datetime)'),
        until: z.string().describe('End of range (ISO-8601 date or datetime)'),
      },
    },
    async ({ controller_id, from, until }) =>
      runTool(
        async () => {
          const fromTs = parseUnixTimestamp(from);
          const untilTs = parseUnixTimestamp(until);
          const events = await api.getWateringReport(controller_id, fromTs, untilTs);
          return jsonResult(events.map(serializeRunEvent));
        },
        { logger, toolName: 'get_watering_report' },
      ),
  );

  server.registerTool(
    'get_zone_run_history',
    {
      description:
        'Return the past run history for a single zone: the most recent run as last_run ' +
        'and an array of recent runs. Each entry includes start/end times, ' +
        'normal_duration_minutes (program default), scheduled_duration_minutes (what the controller ' +
        'was told to run), actual_elapsed_seconds (computed from end-start; smaller than scheduled when ' +
        'a run was cancelled or stopped early), and status.',
      inputSchema: ZoneIdInput,
    },
    async ({ zone_id }) =>
      runTool(
        async () => {
          const history = await api.getZonePastRuns(zone_id);
          return jsonResult({
            last_run: serializeScheduledZoneRun(history.lastRun),
            runs: (history.runs ?? []).map(serializeScheduledZoneRun),
          });
        },
        { logger, toolName: 'get_zone_run_history' },
      ),
  );

  server.registerTool(
    'get_run_summary',
    {
      description:
        'Return aggregated run statistics (normal vs. actual run time and water volume) ' +
        'for a zone over a period. ' +
        'period must be one of: CURRENT_WEEK, WEEK, MONTH, YEAR. ' +
        'WEEK requires start_week (1-53), end_week, year. ' +
        'MONTH requires start_month (1-12), end_month, year. ' +
        'YEAR requires start_year, end_year. ' +
        'CURRENT_WEEK requires no extra args.',
      inputSchema: {
        ...ZoneIdInput,
        // Zod enum derived from RUN_SUMMARY_PERIODS in api.ts — single source of truth.
        period: z.enum(RUN_SUMMARY_PERIODS),
        start_week: z.number().int().optional(),
        end_week: z.number().int().optional(),
        start_month: z.number().int().optional(),
        end_month: z.number().int().optional(),
        start_year: z.number().int().optional(),
        end_year: z.number().int().optional(),
        year: z.number().int().optional(),
      },
    },
    async ({ zone_id, period, ...periodArgs }) =>
      runTool(
        async () => {
          const summaryArgs = validateRunSummaryArgs(period, periodArgs);
          const summary = await api.getZoneRunSummary(zone_id, summaryArgs);
          return jsonResult(serializeRunSummaryDetails(summary));
        },
        { logger, toolName: 'get_run_summary' },
      ),
  );

  server.registerTool(
    'get_water_saving_summary',
    {
      description:
        'Return the period-scoped water savings report for a controller. ' +
        'Reports normal_duration_minutes (what would have been delivered without predictive watering), ' +
        'scheduled_duration_minutes (what was actually scheduled), savings_minutes (the delta), ' +
        'and savings_percent. ' +
        'period must be one of: WEEK, MONTH, QUARTER, YEAR (uses ReportingPeriodEnum — no CURRENT_WEEK). ' +
        'period_number is required for WEEK (1-53), MONTH (1-12), and QUARTER (1-4); omit for YEAR. ' +
        'Returns null fields when the controller has no reporting data for the period. ' +
        'Note: water volume saved is not available through this schema path; use get_run_summary per zone for volume data. ' +
        'This is distinct from accumulated_water_savings (lifetime counter) on get_controller.',
      inputSchema: {
        ...ControllerIdInput,
        year: z.number().int().describe('Calendar year (e.g. 2026)'),
        period: z.enum(WATER_SAVING_PERIODS).describe('Reporting period: WEEK | MONTH | QUARTER | YEAR'),
        period_number: z
          .number()
          .int()
          .optional()
          .describe('Period number within the year (week 1-53, month 1-12, quarter 1-4). Required for WEEK, MONTH, QUARTER; omit for YEAR.'),
      },
    },
    async ({ controller_id, year, period, period_number }) =>
      runTool(
        async () => {
          if (period !== 'YEAR' && period_number == null) {
            throw new ConfigError(`period '${period}' requires period_number`);
          }
          const summary = await api.getWaterSavingSummary(controller_id, year, period, period_number);
          return jsonResult(serializeWaterSavingSummary(summary));
        },
        { logger, toolName: 'get_water_saving_summary' },
      ),
  );
}
