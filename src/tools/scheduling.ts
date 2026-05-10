import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ConfigError } from '../errors.js';
import type { HydrawiseApi } from '../hydrawise/api.js';
import type { Logger } from '../logger.js';
import {
  MONITORING_METHODS,
  PROGRAM_TYPES,
  WATERING_PROGRAM_TYPES,
  type WateringProgramWritable,
  type ZoneStandardUpdateInput,
} from '../hydrawise/queries.js';
import {
  serializeAdvancedProgram,
  serializeProgramStartTime,
  serializeStandardProgram,
  serializeWateringTriggers,
  serializeZoneSettings,
} from './serializers.js';
import { jsonResult, previewOrApply, runTool } from './_helpers.js';

const PHYSICAL = 'PHYSICAL ACTION:';

const ZoneIdInput = { zone_id: z.number().int() };

// Zod enum derived from the MONITORING_METHODS tuple in queries.ts — single source
// of truth (see NOTE_TYPES / CUSTOM_SENSOR_TYPES for the same idiom).
const MonitoringMethodEnum = z.enum(MONITORING_METHODS);

// Required fields match updateZoneAdvanced's Int!/String!/[Int]! args. Optional fields default to null on dispatch; Hydrawise applies its schema-level defaults (cycleSoakEnable=false, factors=[], etc.).
const ZoneWritableShape = {
  zone_id: z.number().int(),
  name: z.string(),
  number: z.number().int(),
  watering_mode: z.number().int(),
  global_master_valve: z.number().int(),
  schedule_adjustment_ids: z.array(z.number().int()),
  watering_adjustment_percent: z.number().int().describe('Zone-level watering adjustment, in percent (updateZoneAdvanced.wateringAdjustment Int).'),
  watering_type: z.number().int(),
  watering_frequency_mode: z.number().int(),
  icon: z.number().int().nullable().optional(),
  run_time_minutes: z.number().int().nullable().optional().describe('Per-zone run-time override, in minutes (updateZoneAdvanced.runTime Int).'),
  fixed_watering_frequency_seconds: z.number().int().nullable().optional().describe('Fixed-program repeat interval, in seconds (Verified empirically: fixedWateringFrequency=2 → period.label="43200 times per day" = 86400/2; updateZoneAdvanced.fixedWateringFrequency Int).'),
  smart_watering_frequency_seconds: z.number().int().nullable().optional().describe('Smart-program repeat interval, in seconds (updateZoneAdvanced.smartWateringFrequency Int; default 86400 = 24 h).'),
  virtual_solar_sync_watering_frequency_seconds: z.number().int().nullable().optional().describe('Virtual Solar Sync repeat interval, in seconds (same unit as fixed/smart; default 60 = 60s; updateZoneAdvanced.virtualSolarSyncWateringFrequency Int).'),
  run_next_available_start_time: z.boolean().nullable().optional(),
  pre_configured_watering_schedule_id: z.number().int().nullable().optional(),
  cycle_soak_enable: z.boolean().nullable().optional(),
  cycle_custom_time_minutes: z.number().int().nullable().optional().describe('Cycle duration for cycle-and-soak, in minutes (CycleAndSoakSettings.cycleDuration Int).'),
  soak_custom_time_minutes: z.number().int().nullable().optional().describe('Soak duration for cycle-and-soak, in minutes (CycleAndSoakSettings.soakDuration Int).'),
  monthly_adjustment_percents: z.array(z.number().int()).nullable().optional().describe('12 monthly watering adjustment factors Jan–Dec, in percent (updateZoneAdvanced.factors [Int]).'),
  sensor_ids: z.array(z.number().int()).nullable().optional(),
  reusable_schedule: z.boolean().nullable().optional(),
  reusable_schedule_name: z.string().nullable().optional(),
  flow_monitoring_method: MonitoringMethodEnum.nullable().optional(),
  current_monitoring_method: MonitoringMethodEnum.nullable().optional(),
  flow_monitoring_value: z.number().nullable().optional().describe('Flow monitoring baseline, in account-preferred units (updateZoneAdvanced.flowMonitoringValue Float).'),
  current_monitoring_value: z.number().int().nullable().optional().describe('Current monitoring baseline, in account-preferred units (updateZoneAdvanced.currentMonitoringValue Int).'),
  preview: z.boolean().optional(),
};

