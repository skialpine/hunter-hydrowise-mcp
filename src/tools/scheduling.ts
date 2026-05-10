import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ConfigError } from '../errors.js';
import type { HydrawiseApi } from '../hydrawise/api.js';
import type { Logger } from '../logger.js';
import {
  MONITORING_METHODS,
  WATERING_PROGRAM_TYPES,
  type WateringProgramWritable,
} from '../hydrawise/queries.js';
import {
  serializeProgramStartTime,
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
  watering_adjustment: z.number().int(),
  watering_type: z.number().int(),
  watering_frequency_mode: z.number().int(),
  icon: z.number().int().nullable().optional(),
  run_time: z.number().int().nullable().optional(),
  fixed_watering_frequency: z.number().int().nullable().optional(),
  smart_watering_frequency: z.number().int().nullable().optional(),
  virtual_solar_sync_watering_frequency: z.number().int().nullable().optional(),
  run_next_available_start_time: z.boolean().nullable().optional(),
  pre_configured_watering_schedule_id: z.number().int().nullable().optional(),
  cycle_soak_enable: z.boolean().nullable().optional(),
  cycle_custom_time: z.number().int().nullable().optional(),
  soak_custom_time: z.number().int().nullable().optional(),
  factors: z.array(z.number().int()).nullable().optional(),
  sensor_ids: z.array(z.number().int()).nullable().optional(),
  reusable_schedule: z.boolean().nullable().optional(),
  reusable_schedule_name: z.string().nullable().optional(),
  flow_monitoring_method: MonitoringMethodEnum.nullable().optional(),
  current_monitoring_method: MonitoringMethodEnum.nullable().optional(),
  flow_monitoring_value: z.number().nullable().optional(),
  current_monitoring_value: z.number().int().nullable().optional(),
  preview: z.boolean().optional(),
};

// setBaselineValues takes Float for both values; updateZoneAdvanced takes Int for currentMonitoringValue.
const SetBaselineInput = {
  zone_id: z.number().int(),
  flow_monitoring_method: MonitoringMethodEnum,
  current_monitoring_method: MonitoringMethodEnum,
  flow_monitoring_value: z.number().nullable().optional(),
  current_monitoring_value: z.number().nullable().optional(),
  preview: z.boolean().optional(),
};

const ControllerIdInput = { controller_id: z.number().int() };

const SeasonalAdjustmentsInput = {
  controller_id: z.number().int(),
  factors: z.array(z.number().int()).length(12, 'factors must have exactly 12 entries'),
  preview: z.boolean().optional(),
};

const WateringTriggersInput = {
  controller_id: z.number().int(),
  extend_water_temperature: z.number(),
  extend_water_temperature_enabled: z.boolean(),
  extend_water_temperature_percentage: z.number().int(),
  extend_water_humidity: z.number().int(),
  extend_water_humidity_enabled: z.boolean(),
  suspend_water_week_rain: z.number(),
  suspend_water_rain_days: z.number().int(),
  suspend_water_week_rain_enabled: z.boolean(),
  suspend_water_rain: z.number(),
  suspend_water_rain_enabled: z.boolean(),
  suspend_water_temperature: z.number(),
  suspend_water_temperature_enabled: z.boolean(),
  suspend_probability_of_precipitation: z.number().int(),
  suspend_probability_of_precipitation_enabled: z.boolean(),
  suspend_wind: z.number(),
  suspend_wind_enabled: z.boolean(),
  enable_evapotranspiration_forecast_temperature: z.boolean(),
  enable_evapotranspiration_forecast_rain: z.boolean(),
  reduce_water_temperature_enabled: z.boolean(),
  reduce_water_temperature: z.number(),
  reduce_water_temperature_percentage: z.number().int(),
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
  run_duration: z.number().int().nullable().optional(),
});

