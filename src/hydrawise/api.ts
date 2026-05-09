import type { HydrawiseClient } from './client.js';
import {
  CONTROLLER_QUERY,
  CONTROLLERS_QUERY,
  CREATE_PROGRAM_START_TIME_MUTATION,
  CREATE_SMART_WATERING_PROGRAM_MUTATION,
  CREATE_STANDARD_PROGRAM_MUTATION,
  CREATE_TIME_WATERING_PROGRAM_MUTATION,
  CREATE_VSS_WATERING_PROGRAM_MUTATION,
  DELETE_PROGRAM_START_TIME_MUTATION,
  DELETE_STANDARD_PROGRAM_MUTATION,
  ME_QUERY,
  PROGRAM_START_TIMES_QUERY,
  PROGRAMS_QUERY,
  REMOVE_WATERING_PROGRAM_MUTATION,
  RESUME_ALL_ZONES_MUTATION,
  RESUME_ZONE_MUTATION,
  SEASONAL_ADJUSTMENTS_QUERY,
  START_ALL_ZONES_MUTATION,
  START_ZONE_MUTATION,
  STOP_ALL_ZONES_MUTATION,
  STOP_ZONE_MUTATION,
  SUSPEND_ALL_ZONES_MUTATION,
  SUSPEND_ZONE_MUTATION,
  UPDATE_PROGRAM_START_TIME_MUTATION,
  UPDATE_SEASONAL_ADJUSTMENTS_MUTATION,
  UPDATE_SMART_WATERING_PROGRAM_MUTATION,
  UPDATE_STANDARD_PROGRAM_MUTATION,
  UPDATE_TIME_WATERING_PROGRAM_MUTATION,
  UPDATE_VSS_WATERING_PROGRAM_MUTATION,
  UPDATE_WATERING_TRIGGERS_MUTATION,
  UPDATE_ZONE_MUTATION,
  WATERING_TRIGGERS_QUERY,
  ZONE_FULL_QUERY,
  ZONE_QUERY,
  ZONES_QUERY,
  type Controller,
  type ProgramListEntry,
  type ProgramStartTimeRead,
  type StandardProgramWritable,
  type StatusCodeAndSummary,
  type User,
  type WateringProgramType,
  type WateringProgramWritable,
  type WateringTriggersRead,
  type WateringTriggersWritable,
  type Zone,
  type ZoneRichRead,
  type ZoneWritable,
} from './queries.js';

export interface StartZoneOptions {
  durationSeconds?: number;
  markRunAsScheduled?: boolean;
  stackRuns?: boolean;
}

export interface StartAllZonesOptions {
  durationSeconds?: number;
  markRunAsScheduled?: boolean;
}

export class HydrawiseApi {
  constructor(private readonly client: HydrawiseClient) {}

  async getUser(): Promise<User> {
    const data = await this.client.query<{ me: User }>(ME_QUERY);
    return data.me;
  }

  async getControllers(): Promise<Controller[]> {
    const data = await this.client.query<{ me: { controllers: Controller[] | null } }>(
      CONTROLLERS_QUERY,
    );
    return data.me.controllers ?? [];
  }

  async getController(controllerId: number): Promise<Controller | null> {
    const data = await this.client.query<{ controller: Controller | null }>(CONTROLLER_QUERY, {
      controllerId,
    });
    return data.controller;
  }

  async getZones(controllerId: number): Promise<Zone[]> {
    const data = await this.client.query<{ controller: { zones: Zone[] | null } | null }>(
      ZONES_QUERY,
      { controllerId },
    );
    return data.controller?.zones ?? [];
  }

  async getZone(zoneId: number): Promise<Zone | null> {
    const data = await this.client.query<{ zone: Zone | null }>(ZONE_QUERY, { zoneId });
    return data.zone;
  }

