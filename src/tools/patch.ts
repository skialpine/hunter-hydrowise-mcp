import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ConfigError } from '../errors.js';
import type { HydrawiseApi } from '../hydrawise/api.js';
import type { Logger } from '../logger.js';
import type {
  StandardProgramRead,
  StandardProgramWritable,
  ZoneStandardUpdateInput,
} from '../hydrawise/queries.js';
import { jsonResult, runTool } from './_helpers.js';

const PHYSICAL = 'PHYSICAL ACTION:';

const DAY_ORDER = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

function daysRunToBitmap(daysRun: string[]): string {
  const set = new Set(daysRun.map((d) => d.toUpperCase()));
  return DAY_ORDER.map((d) => (set.has(d) ? '1' : '0')).join('');
}

// Converts a StandardProgramRead back to the writable shape needed by updateStandardProgram.
// This is the read-side half of the read-merge-write pattern used by all three Standard program
// patch tools — they each call this, mutate one field, then dispatch.
function standardProgramReadToWritable(
  p: StandardProgramRead,
  controllerId: number,
): StandardProgramWritable & { program_id: number } {
  if (p.schedulingMethod == null) {
    throw new ConfigError(`program ${p.id} has no schedulingMethod`);
  }
  return {
    program_id: p.id,
    controller_id: controllerId,
    name: p.name,
    scheduling_method: p.schedulingMethod.value,
    // day_pattern: 7-char bitmap required by the mutation in all modes; derive from daysRun for
    // "dow", fall back to "1111111" for even/odd/interval (API ignores it in those modes).
    day_pattern: p.standardProgramDayPattern === 'dow' ? daysRunToBitmap(p.daysRun) : '1111111',
    standard_program_day_pattern: p.standardProgramDayPattern,
    interval_days: p.periodicity?.period ?? null,
    series_start_epoch_seconds: p.periodicity?.seriesStart?.timestamp ?? null,
    start_times: p.startTimes ?? [],
    zone_run_times: (p.applications ?? []).map((a) => ({
      zone_number: a.zone.number.value,
      run_time_group_id: a.runTimeGroup.id,
      run_duration: a.runTimeGroup.duration ?? null,
    })),
    schedule_adjustment_ids: (p.conditionalWateringAdjustments ?? []).map((a) => a.id),
    seasonal_adjustment_factor_percents: p.monthlyWateringAdjustments ?? [],
    valid_from_epoch_seconds: p.timeRange.validFrom ?? null,
    valid_to_epoch_seconds: p.timeRange.validTo ?? null,
    ignore_rain_sensor: p.ignoreRainSensor,
  };
}

