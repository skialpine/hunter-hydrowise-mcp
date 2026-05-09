export interface User {
  id: number;
  name: string;
  email: string | null;
}

export interface Controller {
  id: number;
  name: string | null;
  online: boolean | null;
  hardware: { serialNumber: string | null } | null;
  lastContactTime: { value: string } | null;
}

export interface Zone {
  id: number;
  name: string;
  number: { value: number };
  status: {
    suspendedUntil: { value: string } | null;
    lastRun: { value: string } | null;
    nextRun: { value: string } | null;
  };
}

export interface StatusCodeAndSummary {
  status: 'OK' | 'WARNING' | 'ERROR';
  summary: string;
}

export const ME_QUERY = /* GraphQL */ `
  query Me {
    me {
      id
      name
      email
    }
  }
`;

export const CONTROLLERS_QUERY = /* GraphQL */ `
  query Controllers {
    me {
      controllers {
        id
        name
        online
        hardware {
          serialNumber
        }
        lastContactTime {
          value
        }
      }
    }
  }
`;

export const CONTROLLER_QUERY = /* GraphQL */ `
  query Controller($controllerId: Int!) {
    controller(controllerId: $controllerId) {
      id
      name
      online
      hardware {
        serialNumber
      }
      lastContactTime {
        value
      }
    }
  }
`;

export const ZONES_QUERY = /* GraphQL */ `
  query Zones($controllerId: Int!) {
    controller(controllerId: $controllerId) {
      zones {
        id
        name
        number {
          value
        }
        status {
          suspendedUntil {
            value
          }
          lastRun {
            value
          }
          nextRun {
            value
          }
        }
      }
    }
  }
`;

export const ZONE_QUERY = /* GraphQL */ `
  query Zone($zoneId: Int!) {
    zone(zoneId: $zoneId) {
      id
      name
      number {
        value
      }
      status {
        suspendedUntil {
          value
        }
        lastRun {
          value
        }
        nextRun {
          value
        }
      }
    }
  }
`;

export const START_ZONE_MUTATION = /* GraphQL */ `
  mutation StartZone(
    $zoneId: Int!
    $markRunAsScheduled: Boolean
    $stackRuns: Boolean
    $customRunDuration: Int
  ) {
    startZone(
      zoneId: $zoneId
      markRunAsScheduled: $markRunAsScheduled
      stackRuns: $stackRuns
      customRunDuration: $customRunDuration
    ) {
      status
      summary
    }
  }
`;

export const STOP_ZONE_MUTATION = /* GraphQL */ `
  mutation StopZone($zoneId: Int!) {
    stopZone(zoneId: $zoneId) {
      status
      summary
    }
  }
`;

export const START_ALL_ZONES_MUTATION = /* GraphQL */ `
  mutation StartAllZones(
    $controllerId: Int!
    $markRunAsScheduled: Boolean
    $customRunDuration: Int
  ) {
    startAllZones(
      controllerId: $controllerId
      markRunAsScheduled: $markRunAsScheduled
      customRunDuration: $customRunDuration
    ) {
      status
      summary
    }
  }
`;

export const STOP_ALL_ZONES_MUTATION = /* GraphQL */ `
  mutation StopAllZones($controllerId: Int!) {
    stopAllZones(controllerId: $controllerId) {
      status
      summary
    }
  }
`;

export const SUSPEND_ZONE_MUTATION = /* GraphQL */ `
  mutation SuspendZone($zoneId: Int!, $until: String!) {
    suspendZone(zoneId: $zoneId, until: $until) {
      status
      summary
    }
  }
`;

export const RESUME_ZONE_MUTATION = /* GraphQL */ `
  mutation ResumeZone($zoneId: Int!) {
    resumeZone(zoneId: $zoneId) {
      status
      summary
    }
  }
`;

export const SUSPEND_ALL_ZONES_MUTATION = /* GraphQL */ `
  mutation SuspendAllZones($controllerId: Int!, $until: String!) {
    suspendAllZones(controllerId: $controllerId, until: $until) {
      status
      summary
    }
  }
`;