// Fields for updateZoneStandard — STANDARD-mode controllers only. Omits all ADVANCED-mode-only
// fields (watering_mode, watering_type, watering_frequency_mode, schedule_adjustment_ids, etc.).
export const ZoneStandardShape = {
  zone_id: z.number().int(),
  name: z.string(),
  number: z.number().int(),
  global_master_valve: z.number().int().describe('Master valve override: -1 = controller default, 0 = always disabled, N = zone N is master (updateZoneStandard.globalMasterValve Int).'),
  watering_adjustment_percent: z.number().int().describe('Zone-level watering adjustment, in percent (updateZoneStandard.wateringAdjustment Int).'),
  cycle_soak_enable: z.boolean(),
  icon: z.number().int().nullable().optional().describe('Built-in icon template ID. Required unless icon_file_id is provided — Hydrawise rejects with "Missing icon" if neither is present. For zones with a custom uploaded image, pass icon_file_id instead and omit this field. Fetch the current values via get_zone_settings if you do not intend to change the icon.'),
  icon_file_id: z.number().int().nullable().optional().describe('Custom uploaded image file ID. Use this (instead of icon) for zones with a custom icon image. Pass null or omit to use the built-in icon specified by the icon field.'),
  cycle_custom_time_minutes: z.number().int().nullable().optional().describe('Cycle duration for cycle-and-soak, in minutes (updateZoneStandard.cycleCustomTime Int).'),
  soak_custom_time_minutes: z.number().int().nullable().optional().describe('Soak duration for cycle-and-soak, in minutes (updateZoneStandard.soakCustomTime Int).'),
  sensor_ids: z.array(z.number().int()).nullable().optional(),
  flow_monitoring_method: MonitoringMethodEnum.nullable().optional(),
  current_monitoring_method: MonitoringMethodEnum.nullable().optional(),
  flow_monitoring_value: z.number().nullable().optional().describe('Flow monitoring baseline, in account-preferred units (updateZoneStandard.flowMonitoringValue Float).'),
  current_monitoring_value: z.number().int().nullable().optional().describe('Current monitoring baseline, in account-preferred units (updateZoneStandard.currentMonitoringValue Int).'),
  preview: z.boolean().optional(),
};

// setBaselineValues takes Float for both values; updateZoneAdvanced takes Int for currentMonitoringValue.
const SetBaselineInput = {
  zone_id: z.number().int(),
  flow_monitoring_method: MonitoringMethodEnum,
  current_monitoring_method: MonitoringMethodEnum,
  flow_monitoring_value: z.number().nullable().optional().describe('Flow monitoring baseline, in account-preferred units (setBaselineValues.flowMonitoringValue Float).'),
  current_monitoring_value: z.number().nullable().optional().describe('Current monitoring baseline, in account-preferred units (setBaselineValues.currentMonitoringValue Float).'),
  preview: z.boolean().optional(),
};

const ControllerIdInput = { controller_id: z.number().int() };

const SeasonalAdjustmentsInput = {
  controller_id: z.number().int(),
  monthly_adjustment_percents: z.array(z.number().int()).length(12, 'monthly_adjustment_percents must have exactly 12 entries').describe('12 monthly watering adjustment factors Jan–Dec, in percent (updateSeasonalAdjustments.factors [Int]!).'),
  preview: z.boolean().optional(),
};

const WateringTriggersInput = {
  controller_id: z.number().int(),
  extend_water_temperature: z.number().describe('Temperature threshold to extend watering, in account-preferred units (WateringTriggers.extendWaterTemperature LocalizedValueType).'),
  extend_water_temperature_enabled: z.boolean(),
  extend_water_temperature_percent: z.number().int().describe('Extra watering when temperature threshold met, in percent (WateringTriggers.extendWaterTemperaturePercentage Int).'),
  extend_water_humidity_percent: z.number().int().describe('Humidity adjustment factor for extended watering, in percent (WateringTriggers.extendWaterHumidity Int).'),
  extend_water_humidity_enabled: z.boolean(),
  suspend_water_week_rain: z.number().describe('Weekly rainfall amount to trigger suspension, in account-preferred units (WateringTriggers.suspendWaterWeekRain LocalizedValueType).'),
  suspend_water_rain_days: z.number().int().describe('Days to suspend watering after rainfall, in days (WateringTriggers.suspendWaterRainDays Int).'),
  suspend_water_week_rain_enabled: z.boolean(),
  suspend_water_rain: z.number().describe('Single-event rainfall amount to trigger suspension, in account-preferred units (WateringTriggers.suspendWaterRain LocalizedValueType).'),
  suspend_water_rain_enabled: z.boolean(),
  suspend_water_temperature: z.number().describe('Temperature threshold to suspend watering, in account-preferred units (WateringTriggers.suspendWaterTemperature LocalizedValueType).'),
  suspend_water_temperature_enabled: z.boolean(),
  suspend_probability_of_precipitation_percent: z.number().int().describe('Forecast rain probability threshold to suspend watering, in percent (WateringTriggers.suspendProbabilityOfPrecipitation Int).'),
  suspend_probability_of_precipitation_enabled: z.boolean(),
  suspend_wind: z.number().describe('Wind speed threshold to suspend watering, in account-preferred units (WateringTriggers.suspendWind LocalizedValueType).'),
  suspend_wind_enabled: z.boolean(),
  enable_evapotranspiration_forecast_temperature: z.boolean(),
  enable_evapotranspiration_forecast_rain: z.boolean(),
  reduce_water_temperature_enabled: z.boolean(),
  reduce_water_temperature: z.number().describe('Temperature threshold to reduce watering, in account-preferred units (WateringTriggers.reduceWaterTemperature LocalizedValueType).'),
  reduce_water_temperature_percent: z.number().int().describe('Watering reduction when temperature threshold met, in percent (WateringTriggers.reduceWaterTemperaturePercentage Int).'),
  preview: z.boolean().optional(),
};