  async startZone(zoneId: number, options: StartZoneOptions = {}): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      START_ZONE_MUTATION,
      {
        zoneId,
        markRunAsScheduled: options.markRunAsScheduled ?? false,
        stackRuns: options.stackRuns ?? true,
        customRunDuration: options.durationSeconds && options.durationSeconds > 0
          ? options.durationSeconds
          : null,
      },
      (data) => data.startZone as StatusCodeAndSummary,
    );
  }

  async stopZone(zoneId: number): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      STOP_ZONE_MUTATION,
      { zoneId },
      (data) => data.stopZone as StatusCodeAndSummary,
    );
  }

  async startAllZones(
    controllerId: number,
    options: StartAllZonesOptions = {},
  ): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      START_ALL_ZONES_MUTATION,
      {
        controllerId,
        markRunAsScheduled: options.markRunAsScheduled ?? false,
        customRunDuration: options.durationSeconds && options.durationSeconds > 0
          ? options.durationSeconds
          : null,
      },
      (data) => data.startAllZones as StatusCodeAndSummary,
    );
  }

  async stopAllZones(controllerId: number): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      STOP_ALL_ZONES_MUTATION,
      { controllerId },
      (data) => data.stopAllZones as StatusCodeAndSummary,
    );
  }

  async suspendZone(zoneId: number, until: Date): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      SUSPEND_ZONE_MUTATION,
      { zoneId, until: until.toISOString() },
      (data) => data.suspendZone as StatusCodeAndSummary,
    );
  }

  async resumeZone(zoneId: number): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      RESUME_ZONE_MUTATION,
      { zoneId },
      (data) => data.resumeZone as StatusCodeAndSummary,
    );
  }

  async suspendAllZones(controllerId: number, until: Date): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      SUSPEND_ALL_ZONES_MUTATION,
      { controllerId, until: until.toISOString() },
      (data) => data.suspendAllZones as StatusCodeAndSummary,
    );
  }

  async resumeAllZones(controllerId: number): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      RESUME_ALL_ZONES_MUTATION,
      { controllerId },
      (data) => data.resumeAllZones as StatusCodeAndSummary,
    );
  }

  // ---------------------------------------------------------------------------
  // Schedule management — added in change `add-schedule-management`.
  // ---------------------------------------------------------------------------

  async getZoneFull(zoneId: number): Promise<ZoneRichRead | null> {
    const data = await this.client.query<{ zone: ZoneRichRead | null }>(ZONE_FULL_QUERY, {
      zoneId,
    });
    return data.zone;
  }

  async getSeasonalAdjustments(controllerId: number): Promise<number[]> {
    const data = await this.client.query<{
      controller: { settings: { offline: { seasonalAdjustments: number[] | null } } | null } | null;
    }>(SEASONAL_ADJUSTMENTS_QUERY, { controllerId });
    return data.controller?.settings?.offline?.seasonalAdjustments ?? [];
  }

  async getWateringTriggers(controllerId: number): Promise<WateringTriggersRead | null> {
    const data = await this.client.query<{
      controller: { wateringTriggers: WateringTriggersRead | null } | null;
    }>(WATERING_TRIGGERS_QUERY, { controllerId });
    return data.controller?.wateringTriggers ?? null;
  }

  async getPrograms(controllerId: number, includeZoneSpecific = true): Promise<ProgramListEntry[]> {
    const data = await this.client.query<{
      controller: {
        programs:
          | {
              __typename: string;
              id: number;
              name: string;
              schedulingMethod: { value: number } | null;
              appliesToZones: { id: number }[] | null;
            }[]
          | null;
      } | null;
    }>(PROGRAMS_QUERY, { controllerId, includeZoneSpecific });
    return (data.controller?.programs ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      program_type: p.__typename,
      scheduling_method: p.schedulingMethod?.value ?? null,
      applies_to_zone_ids: (p.appliesToZones ?? []).map((z) => z.id),
    }));
  }

  async getProgramStartTimesForZone(zoneId: number): Promise<ProgramStartTimeRead[]> {
    const data = await this.client.query<{
      zone: {
        wateringSettings: { programStartTimes: ProgramStartTimeRead[] | null } | null;
      } | null;
    }>(PROGRAM_START_TIMES_QUERY, { zoneId });
    return data.zone?.wateringSettings?.programStartTimes ?? [];
  }

  async updateZone(payload: ZoneWritable): Promise<{ id: number } | null> {
    return this.client.mutateRaw(UPDATE_ZONE_MUTATION, zoneWritableToVars(payload));
  }

  async updateSeasonalAdjustments(controllerId: number, factors: number[]): Promise<boolean> {
    const data = await this.client.mutateRaw<{ updateSeasonalAdjustments: boolean | null }>(
      UPDATE_SEASONAL_ADJUSTMENTS_MUTATION,
      { controllerId, factors },
    );
    return data.updateSeasonalAdjustments ?? false;
  }

  async updateWateringTriggers(payload: WateringTriggersWritable): Promise<{ id: number } | null> {
    return this.client.mutateRaw(
      UPDATE_WATERING_TRIGGERS_MUTATION,
      wateringTriggersWritableToVars(payload),
    );
  }

  async createProgramStartTime(payload: {
    controller_id: number;
    apply_all: boolean;
    zones: number[];
    schedules: number[];
    time: string;
    watering_type: number;
    time_type: string;
    sunday: number;
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
  }): Promise<{ id: number } | null> {
    return this.client.mutateRaw(
      CREATE_PROGRAM_START_TIME_MUTATION,
      programStartTimeWritableToVars(payload, false),
    );
  }

  async updateProgramStartTime(payload: {
    id: number;
    controller_id: number;
    apply_all: boolean;
    zones: number[];
    schedules: number[];
    time: string;
    watering_type: number;
    time_type: string;
    sunday: number;
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
  }): Promise<{ id: number } | null> {
    return this.client.mutateRaw(
      UPDATE_PROGRAM_START_TIME_MUTATION,
      programStartTimeWritableToVars(payload, true),
    );
  }

  async deleteProgramStartTime(id: number, controllerId: number): Promise<number> {
    const data = await this.client.mutateRaw<{ deleteProgramStartTime: number | null }>(
      DELETE_PROGRAM_START_TIME_MUTATION,
      { id, controllerId, isContractor: false },
    );
    return data.deleteProgramStartTime ?? 0;
  }

  async createStandardProgram(payload: StandardProgramWritable): Promise<{ id: number; name: string } | null> {
    return this.client.mutateRaw(CREATE_STANDARD_PROGRAM_MUTATION, standardProgramToVars(payload, false));
  }

  async updateStandardProgram(payload: StandardProgramWritable & { program_id: number }): Promise<{ id: number; name: string } | null> {
    return this.client.mutateRaw(UPDATE_STANDARD_PROGRAM_MUTATION, standardProgramToVars(payload, true));
  }

  async deleteStandardProgram(programId: number, controllerId: number): Promise<number> {
    const data = await this.client.mutateRaw<{ deleteStandardProgram: number | null }>(
      DELETE_STANDARD_PROGRAM_MUTATION,
      { programId, controllerId },
    );
    return data.deleteStandardProgram ?? 0;
  }

  async createWateringProgram(payload: WateringProgramWritable): Promise<{ id: number; name: string } | null> {
    return this.dispatchWateringProgram(payload, /* isUpdate */ false);
  }

  async updateWateringProgram(
    payload: WateringProgramWritable & { program_id: number },
  ): Promise<{ id: number; name: string } | null> {
    return this.dispatchWateringProgram(payload, /* isUpdate */ true);
  }

  async removeWateringProgram(programId: number): Promise<number> {
    const data = await this.client.mutateRaw<{ removeWateringProgram: number | null }>(
      REMOVE_WATERING_PROGRAM_MUTATION,
      { wateringProgramId: programId },
    );
    return data.removeWateringProgram ?? 0;
  }

  private async dispatchWateringProgram(
    payload: WateringProgramWritable,
    isUpdate: boolean,
  ): Promise<{ id: number; name: string } | null> {
    const vars = wateringProgramToVars(payload, isUpdate);
    const mutation = pickWateringProgramMutation(payload.program_type, isUpdate);
    return this.client.mutateRaw(mutation, vars);
  }
}

