import { describe, expect, it } from 'vitest';
import type {
  AdvancedProgramRead,
  Controller,
  ControllerNoteRead,
  ExpanderRead,
  LocationRead,
  RunTimeGroupRead,
  SensorModelRead,
  SensorRead,
  StandardProgramRead,
  TimeZoneRead,
  WateringTriggersRead,
  ZoneRichRead,
} from '../../src/hydrawise/queries.js';
import {
  serializeAdvancedProgram,
  serializeAdvancedProgramReference,
  serializeController,
  serializeExpander,
  serializeLocation,
  serializeNote,
  serializeRunTimeGroup,
  serializeSensor,
  serializeSensorModel,
  serializeSensorZoneRefsForZone,
  serializeStandardProgram,
  serializeTimeZone,
  serializeWateringTriggers,
  serializeZoneSettings,
} from '../../src/tools/serializers.js';

const baseZone: ZoneRichRead = {
  id: 42,
  name: 'Front Drip',
  number: { value: 13 },
  icon: { id: 4 },
  masterValve: -1,
  wateringSettings: {
    fixedWateringAdjustment: 100,
    cycleAndSoakSettings: { cycleDuration: 10, soakDuration: 30 },
  },
  monitoringSettings: {
    operatingRanges: {
      waterFlowRate: { value: 1.2, unit: 'gpm' },
      electricCurrent: { value: 380, unit: 'mA' },
    },
    measuredMedians: {
      waterFlowRate: { value: 1.18, unit: 'gpm' },
      electricCurrent: { value: 402, unit: 'mA' },
    },
  },
  status: { suspendedUntil: null },
};

describe('serializeZoneSettings', () => {
  it('emits cycle_soak_enable as boolean true when cycleAndSoakSettings is present', () => {
    const out = serializeZoneSettings(baseZone);
    expect(out.cycle_soak_enable).toBe(true);
    expect(out.cycle_custom_time_minutes).toBe(10);
    expect(out.soak_custom_time_minutes).toBe(30);
  });

  it('emits cycle_soak_enable as false when cycleAndSoakSettings is null', () => {
    const out = serializeZoneSettings({
      ...baseZone,
      wateringSettings: { fixedWateringAdjustment: 100, cycleAndSoakSettings: null },
    });
    expect(out.cycle_soak_enable).toBe(false);
  });

  it('attaches monitoring_observed with units preserved on every value', () => {
    const out = serializeZoneSettings(baseZone);
    expect(out.monitoring_observed).toEqual({
      operating_ranges: {
        water_flow_rate: { value: 1.2, unit: 'gpm' },
        electric_current: { value: 380, unit: 'mA' },
      },
      measured_medians: {
        water_flow_rate: { value: 1.18, unit: 'gpm' },
        electric_current: { value: 402, unit: 'mA' },
      },
    });
  });

  it('returns null monitoring_observed when monitoringSettings is absent', () => {
    const out = serializeZoneSettings({ ...baseZone, monitoringSettings: null });
    expect(out.monitoring_observed).toBeNull();
  });

  it('writable monitoring fields default to null on read (must be set explicitly on write)', () => {
    const out = serializeZoneSettings(baseZone);
    expect(out.flow_monitoring_method).toBeNull();
    expect(out.current_monitoring_method).toBeNull();
    expect(out.flow_monitoring_value).toBeNull();
    expect(out.current_monitoring_value).toBeNull();
  });

  it('exposes _unreadable_fields listing writable-but-unreadable field names', () => {
    const out = serializeZoneSettings(baseZone);
    const unreadable = out._unreadable_fields as string[];
    expect(unreadable).toContain('watering_mode');
    expect(unreadable).toContain('flow_monitoring_value');
    expect(unreadable).toContain('sensor_ids');
    // Each name listed in _unreadable_fields must correspond to a null value in the serialized output.
    for (const name of unreadable) {
      expect(out[name]).toBeNull();
    }
  });

  it('exposes master_valve_override from Zone.masterValve', () => {
    expect(serializeZoneSettings({ ...baseZone, masterValve: -1 }).master_valve_override).toBe(-1);
    expect(serializeZoneSettings({ ...baseZone, masterValve: 0 }).master_valve_override).toBe(0);
    expect(serializeZoneSettings({ ...baseZone, masterValve: 7 }).master_valve_override).toBe(7);
  });

  it('does not include zone_notes (notes are fetched separately by backup.ts and merged in; serializeZoneSettings does not receive them)', () => {
    const out = serializeZoneSettings(baseZone);
    expect(out.zone_notes).toBeUndefined();
  });
});