const StandardProgramBaseShape = {
  controller_id: z.number().int(),
  name: z.string(),
  program_type: z.number().int(),
  day_pattern: z.string(),
  standard_program_day_pattern: z.string().nullable(),
  interval: z.number().int().nullable(),
  series_start: z.number().int().nullable(),
  start_times: z.array(z.string()),
  zone_run_times: z.array(ZoneRunTimeShape),
  schedule_adjustment_ids: z.array(z.number().int()),
  seasonal_adjustment_factors: z.array(z.number().int()),
  valid_from: z.number().int().nullable(),
  valid_to: z.number().int().nullable(),
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
  seasonal_adjustment: z.array(z.number().int()).nullable(),
  fixed_watering_run_time: z.number().int().optional(),
  fixed_watering_frequency_mode: z.number().int().optional(),
  fixed_watering_frequency_value: z.number().int().nullable().optional(),
  watering_program_adjustment: z.number().int().nullable().optional(),
  smart_watering_run_time: z.number().int().optional(),
  smart_watering_frequency_value: z.number().int().optional(),
  virtual_solar_sync_watering_run_time: z.number().int().optional(),
  virtual_solar_sync_watering_frequency_mode: z.number().int().optional(),
  virtual_solar_sync_watering_frequency_value: z.number().int().nullable().optional(),
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
        'Return full detail for a single program. For Standard programs this includes start ' +
        'times, day pattern, days run, monthly adjustments, periodicity, and per-zone run-time ' +
        'groups (the "for X minutes" you see in the GUI).',
      inputSchema: {
        controller_id: z.number().int(),
        program_id: z.number().int(),
        program_type: z.enum(['Standard', 'Advanced'] as const),
      },
    },
    async ({ controller_id, program_id, program_type }) =>
      wrap('get_program', async () => {
        if (program_type !== 'Standard') {
          throw new ConfigError(
            `program_type=${program_type} is not yet supported by get_program; only Standard is implemented`,
          );
        }
        const program = await api.getStandardProgram(controller_id, program_id);
        if (!program) {
          throw new ConfigError(
            `program ${program_id} not found on controller ${controller_id}`,
          );
        }
        return jsonResult({
          id: program.id,
          name: program.name,
          program_type: 'Standard',
          standard_program_day_pattern: program.standardProgramDayPattern,
          days_run: program.daysRun,
          start_times: program.startTimes,
          ignore_rain_sensor: program.ignoreRainSensor,
          monthly_watering_adjustments: program.monthlyWateringAdjustments,
          scheduling_method: program.schedulingMethod,
          periodicity: program.periodicity
            ? {
                period: program.periodicity.period,
                series_start: program.periodicity.seriesStart?.value ?? null,
              }
            : null,
          applies_to_zones: program.appliesToZones.map((z) => ({
            id: z.id,
            number: z.number.value,
            name: z.name,
          })),
          // RunTimeGroup.duration is minutes; startZone's customRunDuration is seconds — don't conflate.
          per_zone_run_times: program.applications.map((a) => ({
            zone_id: a.zone.id,
            zone_number: a.zone.number.value,
            run_time_group_id: a.runTimeGroup.id,
            run_time_group_name: a.runTimeGroup.name,
            duration_minutes: a.runTimeGroup.duration,
          })),
        });
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
        jsonResult({ factors: await api.getSeasonalAdjustments(controller_id) }),
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
      description: `${PHYSICAL} apply a full writable zone payload (see \`get_zone_settings\` for shape) via the \`updateZoneAdvanced\` mutation. Includes the four optional monitoring fields (\`flow_monitoring_method\`, \`current_monitoring_method\`, \`flow_monitoring_value\`, \`current_monitoring_value\`). Pass \`preview: true\` to see what would be sent without dispatching.`,
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
          watering_adjustment: partial.watering_adjustment,
          watering_type: partial.watering_type,
          watering_frequency_mode: partial.watering_frequency_mode,
          icon: partial.icon ?? null,
          run_time: partial.run_time ?? null,
          fixed_watering_frequency: partial.fixed_watering_frequency ?? null,
          smart_watering_frequency: partial.smart_watering_frequency ?? null,
          virtual_solar_sync_watering_frequency:
            partial.virtual_solar_sync_watering_frequency ?? null,
          run_next_available_start_time: partial.run_next_available_start_time ?? null,
          pre_configured_watering_schedule_id: partial.pre_configured_watering_schedule_id ?? null,
          cycle_soak_enable: partial.cycle_soak_enable ?? null,
          cycle_custom_time: partial.cycle_custom_time ?? null,
          soak_custom_time: partial.soak_custom_time ?? null,
          factors: partial.factors ?? null,
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
      description: `${PHYSICAL} replace the 12 seasonal adjustment factors on a controller. \`factors\` must be exactly 12 ints. Pass \`preview: true\` to see what would be sent.`,
      inputSchema: SeasonalAdjustmentsInput,
    },
    async ({ controller_id, factors, preview }) =>
      wrap('update_seasonal_adjustments', async () =>
        previewOrApply(
          'updateSeasonalAdjustments',
          { controller_id, factors },
          preview,
          async () => api.updateSeasonalAdjustments(controller_id, factors),
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
  seasonal_adjustment: number[] | null;
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
    seasonal_adjustment: p.seasonal_adjustment,
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