export const RESUME_ALL_ZONES_MUTATION = /* GraphQL */ `
  mutation ResumeAllZones($controllerId: Int!) {
    resumeAllZones(controllerId: $controllerId) {
      status
      summary
    }
  }
`;

// ----------------------------------------------------------------------------
// Schedule management — added in change `add-schedule-management`.
// ----------------------------------------------------------------------------

/** Writable shape of a Zone, mirroring the `updateZone` mutation's input. */
export interface ZoneWritable {
  zone_id: number;
  icon: number | null;
  name: string;
  number: number;
  watering_mode: number;
  global_master_valve: number;
  schedule_adjustment_ids: number[];
  watering_adjustment: number;
  watering_type: number;
  run_time: number | null;
  watering_frequency_mode: number;
  fixed_watering_frequency: number | null;
  smart_watering_frequency: number | null;
  virtual_solar_sync_watering_frequency: number | null;
  run_next_available_start_time: number | null;
  pre_configured_watering_schedule_id: number | null;
  cycle_soak_enable: number | null;
  cycle_custom_time: number | null;
  soak_custom_time: number | null;
  factors: number[] | null;
  sensor_ids: number[] | null;
  reusable_schedule: boolean | null;
  reusable_schedule_name: string | null;
}

/** Writable shape of WateringTriggers, mirroring the `updateWateringTriggers` mutation. */
export interface WateringTriggersWritable {
  controller_id: number;
  extend_water_temperature: number;
  extend_water_temperature_enabled: boolean;
  extend_water_temperature_percentage: number;
  extend_water_humidity: number;
  extend_water_humidity_enabled: boolean;
  suspend_water_week_rain: number;
  suspend_water_rain_days: number;
  suspend_water_week_rain_enabled: boolean;
  suspend_water_rain: number;
  suspend_water_rain_enabled: boolean;
  suspend_water_temperature: number;
  suspend_water_temperature_enabled: boolean;
  suspend_probability_of_precipitation: number;
  suspend_probability_of_precipitation_enabled: boolean;
  suspend_wind: number;
  suspend_wind_enabled: boolean;
  enable_evapotranspiration_forecast_temperature: boolean;
  enable_evapotranspiration_forecast_rain: boolean;
  reduce_water_temperature_enabled: boolean;
  reduce_water_temperature: number;
  reduce_water_temperature_percentage: number;
}

/** A ProgramStartTime in writable form, mirroring `updateProgramStartTime`. */
export interface ProgramStartTimeWritable {
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
}

/** Standard program, writable shape mirroring `updateStandardProgram`. */
export interface StandardProgramWritable {
  program_id?: number;
  controller_id: number;
  name: string;
  program_type: number;
  day_pattern: string;
  standard_program_day_pattern: string | null;
  interval: number | null;
  series_start: number | null;
  start_times: string[];
  zone_run_times: { zone_number: number; run_time_group_id?: number | null; run_duration?: number | null }[];
  schedule_adjustment_ids: number[];
  seasonal_adjustment_factors: number[];
  valid_from: number | null;
  valid_to: number | null;
  ignore_rain_sensor: boolean | null;
}

/** WateringProgram subtype discriminator used by tool argument schemas. */
export type WateringProgramType = 'Time' | 'Smart' | 'VirtualSolarSync';

/** WateringProgram (Time/Smart/VSS) writable shape — discriminated by program_type. */
export interface WateringProgramWritable {
  program_id?: number;
  program_type: WateringProgramType;
  watering_program_name: string;
  watering_program_type: number | null;
  controller_id: number;
  schedule_adjustment_ids: number[] | null;
  seasonal_adjustment: number[] | null;
  /** Time-based only */
  fixed_watering_run_time?: number;
  fixed_watering_frequency_mode?: number;
  fixed_watering_frequency_value?: number | null;
  watering_program_adjustment?: number | null;
  /** Smart-based only */
  smart_watering_run_time?: number;
  smart_watering_frequency_value?: number;
  /** Virtual-Solar-Sync only */
  virtual_solar_sync_watering_run_time?: number;
  virtual_solar_sync_watering_frequency_mode?: number;
  virtual_solar_sync_watering_frequency_value?: number | null;
}