describe('serializeLocation', () => {
  it('flattens coordinates into top-level latitude/longitude', () => {
    const loc: LocationRead = {
      id: 7,
      coordinates: { latitude: 39.6, longitude: -104.9 },
      address: '1 Tufts Ln',
      country: 'US',
      state: 'CO',
      locality: 'Centennial',
    };
    expect(serializeLocation(loc)).toEqual({
      id: 7,
      latitude: 39.6,
      longitude: -104.9,
      address: '1 Tufts Ln',
      country: 'US',
      state: 'CO',
      locality: 'Centennial',
    });
  });

  it('emits null lat/long when coordinates are absent', () => {
    const loc: LocationRead = {
      id: 7,
      coordinates: null,
      address: '...',
      country: null,
      state: null,
      locality: null,
    };
    const out = serializeLocation(loc);
    expect(out.latitude).toBeNull();
    expect(out.longitude).toBeNull();
  });

  it('emits null (not undefined / missing key) for every absent field', () => {
    // Cast through unknown to simulate a malformed upstream response missing optional fields.
    const sparse = { id: 7, coordinates: null } as unknown as LocationRead;
    const out = serializeLocation(sparse);
    // After JSON round-trip, missing keys would disappear; null keys survive. We need null.
    const roundTripped = JSON.parse(JSON.stringify(out));
    expect(roundTripped).toHaveProperty('address', null);
    expect(roundTripped).toHaveProperty('country', null);
    expect(roundTripped).toHaveProperty('state', null);
    expect(roundTripped).toHaveProperty('locality', null);
    expect(roundTripped).toHaveProperty('latitude', null);
    expect(roundTripped).toHaveProperty('longitude', null);
  });
});

describe('serializeTimeZone', () => {
  it('keeps name + offset', () => {
    const tz: TimeZoneRead = { name: 'America/Denver', offset: -25200 };
    expect(serializeTimeZone(tz)).toEqual({ name: 'America/Denver', offset: -25200 });
  });
});

describe('serializeExpander', () => {
  it('flattens model id and lists firmware entries', () => {
    const e: ExpanderRead = {
      id: 11,
      name: 'Expander A',
      number: 1,
      hardware: {
        model: { id: 'EXP-12' },
        firmware: [
          { type: 'main', version: 1.23, bank: 0 },
          { type: 'rf', version: 2.0, bank: null },
        ],
      },
    };
    expect(serializeExpander(e)).toEqual({
      id: 11,
      name: 'Expander A',
      number: 1,
      model_id: 'EXP-12',
      firmware: [
        { type: 'main', version: 1.23, bank: 0 },
        { type: 'rf', version: 2.0, bank: null },
      ],
    });
  });
});

describe('serializeNote', () => {
  it('serializes a controller note with snake_case fields', () => {
    const n: ControllerNoteRead = {
      id: 5,
      note: 'Winterized 2025-10-01',
      type: 'repair',
      pinnedToTop: false,
      lastUpdatedAt: { value: '2025-10-01T08:00:00Z' },
    };
    expect(serializeNote(n)).toEqual({
      id: 5,
      note: 'Winterized 2025-10-01',
      type: 'repair',
      pinned_to_top: false,
      last_updated_at: '2025-10-01T08:00:00Z',
    });
  });
});