const ProgramStartTimeBaseShape = {
  controller_id: z.number().int(),
  apply_all: z.boolean(),
  zones: z.array(z.number().int()),
  schedules: z.array(z.number().int()),
  time: z.string(),
  watering_type: z.number().int(),
  time_type: z.string(),
  sunday: z.number().int(),
  monday: z.number().int(),
  tuesday: z.number().int(),
  wednesday: z.number().int(),
  thursday: z.number().int(),
  friday: z.number().int(),
  saturday: z.number().int(),
};

const CreateProgramStartTimeInput = {
  ...ProgramStartTimeBaseShape,
  preview: z.boolean().optional(),
};

const UpdateProgramStartTimeInput = {
  id: z.number().int(),
  ...ProgramStartTimeBaseShape,
  preview: z.boolean().optional(),
};

const DeleteProgramStartTimeInput = {
  id: z.number().int(),
  controller_id: z.number().int(),
  preview: z.boolean().optional(),
};

const ZoneRunTimeShape = z.object({
  zone_number: z.number().int(),
  run_time_group_id: z.number().int().nullable().optional(),
  run_duration: z.number().int().nullable().optional().describe('DEFERRED — unit not yet verified on a live controller (likely minutes per GUI; updateStandardProgram.zoneRunTimes.runDuration Int).'),
});

const StandardProgramBaseShape = {
  controller_id: z.number().int(),
  name: z.string(),
  scheduling_method: z
    .number()
    .int()
    .describe(
      'Hydrawise scheduling-method int (e.g. 3 = Standard); matches the scheduling_method field returned by get_program.',
    ),
  day_pattern: z
    .string()
    .describe(
      'Required by the Hydrawise mutation regardless of mode. ' +
        'For dow mode: 7-character ASCII bitmap with position 0 = Sunday, 1 = Monday, …, 6 = Saturday; ' +
        "'1' = run on that day, '0' = skip. " +
        "Examples: \"0001001\" = Wed+Sat (Denver Water Stage 1), \"0111110\" = weekdays, \"1111111\" = every day. " +
        'For even/odd/interval modes the mutation still requires this field — pass the current value ' +
        'from get_program (or a neutral placeholder like "1111111") since Hydrawise ignores it when ' +
        'standard_program_day_pattern is not "dow".',
    ),
  standard_program_day_pattern: z.string().nullable(),
  interval_days: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe(
      'Repeat interval in days (StandardProgram periodicity.period Int). Required when standard_program_day_pattern == "interval"; ignored otherwise.',
    ),
  series_start_epoch_seconds: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe(
      'Series start date as Unix timestamp in seconds (StandardProgram periodicity.seriesStart.timestamp Int). Only meaningful in "interval" mode.',
    ),
  start_times: z.array(z.string()),
  zone_run_times: z.array(ZoneRunTimeShape),
  schedule_adjustment_ids: z.array(z.number().int()),
  seasonal_adjustment_factor_percents: z.array(z.number().int()).describe('12 monthly watering adjustment factors Jan–Dec, in percent (updateStandardProgram.seasonalAdjustmentFactors [Int]).'),
  valid_from_epoch_seconds: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe('Program valid-from date as Unix timestamp in seconds; null means no start bound.'),
  valid_to_epoch_seconds: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe('Program valid-to date as Unix timestamp in seconds; null means no end bound.'),
  ignore_rain_sensor: z.boolean().nullable(),
};