/** Discriminated program list entry (read shape, normalized). */
export interface ProgramListEntry {
  id: number;
  name: string;
  program_type: 'Standard' | 'Advanced' | string;
  scheduling_method?: number | null;
  applies_to_zone_ids?: number[];
}

/** Read shapes returned from the schedule queries. They retain the API's nested
 *  shapes so the serializer in `tools/serializers.ts` can normalize them. */
export interface ZoneRichRead {
  id: number;
  name: string;
  number: { value: number };
  icon: { id: number | null } | null;
  wateringSettings: {
    fixedWateringAdjustment: number;
    cycleAndSoakSettings: {
      cycleTime: { value: number } | null;
      soakTime: { value: number } | null;
    } | null;
  } | null;
  status: {
    suspendedUntil: { value: string } | null;
    lastRun: { value: string } | null;
    nextRun: { value: string } | null;
  };
}

export interface LocalizedValue {
  value: number | null;
  unit?: string | null;
}

export interface WateringTriggersRead {
  id: number;
  extendWaterTemperature: LocalizedValue | null;
  extendWaterTemperatureEnabled: boolean;
  extendWaterTemperaturePercentage: number;
  extendWaterHumidity: number;
  extendWaterHumidityEnabled: boolean;
  suspendWaterWeekRain: LocalizedValue | null;
  suspendWaterRainDays: number;
  suspendWaterWeekRainEnabled: boolean;
  suspendWaterRain: LocalizedValue | null;
  suspendWaterRainEnabled: boolean;
  suspendWaterTemperature: LocalizedValue | null;
  suspendWaterTemperatureEnabled: boolean;
  suspendProbabilityOfPrecipitation: number;
  suspendProbabilityOfPrecipitationEnabled: boolean;
  suspendWind: LocalizedValue | null;
  suspendWindEnabled: boolean;
  enableEvapotranspirationForecastTemperature: boolean;
  enableEvapotranspirationForecastRain: boolean;
  reduceWaterTemperatureEnabled: boolean;
  reduceWaterTemperature: LocalizedValue | null;
  reduceWaterTemperaturePercentage: number;
}

export interface ProgramStartTimeRead {
  id: number;
  type: { value: number; label?: string | null } | null;
  time: { value: string } | { hour: number; minute: number } | null;
  application: {
    all: boolean;
    zones: { id: number }[] | null;
  } | null;
}

/** GraphQL: zone with all writable-related read fields. */
export const ZONE_FULL_QUERY = /* GraphQL */ `
  query ZoneFull($zoneId: Int!) {
    zone(zoneId: $zoneId) {
      id
      name
      number {
        value
      }
      icon {
        id
      }
      wateringSettings {
        ... on AdvancedWateringSettings {
          fixedWateringAdjustment
          cycleAndSoakSettings {
            cycleTime {
              value
            }
            soakTime {
              value
            }
          }
        }
      }
      status {
        suspendedUntil {
          value
        }
        lastRun {
          value
        }
        nextRun {
          value
        }
      }
    }
  }
`;

/** GraphQL: controller seasonal adjustments — Controller.settings.offline.seasonalAdjustments. */
export const SEASONAL_ADJUSTMENTS_QUERY = /* GraphQL */ `
  query SeasonalAdjustments($controllerId: Int!) {
    controller(controllerId: $controllerId) {
      settings {
        offline {
          seasonalAdjustments
        }
      }
    }
  }
`;

