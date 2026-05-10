import type {
  AdvancedProgramRead,
  AdvancedProgramReferenceRead,
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
  SensorModelRead,
  SensorRead,
  TimeZoneRead,
  User,
  WateringTriggersRead,
  Zone,
  ZoneNoteRead,
  ZoneRichRead,
  ZoneWritable,
} from '../hydrawise/queries.js';

// Listed in the snapshot's per-zone _unreadable_fields block. These are accepted by updateZoneAdvanced but not surfaced by any read query — the AI restoring must supply them from another source.
// Constrained to `keyof ZoneWritable` so adding/renaming a writable field forces a compile error here.
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
] as const satisfies readonly (keyof ZoneWritable)[];

// Several Hydrawise list types declare nullable members ([Expander], [Module], [ZoneNote]!, [ControllerNote]!, [ExpanderFirmware]); strip nulls so per-element serializers can be null-blind. Don't "simplify" to `arr ?? []` — runtime nulls would crash with "Cannot read properties of null".
export function nonNull<T>(arr: (T | null)[] | null | undefined): T[] {
  return (arr ?? []).filter((x): x is T => x != null);
}

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
    expanders: nonNull(controller.expanders).map(serializeExpander),
    modules: nonNull(controller.hardware?.modules).map(serializeModule),
    run_time_groups: controller.runTimeGroups.map(serializeRunTimeGroup),
    controller_notes: nonNull(controller.controllerNotes).map(serializeNote),
  };
}

export function serializeLocation(loc: LocationRead): Record<string, unknown> {
  // Explicitly coalesce undefined → null so JSON.stringify emits the keys with null values
  // rather than dropping them entirely. The snapshot contract is "every documented field appears
  // as null OR a typed value", never "key absent."
  return {
    id: loc.id,
    latitude: loc.coordinates?.latitude ?? null,
    longitude: loc.coordinates?.longitude ?? null,
    address: loc.address ?? null,
    country: loc.country ?? null,
    state: loc.state ?? null,
    locality: loc.locality ?? null,
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
    firmware: nonNull(e.hardware.firmware).map((f) => ({
      type: f.type,
      version: f.version,
      bank: f.bank,
    })),
  };
}