const CreateStandardProgramInput = { ...StandardProgramBaseShape, preview: z.boolean().optional() };
const UpdateStandardProgramInput = {
  program_id: z.number().int(),
  ...StandardProgramBaseShape,
  preview: z.boolean().optional(),
};
const DeleteStandardProgramInput = {
  program_id: z.number().int(),
  controller_id: z.number().int(),
  preview: z.boolean().optional(),
};

// Zod enum derived from the WATERING_PROGRAM_TYPES tuple in queries.ts.
const WateringProgramTypeEnum = z.enum(WATERING_PROGRAM_TYPES);

const WateringProgramBaseShape = {
  program_type: WateringProgramTypeEnum,
  watering_program_name: z.string(),
  watering_program_type: z.number().int().nullable(),
  controller_id: z.number().int(),
  schedule_adjustment_ids: z.array(z.number().int()).nullable(),
  seasonal_adjustment_percents: z.array(z.number().int()).nullable().describe('12 monthly watering adjustment factors Jan–Dec, in percent (updateTimeBasedWateringProgram.seasonalAdjustment [Int]).'),
  fixed_watering_run_time: z.number().int().optional().describe('DEFERRED — unit not yet verified on a live controller (likely minutes; updateTimeBasedWateringProgram.fixedWateringRunTime Int).'),
  fixed_watering_frequency_mode: z.number().int().optional(),
  fixed_watering_frequency_value: z.number().int().nullable().optional().describe('DEFERRED — unit not yet verified on a live controller (updateTimeBasedWateringProgram.fixedWateringFrequencyValue Int).'),
  watering_program_adjustment: z.number().int().nullable().optional().describe('DEFERRED — unit not yet verified (updateTimeBasedWateringProgram.wateringProgramAdjustment Int).'),
  smart_watering_run_time: z.number().int().optional().describe('DEFERRED — unit not yet verified on a live controller (likely minutes; updateSmartBasedWateringProgram.smartWateringRunTime Int).'),
  smart_watering_frequency_value: z.number().int().optional().describe('DEFERRED — unit not yet verified (updateSmartBasedWateringProgram.smartWateringFrequencyValue Int).'),
  virtual_solar_sync_watering_run_time: z.number().int().optional().describe('DEFERRED — unit not yet verified on a live controller (likely minutes; updateVirtualSolarSyncWateringProgram.virtualSolarSyncWateringRunTime Int).'),
  virtual_solar_sync_watering_frequency_mode: z.number().int().optional(),
  virtual_solar_sync_watering_frequency_value: z.number().int().nullable().optional().describe('DEFERRED — unit not yet verified (updateVirtualSolarSyncWateringProgram.virtualSolarSyncWateringFrequencyValue Int).'),
};

const CreateWateringProgramInput = {
  ...WateringProgramBaseShape,
  preview: z.boolean().optional(),
};
const UpdateWateringProgramInput = {
  program_id: z.number().int(),
  ...WateringProgramBaseShape,
  preview: z.boolean().optional(),
};
const DeleteWateringProgramInput = {
  program_id: z.number().int(),
  preview: z.boolean().optional(),
};

const ProgramTypeReadInput = {
  controller_id: z.number().int(),
};