/** GraphQL: full WateringTriggers for a controller. */
export const WATERING_TRIGGERS_QUERY = /* GraphQL */ `
  query WateringTriggers($controllerId: Int!) {
    controller(controllerId: $controllerId) {
      wateringTriggers {
        id
        extendWaterTemperature {
          value
          unit
        }
        extendWaterTemperatureEnabled
        extendWaterTemperaturePercentage
        extendWaterHumidity
        extendWaterHumidityEnabled
        suspendWaterWeekRain {
          value
          unit
        }
        suspendWaterRainDays
        suspendWaterWeekRainEnabled
        suspendWaterRain {
          value
          unit
        }
        suspendWaterRainEnabled
        suspendWaterTemperature {
          value
          unit
        }
        suspendWaterTemperatureEnabled
        suspendProbabilityOfPrecipitation
        suspendProbabilityOfPrecipitationEnabled
        suspendWind {
          value
          unit
        }
        suspendWindEnabled
        enableEvapotranspirationForecastTemperature
        enableEvapotranspirationForecastRain
        reduceWaterTemperatureEnabled
        reduceWaterTemperature {
          value
          unit
        }
        reduceWaterTemperaturePercentage
      }
    }
  }
`;

/** GraphQL: programs on a controller (Standard + Advanced via Program interface). */
export const PROGRAMS_QUERY = /* GraphQL */ `
  query Programs($controllerId: Int!, $includeZoneSpecific: Boolean!) {
    controller(controllerId: $controllerId) {
      programs(includeZoneSpecific: $includeZoneSpecific) {
        __typename
        id
        name
        schedulingMethod {
          value
        }
        appliesToZones {
          id
        }
      }
    }
  }
`;

/** GraphQL: program start times via wateringSettings on a zone (best available read path). */
export const PROGRAM_START_TIMES_QUERY = /* GraphQL */ `
  query ProgramStartTimes($zoneId: Int!) {
    zone(zoneId: $zoneId) {
      wateringSettings {
        ... on AdvancedWateringSettings {
          programStartTimes {
            id
            type {
              value
            }
            application {
              all
              zones {
                id
              }
            }
          }
        }
      }
    }
  }
`;

// Mutations -----------------------------------------------------------------

export const UPDATE_ZONE_MUTATION = /* GraphQL */ `
  mutation UpdateZone(
    $zoneId: Int!
    $icon: Int
    $name: String!
    $number: Int!
    $wateringMode: Int!
    $globalMasterValve: Int!
    $scheduleAdjustmentIds: [Int]!
    $wateringAdjustment: Int!
    $wateringType: Int!
    $runTime: Int
    $wateringFrequencyMode: Int!
    $fixedWateringFrequency: Int
    $smartWateringFrequency: Int
    $virtualSolarSyncWateringFrequency: Int
    $runNextAvailableStartTime: Int
    $preConfiguredWateringScheduleId: Int
    $cycleSoakEnable: Int
    $cycleCustomTime: Int
    $soakCustomTime: Int
    $factors: [Int]
    $sensorIds: [Int]
    $reusableSchedule: Boolean
    $reusableScheduleName: String
  ) {
    updateZone(
      zoneId: $zoneId
      icon: $icon
      name: $name
      number: $number
      wateringMode: $wateringMode
      globalMasterValve: $globalMasterValve
      scheduleAdjustmentIds: $scheduleAdjustmentIds
      wateringAdjustment: $wateringAdjustment
      wateringType: $wateringType
      runTime: $runTime
      wateringFrequencyMode: $wateringFrequencyMode
      fixedWateringFrequency: $fixedWateringFrequency
      smartWateringFrequency: $smartWateringFrequency
      virtualSolarSyncWateringFrequency: $virtualSolarSyncWateringFrequency
      runNextAvailableStartTime: $runNextAvailableStartTime
      preConfiguredWateringScheduleId: $preConfiguredWateringScheduleId
      cycleSoakEnable: $cycleSoakEnable
      cycleCustomTime: $cycleCustomTime
      soakCustomTime: $soakCustomTime
      factors: $factors
      sensorIds: $sensorIds
      reusableSchedule: $reusableSchedule
      reusableScheduleName: $reusableScheduleName
    ) {
      id
    }
  }
`;

