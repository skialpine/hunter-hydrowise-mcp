export interface User {
  id: number;
  name: string;
  email: string | null;
}

export interface Controller {
  id: number;
  // deviceId is required by location mutations (updateLocation, updateLocationCoordinates) — distinct from id.
  deviceId: number;
  name: string | null;
  online: boolean | null;
  softwareVersion: string | null;
  programMode: 'STANDARD' | 'ADVANCED' | null;
  hardware: {
    serialNumber: string | null;
    status: string | null;
    installationTime: { value: string } | null;
    model: { id: string; name: string; family: { name?: string | null } | null } | null;
    // Schema: `modules: [Module]` — list members may be null.
    modules: (ModuleRead | null)[] | null;
  } | null;
  lastContactTime: { value: string } | null;
  location: LocationRead | null;
  settings: ControllerSettingsRead | null;
  masterZone: MasterValveRead | null;
  // Schema: `expanders: [Expander]` — list members may be null.
  expanders: (ExpanderRead | null)[] | null;
  runTimeGroups: RunTimeGroupRead[];
  // Schema: `controllerNotes: [ControllerNote]!` — non-null list, members may be null.
  controllerNotes: (ControllerNoteRead | null)[];
}

export interface GeoCoordinatesRead {
  latitude: number | null;
  longitude: number | null;
}

export interface LocationRead {
  id: number;
  coordinates: GeoCoordinatesRead | null;
  address: string | null;
  country: string | null;
  state: string | null;
  locality: string | null;
}

export interface TimeZoneRead {
  name: string;
  offset: number;
}

export interface MasterValveRead {
  zoneNumber: { value: number } | null;
  delay: number | null;
  postTimer: number | null;
}

export interface ControllerSettingsRead {
  timeZone: TimeZoneRead | null;
  zones: {
    interZoneDelay: number;
    masterZone: MasterValveRead | null;
  } | null;
}

export interface ExpanderRead {
  id: number;
  name: string;
  number: number;
  hardware: {
    model: { id: string };
    // Schema: `firmware: [ExpanderFirmware]` — list members may be null.
    firmware: ({ type: string; version: number | null; bank: number | null } | null)[] | null;
  };
}

export interface ModuleRead {
  // Long scalar from upstream — serialized as string to dodge JS Int53 issues.
  id: string;
  name: string;
  serialNumber: string;
  moduleType: string;
  firmwareVersion: string;
}

export interface RunTimeGroupRead {
  id: number;
  name: string | null;
  duration: number;
}

export interface ControllerNoteRead {
  id: number;
  note: string;
  type: 'fault' | 'location' | 'repair' | 'comment';
  pinnedToTop: boolean;
  lastUpdatedAt: { value: string } | null;
}

export interface ZoneNoteRead {
  id: number;
  note: string;
  type: 'fault' | 'location' | 'repair' | 'comment';
  pinnedToTop: boolean;
  lastUpdatedAt: { value: string } | null;
}

