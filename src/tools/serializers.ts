import type {
  Controller,
  ProgramStartTimeRead,
  RunEventType,
  RunSummaryDetails,
  ScheduledZoneRun,
  User,
  WateringTriggersRead,
  Zone,
  ZoneRichRead,
} from '../hydrawise/queries.js';

export function serializeUser(user: User): Record<string, unknown> {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

export function serializeController(controller: Controller): Record<string, unknown> {
  return {
    id: controller.id,
    name: controller.name,
    online: controller.online,
    serial_number: controller.hardware?.serialNumber ?? null,
    last_contact_time: controller.lastContactTime?.value ?? null,
    software_version: controller.softwareVersion ?? null,
    program_mode: controller.programMode ?? null,
    hardware_status: controller.hardware?.status ?? null,
    installation_time: controller.hardware?.installationTime?.value ?? null,
    model: controller.hardware?.model
      ? {
          id: controller.hardware.model.id,
          name: controller.hardware.model.name,
          family: controller.hardware.model.family?.name ?? null,
        }
      : null,
  };
}

export function serializeZone(zone: Zone): Record<string, unknown> {
  return {
    id: zone.id,
    name: zone.name,
    number: zone.number.value,
  };
}

// Returns null for fields the read schema doesn't expose, forcing the caller to supply them on update.
export function serializeZoneSettings(zone: ZoneRichRead): Record<string, unknown> {
  const ws = zone.wateringSettings;
  return {
    zone_id: zone.id,
    name: zone.name,
    number: zone.number.value,
    icon: zone.icon?.id ?? null,
    watering_adjustment: ws?.fixedWateringAdjustment ?? null,
    // cycle_soak_enable isn't exposed in reads — infer from cycleAndSoakSettings presence; null when wateringSettings is missing entirely.
    cycle_soak_enable: ws ? ws.cycleAndSoakSettings != null : null,
    cycle_custom_time: ws?.cycleAndSoakSettings?.cycleDuration ?? null,
    soak_custom_time: ws?.cycleAndSoakSettings?.soakDuration ?? null,
    // Monitoring method/value aren't readable; caller supplies. monitoring_observed below is read-only.
    flow_monitoring_method: null,
    current_monitoring_method: null,
    flow_monitoring_value: null,
    current_monitoring_value: null,
    monitoring_observed: zone.monitoringSettings
      ? {
          operating_ranges: {
            water_flow_rate: zone.monitoringSettings.operatingRanges?.waterFlowRate?.value ?? null,
            electric_current:
              zone.monitoringSettings.operatingRanges?.electricCurrent?.value ?? null,
          },
          measured_medians: {
            water_flow_rate: zone.monitoringSettings.measuredMedians?.waterFlowRate?.value ?? null,
            electric_current:
              zone.monitoringSettings.measuredMedians?.electricCurrent?.value ?? null,
          },
        }
      : null,
    // Read schema doesn't expose these; caller must supply on update.
    watering_mode: null,
    global_master_valve: null,
    schedule_adjustment_ids: null,
    watering_type: null,
    run_time: null,
    watering_frequency_mode: null,
    fixed_watering_frequency: null,
    smart_watering_frequency: null,
    virtual_solar_sync_watering_frequency: null,
    run_next_available_start_time: null,
    pre_configured_watering_schedule_id: null,
    factors: null,
    sensor_ids: null,
    reusable_schedule: null,
    reusable_schedule_name: null,
  };
}

export function serializeWateringTriggers(t: WateringTriggersRead): Record<string, unknown> {
  return {
    extend_water_temperature: t.extendWaterTemperature?.value ?? null,
    extend_water_temperature_enabled: t.extendWaterTemperatureEnabled,
    extend_water_temperature_percentage: t.extendWaterTemperaturePercentage,
    extend_water_humidity: t.extendWaterHumidity,
    extend_water_humidity_enabled: t.extendWaterHumidityEnabled,
    suspend_water_week_rain: t.suspendWaterWeekRain?.value ?? null,
    suspend_water_rain_days: t.suspendWaterRainDays,
    suspend_water_week_rain_enabled: t.suspendWaterWeekRainEnabled,
    suspend_water_rain: t.suspendWaterRain?.value ?? null,
    suspend_water_rain_enabled: t.suspendWaterRainEnabled,
    suspend_water_temperature: t.suspendWaterTemperature?.value ?? null,
    suspend_water_temperature_enabled: t.suspendWaterTemperatureEnabled,
    suspend_probability_of_precipitation: t.suspendProbabilityOfPrecipitation,
    suspend_probability_of_precipitation_enabled: t.suspendProbabilityOfPrecipitationEnabled,
    suspend_wind: t.suspendWind?.value ?? null,
    suspend_wind_enabled: t.suspendWindEnabled,
    enable_evapotranspiration_forecast_temperature: t.enableEvapotranspirationForecastTemperature,
    enable_evapotranspiration_forecast_rain: t.enableEvapotranspirationForecastRain,
    reduce_water_temperature_enabled: t.reduceWaterTemperatureEnabled,
    reduce_water_temperature: t.reduceWaterTemperature?.value ?? null,
    reduce_water_temperature_percentage: t.reduceWaterTemperaturePercentage,
  };
}

export function serializeRunEvent(e: RunEventType): Record<string, unknown> {
  return {
    id: e.id,
    zone_id: e.zone.id,
    zone_name: e.zone.name,
    program_id: e.standardProgram?.id ?? null,
    program_name: e.standardProgram?.name ?? null,
    normal_start_time: e.normalStartTime?.value ?? null,
    scheduled_start_time: e.scheduledStartTime?.value ?? null,
    reported_start_time: e.reportedStartTime?.value ?? null,
    normal_end_time: e.normalEndTime?.value ?? null,
    scheduled_end_time: e.scheduledEndTime?.value ?? null,
    reported_end_time: e.reportedEndTime?.value ?? null,
    normal_duration_seconds: e.normalDuration ?? null,
    scheduled_duration_seconds: e.scheduledDuration ?? null,
    reported_duration_seconds: e.reportedDuration ?? null,
    scheduled_status: e.scheduledStatus?.label ?? null,
    reported_status: e.reportedStatus?.label ?? null,
    reported_water_usage: e.reportedWaterUsage
      ? { value: e.reportedWaterUsage.value, unit: e.reportedWaterUsage.unit }
      : null,
    stop_reason_finished_normally: e.reportedStopReason?.finishedNormally ?? null,
    stop_reason_description: e.reportedStopReason?.description ?? null,
    reported_current: e.reportedCurrent
      ? { value: e.reportedCurrent.value, unit: e.reportedCurrent.unit }
      : null,
  };
}

export function serializeScheduledZoneRun(
  r: ScheduledZoneRun | null | undefined,
): Record<string, unknown> | null {
  if (!r) return null;
  return {
    id: r.id,
    start_time: r.startTime.value,
    end_time: r.endTime.value,
    normal_duration_minutes: r.normalDuration,
    // Hydrawise's `duration` is the SCHEDULED minutes the controller was told to run, not what actually elapsed. Compute actual_elapsed_seconds from start/end so manual cancellations and short runs are visible.
    scheduled_duration_minutes: r.duration,
    actual_elapsed_seconds: computeElapsedSeconds(r.startTime.value, r.endTime.value),
    status: r.status.label ?? null,
  };
}

function computeElapsedSeconds(start: string, end: string): number | null {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

export function serializeRunSummaryDetails(
  d: RunSummaryDetails | null | undefined,
): Record<string, unknown> {
  return {
    total_normal_run_time_minutes: d?.totalNormalRunTime ?? 0,
    total_actual_run_time_minutes: d?.totalActualRunTime ?? 0,
    total_water_volume: d?.totalWaterVolume
      ? { value: d.totalWaterVolume.value, unit: d.totalWaterVolume.unit }
      : null,
  };
}

export function serializeProgramStartTime(p: ProgramStartTimeRead): Record<string, unknown> {
  const time = p.time;
  let timeString: string | null = null;
  if (time && 'value' in time) timeString = time.value;
  else if (time && 'hour' in time)
    timeString = `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
  return {
    id: p.id,
    type_value: p.type?.value ?? null,
    time: timeString,
    apply_all: p.application?.all ?? null,
    zone_ids: (p.application?.zones ?? []).map((z) => z.id),
  };
}