export const UPDATE_SEASONAL_ADJUSTMENTS_MUTATION = /* GraphQL */ `
  mutation UpdateSeasonalAdjustments($controllerId: Int!, $factors: [Int]!) {
    updateSeasonalAdjustments(controllerId: $controllerId, factors: $factors)
  }
`;

export const UPDATE_WATERING_TRIGGERS_MUTATION = /* GraphQL */ `
  mutation UpdateWateringTriggers(
    $controllerId: Int
    $contractorId: Int
    $isContractor: Boolean!
    $extendWaterTemperature: Float!
    $extendWaterTemperatureEnabled: Boolean!
    $extendWaterTemperaturePercentage: Int!
    $extendWaterHumidity: Int!
    $extendWaterHumidityEnabled: Boolean!
    $suspendWaterWeekRain: Float!
    $suspendWaterRainDays: Int!
    $suspendWaterWeekRainEnabled: Boolean!
    $suspendWaterRain: Float!
    $suspendWaterRainEnabled: Boolean!
    $suspendWaterTemperature: Float!
    $suspendWaterTemperatureEnabled: Boolean!
    $suspendProbabilityOfPrecipitation: Int!
    $suspendProbabilityOfPrecipitationEnabled: Boolean!
    $suspendWind: Float!
    $suspendWindEnabled: Boolean!
    $enableEvapotranspirationForecastTemperature: Boolean!
    $enableEvapotranspirationForecastRain: Boolean!
    $reduceWaterTemperatureEnabled: Boolean!
    $reduceWaterTemperaturePercentage: Int!
    $reduceWaterTemperature: Float!
  ) {
    updateWateringTriggers(
      controllerId: $controllerId
      contractorId: $contractorId
      isContractor: $isContractor
      extendWaterTemperature: $extendWaterTemperature
      extendWaterTemperatureEnabled: $extendWaterTemperatureEnabled
      extendWaterTemperaturePercentage: $extendWaterTemperaturePercentage
      extendWaterHumidity: $extendWaterHumidity
      extendWaterHumidityEnabled: $extendWaterHumidityEnabled
      suspendWaterWeekRain: $suspendWaterWeekRain
      suspendWaterRainDays: $suspendWaterRainDays
      suspendWaterWeekRainEnabled: $suspendWaterWeekRainEnabled
      suspendWaterRain: $suspendWaterRain
      suspendWaterRainEnabled: $suspendWaterRainEnabled
      suspendWaterTemperature: $suspendWaterTemperature
      suspendWaterTemperatureEnabled: $suspendWaterTemperatureEnabled
      suspendProbabilityOfPrecipitation: $suspendProbabilityOfPrecipitation
      suspendProbabilityOfPrecipitationEnabled: $suspendProbabilityOfPrecipitationEnabled
      suspendWind: $suspendWind
      suspendWindEnabled: $suspendWindEnabled
      enableEvapotranspirationForecastTemperature: $enableEvapotranspirationForecastTemperature
      enableEvapotranspirationForecastRain: $enableEvapotranspirationForecastRain
      reduceWaterTemperatureEnabled: $reduceWaterTemperatureEnabled
      reduceWaterTemperaturePercentage: $reduceWaterTemperaturePercentage
      reduceWaterTemperature: $reduceWaterTemperature
    ) {
      id
    }
  }
`;