export function registerPatchTools(
  server: McpServer,
  api: HydrawiseApi,
  logger?: Logger,
): void {
  const wrap = (toolName: string, fn: () => Promise<ReturnType<typeof jsonResult>>) =>
    runTool(fn, { logger, toolName });

  server.registerTool(
    'update_zone_run_time_in_program',
    {
      description:
        `${PHYSICAL} Preferred tool for single-zone run-time changes in a Standard program — ` +
        `avoids sending the full program payload. Reads the current program state, changes only the ` +
        `run duration for the specified zone, and dispatches updateStandardProgram. ` +
        `Pass preview: true to inspect the planned mutation without dispatching.`,
      inputSchema: {
        controller_id: z.number().int(),
        program_id: z.number().int(),
        zone_id: z.number().int(),
        run_duration_minutes: z
          .number()
          .int()
          .describe('New run duration for the zone in this program, in minutes.'),
        preview: z.boolean().optional(),
      },
    },
    async ({ controller_id, program_id, zone_id, run_duration_minutes, preview }) =>
      wrap('update_zone_run_time_in_program', async () => {
        const program = await api.getStandardProgram(controller_id, program_id);
        if (!program) {
          throw new ConfigError(
            `Standard program ${program_id} not found on controller ${controller_id}`,
          );
        }
        const apps = program.applications ?? [];
        const appIndex = apps.findIndex((a) => a.zone.id === zone_id);
        if (appIndex === -1) {
          throw new ConfigError(
            `zone ${zone_id} is not part of Standard program ${program_id}`,
          );
        }
        const matchedApp = apps[appIndex]!;
        const before = { run_duration_minutes: matchedApp.runTimeGroup.duration };
        const writable = standardProgramReadToWritable(program, controller_id);
        writable.zone_run_times = writable.zone_run_times.map((z, i) =>
          i === appIndex ? { ...z, run_duration: run_duration_minutes } : z,
        );
        const after = { run_duration_minutes };
        if (preview) {
          return jsonResult({
            before,
            after,
            preview: true,
            planned_call: { tool: 'update_standard_program', variables: writable },
          });
        }
        await api.updateStandardProgram(writable);
        return jsonResult({ before, after, preview: false });
      }),
  );

  server.registerTool(
    'update_program_day_pattern',
    {
      description:
        `${PHYSICAL} Change the day schedule of a Standard program without touching start times or ` +
        `zone run times. Reads the current program, replaces day-pattern fields, and dispatches ` +
        `updateStandardProgram. Pass preview: true to inspect the planned mutation without dispatching.`,
      inputSchema: {
        controller_id: z.number().int(),
        program_id: z.number().int(),
        standard_program_day_pattern: z
          .enum(['dow', 'even', 'odd', 'interval'])
          .describe(
            'Day-pattern mode: "dow" = specific days of week, "even" = even calendar days, ' +
              '"odd" = odd calendar days, "interval" = every N days (requires interval_days).',
          ),
        day_pattern: z
          .string()
          .length(7)
          .describe(
            '7-char bitmap Sunday-first (0 = Sunday … 6 = Saturday); "1" = run, "0" = skip. ' +
              'Required for "dow" mode. For other modes the API ignores this value — pass "1111111" or the current value.',
          ),
        interval_days: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe(
            'Repeat interval in days. Required when standard_program_day_pattern is "interval"; ignored otherwise.',
          ),
        preview: z.boolean().optional(),
      },
    },
    async ({
      controller_id,
      program_id,
      standard_program_day_pattern,
      day_pattern,
      interval_days,
      preview,
    }) =>
      wrap('update_program_day_pattern', async () => {
        if (standard_program_day_pattern === 'interval' && interval_days == null) {
          throw new ConfigError(
            'interval_days is required when standard_program_day_pattern is "interval"',
          );
        }
        const program = await api.getStandardProgram(controller_id, program_id);
        if (!program) {
          throw new ConfigError(
            `Standard program ${program_id} not found on controller ${controller_id}`,
          );
        }
        const before = {
          standard_program_day_pattern: program.standardProgramDayPattern,
          day_pattern:
            program.standardProgramDayPattern === 'dow'
              ? daysRunToBitmap(program.daysRun)
              : null,
        };
        const writable = standardProgramReadToWritable(program, controller_id);
        writable.standard_program_day_pattern = standard_program_day_pattern;
        writable.day_pattern = day_pattern;
        writable.interval_days = interval_days ?? null;
        const after = { standard_program_day_pattern, day_pattern };
        if (preview) {
          return jsonResult({
            before,
            after,
            preview: true,
            planned_call: { tool: 'update_standard_program', variables: writable },
          });
        }
        await api.updateStandardProgram(writable);
        return jsonResult({ before, after, preview: false });
      }),
  );

  server.registerTool(
    'update_program_start_times',
    {
      description:
        `${PHYSICAL} Replace ALL start times for a Standard program. Reads the current program, ` +
        `replaces the start_times array entirely, and dispatches updateStandardProgram. ` +
        `Pass preview: true to inspect the planned mutation without dispatching.`,
      inputSchema: {
        controller_id: z.number().int(),
        program_id: z.number().int(),
        start_times: z
          .array(z.string())
          .describe('HH:MM start times to set. Replaces ALL existing start times for this program.'),
        preview: z.boolean().optional(),
      },
    },
    async ({ controller_id, program_id, start_times, preview }) =>
      wrap('update_program_start_times', async () => {
        const program = await api.getStandardProgram(controller_id, program_id);
        if (!program) {
          throw new ConfigError(
            `Standard program ${program_id} not found on controller ${controller_id}`,
          );
        }
        const before = { start_times: program.startTimes ?? [] };
        const writable = standardProgramReadToWritable(program, controller_id);
        writable.start_times = start_times;
        const after = { start_times };
        if (preview) {
          return jsonResult({
            before,
            after,
            preview: true,
            planned_call: { tool: 'update_standard_program', variables: writable },
          });
        }
        await api.updateStandardProgram(writable);
        return jsonResult({ before, after, preview: false });
      }),
  );

  server.registerTool(
    'update_zone_cycle_soak',
    {
      description:
        `${PHYSICAL} Change cycle-and-soak settings for a single zone on a STANDARD-mode controller. ` +
        `Reads the current zone settings and merges the supplied cycle/soak values, then dispatches ` +
        `updateZoneStandard. Omit cycle_custom_time_minutes or soak_custom_time_minutes to preserve ` +
        `the existing values. For ADVANCED-mode controllers use update_zone_settings instead. ` +
        `Pass preview: true to inspect the planned mutation without dispatching.`,
      inputSchema: {
        controller_id: z.number().int(),
        zone_id: z.number().int(),
        cycle_soak_enable: z.boolean(),
        cycle_custom_time_minutes: z
          .number()
          .int()
          .nullable()
          .optional()
          .describe('Cycle duration in minutes. Preserved from current settings when omitted.'),
        soak_custom_time_minutes: z
          .number()
          .int()
          .nullable()
          .optional()
          .describe('Soak duration in minutes. Preserved from current settings when omitted.'),
        preview: z.boolean().optional(),
      },
    },
    async ({
      controller_id,
      zone_id,
      cycle_soak_enable,
      cycle_custom_time_minutes,
      soak_custom_time_minutes,
      preview,
    }) =>
      wrap('update_zone_cycle_soak', async () => {
        const [zone, controller] = await Promise.all([
          api.getZoneFull(zone_id),
          api.getController(controller_id),
        ]);
        if (controller.programMode === 'ADVANCED') {
          throw new ConfigError(
            `update_zone_cycle_soak only supports STANDARD-mode controllers. ` +
              `Use update_zone_settings for ADVANCED-mode controllers.`,
          );
        }
        const iconId = zone.icon?.id;
        if (iconId == null) {
          throw new ConfigError(
            `zone ${zone_id} has no icon id in the read response; cannot call updateZoneStandard ` +
              `(icon is required upstream). Use update_zone_standard and supply the icon id explicitly.`,
          );
        }
        const ws = zone.wateringSettings;
        const before = {
          cycle_soak_enable: ws ? ws.cycleAndSoakSettings != null : false,
          cycle_custom_time_minutes: ws?.cycleAndSoakSettings?.cycleDuration ?? null,
          soak_custom_time_minutes: ws?.cycleAndSoakSettings?.soakDuration ?? null,
        };
        const resolvedCycleMinutes =
          cycle_custom_time_minutes !== undefined
            ? cycle_custom_time_minutes
            : before.cycle_custom_time_minutes;
        const resolvedSoakMinutes =
          soak_custom_time_minutes !== undefined
            ? soak_custom_time_minutes
            : before.soak_custom_time_minutes;
        const after = {
          cycle_soak_enable,
          cycle_custom_time_minutes: resolvedCycleMinutes ?? null,
          soak_custom_time_minutes: resolvedSoakMinutes ?? null,
        };
        const payload: ZoneStandardUpdateInput = {
          zone_id: zone.id,
          name: zone.name,
          number: zone.number.value,
          global_master_valve: zone.masterValve,
          watering_adjustment_percent: ws?.fixedWateringAdjustment ?? 100,
          cycle_soak_enable,
          icon: iconId,
          cycle_custom_time_minutes: resolvedCycleMinutes ?? null,
          soak_custom_time_minutes: resolvedSoakMinutes ?? null,
        };
        if (preview) {
          return jsonResult({
            before,
            after,
            preview: true,
            planned_call: { tool: 'update_zone_standard', variables: payload },
          });
        }
        await api.updateZoneStandard(payload);
        return jsonResult({ before, after, preview: false });
      }),
  );

  server.registerTool(
    'update_zone_watering_adjustment',
    {
      description:
        `${PHYSICAL} Change the watering adjustment percentage for a single zone on a STANDARD-mode ` +
        `controller. Reads the current zone settings and merges the adjustment, then dispatches ` +
        `updateZoneStandard. For ADVANCED-mode controllers use update_zone_settings instead. ` +
        `Pass preview: true to inspect the planned mutation without dispatching.`,
      inputSchema: {
        controller_id: z.number().int(),
        zone_id: z.number().int(),
        watering_adjustment_percent: z
          .number()
          .int()
          .min(0)
          .max(200)
          .describe('Watering adjustment, in percent (0–200).'),
        preview: z.boolean().optional(),
      },
    },
    async ({ controller_id, zone_id, watering_adjustment_percent, preview }) =>
      wrap('update_zone_watering_adjustment', async () => {
        const [zone, controller] = await Promise.all([
          api.getZoneFull(zone_id),
          api.getController(controller_id),
        ]);
        if (controller.programMode === 'ADVANCED') {
          throw new ConfigError(
            `update_zone_watering_adjustment only supports STANDARD-mode controllers. ` +
              `Use update_zone_settings for ADVANCED-mode controllers.`,
          );
        }
        const iconId = zone.icon?.id;
        if (iconId == null) {
          throw new ConfigError(
            `zone ${zone_id} has no icon id in the read response; cannot call updateZoneStandard ` +
              `(icon is required upstream). Use update_zone_standard and supply the icon id explicitly.`,
          );
        }
        const ws = zone.wateringSettings;
        const before = { watering_adjustment_percent: ws?.fixedWateringAdjustment ?? null };
        const after = { watering_adjustment_percent };
        const payload: ZoneStandardUpdateInput = {
          zone_id: zone.id,
          name: zone.name,
          number: zone.number.value,
          global_master_valve: zone.masterValve,
          watering_adjustment_percent,
          cycle_soak_enable: ws ? ws.cycleAndSoakSettings != null : false,
          icon: iconId,
          cycle_custom_time_minutes: ws?.cycleAndSoakSettings?.cycleDuration ?? null,
          soak_custom_time_minutes: ws?.cycleAndSoakSettings?.soakDuration ?? null,
        };
        if (preview) {
          return jsonResult({
            before,
            after,
            preview: true,
            planned_call: { tool: 'update_zone_standard', variables: payload },
          });
        }
        await api.updateZoneStandard(payload);
        return jsonResult({ before, after, preview: false });
      }),
  );
}