describe('serializeRunTimeGroup', () => {
  it('renames duration to duration_minutes', () => {
    const g: RunTimeGroupRead = { id: 1, name: 'Standard', duration: 30 };
    expect(serializeRunTimeGroup(g)).toEqual({ id: 1, name: 'Standard', duration_minutes: 30 });
  });
});

describe('serializeWateringTriggers (units)', () => {
  it('emits {value, unit} for every LocalizedValueType field', () => {
    const t: WateringTriggersRead = {
      id: 1,
      extendWaterTemperature: { value: 96.99998, unit: 'F' },
      extendWaterTemperatureEnabled: true,
      extendWaterTemperaturePercentage: 20,
      extendWaterHumidity: 100,
      extendWaterHumidityEnabled: false,
      suspendWaterWeekRain: { value: 1.2, unit: 'in' },
      suspendWaterRainDays: 3,
      suspendWaterWeekRainEnabled: false,
      suspendWaterRain: { value: 0.2, unit: 'in' },
      suspendWaterRainEnabled: false,
      suspendWaterTemperature: { value: 50, unit: 'F' },
      suspendWaterTemperatureEnabled: true,
      suspendProbabilityOfPrecipitation: 70,
      suspendProbabilityOfPrecipitationEnabled: true,
      suspendWind: { value: 25, unit: 'mph' },
      suspendWindEnabled: true,
      enableEvapotranspirationForecastTemperature: true,
      enableEvapotranspirationForecastRain: true,
      reduceWaterTemperatureEnabled: true,
      reduceWaterTemperature: { value: 75, unit: 'F' },
      reduceWaterTemperaturePercentage: 30,
    };
    const out = serializeWateringTriggers(t);
    expect(out.extend_water_temperature).toEqual({ value: 96.99998, unit: 'F' });
    expect(out.suspend_water_temperature).toEqual({ value: 50, unit: 'F' });
    expect(out.reduce_water_temperature).toEqual({ value: 75, unit: 'F' });
    expect(out.suspend_wind).toEqual({ value: 25, unit: 'mph' });
    expect(out.suspend_water_rain).toEqual({ value: 0.2, unit: 'in' });
    expect(out.suspend_water_week_rain).toEqual({ value: 1.2, unit: 'in' });
    // Plain Int fields stay as bare numbers (no unit on the schema side).
    expect(out.extend_water_humidity_percent).toBe(100);
    expect(out.suspend_probability_of_precipitation_percent).toBe(70);
    expect(out.reduce_water_temperature_percent).toBe(30);
  });
});