export const CREATE_PROGRAM_START_TIME_MUTATION = /* GraphQL */ `
  mutation CreateProgramStartTime(
    $controllerId: Int
    $contractorId: Int
    $isContractor: Boolean!
    $applyAll: Boolean!
    $zones: [Int]
    $schedules: [Int]
    $time: String!
    $wateringType: Int!
    $timeType: String!
    $sunday: Int!
    $monday: Int!
    $tuesday: Int!
    $wednesday: Int!
    $thursday: Int!
    $friday: Int!
    $saturday: Int!
  ) {
    createProgramStartTime(
      controllerId: $controllerId
      contractorId: $contractorId
      isContractor: $isContractor
      applyAll: $applyAll
      zones: $zones
      schedules: $schedules
      time: $time
      wateringType: $wateringType
      timeType: $timeType
      sunday: $sunday
      monday: $monday
      tuesday: $tuesday
      wednesday: $wednesday
      thursday: $thursday
      friday: $friday
      saturday: $saturday
    ) {
      id
    }
  }
`;

export const UPDATE_PROGRAM_START_TIME_MUTATION = /* GraphQL */ `
  mutation UpdateProgramStartTime(
    $id: Int!
    $controllerId: Int
    $contractorId: Int
    $isContractor: Boolean!
    $applyAll: Boolean!
    $zones: [Int]
    $schedules: [Int]
    $time: String!
    $wateringType: Int!
    $timeType: String!
    $sunday: Int!
    $monday: Int!
    $tuesday: Int!
    $wednesday: Int!
    $thursday: Int!
    $friday: Int!
    $saturday: Int!
  ) {
    updateProgramStartTime(
      id: $id
      controllerId: $controllerId
      contractorId: $contractorId
      isContractor: $isContractor
      applyAll: $applyAll
      zones: $zones
      schedules: $schedules
      time: $time
      wateringType: $wateringType
      timeType: $timeType
      sunday: $sunday
      monday: $monday
      tuesday: $tuesday
      wednesday: $wednesday
      thursday: $thursday
      friday: $friday
      saturday: $saturday
    ) {
      id
    }
  }
`;

export const DELETE_PROGRAM_START_TIME_MUTATION = /* GraphQL */ `
  mutation DeleteProgramStartTime($id: Int!, $controllerId: Int, $isContractor: Boolean!) {
    deleteProgramStartTime(id: $id, controllerId: $controllerId, isContractor: $isContractor)
  }
`;

export const CREATE_STANDARD_PROGRAM_MUTATION = /* GraphQL */ `
  mutation CreateStandardProgram(
    $controllerId: Int!
    $name: String!
    $programType: Int!
    $dayPattern: String!
    $standardProgramDayPattern: StandardProgramDayPatternEnum
    $interval: Int
    $seriesStart: Int
    $startTimes: [String]!
    $zoneRunTimes: [ZoneRunTime!]!
    $scheduleAdjustmentIds: [Int]!
    $seasonalAdjustmentFactors: [Int]!
    $validFrom: Int
    $validTo: Int
    $ignoreRainSensor: Boolean
  ) {
    createStandardProgram(
      controllerId: $controllerId
      name: $name
      programType: $programType
      dayPattern: $dayPattern
      standardProgramDayPattern: $standardProgramDayPattern
      interval: $interval
      seriesStart: $seriesStart
      startTimes: $startTimes
      zoneRunTimes: $zoneRunTimes
      scheduleAdjustmentIds: $scheduleAdjustmentIds
      seasonalAdjustmentFactors: $seasonalAdjustmentFactors
      validFrom: $validFrom
      validTo: $validTo
      ignoreRainSensor: $ignoreRainSensor
    ) {
      id
      name
    }
  }
`;

export const UPDATE_STANDARD_PROGRAM_MUTATION = /* GraphQL */ `
  mutation UpdateStandardProgram(
    $programId: Int!
    $controllerId: Int!
    $name: String!
    $programType: Int!
    $dayPattern: String!
    $standardProgramDayPattern: StandardProgramDayPatternEnum
    $interval: Int
    $seriesStart: Int
    $startTimes: [String]!
    $zoneRunTimes: [ZoneRunTime!]!
    $scheduleAdjustmentIds: [Int]!
    $seasonalAdjustmentFactors: [Int]!
    $validFrom: Int
    $validTo: Int
    $ignoreRainSensor: Boolean
  ) {
    updateStandardProgram(
      programId: $programId
      controllerId: $controllerId
      name: $name
      programType: $programType
      dayPattern: $dayPattern
      standardProgramDayPattern: $standardProgramDayPattern
      interval: $interval
      seriesStart: $seriesStart
      startTimes: $startTimes
      zoneRunTimes: $zoneRunTimes
      scheduleAdjustmentIds: $scheduleAdjustmentIds
      seasonalAdjustmentFactors: $seasonalAdjustmentFactors
      validFrom: $validFrom
      validTo: $validTo
      ignoreRainSensor: $ignoreRainSensor
    ) {
      id
      name
    }
  }
`;