export interface Zone {
  id: number;
  name: string;
  number: { value: number };
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

const CONTROLLER_FIELDS = /* GraphQL */ `
  id
  deviceId
  name
  online
  softwareVersion
  programMode
  hardware {
    serialNumber
    status
    installationTime {
      value
    }
    model {
      id
      name
      family {
        name
      }
    }
    modules {
      id
      name
      serialNumber
      moduleType
      firmwareVersion
    }
  }
  lastContactTime {
    value
  }
  location {
    id
    coordinates {
      latitude
      longitude
    }
    address
    country
    state
    locality
  }
  settings {
    timeZone {
      name
      offset
    }
    zones {
      interZoneDelay
      masterZone {
        zoneNumber {
          value
        }
        delay
        postTimer
      }
    }
  }
  masterZone {
    zoneNumber {
      value
    }
    delay
    postTimer
  }
  expanders {
    id
    name
    number
    hardware {
      model {
        id
      }
      firmware {
        type
        version
        bank
      }
    }
  }
  runTimeGroups {
    id
    name
    duration
  }
  controllerNotes {
    id
    note
    type
    pinnedToTop
    lastUpdatedAt {
      value
    }
  }
`;

export const CONTROLLERS_QUERY = /* GraphQL */ `
  query Controllers {
    me {
      controllers {
        ${CONTROLLER_FIELDS}
      }
    }
  }
`;

export const CONTROLLER_QUERY = /* GraphQL */ `
  query Controller($controllerId: Int!) {
    controller(controllerId: $controllerId) {
      ${CONTROLLER_FIELDS}
    }
  }
`;

// Bulk Controller.zones omits `status` — Zone.status.{lastRun,nextRun} are declared DateTime! but are null upstream, which 500s the bulk fan-out. Richer per-zone reads go through ZONE_FULL_QUERY (get_zone_settings).
export const ZONES_QUERY = /* GraphQL */ `
  query Zones($controllerId: Int!) {
    controller(controllerId: $controllerId) {
      zones {
        id
        name
        number {
          value
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
    }
  }
`;

export const START_ZONE_MUTATION = /* GraphQL */ `
  mutation StartZone(
    $zoneId: Int!
    $markRunAsScheduled: Boolean
    $stackRuns: Boolean
    $customRunDuration: Int
    $learnCurrentFromNextRun: Boolean
    $learnFlowFromNextRun: Boolean
  ) {
    startZone(
      zoneId: $zoneId
      markRunAsScheduled: $markRunAsScheduled
      stackRuns: $stackRuns
      customRunDuration: $customRunDuration
      learnCurrentFromNextRun: $learnCurrentFromNextRun
      learnFlowFromNextRun: $learnFlowFromNextRun
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
    $learnCurrentFromNextRun: Boolean
    $learnFlowFromNextRun: Boolean
  ) {
    startAllZones(
      controllerId: $controllerId
      markRunAsScheduled: $markRunAsScheduled
      customRunDuration: $customRunDuration
      learnCurrentFromNextRun: $learnCurrentFromNextRun
      learnFlowFromNextRun: $learnFlowFromNextRun
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

// Schedule management

export type MonitoringMethod = 'MANUAL' | 'LEARN_FROM_NEXT_RUN';

// Mirrors updateZoneAdvanced. cycle_soak_enable and run_next_available_start_time are Boolean (the deprecated updateZone took Int).
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
  run_next_available_start_time: boolean | null;
  pre_configured_watering_schedule_id: number | null;
  cycle_soak_enable: boolean | null;
  cycle_custom_time: number | null;
  soak_custom_time: number | null;
  factors: number[] | null;
  sensor_ids: number[] | null;
  reusable_schedule: boolean | null;
  reusable_schedule_name: string | null;
  flow_monitoring_method: MonitoringMethod | null;
  current_monitoring_method: MonitoringMethod | null;
  flow_monitoring_value: number | null;
  current_monitoring_value: number | null;
}

/** Arguments for `setBaselineValues`. */
export interface SetBaselineValuesPayload {
  zone_id: number;
  flow_monitoring_method: MonitoringMethod;
  current_monitoring_method: MonitoringMethod;
  flow_monitoring_value: number | null;
  current_monitoring_value: number | null;
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

export type WateringProgramType = 'Time' | 'Smart' | 'VirtualSolarSync';

interface WateringProgramBase {
  program_id?: number;
  watering_program_name: string;
  watering_program_type: number | null;
  controller_id: number;
  schedule_adjustment_ids: number[] | null;
  seasonal_adjustment: number[] | null;
}

export interface TimeWateringProgramWritable extends WateringProgramBase {
  program_type: 'Time';
  fixed_watering_run_time: number;
  fixed_watering_frequency_mode: number;
  fixed_watering_frequency_value?: number | null;
  watering_program_adjustment?: number | null;
}

export interface SmartWateringProgramWritable extends WateringProgramBase {
  program_type: 'Smart';
  smart_watering_run_time: number;
  smart_watering_frequency_value: number;
}

export interface VssWateringProgramWritable extends WateringProgramBase {
  program_type: 'VirtualSolarSync';
  virtual_solar_sync_watering_run_time: number;
  virtual_solar_sync_watering_frequency_mode: number;
  virtual_solar_sync_watering_frequency_value?: number | null;
}

export type WateringProgramWritable =
  | TimeWateringProgramWritable
  | SmartWateringProgramWritable
  | VssWateringProgramWritable;

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
  // -1 = follow controller-global master valve; 0 = always disabled; else specific zone number.
  masterValve: number;
  wateringSettings: {
    fixedWateringAdjustment: number;
    cycleAndSoakSettings: {
      cycleDuration: number;
      soakDuration: number;
    } | null;
  } | null;
  monitoringSettings: {
    operatingRanges: {
      waterFlowRate: { value: number | null; unit: string | null } | null;
      electricCurrent: { value: number | null; unit: string | null } | null;
    } | null;
    measuredMedians: {
      waterFlowRate: { value: number | null; unit: string | null } | null;
      electricCurrent: { value: number | null; unit: string | null } | null;
    } | null;
  } | null;
  status: {
    suspendedUntil: { value: string } | null;
  };
  // Schema: `zoneNotes: [ZoneNote]!` — non-null list, members may be null.
  zoneNotes: (ZoneNoteRead | null)[];
}

export interface LocalizedValue {
  value: number | null;
  // Always select `unit` from LocalizedValueType in queries — the snapshot needs it to detect unit-pref drift between capture and restore.
  unit: string | null;
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
  // EVEN | ODD | DAYS | MONDAY..SUNDAY
  wateringDays: string[] | null;
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
      masterValve
      wateringSettings {
        fixedWateringAdjustment
        cycleAndSoakSettings {
          cycleDuration
          soakDuration
        }
      }
      monitoringSettings {
        operatingRanges {
          waterFlowRate {
            value
            unit
          }
          electricCurrent {
            value
            unit
          }
        }
        measuredMedians {
          waterFlowRate {
            value
            unit
          }
          electricCurrent {
            value
            unit
          }
        }
      }
      status {
        suspendedUntil {
          value
        }
      }
      zoneNotes {
        id
        note
        type
        pinnedToTop
        lastUpdatedAt {
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

/** GraphQL: programs with full Standard detail per program. Filtered by id client-side. */
export const PROGRAMS_FULL_QUERY = /* GraphQL */ `
  query ProgramsFull($controllerId: Int!, $includeZoneSpecific: Boolean!) {
    controller(controllerId: $controllerId) {
      programs(includeZoneSpecific: $includeZoneSpecific) {
        __typename
        id
        name
        appliesToZones {
          id
          number {
            value
          }
          name
        }
        ... on StandardProgram {
          schedulingMethod {
            value
            label
          }
          monthlyWateringAdjustments
          startTimes
          ignoreRainSensor
          daysRun
          standardProgramDayPattern
          periodicity {
            period
            seriesStart {
              value
            }
          }
          timeRange {
            validFrom
            validTo
          }
          conditionalWateringAdjustments(controllerId: $controllerId) {
            id
            label
          }
          applications {
            zone {
              id
              number {
                value
              }
            }
            runTimeGroup {
              id
              name
              duration
            }
          }
        }
      }
    }
  }
`;

export interface StandardProgramRead {
  __typename: 'StandardProgram';
  id: number;
  name: string;
  appliesToZones: { id: number; number: { value: number }; name: string }[];
  schedulingMethod: { value: number; label: string | null } | null;
  monthlyWateringAdjustments: number[];
  startTimes: string[];
  ignoreRainSensor: boolean;
  daysRun: string[];
  standardProgramDayPattern: string | null;
  periodicity: { period: number; seriesStart: { value: string } | null } | null;
  // The schema's `timeRange: Unit!` is non-null at the wrapper; only the inner validFrom/validTo are nullable (null = unbounded on that side). Keep the wrapper non-null to match.
  timeRange: { validFrom: number | null; validTo: number | null };
  conditionalWateringAdjustments: { id: number; label: string }[];
  applications: {
    zone: { id: number; number: { value: number } };
    runTimeGroup: { id: number; name: string | null; duration: number };
  }[];
}

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
            wateringDays
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

export const UPDATE_ZONE_ADVANCED_MUTATION = /* GraphQL */ `
  mutation UpdateZoneAdvanced(
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
    $runNextAvailableStartTime: Boolean
    $preConfiguredWateringScheduleId: Int
    $cycleSoakEnable: Boolean
    $cycleCustomTime: Int
    $soakCustomTime: Int
    $factors: [Int]
    $sensorIds: [Int]
    $reusableSchedule: Boolean
    $reusableScheduleName: String
    $flowMonitoringMethod: MonitoringMethodEnum
    $currentMonitoringMethod: MonitoringMethodEnum
    $flowMonitoringValue: Float
    $currentMonitoringValue: Int
  ) {
    updateZoneAdvanced(
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
      flowMonitoringMethod: $flowMonitoringMethod
      currentMonitoringMethod: $currentMonitoringMethod
      flowMonitoringValue: $flowMonitoringValue
      currentMonitoringValue: $currentMonitoringValue
    ) {
      id
    }
  }
`;

export const SET_BASELINE_VALUES_MUTATION = /* GraphQL */ `
  mutation SetBaselineValues(
    $zoneId: Int!
    $flowMonitoringMethod: MonitoringMethodEnum!
    $currentMonitoringMethod: MonitoringMethodEnum!
    $flowMonitoringValue: Float
    $currentMonitoringValue: Float
  ) {
    setBaselineValues(
      zoneId: $zoneId
      flowMonitoringMethod: $flowMonitoringMethod
      currentMonitoringMethod: $currentMonitoringMethod
      flowMonitoringValue: $flowMonitoringValue
      currentMonitoringValue: $currentMonitoringValue
    ) {
      status
      summary
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

// WateringProgram subtype-specific mutations (Time / Smart / VirtualSolarSync). The Standard equivalent lives in updateStandardProgram above.

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

// Reporting

export interface ScheduledZoneRun {
  id: string;
  /** DateTime object — use .value for the ISO string */
  startTime: { value: string };
  /** DateTime object — use .value for the ISO string */
  endTime: { value: string };
  /** minutes */
  normalDuration: number;
  /** minutes */
  duration: number;
  /** seconds */
  remainingTime: number;
  status: { value: number | null; label: string | null };
}

export interface PastZoneRuns {
  lastRun: ScheduledZoneRun | null;
  runs: ScheduledZoneRun[] | null;
}

export interface RunEventType {
  id: string;
  zone: { id: number; name: string };
  standardProgram: { id: number; name: string } | null;
  /** DateTime object — use .value for the ISO string */
  normalStartTime: { value: string } | null;
  scheduledStartTime: { value: string } | null;
  reportedStartTime: { value: string } | null;
  normalEndTime: { value: string } | null;
  scheduledEndTime: { value: string } | null;
  reportedEndTime: { value: string } | null;
  /** seconds */
  normalDuration: number | null;
  /** seconds */
  scheduledDuration: number | null;
  /** seconds */
  reportedDuration: number | null;
  scheduledStatus: { value: number; label: string } | null;
  reportedStatus: { value: number; label: string } | null;
  reportedWaterUsage: { value: number | null; unit: string | null } | null;
  reportedStopReason: { finishedNormally: boolean; description: string[] } | null;
  reportedCurrent: { value: number | null; unit: string | null } | null;
}

export interface RunSummaryDetails {
  totalNormalRunTime: number | null;
  totalActualRunTime: number | null;
  totalWaterVolume: { value: number | null; unit: string | null } | null;
}

const SCHEDULED_ZONE_RUN_FIELDS = /* GraphQL */ `
  id
  startTime { value }
  endTime { value }
  normalDuration
  duration
  remainingTime
  status {
    value
    label
  }
`;

const RUN_SUMMARY_FIELDS = /* GraphQL */ `
  totalNormalRunTime
  totalActualRunTime
  totalWaterVolume {
    value
    unit
  }
`;

export const WATERING_REPORT_QUERY = /* GraphQL */ `
  query WateringReport($controllerId: Int!, $from: Int!, $until: Int!) {
    controller(controllerId: $controllerId) {
      reports {
        watering(from: $from, until: $until) {
          runEvent {
            id
            zone {
              id
              name
            }
            standardProgram {
              id
              name
            }
            normalStartTime { value }
            scheduledStartTime { value }
            reportedStartTime { value }
            normalEndTime { value }
            scheduledEndTime { value }
            reportedEndTime { value }
            normalDuration
            scheduledDuration
            reportedDuration
            scheduledStatus {
              value
              label
            }
            reportedStatus {
              value
              label
            }
            reportedWaterUsage {
              value
              unit
            }
            reportedStopReason {
              finishedNormally
              description
            }
            reportedCurrent {
              value
              unit
            }
          }
        }
      }
    }
  }
`;

export const ZONE_PAST_RUNS_QUERY = /* GraphQL */ `
  query ZonePastRuns($zoneId: Int!) {
    zone(zoneId: $zoneId) {
      pastRuns {
        lastRun {
          ${SCHEDULED_ZONE_RUN_FIELDS}
        }
        runs {
          ${SCHEDULED_ZONE_RUN_FIELDS}
        }
      }
    }
  }
`;

export const ZONE_RUN_SUMMARY_CURRENT_WEEK_QUERY = /* GraphQL */ `
  query ZoneRunSummaryCurrentWeek($zoneId: Int!) {
    zone(zoneId: $zoneId) {
      runSummary {
        currentWeek {
          ${RUN_SUMMARY_FIELDS}
        }
      }
    }
  }
`;

export const ZONE_RUN_SUMMARY_WEEKLY_QUERY = /* GraphQL */ `
  query ZoneRunSummaryWeekly($zoneId: Int!, $startWeek: Int!, $endWeek: Int!, $year: Int!) {
    zone(zoneId: $zoneId) {
      runSummary {
        weekly(startWeek: $startWeek, endWeek: $endWeek, year: $year) {
          ${RUN_SUMMARY_FIELDS}
        }
      }
    }
  }
`;

export const ZONE_RUN_SUMMARY_MONTHLY_QUERY = /* GraphQL */ `
  query ZoneRunSummaryMonthly($zoneId: Int!, $startMonth: Int!, $endMonth: Int!, $year: Int!) {
    zone(zoneId: $zoneId) {
      runSummary {
        monthly(startMonth: $startMonth, endMonth: $endMonth, year: $year) {
          ${RUN_SUMMARY_FIELDS}
        }
      }
    }
  }
`;

export const ZONE_RUN_SUMMARY_ANNUAL_QUERY = /* GraphQL */ `
  query ZoneRunSummaryAnnual($zoneId: Int!, $startYear: Int!, $endYear: Int!) {
    zone(zoneId: $zoneId) {
      runSummary {
        annual(startYear: $startYear, endYear: $endYear) {
          ${RUN_SUMMARY_FIELDS}
        }
      }
    }
  }
`;

// Controller config mutations (location, master valve, program mode, hibernate, expanders)

export const UPDATE_LOCATION_MUTATION = /* GraphQL */ `
  mutation UpdateLocation($deviceId: Int!, $address: String!) {
    updateLocation(deviceId: $deviceId, address: $address) {
      id
      address
      country
      state
      locality
      coordinates {
        latitude
        longitude
      }
    }
  }
`;

export const UPDATE_LOCATION_COORDINATES_MUTATION = /* GraphQL */ `
  mutation UpdateLocationCoordinates($deviceId: Int!, $latitude: Float!, $longitude: Float!) {
    updateLocationCoordinates(deviceId: $deviceId, latitude: $latitude, longitude: $longitude) {
      id
      address
      coordinates {
        latitude
        longitude
      }
    }
  }
`;

export const UPDATE_CONTROLLER_MASTER_VALVE_MUTATION = /* GraphQL */ `
  mutation UpdateControllerMasterValve($zoneNumber: Int!, $controllerId: Int!) {
    updateControllerMasterValve(zoneNumber: $zoneNumber, controllerId: $controllerId) {
      zoneNumber {
        value
      }
      delay
      postTimer
    }
  }
`;

export const UPDATE_CONTROLLER_PROGRAM_MODE_MUTATION = /* GraphQL */ `
  mutation UpdateControllerProgramMode($controllerId: Int!, $programMode: ControllerProgramModeEnum) {
    updateControllerProgramMode(controllerId: $controllerId, programMode: $programMode) {
      id
      programMode
    }
  }
`;

export const HIBERNATE_CONTROLLER_MUTATION = /* GraphQL */ `
  mutation HibernateController($controllerId: Int!) {
    hibernateController(controllerId: $controllerId)
  }
`;

export const WAKE_CONTROLLER_MUTATION = /* GraphQL */ `
  mutation WakeController($controllerId: Int!) {
    wakeController(controllerId: $controllerId)
  }
`;

export const CREATE_EXPANDER_MUTATION = /* GraphQL */ `
  mutation CreateExpander($controllerId: Int!, $name: String!, $number: Int!) {
    createExpander(controllerId: $controllerId, name: $name, number: $number) {
      id
      name
      number
    }
  }
`;

export const UPDATE_EXPANDER_MUTATION = /* GraphQL */ `
  mutation UpdateExpander($expanderId: Int!, $name: String!, $number: Int!) {
    updateExpander(expanderId: $expanderId, name: $name, number: $number) {
      id
      name
      number
    }
  }
`;

export const DELETE_EXPANDER_MUTATION = /* GraphQL */ `
  mutation DeleteExpander($expanderId: Int!) {
    deleteExpander(expanderId: $expanderId)
  }
`;

// Note CRUD mutations

const NOTE_FIELDS = /* GraphQL */ `
  id
  note
  type
  pinnedToTop
  lastUpdatedAt {
    value
  }
`;

export const CREATE_CONTROLLER_NOTE_MUTATION = /* GraphQL */ `
  mutation CreateControllerNote($controllerId: Int!, $note: String!, $type: NoteType!, $pinnedToTop: Boolean!) {
    createControllerNote(controllerId: $controllerId, note: $note, type: $type, pinnedToTop: $pinnedToTop) {
      ${NOTE_FIELDS}
    }
  }
`;

export const UPDATE_CONTROLLER_NOTE_MUTATION = /* GraphQL */ `
  mutation UpdateControllerNote($noteId: Int!, $controllerId: Int!, $note: String!, $type: NoteType!, $pinnedToTop: Boolean!) {
    updateControllerNote(noteId: $noteId, controllerId: $controllerId, note: $note, type: $type, pinnedToTop: $pinnedToTop) {
      ${NOTE_FIELDS}
    }
  }
`;

export const DELETE_CONTROLLER_NOTE_MUTATION = /* GraphQL */ `
  mutation DeleteControllerNote($noteId: Int!) {
    deleteControllerNote(noteId: $noteId) {
      status
      summary
    }
  }
`;

export const CREATE_ZONE_NOTE_MUTATION = /* GraphQL */ `
  mutation CreateZoneNote($zoneId: Int!, $note: String!, $type: NoteType!, $pinnedToTop: Boolean!) {
    createZoneNote(zoneId: $zoneId, note: $note, type: $type, pinnedToTop: $pinnedToTop) {
      ${NOTE_FIELDS}
    }
  }
`;

export const UPDATE_ZONE_NOTE_MUTATION = /* GraphQL */ `
  mutation UpdateZoneNote($noteId: Int!, $zoneId: Int!, $note: String!, $type: NoteType!, $pinnedToTop: Boolean!) {
    updateZoneNote(noteId: $noteId, zoneId: $zoneId, note: $note, type: $type, pinnedToTop: $pinnedToTop) {
      ${NOTE_FIELDS}
    }
  }
`;

export const DELETE_ZONE_NOTE_MUTATION = /* GraphQL */ `
  mutation DeleteZoneNote($noteId: Int!) {
    deleteZoneNote(noteId: $noteId) {
      status
      summary
    }
  }
`;

// Zone create/delete (Advanced variant — the deprecated createZone is intentionally not wrapped)

export const CREATE_ZONE_ADVANCED_MUTATION = /* GraphQL */ `
  mutation CreateZoneAdvanced(
    $controllerId: Int!
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
    $runNextAvailableStartTime: Boolean
    $preConfiguredWateringScheduleId: Int
    $cycleSoakEnable: Boolean
    $cycleCustomTime: Int
    $soakCustomTime: Int
    $factors: [Int]
    $sensorIds: [Int]
    $reusableSchedule: Boolean
    $reusableScheduleName: String
    $flowMonitoringMethod: MonitoringMethodEnum
    $currentMonitoringMethod: MonitoringMethodEnum
    $flowMonitoringValue: Float
    $currentMonitoringValue: Int
  ) {
    createZoneAdvanced(
      controllerId: $controllerId
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
      flowMonitoringMethod: $flowMonitoringMethod
      currentMonitoringMethod: $currentMonitoringMethod
      flowMonitoringValue: $flowMonitoringValue
      currentMonitoringValue: $currentMonitoringValue
    ) {
      id
      name
      number {
        value
      }
    }
  }
`;

export const DELETE_ZONE_MUTATION = /* GraphQL */ `
  mutation DeleteZone($zoneId: Int!) {
    deleteZone(zoneId: $zoneId)
  }
`;

// Writable shape for create_zone — same as ZoneWritable minus zone_id, plus controller_id.
export interface ZoneCreatePayload {
  controller_id: number;
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
  run_next_available_start_time: boolean | null;
  pre_configured_watering_schedule_id: number | null;
  cycle_soak_enable: boolean | null;
  cycle_custom_time: number | null;
  soak_custom_time: number | null;
  factors: number[] | null;
  sensor_ids: number[] | null;
  reusable_schedule: boolean | null;
  reusable_schedule_name: string | null;
  flow_monitoring_method: MonitoringMethod | null;
  current_monitoring_method: MonitoringMethod | null;
  flow_monitoring_value: number | null;
  current_monitoring_value: number | null;
}