function pickWateringProgramMutation(type: WateringProgramType, isUpdate: boolean): string {
  if (type === 'Time') {
    return isUpdate ? UPDATE_TIME_WATERING_PROGRAM_MUTATION : CREATE_TIME_WATERING_PROGRAM_MUTATION;
  }
  if (type === 'Smart') {
    return isUpdate ? UPDATE_SMART_WATERING_PROGRAM_MUTATION : CREATE_SMART_WATERING_PROGRAM_MUTATION;
  }
  return isUpdate ? UPDATE_VSS_WATERING_PROGRAM_MUTATION : CREATE_VSS_WATERING_PROGRAM_MUTATION;
}

function zoneWritableToVars(p: ZoneWritable): Record<string, unknown> {
  return {
    zoneId: p.zone_id,
    icon: p.icon,
    name: p.name,
    number: p.number,
    wateringMode: p.watering_mode,
    globalMasterValve: p.global_master_valve,
    scheduleAdjustmentIds: p.schedule_adjustment_ids,
    wateringAdjustment: p.watering_adjustment,
    wateringType: p.watering_type,
    runTime: p.run_time,
    wateringFrequencyMode: p.watering_frequency_mode,
    fixedWateringFrequency: p.fixed_watering_frequency,
    smartWateringFrequency: p.smart_watering_frequency,
    virtualSolarSyncWateringFrequency: p.virtual_solar_sync_watering_frequency,
    runNextAvailableStartTime: p.run_next_available_start_time,
    preConfiguredWateringScheduleId: p.pre_configured_watering_schedule_id,
    cycleSoakEnable: p.cycle_soak_enable,
    cycleCustomTime: p.cycle_custom_time,
    soakCustomTime: p.soak_custom_time,
    factors: p.factors,
    sensorIds: p.sensor_ids,
    reusableSchedule: p.reusable_schedule,
    reusableScheduleName: p.reusable_schedule_name,
  };
}