export const DELETE_STANDARD_PROGRAM_MUTATION = /* GraphQL */ `
  mutation DeleteStandardProgram($programId: Int!, $controllerId: Int!) {
    deleteStandardProgram(programId: $programId, controllerId: $controllerId)
  }
`;

// WateringProgram (legacy API path) — three subtype-specific mutations.

export const CREATE_TIME_WATERING_PROGRAM_MUTATION = /* GraphQL */ `
  mutation CreateTimeWP(
    $wateringProgramName: String!
    $wateringProgramType: Int
    $fixedWateringRunTime: Int!
    $fixedWateringFrequencyMode: Int!
    $fixedWateringFrequencyValue: Int
    $wateringProgramAdjustment: Int
    $scheduleAdjustmentIds: [Int]
    $controllerId: Int!
    $seasonalAdjustment: [Int]
  ) {
    createTimeBasedWateringProgram(
      wateringProgramName: $wateringProgramName
      wateringProgramType: $wateringProgramType
      fixedWateringRunTime: $fixedWateringRunTime
      fixedWateringFrequencyMode: $fixedWateringFrequencyMode
      fixedWateringFrequencyValue: $fixedWateringFrequencyValue
      wateringProgramAdjustment: $wateringProgramAdjustment
      scheduleAdjustmentIds: $scheduleAdjustmentIds
      controllerId: $controllerId
      seasonalAdjustment: $seasonalAdjustment
    ) {
      id
      name
    }
  }
`;

export const UPDATE_TIME_WATERING_PROGRAM_MUTATION = /* GraphQL */ `
  mutation UpdateTimeWP(
    $wateringProgramId: Int!
    $wateringProgramName: String!
    $wateringProgramType: Int
    $fixedWateringRunTime: Int!
    $fixedWateringFrequencyMode: Int!
    $fixedWateringFrequencyValue: Int
    $wateringProgramAdjustment: Int
    $scheduleAdjustmentIds: [Int]
    $controllerId: Int!
    $seasonalAdjustment: [Int]
  ) {
    updateTimeBasedWateringProgram(
      wateringProgramId: $wateringProgramId
      wateringProgramName: $wateringProgramName
      wateringProgramType: $wateringProgramType
      fixedWateringRunTime: $fixedWateringRunTime
      fixedWateringFrequencyMode: $fixedWateringFrequencyMode
      fixedWateringFrequencyValue: $fixedWateringFrequencyValue
      wateringProgramAdjustment: $wateringProgramAdjustment
      scheduleAdjustmentIds: $scheduleAdjustmentIds
      controllerId: $controllerId
      seasonalAdjustment: $seasonalAdjustment
    ) {
      id
      name
    }
  }
`;

export const CREATE_SMART_WATERING_PROGRAM_MUTATION = /* GraphQL */ `
  mutation CreateSmartWP(
    $wateringProgramName: String!
    $smartWateringRunTime: Int!
    $smartWateringFrequencyValue: Int!
    $wateringProgramType: Int
    $controllerId: Int!
    $seasonalAdjustment: [Int]
    $scheduleAdjustmentIds: [Int]
  ) {
    createSmartBasedWateringProgram(
      wateringProgramName: $wateringProgramName
      smartWateringRunTime: $smartWateringRunTime
      smartWateringFrequencyValue: $smartWateringFrequencyValue
      wateringProgramType: $wateringProgramType
      controllerId: $controllerId
      seasonalAdjustment: $seasonalAdjustment
      scheduleAdjustmentIds: $scheduleAdjustmentIds
    ) {
      id
      name
    }
  }
`;

