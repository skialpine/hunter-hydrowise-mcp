import type {
  Controller,
  ControllerNoteRead,
  ExpanderRead,
  LocationRead,
  MasterValveRead,
  ModuleRead,
  ProgramStartTimeRead,
  RunEventType,
  RunSummaryDetails,
  RunTimeGroupRead,
  ScheduledZoneRun,
  TimeZoneRead,
  User,
  WateringTriggersRead,
  Zone,
  ZoneNoteRead,
  ZoneRichRead,
} from '../hydrawise/queries.js';

// Listed in the snapshot's per-zone _unreadable_fields block. These are accepted by updateZoneAdvanced but not surfaced by any read query — the AI restoring must supply them from another source.
const ZONE_UNREADABLE_FIELDS = [
  'watering_mode',
  'global_master_valve',
  'schedule_adjustment_ids',
  'watering_type',
  'run_time',
  'watering_frequency_mode',
  'fixed_watering_frequency',
  'smart_watering_frequency',
  'virtual_solar_sync_watering_frequency',
  'run_next_available_start_time',
  'pre_configured_watering_schedule_id',
  'factors',
  'sensor_ids',
  'reusable_schedule',
  'reusable_schedule_name',
  'flow_monitoring_method',
  'current_monitoring_method',
  'flow_monitoring_value',
  'current_monitoring_value',
] as const;

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
    device_id: controller.deviceId,
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
    location: controller.location ? serializeLocation(controller.location) : null,
    time_zone: controller.settings?.timeZone ? serializeTimeZone(controller.settings.timeZone) : null,
    inter_zone_delay: controller.settings?.zones?.interZoneDelay ?? null,
    master_valve: controller.masterZone ? serializeMasterValve(controller.masterZone) : null,
    expanders: (controller.expanders ?? []).map(serializeExpander),
    modules: (controller.hardware?.modules ?? []).map(serializeModule),
    run_time_groups: controller.runTimeGroups.map(serializeRunTimeGroup),
    controller_notes: controller.controllerNotes.map(serializeNote),
  };
}

export function serializeLocation(loc: LocationRead): Record<string, unknown> {
  return {
    id: loc.id,
    latitude: loc.coordinates?.latitude ?? null,
    longitude: loc.coordinates?.longitude ?? null,
    address: loc.address,
    country: loc.country,
    state: loc.state,
    locality: loc.locality,
  };
}

export function serializeTimeZone(tz: TimeZoneRead): Record<string, unknown> {
  return { name: tz.name, offset: tz.offset };
}

export function serializeMasterValve(mv: MasterValveRead): Record<string, unknown> {
  return {
    zone_number: mv.zoneNumber?.value ?? null,
    delay: mv.delay,
    post_timer: mv.postTimer,
  };
}

export function serializeExpander(e: ExpanderRead): Record<string, unknown> {
  return {
    id: e.id,
    name: e.name,
    number: e.number,
    model_id: e.hardware.model.id,
    firmware: (e.hardware.firmware ?? []).map((f) => ({
      type: f.type,
      version: f.version,
      bank: f.bank,
    })),
  };
}

export function serializeModule(m: ModuleRead): Record<string, unknown> {
  return {
    id: m.id,
    name: m.name,
    serial_number: m.serialNumber,
    module_type: m.moduleType,
    firmware_version: m.firmwareVersion,
  };
}

export function serializeRunTimeGroup(g: RunTimeGroupRead): Record<string, unknown> {
  return {
    id: g.id,
    name: g.name,
    duration_minutes: g.duration,
  };
}

export function serializeNote(n: ControllerNoteRead | ZoneNoteRead): Record<string, unknown> {
  return {
    id: n.id,
    note: n.note,
    type: n.type,
    pinned_to_top: n.pinnedToTop,
    last_updated_at: n.lastUpdatedAt?.value ?? null,
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
    // -1 = global, 0 = always disabled, else specific zone number.
    master_valve_override: zone.masterValve,
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
            water_flow_rate: serializeUnitValue(zone.monitoringSettings.operatingRanges?.waterFlowRate),
            electric_current: serializeUnitValue(zone.monitoringSettings.operatingRanges?.electricCurrent),
          },
          measured_medians: {
            water_flow_rate: serializeUnitValue(zone.monitoringSettings.measuredMedians?.waterFlowRate),
            electric_current: serializeUnitValue(zone.monitoringSettings.measuredMedians?.electricCurrent),
          },
        }
      : null,
    zone_notes: (zone.zoneNotes ?? []).map(serializeNote),
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
    _unreadable_fields: [...ZONE_UNREADABLE_FIELDS],
  };
}