export function registerSchedulingTools(
  server: McpServer,
  api: HydrawiseApi,
  logger?: Logger,
): void {
  const wrap = (toolName: string, fn: () => Promise<ReturnType<typeof jsonResult>>) =>
    runTool(fn, { logger, toolName });

  server.registerTool(
    'get_zone_settings',
    {
      description:
        'Return the zone watering settings in the writable shape used by `update_zone_settings`. ' +
        'Some fields may be null because the read schema does not expose them; supply them ' +
        'explicitly when calling the write tool.',
      inputSchema: ZoneIdInput,
    },
    async ({ zone_id }) =>
      wrap('get_zone_settings', async () =>
        jsonResult(serializeZoneSettings(await api.getZoneFull(zone_id))),
      ),
  );

  server.registerTool(
    'get_program',
    {
      description:
        'Return full detail for a single program. Dispatches on program_type. ' +
        'For Standard: start times, day pattern, days run, monthly adjustments, periodicity, ' +
        'valid_from/to, and per-zone run-time groups (the "for X minutes" you see in the GUI). ' +
        'Returns periodicity: null when standard_program_day_pattern is "dow", "odd", or "even" — ' +
        'periodicity is only meaningful in "interval" mode. ' +
        'For Advanced: scope, zone_specific, advanced_program_id, watering_frequency ' +
        '(label/description/period), run_time_group reference, and applies_to_zones. ' +
        'Note that Advanced programs do NOT carry start times here — those live per-zone via ' +
        'list_program_start_times_for_zone.',
      inputSchema: {
        controller_id: z.number().int(),
        program_id: z.number().int(),
        // Closed validation at the user-input boundary (PROGRAM_TYPES tuple in queries.ts
        // is the single source of truth — `ProgramListEntry.program_type` keeps `| string`
        // for read-side forward-compat, but get_program's input is intentionally closed).
        program_type: z.enum(PROGRAM_TYPES),
      },
    },
    async ({ controller_id, program_id, program_type }) =>
      wrap('get_program', async () => {
        // Dispatch on the discriminator. Both branches return null when the id exists
        // but is the OTHER program type (e.g. requesting Advanced but the id is a
        // StandardProgram) — surfaced as ConfigError so the caller distinguishes
        // "no such id" from "wrong type".
        if (program_type === 'Standard') {
          const program = await api.getStandardProgram(controller_id, program_id);
          if (!program) {
            throw new ConfigError(
              `Standard program ${program_id} not found on controller ${controller_id} ` +
                '(check that program_type matches the program\'s actual type)',
            );
          }
          return jsonResult(serializeStandardProgram(program));
        }
        // program_type === 'Advanced'
        const program = await api.getAdvancedProgram(controller_id, program_id);
        if (!program) {
          throw new ConfigError(
            `Advanced program ${program_id} not found on controller ${controller_id} ` +
              '(check that program_type matches the program\'s actual type)',
          );
        }
        return jsonResult(serializeAdvancedProgram(program));
      }),
  );

  server.registerTool(
    'list_programs',
    {
      description:
        'List the programs configured on a controller. Each entry has a `program_type` ' +
        'discriminator (`Standard`, `Advanced`, etc.) plus basic fields (id, name, applies_to_zone_ids).',
      inputSchema: ProgramTypeReadInput,
    },
    async ({ controller_id }) =>
      wrap('list_programs', async () => jsonResult(await api.getPrograms(controller_id))),
  );

  server.registerTool(
    'list_program_start_times_for_zone',
    {
      description:
        'List the program start times associated with a single zone. Use `dump_controller_snapshot` ' +
        'to see start times grouped per zone for the whole controller.',
      inputSchema: ZoneIdInput,
    },
    async ({ zone_id }) =>
      wrap('list_program_start_times_for_zone', async () => {
        const starts = await api.getProgramStartTimesForZone(zone_id);
        return jsonResult(starts.map(serializeProgramStartTime));
      }),
  );

  server.registerTool(
    'get_seasonal_adjustments',
    {
      description: 'Return the controller-level seasonal adjustment factors as a 12-int array.',
      inputSchema: ControllerIdInput,
    },
    async ({ controller_id }) =>
      wrap('get_seasonal_adjustments', async () =>
        jsonResult({ monthly_adjustment_percents: await api.getSeasonalAdjustments(controller_id) }),
      ),
  );

  server.registerTool(
    'get_watering_triggers',
    {
      description:
        "Return the controller's watering triggers (rain/temp/humidity/wind) in the writable shape " +
        'used by `update_watering_triggers`.',
      inputSchema: ControllerIdInput,
    },
    async ({ controller_id }) =>
      wrap('get_watering_triggers', async () => {
        const triggers = await api.getWateringTriggers(controller_id);
        if (!triggers) {
          throw new ConfigError(`watering triggers not configured on controller ${controller_id}`);
        }
        return jsonResult(serializeWateringTriggers(triggers));
      }),
  );

  server.registerTool(
    'update_zone_settings',
    {
      description: `${PHYSICAL} apply a full writable zone payload via the \`updateZoneAdvanced\` mutation. **For ADVANCED-mode controllers only** — use \`update_zone_standard\` for STANDARD-mode controllers to avoid accidental mode changes. Includes the four optional monitoring fields (\`flow_monitoring_method\`, \`current_monitoring_method\`, \`flow_monitoring_value\`, \`current_monitoring_value\`). Pass \`preview: true\` to see what would be sent without dispatching.`,
      inputSchema: ZoneWritableShape,
    },
    async (input) =>
      wrap('update_zone_settings', async () => {
        const { preview, ...partial } = input;
        const payload = {
          zone_id: partial.zone_id,
          name: partial.name,
          number: partial.number,
          watering_mode: partial.watering_mode,
          global_master_valve: partial.global_master_valve,
          schedule_adjustment_ids: partial.schedule_adjustment_ids,
          watering_adjustment_percent: partial.watering_adjustment_percent,
          watering_type: partial.watering_type,
          watering_frequency_mode: partial.watering_frequency_mode,
          icon: partial.icon ?? null,
          run_time_minutes: partial.run_time_minutes ?? null,
          fixed_watering_frequency_seconds: partial.fixed_watering_frequency_seconds ?? null,
          smart_watering_frequency_seconds: partial.smart_watering_frequency_seconds ?? null,
          virtual_solar_sync_watering_frequency_seconds:
            partial.virtual_solar_sync_watering_frequency_seconds ?? null,
          run_next_available_start_time: partial.run_next_available_start_time ?? null,
          pre_configured_watering_schedule_id: partial.pre_configured_watering_schedule_id ?? null,
          cycle_soak_enable: partial.cycle_soak_enable ?? null,
          cycle_custom_time_minutes: partial.cycle_custom_time_minutes ?? null,
          soak_custom_time_minutes: partial.soak_custom_time_minutes ?? null,
          monthly_adjustment_percents: partial.monthly_adjustment_percents ?? null,
          sensor_ids: partial.sensor_ids ?? null,
          reusable_schedule: partial.reusable_schedule ?? null,
          reusable_schedule_name: partial.reusable_schedule_name ?? null,
          flow_monitoring_method: partial.flow_monitoring_method ?? null,
          current_monitoring_method: partial.current_monitoring_method ?? null,
          flow_monitoring_value: partial.flow_monitoring_value ?? null,
          current_monitoring_value: partial.current_monitoring_value ?? null,
        };
        return previewOrApply('updateZoneAdvanced', payload, preview, async () =>
          api.updateZoneAdvanced(payload),
        );
      }),
  );

  server.registerTool(
    'update_zone_standard',
    {
      description: `${PHYSICAL} update per-zone settings on a **STANDARD-mode controller** via the \`updateZoneStandard\` mutation. Use this instead of \`update_zone_settings\` on STANDARD-mode controllers to avoid accidental mode changes. Covers name, number, icon, cycle/soak, watering adjustment, master valve override, sensor associations, and flow/current monitoring baselines. Pass \`preview: true\` to see what would be sent without dispatching.`,
      inputSchema: ZoneStandardShape,
    },
    async (input) =>
      wrap('update_zone_standard', async () => {
        const { preview, ...partial } = input;
        const payload: ZoneStandardUpdateInput = {
          zone_id: partial.zone_id,
          name: partial.name,
          number: partial.number,
          global_master_valve: partial.global_master_valve,
          watering_adjustment_percent: partial.watering_adjustment_percent,
          cycle_soak_enable: partial.cycle_soak_enable,
          icon: partial.icon ?? null,
          icon_file_id: partial.icon_file_id ?? null,
          cycle_custom_time_minutes: partial.cycle_custom_time_minutes ?? null,
          soak_custom_time_minutes: partial.soak_custom_time_minutes ?? null,
          sensor_ids: partial.sensor_ids ?? null,
          flow_monitoring_method: partial.flow_monitoring_method ?? null,
          current_monitoring_method: partial.current_monitoring_method ?? null,
          flow_monitoring_value: partial.flow_monitoring_value ?? null,
          current_monitoring_value: partial.current_monitoring_value ?? null,
        };
        return previewOrApply('updateZoneStandard', payload, preview, async () =>
          api.updateZoneStandard(payload),
        );
      }),
  );

  server.registerTool(
    'set_zone_baseline',
    {
      description: `${PHYSICAL} set the flow/current monitoring baselines for a single zone in one call (wraps Hydrawise's \`setBaselineValues\`). Each method must be \`MANUAL\` or \`LEARN_FROM_NEXT_RUN\`; values are only meaningful when the corresponding method is \`MANUAL\`. Pass \`preview: true\` to dry-run.`,
      inputSchema: SetBaselineInput,
    },
    async (input) =>
      wrap('set_zone_baseline', async () => {
        const { preview, ...rest } = input;
        const payload = {
          zone_id: rest.zone_id,
          flow_monitoring_method: rest.flow_monitoring_method,
          current_monitoring_method: rest.current_monitoring_method,
          flow_monitoring_value: rest.flow_monitoring_value ?? null,
          current_monitoring_value: rest.current_monitoring_value ?? null,
        };
        return previewOrApply('setBaselineValues', payload, preview, async () =>
          api.setBaselineValues(payload),
        );
      }),
  );

  server.registerTool(
    'update_seasonal_adjustments',
    {
      description: `${PHYSICAL} replace the 12 seasonal adjustment factors on a controller. \`monthly_adjustment_percents\` must be exactly 12 ints. Pass \`preview: true\` to see what would be sent.`,
      inputSchema: SeasonalAdjustmentsInput,
    },
    async ({ controller_id, monthly_adjustment_percents, preview }) =>
      wrap('update_seasonal_adjustments', async () =>
        previewOrApply(
          'updateSeasonalAdjustments',
          { controller_id, monthly_adjustment_percents },
          preview,
          async () => api.updateSeasonalAdjustments(controller_id, monthly_adjustment_percents),
        ),
      ),
  );

  server.registerTool(
    'update_watering_triggers',
    {
      description: `${PHYSICAL} replace the controller-level watering triggers (rain/temp/humidity/wind) with the full payload. Pass \`preview: true\` to dry-run.`,
      inputSchema: WateringTriggersInput,
    },
    async (input) =>
      wrap('update_watering_triggers', async () => {
        const { preview, ...payload } = input;
        return previewOrApply('updateWateringTriggers', payload, preview, async () =>
          api.updateWateringTriggers(payload),
        );
      }),
  );

  server.registerTool(
    'create_program_start_time',
    {
      description: `${PHYSICAL} create a new program start time. Pass \`preview: true\` to dry-run.`,
      inputSchema: CreateProgramStartTimeInput,
    },
    async (input) =>
      wrap('create_program_start_time', async () => {
        const { preview, ...payload } = input;
        return previewOrApply('createProgramStartTime', payload, preview, async () =>
          api.createProgramStartTime(payload),
        );
      }),
  );

  server.registerTool(
    'update_program_start_time',
    {
      description: `${PHYSICAL} update an existing program start time with the full payload. Pass \`preview: true\` to dry-run.`,
      inputSchema: UpdateProgramStartTimeInput,
    },
    async (input) =>
      wrap('update_program_start_time', async () => {
        const { preview, ...payload } = input;
        return previewOrApply('updateProgramStartTime', payload, preview, async () =>
          api.updateProgramStartTime(payload),
        );
      }),
  );

  server.registerTool(
    'delete_program_start_time',
    {
      description: `${PHYSICAL} delete a program start time. Pass \`preview: true\` to dry-run.`,
      inputSchema: DeleteProgramStartTimeInput,
    },
    async ({ id, controller_id, preview }) =>
      wrap('delete_program_start_time', async () =>
        previewOrApply('deleteProgramStartTime', { id, controller_id }, preview, async () =>
          api.deleteProgramStartTime(id, controller_id),
        ),
      ),
  );

  server.registerTool(
    'create_standard_program',
    {
      description: `${PHYSICAL} create a new standard program. Pass \`preview: true\` to dry-run.`,
      inputSchema: CreateStandardProgramInput,
    },
    async (input) =>
      wrap('create_standard_program', async () => {
        const { preview, ...payload } = input;
        return previewOrApply('createStandardProgram', payload, preview, async () =>
          api.createStandardProgram(payload),
        );
      }),
  );

  server.registerTool(
    'update_standard_program',
    {
      description: `${PHYSICAL} update an existing standard program with the full payload. Pass \`preview: true\` to dry-run.`,
      inputSchema: UpdateStandardProgramInput,
    },
    async (input) =>
      wrap('update_standard_program', async () => {
        const { preview, ...payload } = input;
        return previewOrApply('updateStandardProgram', payload, preview, async () =>
          api.updateStandardProgram(payload),
        );
      }),
  );

  server.registerTool(
    'delete_standard_program',
    {
      description: `${PHYSICAL} delete a standard program. Pass \`preview: true\` to dry-run.`,
      inputSchema: DeleteStandardProgramInput,
    },
    async ({ program_id, controller_id, preview }) =>
      wrap('delete_standard_program', async () =>
        previewOrApply(
          'deleteStandardProgram',
          { program_id, controller_id },
          preview,
          async () => api.deleteStandardProgram(program_id, controller_id),
        ),
      ),
  );

  server.registerTool(
    'create_watering_program',
    {
      description: `${PHYSICAL} create a Time/Smart/VirtualSolarSync watering program. \`program_type\` selects the subtype. Pass \`preview: true\` to dry-run.`,
      inputSchema: CreateWateringProgramInput,
    },
    async (input) =>
      wrap('create_watering_program', async () => {
        const { preview, ...partial } = input;
        const payload = narrowWateringProgram(partial);
        return previewOrApply(
          `create${payload.program_type}WateringProgram`,
          payload,
          preview,
          async () => api.createWateringProgram(payload),
        );
      }),
  );

  server.registerTool(
    'update_watering_program',
    {
      description: `${PHYSICAL} update an existing Time/Smart/VirtualSolarSync watering program. \`program_type\` must match the existing subtype. Pass \`preview: true\` to dry-run.`,
      inputSchema: UpdateWateringProgramInput,
    },
    async (input) =>
      wrap('update_watering_program', async () => {
        const { preview, program_id, ...partial } = input;
        const payload = { ...narrowWateringProgram(partial), program_id };
        return previewOrApply(
          `update${payload.program_type}WateringProgram`,
          payload,
          preview,
          async () => api.updateWateringProgram(payload),
        );
      }),
  );

  server.registerTool(
    'delete_watering_program',
    {
      description: `${PHYSICAL} delete a watering program. Pass \`preview: true\` to dry-run.`,
      inputSchema: DeleteWateringProgramInput,
    },
    async ({ program_id, preview }) =>
      wrap('delete_watering_program', async () =>
        previewOrApply('removeWateringProgram', { program_id }, preview, async () =>
          api.removeWateringProgram(program_id),
        ),
      ),
  );
}

