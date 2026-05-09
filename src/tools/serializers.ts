import type {
  Controller,
  ProgramStartTimeRead,
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
  };
}

export function serializeZone(zone: Zone): Record<string, unknown> {
  return {
    id: zone.id,
    name: zone.name,
    number: zone.number.value,
    suspended_until: zone.status.suspendedUntil?.value ?? null,
  };
}

/**
 * Translate a Zone read result into the snake_case writable view used by tool
 * outputs and the input shape of `update_zone_settings`. Numeric fields the
 * upstream mutation expects but we cannot reliably read are returned as `null`,
 * forcing the AI to supply them explicitly when calling the write tool.
 */
export function serializeZoneSettings(zone: ZoneRichRead): Record<string, unknown> {
  return {
    zone_id: zone.id,
    name: zone.name,
    number: zone.number.value,
    icon: zone.icon?.id ?? null,
    watering_adjustment: zone.wateringSettings?.fixedWateringAdjustment ?? null,
    cycle_custom_time: zone.wateringSettings?.cycleAndSoakSettings?.cycleDuration ?? null,
    soak_custom_time: zone.wateringSettings?.cycleAndSoakSettings?.soakDuration ?? null,
    // Fields not directly present on the read shape; the AI must supply these
    // (typically copied from a recent snapshot or set by intent):
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
    cycle_soak_enable: null,
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