export const UPDATE_SMART_WATERING_PROGRAM_MUTATION = /* GraphQL */ `
  mutation UpdateSmartWP(
    $wateringProgramId: Int!
    $wateringProgramName: String!
    $smartWateringRunTime: Int!
    $smartWateringFrequencyValue: Int!
    $wateringProgramType: Int
    $controllerId: Int!
    $seasonalAdjustment: [Int]
    $scheduleAdjustmentIds: [Int]
  ) {
    updateSmartBasedWateringProgram(
      wateringProgramId: $wateringProgramId
      wateringProgramName: $wateringProgramName
      smartWateringRunTime: $smartWateringRunTime
      smartWateringFrequencyValue: $smartWateringFrequencyValue
      wateringProgramType: $wateringProgramType
      controllerId: $controllerId
      seasonalAdjustment: $seasonalAdjustment
      scheduleAdjustmentIds: $scheduleAdjustmentIds
    ) {
      id
      name
    }
  }
`;

export const CREATE_VSS_WATERING_PROGRAM_MUTATION = /* GraphQL */ `
  mutation CreateVssWP(
    $wateringProgramName: String!
    $wateringProgramType: Int
    $virtualSolarSyncWateringRunTime: Int!
    $virtualSolarSyncWateringFrequencyMode: Int!
    $virtualSolarSyncWateringFrequencyValue: Int
    $controllerId: Int!
    $scheduleAdjustmentIds: [Int]!
    $seasonalAdjustment: [Int]
  ) {
    createVirtualSolarSyncWateringProgram(
      wateringProgramName: $wateringProgramName
      wateringProgramType: $wateringProgramType
      virtualSolarSyncWateringRunTime: $virtualSolarSyncWateringRunTime
      virtualSolarSyncWateringFrequencyMode: $virtualSolarSyncWateringFrequencyMode
      virtualSolarSyncWateringFrequencyValue: $virtualSolarSyncWateringFrequencyValue
      controllerId: $controllerId
      scheduleAdjustmentIds: $scheduleAdjustmentIds
      seasonalAdjustment: $seasonalAdjustment
    ) {
      id
      name
    }
  }
`;

export const UPDATE_VSS_WATERING_PROGRAM_MUTATION = /* GraphQL */ `
  mutation UpdateVssWP(
    $wateringProgramId: Int!
    $wateringProgramName: String!
    $wateringProgramType: Int
    $virtualSolarSyncWateringRunTime: Int!
    $virtualSolarSyncWateringFrequencyMode: Int!
    $virtualSolarSyncWateringFrequencyValue: Int
    $controllerId: Int!
    $scheduleAdjustmentIds: [Int]!
    $seasonalAdjustment: [Int]
  ) {
    updateVirtualSolarSyncWateringProgram(
      wateringProgramId: $wateringProgramId
      wateringProgramName: $wateringProgramName
      wateringProgramType: $wateringProgramType
      virtualSolarSyncWateringRunTime: $virtualSolarSyncWateringRunTime
      virtualSolarSyncWateringFrequencyMode: $virtualSolarSyncWateringFrequencyMode
      virtualSolarSyncWateringFrequencyValue: $virtualSolarSyncWateringFrequencyValue
      controllerId: $controllerId
      scheduleAdjustmentIds: $scheduleAdjustmentIds
      seasonalAdjustment: $seasonalAdjustment
    ) {
      id
      name
    }
  }
`;

export const REMOVE_WATERING_PROGRAM_MUTATION = /* GraphQL */ `
  mutation RemoveWP($wateringProgramId: Int!) {
    removeWateringProgram(wateringProgramId: $wateringProgramId)
  }
`;