// LocalizedValueType → { value, unit } object so the snapshot can detect unit-pref drift between capture and restore.
function serializeUnitValue(
  v: { value: number | null; unit: string | null } | null | undefined,
): { value: number | null; unit: string | null } | null {
  if (v == null) return null;
  return { value: v.value ?? null, unit: v.unit ?? null };
}

export function serializeWateringTriggers(t: WateringTriggersRead): Record<string, unknown> {
  return {
    extend_water_temperature: serializeUnitValue(t.extendWaterTemperature),
    extend_water_temperature_enabled: t.extendWaterTemperatureEnabled,
    extend_water_temperature_percentage: t.extendWaterTemperaturePercentage,
    extend_water_humidity: t.extendWaterHumidity,
    extend_water_humidity_enabled: t.extendWaterHumidityEnabled,
    suspend_water_week_rain: serializeUnitValue(t.suspendWaterWeekRain),
    suspend_water_rain_days: t.suspendWaterRainDays,
    suspend_water_week_rain_enabled: t.suspendWaterWeekRainEnabled,
    suspend_water_rain: serializeUnitValue(t.suspendWaterRain),
    suspend_water_rain_enabled: t.suspendWaterRainEnabled,
    suspend_water_temperature: serializeUnitValue(t.suspendWaterTemperature),
    suspend_water_temperature_enabled: t.suspendWaterTemperatureEnabled,
    suspend_probability_of_precipitation: t.suspendProbabilityOfPrecipitation,
    suspend_probability_of_precipitation_enabled: t.suspendProbabilityOfPrecipitationEnabled,
    suspend_wind: serializeUnitValue(t.suspendWind),
    suspend_wind_enabled: t.suspendWindEnabled,
    enable_evapotranspiration_forecast_temperature: t.enableEvapotranspirationForecastTemperature,
    enable_evapotranspiration_forecast_rain: t.enableEvapotranspirationForecastRain,
    reduce_water_temperature_enabled: t.reduceWaterTemperatureEnabled,
    reduce_water_temperature: serializeUnitValue(t.reduceWaterTemperature),
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
    watering_days: p.wateringDays ?? null,
    apply_all: p.application?.all ?? null,
    zone_ids: (p.application?.zones ?? []).map((z) => z.id),
  };
}

export function serializeStandardProgram(p: import('../hydrawise/queries.js').StandardProgramRead): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    program_type: 'Standard',
    standard_program_day_pattern: p.standardProgramDayPattern,
    days_run: p.daysRun,
    start_times: p.startTimes,
    ignore_rain_sensor: p.ignoreRainSensor,
    monthly_watering_adjustments: p.monthlyWateringAdjustments,
    scheduling_method: p.schedulingMethod,
    periodicity: p.periodicity
      ? {
          period: p.periodicity.period,
          series_start: p.periodicity.seriesStart?.value ?? null,
        }
      : null,
    valid_from: p.timeRange?.validFrom ?? null,
    valid_to: p.timeRange?.validTo ?? null,
    schedule_adjustment_ids: p.conditionalWateringAdjustments.map((a) => a.id),
    applies_to_zones: p.appliesToZones.map((z) => ({
      id: z.id,
      number: z.number.value,
      name: z.name,
    })),
    // RunTimeGroup.duration is minutes; startZone's customRunDuration is seconds — don't conflate.
    per_zone_run_times: p.applications.map((a) => ({
      zone_id: a.zone.id,
      zone_number: a.zone.number.value,
      run_time_group_id: a.runTimeGroup.id,
      run_time_group_name: a.runTimeGroup.name,
      duration_minutes: a.runTimeGroup.duration,
    })),
  };
}