interface WateringProgramFlatInput {
  program_type: 'Time' | 'Smart' | 'VirtualSolarSync';
  watering_program_name: string;
  watering_program_type: number | null;
  controller_id: number;
  schedule_adjustment_ids: number[] | null;
  seasonal_adjustment_percents: number[] | null;
  fixed_watering_run_time?: number;
  fixed_watering_frequency_mode?: number;
  fixed_watering_frequency_value?: number | null;
  watering_program_adjustment?: number | null;
  smart_watering_run_time?: number;
  smart_watering_frequency_value?: number;
  virtual_solar_sync_watering_run_time?: number;
  virtual_solar_sync_watering_frequency_mode?: number;
  virtual_solar_sync_watering_frequency_value?: number | null;
}

function narrowWateringProgram(p: WateringProgramFlatInput): WateringProgramWritable {
  const base = {
    watering_program_name: p.watering_program_name,
    watering_program_type: p.watering_program_type,
    controller_id: p.controller_id,
    schedule_adjustment_ids: p.schedule_adjustment_ids,
    seasonal_adjustment_percents: p.seasonal_adjustment_percents,
  };
  if (p.program_type === 'Time') {
    if (p.fixed_watering_run_time === undefined || p.fixed_watering_frequency_mode === undefined) {
      throw new ConfigError(
        'program_type=Time requires fixed_watering_run_time and fixed_watering_frequency_mode',
      );
    }
    return {
      ...base,
      program_type: 'Time',
      fixed_watering_run_time: p.fixed_watering_run_time,
      fixed_watering_frequency_mode: p.fixed_watering_frequency_mode,
      fixed_watering_frequency_value: p.fixed_watering_frequency_value,
      watering_program_adjustment: p.watering_program_adjustment,
    };
  }
  if (p.program_type === 'Smart') {
    if (p.smart_watering_run_time === undefined || p.smart_watering_frequency_value === undefined) {
      throw new ConfigError(
        'program_type=Smart requires smart_watering_run_time and smart_watering_frequency_value',
      );
    }
    return {
      ...base,
      program_type: 'Smart',
      smart_watering_run_time: p.smart_watering_run_time,
      smart_watering_frequency_value: p.smart_watering_frequency_value,
    };
  }
  if (
    p.virtual_solar_sync_watering_run_time === undefined ||
    p.virtual_solar_sync_watering_frequency_mode === undefined
  ) {
    throw new ConfigError(
      'program_type=VirtualSolarSync requires virtual_solar_sync_watering_run_time and virtual_solar_sync_watering_frequency_mode',
    );
  }
  return {
    ...base,
    program_type: 'VirtualSolarSync',
    virtual_solar_sync_watering_run_time: p.virtual_solar_sync_watering_run_time,
    virtual_solar_sync_watering_frequency_mode: p.virtual_solar_sync_watering_frequency_mode,
    virtual_solar_sync_watering_frequency_value: p.virtual_solar_sync_watering_frequency_value,
  };
}