describe('serializeStandardProgram', () => {
  it('inlines start_times, days_run, periodicity, valid_from/to, schedule_adjustment_ids, per_zone_run_times', () => {
    const p: StandardProgramRead = {
      __typename: 'StandardProgram',
      id: 6390589,
      name: 'Lawn',
      appliesToZones: [{ id: 100, number: { value: 1 }, name: '1. Test' }],
      schedulingMethod: { value: 3, label: 'Virtual Solar Sync' },
      monthlyWateringAdjustments: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      startTimes: ['22:00'],
      ignoreRainSensor: false,
      daysRun: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
      standardProgramDayPattern: 'interval',
      periodicity: { period: 2, seriesStart: { timestamp: 1750914000 } },
      timeRange: { validFrom: null, validTo: null },
      conditionalWateringAdjustments: [{ id: 17, label: 'Vacation' }],
      applications: [
        {
          zone: { id: 100, number: { value: 1 } },
          runTimeGroup: { id: 200, name: null, duration: 10 },
        },
      ],
    };
    const out = serializeStandardProgram(p);
    expect(out.id).toBe(6390589);
    expect(out.name).toBe('Lawn');
    expect(out.program_type).toBe('Standard');
    expect(out.start_times).toEqual(['22:00']);
    expect(out.days_run).toHaveLength(7);
    expect(out.periodicity).toEqual({ period: 2, series_start_epoch_seconds: 1750914000 });
    expect(out.valid_from_epoch_seconds).toBeNull();
    expect(out.valid_to_epoch_seconds).toBeNull();
    expect(out.schedule_adjustment_ids).toEqual([17]);
    expect(out.per_zone_run_times).toEqual([
      { zone_id: 100, zone_number: 1, run_time_group_id: 200, run_time_group_name: null, duration_minutes: 10 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Sensor serializers
// ---------------------------------------------------------------------------

const fakeRainSensorModel: SensorModelRead = {
  id: 12,
  name: 'Rain Sensor (normally closed wire)',
  modeType: 'STOP',
  active: true,
  offLevel: null,
  offTimer: null,
  delay: 0,
  divisor: null,
  flowRate: null,
  customerId: null,
  sensorType: 'LEVEL_CLOSED',
  type: { value: 1, label: 'Hunter Clik' },
  category: { id: 1, name: 'Hunter Clik' },
};

const fakeRainSensor: SensorRead = {
  id: 5001,
  name: 'Front yard rain',
  model: fakeRainSensorModel,
  input: { number: 1, label: 'SEN-1' },
  zones: [
    { id: 100, name: 'Front Lawn' },
    { id: 101, name: 'Back Lawn' },
  ],
};

describe('serializeSensor', () => {
  it('emits flat writable shape (id, name, model_id, input_number, zone_ids) plus _observed model details', () => {
    const out = serializeSensor(fakeRainSensor);
    expect(out.id).toBe(5001);
    expect(out.name).toBe('Front yard rain');
    expect(out.model_id).toBe(12);
    expect(out.input_number).toBe(1);
    expect(out.zone_ids).toEqual([100, 101]);
    expect(out._observed).toEqual({
      model_name: 'Rain Sensor (normally closed wire)',
      sensor_type: 'LEVEL_CLOSED',
      mode_type: 'STOP',
      divisor: null,
      flow_rate: null,
      off_level: null,
      off_timer_seconds: null,
      delay_seconds: 0,
      active: true,
      input_label: 'SEN-1',
      type_label: 'Hunter Clik',
      category: { id: 1, name: 'Hunter Clik' },
      customer_id: null,
    });
  });

  it('emits empty zone_ids and _observed.category=null when zones/category are absent', () => {
    const out = serializeSensor({
      ...fakeRainSensor,
      zones: null,
      // SelectedOption.label IS nullable (the wrapper isn't); model.category IS nullable.
      model: { ...fakeRainSensorModel, category: null, type: { value: 1, label: null } },
    });
    expect(out.zone_ids).toEqual([]);
    const observed = out._observed as { category: unknown; type_label: unknown };
    expect(observed.category).toBeNull();
    expect(observed.type_label).toBeNull();
  });

  it('strips null entries from the zones array (Hydrawise list-of-nullable schema honesty)', () => {
    const out = serializeSensor({
      ...fakeRainSensor,
      zones: [
        { id: 100, name: 'Front Lawn' },
        null,
        { id: 102, name: 'Side' },
      ],
    });
    expect(out.zone_ids).toEqual([100, 102]);
  });
});

describe('serializeSensorModel', () => {
  it('emits the catalog shape (id, name, sensor_type, mode_type, category, calibration fields, customer_id)', () => {
    const out = serializeSensorModel(fakeRainSensorModel);
    expect(out).toEqual({
      id: 12,
      name: 'Rain Sensor (normally closed wire)',
      sensor_type: 'LEVEL_CLOSED',
      mode_type: 'STOP',
      category: { id: 1, name: 'Hunter Clik' },
      delay_seconds: 0,
      off_timer_seconds: null,
      off_level: null,
      divisor: null,
      flow_rate: null,
      customer_id: null,
    });
  });

  it('treats a non-zero customer_id as a custom-type marker', () => {
    const out = serializeSensorModel({ ...fakeRainSensorModel, customerId: 4242 });
    expect(out.customer_id).toBe(4242);
  });
});

describe('serializeSensorZoneRefsForZone', () => {
  it('returns the {id, name} of every controller-level sensor that guards the given zone', () => {
    const out = serializeSensorZoneRefsForZone([fakeRainSensor], 100);
    expect(out).toEqual([{ id: 5001, name: 'Front yard rain' }]);
  });

  it('returns an empty array when no sensor guards the zone', () => {
    const out = serializeSensorZoneRefsForZone([fakeRainSensor], 999);
    expect(out).toEqual([]);
  });

  it('returns multiple references when several sensors guard the same zone', () => {
    const second: SensorRead = {
      ...fakeRainSensor,
      id: 5002,
      name: 'Soil',
      zones: [{ id: 100, name: 'Front Lawn' }],
    };
    const out = serializeSensorZoneRefsForZone([fakeRainSensor, second], 100);
    expect(out).toEqual([
      { id: 5001, name: 'Front yard rain' },
      { id: 5002, name: 'Soil' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// AdvancedProgram serializers (irrigation-scheduling, ADVANCED-mode)
// ---------------------------------------------------------------------------

const fakeAdvancedProgram: AdvancedProgramRead = {
  __typename: 'AdvancedProgram',
  id: 6390999,
  name: 'Lawn Smart',
  appliesToZones: [
    { id: 100, number: { value: 1 }, name: 'Front Lawn' },
    { id: 101, number: { value: 2 }, name: 'Back Lawn' },
  ],
  schedulingMethod: { value: 3, label: 'Smart' },
  monthlyWateringAdjustments: [100, 100, 100, 110, 120, 130, 140, 130, 120, 110, 100, 100],
  zoneSpecific: false,
  advancedProgramId: 99999,
  scope: 'CUSTOMER',
  conditionalWateringAdjustments: [{ id: 17, label: 'Hot Days' }],
  wateringFrequency: {
    label: 'Daily',
    description: 'Run every day',
    period: { value: 1, label: 'day' },
  },
  runTimeGroup: { id: 12345, name: 'Default 15min', duration: 15 },
};

describe('serializeAdvancedProgram', () => {
  it('emits flat snake_case shape with all subtype-specific fields plus the Program-interface common fields', () => {
    const out = serializeAdvancedProgram(fakeAdvancedProgram);
    expect(out).toMatchObject({
      id: 6390999,
      name: 'Lawn Smart',
      program_type: 'Advanced',
      advanced_program_id: 99999,
      scope: 'CUSTOMER',
      zone_specific: false,
      monthly_watering_adjustment_percents: [100, 100, 100, 110, 120, 130, 140, 130, 120, 110, 100, 100],
      scheduling_method: 3,
      schedule_adjustment_ids: [17],
    });
    expect(out.watering_frequency).toEqual({
      label: 'Daily',
      description: 'Run every day',
      period_value: 1,
      period_label: 'day',
    });
    expect(out.run_time_group).toEqual({
      id: 12345,
      name: 'Default 15min',
      duration_minutes: 15,
    });
    expect(out.applies_to_zones).toEqual([
      { id: 100, number: 1, name: 'Front Lawn' },
      { id: 101, number: 2, name: 'Back Lawn' },
    ]);
  });

  it('emits run_time_group: null when AdvancedProgram has no associated run-time group', () => {
    const out = serializeAdvancedProgram({ ...fakeAdvancedProgram, runTimeGroup: null });
    expect(out.run_time_group).toBeNull();
  });

  it('emits null period_value/label when WateringPeriodicity members are null (schema allows both)', () => {
    const out = serializeAdvancedProgram({
      ...fakeAdvancedProgram,
      wateringFrequency: {
        label: 'Custom',
        description: 'Per-zone schedule',
        period: { value: null, label: null },
      },
    });
    const wf = out.watering_frequency as { period_value: unknown; period_label: unknown };
    expect(wf.period_value).toBeNull();
    expect(wf.period_label).toBeNull();
  });

  it('uses program_type: "Advanced" (matching the get_program input enum and snapshot discriminator)', () => {
    const out = serializeAdvancedProgram(fakeAdvancedProgram);
    expect(out.program_type).toBe('Advanced');
  });
});

describe('serializeAdvancedProgramReference', () => {
  it('emits the minimal {id, name, advanced_program_id} cross-reference shape', () => {
    const out = serializeAdvancedProgramReference({
      id: 6390999,
      name: 'Lawn Smart',
      advancedProgramId: 99999,
    });
    expect(out).toEqual({
      id: 6390999,
      name: 'Lawn Smart',
      advanced_program_id: 99999,
    });
  });
});

describe('serializeZoneSettings — advanced_program field', () => {
  it('populates advanced_program when wateringSettings.advancedProgram is present (ADVANCED-mode zone)', () => {
    const out = serializeZoneSettings({
      ...baseZone,
      wateringSettings: {
        fixedWateringAdjustment: 100,
        cycleAndSoakSettings: null,
        advancedProgram: { id: 6390999, name: 'Lawn Smart', advancedProgramId: 99999 },
      },
    });
    expect(out.advanced_program).toEqual({
      id: 6390999,
      name: 'Lawn Smart',
      advanced_program_id: 99999,
    });
  });

  it('emits advanced_program: null on STANDARD-mode zones (the AdvancedWateringSettings fragment did not match)', () => {
    const out = serializeZoneSettings(baseZone);
    expect(out.advanced_program).toBeNull();
  });

  it('emits advanced_program: null when wateringSettings is entirely absent', () => {
    const out = serializeZoneSettings({ ...baseZone, wateringSettings: null });
    expect(out.advanced_program).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// serializeController
// ---------------------------------------------------------------------------

const baseController: Controller = {
  id: 317416,
  deviceId: 11111,
  name: 'Test Controller',
  online: true,
  softwareVersion: '1.2.3',
  programMode: 'STANDARD',
  hardware: null,
  lastContactTime: null,
  location: null,
  settings: {
    hibernateStatus: false,
    timeZone: null,
    zones: null,
  },
  status: {
    online: true,
    summary: 'All good!',
    icon: 'ok.png',
    accumulatedWaterSavings: 100,
  },
  masterZone: null,
  expanders: null,
  runTimeGroups: [],
};

describe('serializeController', () => {
  it('serializes all new fields with correct names and values', () => {
    const out = serializeController({
      ...baseController,
      settings: { hibernateStatus: true, timeZone: null, zones: null },
      status: { online: true, summary: 'Sleeping', icon: 'moon.png', accumulatedWaterSavings: 250 },
    });
    expect(out.hibernate_status).toBe(true);
    expect(out.status_summary).toBe('Sleeping');
    expect(out.status_icon).toBe('moon.png');
    expect(out.accumulated_water_savings).toBe(250);
  });

  it('serializes non-hibernated controller with hibernate_status: false', () => {
    const out = serializeController(baseController);
    expect(out.hibernate_status).toBe(false);
    expect(out.status_summary).toBe('All good!');
    expect(out.status_icon).toBe('ok.png');
    expect(out.accumulated_water_savings).toBe(100);
  });

  // Guard against runtime null on controller.status (schema says !, but the project has seen
  // !-declared fields return null — e.g. Zone.status.lastRun). All status-derived fields must
  // be null, not a TypeError crash.
  it('emits null status fields when controller.status is null at runtime', () => {
    const out = serializeController({
      ...baseController,
      status: null as unknown as Controller['status'],
    });
    expect(out.status_summary).toBeNull();
    expect(out.status_icon).toBeNull();
    expect(out.accumulated_water_savings).toBeNull();
  });

  // Task 5.2: null-path (a) — settings parent is null (older firmware)
  it('emits hibernate_status: null when settings is null (older firmware, no settings block)', () => {
    const out = serializeController({ ...baseController, settings: null });
    expect(out.hibernate_status).toBeNull();
  });

  // Task 5.2: null-path (b) — settings present but hibernateStatus field is null
  it('emits hibernate_status: null when settings.hibernateStatus is null (field absent on firmware)', () => {
    const out = serializeController({
      ...baseController,
      settings: { hibernateStatus: null, timeZone: null, zones: null },
    });
    expect(out.hibernate_status).toBeNull();
  });
});