export function serializeModule(m: ModuleRead): Record<string, unknown> {
  return {
    // Long! scalar from upstream is delivered as a JS Number by graphql-request; coerce to string
    // so the snapshot survives the JS Int53 boundary if a future module id ever exceeds 2^53.
    id: String(m.id),
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
    zone_notes: nonNull(zone.zoneNotes).map(serializeNote),
    // ADVANCED-mode zones expose a per-zone `advancedProgram` reference (the
    // `... on AdvancedWateringSettings` fragment in ZONE_FULL_QUERY). On STANDARD-mode
    // zones the fragment doesn't match, so the upstream returns null/undefined and we
    // emit `null` here. Restore consumers gate on this field's presence to decide
    // whether the zone needs Advanced-style schedule restoration.
    advanced_program: zone.wateringSettings?.advancedProgram
      ? serializeAdvancedProgramReference(zone.wateringSettings.advancedProgram)
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

// =============================================================================
// Sensors
// =============================================================================

// Snake-case writable shape per project convention. The flat top-level fields
// (id, name, model_id, input_number, zone_ids) are exactly the args needed by
// `update_sensor` — copy → modify → call. The `_observed` block holds read-only
// model details for AI scanning (sensor_type, mode_type, divisor, flow_rate,
// model_name, category) that the writable shape doesn't include.
//
// `zone_ids` is intentionally an array of bare integer ids, not the upstream
// `{id, name, number}` objects — restore wants the same shape it would pass to
// `create_sensor`. The denormalized `{id, name}` references for per-zone
// snapshot embedding live in `serializeSensorZoneRefsForZone`.
export function serializeSensor(s: SensorRead): Record<string, unknown> {
  const zones = nonNull(s.zones);
  return {
    id: s.id,
    name: s.name,
    model_id: s.model.id,
    input_number: s.input.number,
    zone_ids: zones.map((z) => z.id),
    _observed: {
      model_name: s.model.name,
      sensor_type: s.model.sensorType,
      mode_type: s.model.modeType,
      mode: s.model.mode,
      divisor: s.model.divisor,
      flow_rate: s.model.flowRate,
      off_level: s.model.offLevel,
      off_timer: s.model.offTimer,
      delay: s.model.delay,
      active: s.model.active,
      input_label: s.input.label,
      // SelectedOption wrapper is `SelectedOption!` per the live schema, but Hydrawise
      // demonstrably violates its own `!` declarations (see CLAUDE.md gotcha re
      // `Zone.status.lastRun` lying as DateTime!). Defensive optional chain: a single
      // misbehaving sensor must not crash the whole snapshot. Inner `.label` is genuinely
      // nullable per schema either way.
      type_label: s.model.type?.label ?? null,
      category: s.model.category ? { id: s.model.category.id, name: s.model.category.name } : null,
      // customerId on the model is the tell for "this is a custom (account-owned) type" vs.
      // built-in (null/0). Restore needs this signal to know whether to recreate the type first.
      customer_id: s.model.customerId,
    },
  };
}

// Catalog entry for `list_sensor_models`. Per the spec, includes id, name,
// sensor_type, mode_type, category — the fields a restore workflow needs to map
// snapshot model names back to current model_ids.
export function serializeSensorModel(m: SensorModelRead): Record<string, unknown> {
  return {
    id: m.id,
    name: m.name,
    sensor_type: m.sensorType,
    mode_type: m.modeType,
    category: m.category ? { id: m.category.id, name: m.category.name } : null,
    // Calibration / behaviour fields useful when a custom type is being inspected.
    delay: m.delay,
    off_timer: m.offTimer,
    off_level: m.offLevel,
    divisor: m.divisor,
    flow_rate: m.flowRate,
    // customerId is the marker for built-in (null/0) vs. customer-owned (non-zero).
    customer_id: m.customerId,
  };
}

// Per-zone denormalized references — derived from controller-level sensors at
// snapshot assembly time, not from a separate ZONE_SENSORS_QUERY (avoids N+1).
// Returns the minimal {id, name} shape the spec calls for in zone snapshot entries.
export function serializeSensorZoneRefsForZone(
  controllerSensors: SensorRead[],
  zoneId: number,
): Array<{ id: number; name: string }> {
  return controllerSensors
    .filter((s) => nonNull(s.zones).some((z) => z.id === zoneId))
    .map((s) => ({ id: s.id, name: s.name }));
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
    // timeRange wrapper is non-null (Unit! per schema); inner validFrom/validTo are nullable.
    valid_from: p.timeRange.validFrom,
    valid_to: p.timeRange.validTo,
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

// =============================================================================
// AdvancedProgram serializers (irrigation-scheduling, ADVANCED-mode)
// =============================================================================

// Full inlined shape for an AdvancedProgram entry. Companion to serializeStandardProgram;
// both share `id`, `name`, `program_type`, `applies_to_zones`, `monthly_watering_adjustments`,
// `scheduling_method`, `schedule_adjustment_ids` at the top level. AdvancedProgram-specific
// fields (zone_specific, advanced_program_id, scope, watering_frequency, run_time_group)
// follow.
//
// Note: AdvancedProgram does NOT carry start_times / days_run / day_pattern / periodicity /
// timeRange like StandardProgram. The schedule-time data for ADVANCED-mode zones lives
// per-zone via `zone.wateringSettings.programStartTimes` and the referenced WateringProgram
// (Time/Smart/VSS) — emitted by the per-zone snapshot path, not here.
export function serializeAdvancedProgram(p: AdvancedProgramRead): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    program_type: 'Advanced',
    advanced_program_id: p.advancedProgramId,
    scope: p.scope,
    zone_specific: p.zoneSpecific,
    monthly_watering_adjustments: p.monthlyWateringAdjustments,
    scheduling_method: p.schedulingMethod?.value ?? null,
    schedule_adjustment_ids: p.conditionalWateringAdjustments.map((a) => a.id),
    // Flatten the ProgramWateringFrequency wrapper. WateringPeriodicity.{value, label} are
    // both nullable per schema, so ?. them.
    watering_frequency: {
      label: p.wateringFrequency.label,
      description: p.wateringFrequency.description,
      period_value: p.wateringFrequency.period?.value ?? null,
      period_label: p.wateringFrequency.period?.label ?? null,
    },
    // run_time_group is nullable on AdvancedProgram; surface as null when absent so the
    // snapshot's null-not-omitted convention holds.
    run_time_group: p.runTimeGroup
      ? {
          id: p.runTimeGroup.id,
          name: p.runTimeGroup.name,
          // Same units as StandardProgram per_zone_run_times.duration_minutes — minutes.
          duration_minutes: p.runTimeGroup.duration,
        }
      : null,
    applies_to_zones: p.appliesToZones.map((z) => ({
      id: z.id,
      number: z.number.value,
      name: z.name,
    })),
  };
}

// Per-zone short reference to an AdvancedProgram. Embedded under each zone's snapshot
// entry as `advanced_program: { id, name, advanced_program_id }` so a restore consumer
// can correlate the zone with the controller-level advanced_programs[] list without
// duplicating the full record on every zone.
export function serializeAdvancedProgramReference(
  p: AdvancedProgramReferenceRead,
): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    advanced_program_id: p.advancedProgramId,
  };
}