function wateringTriggersWritableToVars(p: WateringTriggersWritable): Record<string, unknown> {
  return {
    controllerId: p.controller_id,
    contractorId: null,
    isContractor: false,
    extendWaterTemperature: p.extend_water_temperature,
    extendWaterTemperatureEnabled: p.extend_water_temperature_enabled,
    extendWaterTemperaturePercentage: p.extend_water_temperature_percentage,
    extendWaterHumidity: p.extend_water_humidity,
    extendWaterHumidityEnabled: p.extend_water_humidity_enabled,
    suspendWaterWeekRain: p.suspend_water_week_rain,
    suspendWaterRainDays: p.suspend_water_rain_days,
    suspendWaterWeekRainEnabled: p.suspend_water_week_rain_enabled,
    suspendWaterRain: p.suspend_water_rain,
    suspendWaterRainEnabled: p.suspend_water_rain_enabled,
    suspendWaterTemperature: p.suspend_water_temperature,
    suspendWaterTemperatureEnabled: p.suspend_water_temperature_enabled,
    suspendProbabilityOfPrecipitation: p.suspend_probability_of_precipitation,
    suspendProbabilityOfPrecipitationEnabled: p.suspend_probability_of_precipitation_enabled,
    suspendWind: p.suspend_wind,
    suspendWindEnabled: p.suspend_wind_enabled,
    enableEvapotranspirationForecastTemperature: p.enable_evapotranspiration_forecast_temperature,
    enableEvapotranspirationForecastRain: p.enable_evapotranspiration_forecast_rain,
    reduceWaterTemperatureEnabled: p.reduce_water_temperature_enabled,
    reduceWaterTemperature: p.reduce_water_temperature,
    reduceWaterTemperaturePercentage: p.reduce_water_temperature_percentage,
  };
}

function programStartTimeWritableToVars(
  p: {
    id?: number;
    controller_id: number;
    apply_all: boolean;
    zones: number[];
    schedules: number[];
    time: string;
    watering_type: number;
    time_type: string;
    sunday: number;
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
  },
  includeId: boolean,
): Record<string, unknown> {
  const vars: Record<string, unknown> = {
    controllerId: p.controller_id,
    contractorId: null,
    isContractor: false,
    applyAll: p.apply_all,
    zones: p.zones,
    schedules: p.schedules,
    time: p.time,
    wateringType: p.watering_type,
    timeType: p.time_type,
    sunday: p.sunday,
    monday: p.monday,
    tuesday: p.tuesday,
    wednesday: p.wednesday,
    thursday: p.thursday,
    friday: p.friday,
    saturday: p.saturday,
  };
  if (includeId && p.id !== undefined) vars.id = p.id;
  return vars;
}

function standardProgramToVars(
  p: StandardProgramWritable,
  isUpdate: boolean,
): Record<string, unknown> {
  const vars: Record<string, unknown> = {
    controllerId: p.controller_id,
    name: p.name,
    programType: p.program_type,
    dayPattern: p.day_pattern,
    standardProgramDayPattern: p.standard_program_day_pattern,
    interval: p.interval,
    seriesStart: p.series_start,
    startTimes: p.start_times,
    zoneRunTimes: p.zone_run_times.map((z) => ({
      zoneNumber: z.zone_number,
      runTimeGroupId: z.run_time_group_id ?? null,
      runDuration: z.run_duration ?? null,
    })),
    scheduleAdjustmentIds: p.schedule_adjustment_ids,
    seasonalAdjustmentFactors: p.seasonal_adjustment_factors,
    validFrom: p.valid_from,
    validTo: p.valid_to,
    ignoreRainSensor: p.ignore_rain_sensor,
  };
  if (isUpdate && p.program_id !== undefined) vars.programId = p.program_id;
  return vars;
}

function wateringProgramToVars(
  p: WateringProgramWritable,
  isUpdate: boolean,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    wateringProgramName: p.watering_program_name,
    wateringProgramType: p.watering_program_type,
    controllerId: p.controller_id,
    seasonalAdjustment: p.seasonal_adjustment,
    scheduleAdjustmentIds: p.schedule_adjustment_ids,
  };
  if (isUpdate && p.program_id !== undefined) base.wateringProgramId = p.program_id;
  if (p.program_type === 'Time') {
    base.fixedWateringRunTime = p.fixed_watering_run_time;
    base.fixedWateringFrequencyMode = p.fixed_watering_frequency_mode;
    base.fixedWateringFrequencyValue = p.fixed_watering_frequency_value;
    base.wateringProgramAdjustment = p.watering_program_adjustment;
  } else if (p.program_type === 'Smart') {
    base.smartWateringRunTime = p.smart_watering_run_time;
    base.smartWateringFrequencyValue = p.smart_watering_frequency_value;
  } else {
    base.virtualSolarSyncWateringRunTime = p.virtual_solar_sync_watering_run_time;
    base.virtualSolarSyncWateringFrequencyMode = p.virtual_solar_sync_watering_frequency_mode;
    base.virtualSolarSyncWateringFrequencyValue = p.virtual_solar_sync_watering_frequency_value;
  }
  return base;
}
