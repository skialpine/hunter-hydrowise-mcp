import { describe, expect, it } from 'vitest';
import {
  buildRestoreCaveats,
  buildRestoreRecipe,
  RECIPE_TOOL_NAMES,
  type SnapshotForRecipe,
} from '../../src/tools/restoreRecipe.js';

// =============================================================================
// Minimal-controller fixture: one zone, no sensors, no programs, no notes.
// All other fixtures extend this to keep test setup focused on the field under test.
// =============================================================================

function makeMinimalSnapshot(overrides: Partial<SnapshotForRecipe['controller']> = {}): SnapshotForRecipe {
  return {
    snapshot_version: 6,
    controller: {
      id: 317416,
      program_mode: 'STANDARD',
      location: null,
      master_valve: null,
      seasonal_adjustments: { monthly_adjustment_percents: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100] },
      watering_triggers: null,
      zones: [],
      programs: [],
      sensors: [],
      advanced_programs: [],
      controller_notes: [],
      ...overrides,
    },
  };
}

describe('buildRestoreRecipe — minimal snapshot', () => {
  it('emits update_controller_program_mode + update_seasonal_adjustments for a STANDARD-mode controller with no zones/programs/sensors/notes', () => {
    const recipe = buildRestoreRecipe(makeMinimalSnapshot());
    const tools = recipe.map((s) => s.tool);
    expect(tools).toEqual(['update_controller_program_mode', 'update_seasonal_adjustments']);
  });

  it('orders steps starting at 1 with monotonically increasing order numbers', () => {
    const recipe = buildRestoreRecipe(makeMinimalSnapshot());
    expect(recipe.map((s) => s.order)).toEqual([1, 2]);
  });

  it('emits ADVANCED program_mode when snapshot is ADVANCED', () => {
    const recipe = buildRestoreRecipe(makeMinimalSnapshot({ program_mode: 'ADVANCED' }));
    const programModeStep = recipe.find((s) => s.tool === 'update_controller_program_mode');
    expect(programModeStep?.args.program_mode).toBe('ADVANCED');
  });

  it('omits update_controller_program_mode when snapshot has no program_mode (older snapshots)', () => {
    const recipe = buildRestoreRecipe(makeMinimalSnapshot({ program_mode: null }));
    expect(recipe.map((s) => s.tool)).not.toContain('update_controller_program_mode');
  });
});

// =============================================================================
// Controller-level prerequisites
// =============================================================================

describe('buildRestoreRecipe — controller-level prereqs', () => {
  it('emits update_location with address + coords when both are captured', () => {
    const recipe = buildRestoreRecipe(
      makeMinimalSnapshot({
        location: { address: '1 Tufts', latitude: 39.6, longitude: -104.9 },
      }),
    );
    const locStep = recipe.find((s) => s.tool === 'update_location');
    expect(locStep?.args).toEqual({
      controller_id: 317416,
      address: '1 Tufts',
      latitude: 39.6,
      longitude: -104.9,
    });
  });

  it('omits update_location when location is null and address+coords are absent', () => {
    const recipe = buildRestoreRecipe(makeMinimalSnapshot({ location: null }));
    expect(recipe.map((s) => s.tool)).not.toContain('update_location');
  });

  it('emits update_controller_master_valve when zone_number is captured', () => {
    const recipe = buildRestoreRecipe(makeMinimalSnapshot({ master_valve: { zone_number: 12 } }));
    const mvStep = recipe.find((s) => s.tool === 'update_controller_master_valve');
    expect(mvStep?.args).toEqual({ controller_id: 317416, zone_number: 12 });
  });

  it('emits update_watering_triggers with bare numbers (unit metadata stripped)', () => {
    const recipe = buildRestoreRecipe(
      makeMinimalSnapshot({
        watering_triggers: {
          extend_water_temperature: { value: 96, unit: 'F' },
          extend_water_temperature_enabled: true,
          extend_water_temperature_percent: 10,
          extend_water_humidity_percent: 80,
          extend_water_humidity_enabled: true,
          suspend_water_week_rain: { value: 0.5, unit: 'in' },
          suspend_water_rain_days: 3,
          suspend_water_week_rain_enabled: true,
          suspend_water_rain: { value: 0.2, unit: 'in' },
          suspend_water_rain_enabled: true,
          suspend_water_temperature: { value: 50, unit: 'F' },
          suspend_water_temperature_enabled: true,
          suspend_probability_of_precipitation_percent: 60,
          suspend_probability_of_precipitation_enabled: true,
          suspend_wind: { value: 25, unit: 'mph' },
          suspend_wind_enabled: true,
          enable_evapotranspiration_forecast_temperature: true,
          enable_evapotranspiration_forecast_rain: true,
          reduce_water_temperature_enabled: true,
          reduce_water_temperature: { value: 75, unit: 'F' },
          reduce_water_temperature_percent: 30,
        },
      }),
    );
    const wtStep = recipe.find((s) => s.tool === 'update_watering_triggers');
    expect(wtStep?.args.extend_water_temperature).toBe(96);
    expect(wtStep?.args.suspend_wind).toBe(25);
    expect(wtStep?.args.suspend_water_rain).toBe(0.2);
    expect(wtStep?.args.extend_water_temperature_enabled).toBe(true);
    expect(wtStep?.args.suspend_water_rain_days).toBe(3);
    // Confirm unit metadata is NOT in the args (mutations take bare numbers).
    expect(JSON.stringify(wtStep?.args)).not.toContain('"unit"');
  });
});

// =============================================================================
// Sensors with custom-type dependency tracking
// =============================================================================

describe('buildRestoreRecipe — sensors', () => {
  it('emits create_sensor for a built-in sensor (customer_id null) with no custom-type dependency', () => {
    const recipe = buildRestoreRecipe(
      makeMinimalSnapshot({
        sensors: [
          {
            id: 5001,
            name: 'Front rain',
            model_id: 12,
            input_number: 1,
            zone_ids: [100, 101],
            _observed: {
              model_name: 'Rain Sensor (NC)',
              sensor_type: 'LEVEL_CLOSED',
              mode_type: 'STOP',
              customer_id: null,
              delay_seconds: 0,
              off_timer_seconds: null,
              flow_rate: null,
            },
          },
        ],
      }),
    );
    const customStep = recipe.find((s) => s.tool === 'create_custom_sensor_type');
    const sensorStep = recipe.find((s) => s.tool === 'create_sensor');
    expect(customStep).toBeUndefined();
    expect(sensorStep?.args).toMatchObject({
      controller_id: 317416,
      name: 'Front rain',
      model_id: 12,
      input_number: 1,
      zone_ids: [100, 101],
    });
    expect(sensorStep?.depends_on).toEqual([]);
  });

  it('emits create_custom_sensor_type before create_sensor for custom-typed sensors, with depends_on linking them', () => {
    const recipe = buildRestoreRecipe(
      makeMinimalSnapshot({
        sensors: [
          {
            id: 5002,
            name: 'Custom flow',
            model_id: 999,
            input_number: 2,
            zone_ids: [100],
            _observed: {
              model_name: 'Custom Flow Type',
              sensor_type: 'FLOW',
              mode_type: 'REPORT',
              customer_id: 4242,
              delay_seconds: 5,
              off_timer_seconds: 30,
              flow_rate: 1.5,
            },
          },
        ],
      }),
    );
    const customStep = recipe.find((s) => s.tool === 'create_custom_sensor_type');
    const sensorStep = recipe.find((s) => s.tool === 'create_sensor');
    expect(customStep).toBeDefined();
    expect(sensorStep).toBeDefined();
    // customStep must precede sensorStep (lower order number).
    expect(customStep!.order).toBeLessThan(sensorStep!.order);
    // sensorStep depends on customStep.
    expect(sensorStep!.depends_on).toEqual([customStep!.order]);
    // Custom-type args carry the calibration fields.
    expect(customStep?.args).toMatchObject({
      customer_id: 4242,
      name: 'Custom Flow Type',
      custom_sensor_type: 'FLOW',
      mode_type: 'REPORT',
      delay_seconds: 5,
      off_timer_seconds: 30,
      flow_sensor_rate: 1.5,
    });
  });

  it('deduplicates create_custom_sensor_type by model_id when multiple sensors share the same custom type', () => {
    const obs = {
      model_name: 'Custom Flow Type',
      sensor_type: 'FLOW' as const,
      mode_type: 'REPORT' as const,
      customer_id: 4242,
      delay_seconds: null,
      off_timer_seconds: null,
      flow_rate: 1.5,
    };
    const recipe = buildRestoreRecipe(
      makeMinimalSnapshot({
        sensors: [
          { id: 1, name: 'A', model_id: 999, input_number: 1, zone_ids: [100], _observed: obs },
          { id: 2, name: 'B', model_id: 999, input_number: 2, zone_ids: [101], _observed: obs },
        ],
      }),
    );
    const customSteps = recipe.filter((s) => s.tool === 'create_custom_sensor_type');
    const sensorSteps = recipe.filter((s) => s.tool === 'create_sensor');
    expect(customSteps).toHaveLength(1);
    expect(sensorSteps).toHaveLength(2);
    // Both sensors depend on the single custom-type step.
    for (const ss of sensorSteps) {
      expect(ss.depends_on).toEqual([customSteps[0]!.order]);
    }
  });
});

// =============================================================================
// Standard programs and zone settings
// =============================================================================

describe('buildRestoreRecipe — programs and zones', () => {
  it('emits update_standard_program for a Standard program with full inlined detail', () => {
    const recipe = buildRestoreRecipe(
      makeMinimalSnapshot({
        programs: [
          {
            id: 100,
            name: 'Lawn',
            program_type: 'Standard',
            standard_program_day_pattern: 'EVERY_DAY',
            scheduling_method: 3,
            monthly_watering_adjustment_percents: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
            schedule_adjustment_ids: [17],
            valid_from_epoch_seconds: null,
            valid_to_epoch_seconds: null,
            periodicity: { period: 1, series_start_epoch_seconds: null },
            start_times: ['06:00', '18:00'],
            days_run: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
            per_zone_run_times: [
              { zone_id: 100, zone_number: 1, run_time_group_id: 200, duration_minutes: 10 },
            ],
          },
        ],
      }),
    );
    const progStep = recipe.find((s) => s.tool === 'update_standard_program');
    expect(progStep?.args).toMatchObject({
      program_id: 100,
      controller_id: 317416,
      name: 'Lawn',
      start_times: ['06:00', '18:00'],
      schedule_adjustment_ids: [17],
    });
    // notes flag the gap (program_type / day_pattern not in the captured shape).
    expect(progStep?.notes).toBeDefined();
  });

  it('skips Advanced programs (no createAdvancedProgram mutation) — handled via per-zone flow instead', () => {
    const recipe = buildRestoreRecipe(
      makeMinimalSnapshot({
        program_mode: 'ADVANCED',
        programs: [
          { id: 100, name: 'Adv', program_type: 'Advanced', advanced_program_id: 999 },
        ],
      }),
    );
    expect(recipe.map((s) => s.tool)).not.toContain('update_advanced_program');
  });

  it('emits update_zone_settings for each zone with zone settings, depending on prior program steps', () => {
    const recipe = buildRestoreRecipe(
      makeMinimalSnapshot({
        programs: [
          {
            id: 100,
            name: 'Lawn',
            program_type: 'Standard',
            standard_program_day_pattern: 'EVERY_DAY',
            scheduling_method: 3,
            monthly_watering_adjustment_percents: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
            schedule_adjustment_ids: [],
            valid_from_epoch_seconds: null,
            valid_to_epoch_seconds: null,
            periodicity: null,
            start_times: ['06:00'],
            days_run: ['MONDAY'],
            per_zone_run_times: [],
          },
        ],
        zones: [
          {
            id: 100,
            name: 'Front Lawn',
            number: 1,
            program_start_times: [],
            settings: {
              zone_id: 100,
              name: 'Front Lawn',
              number: 1,
              icon: 4,
              master_valve_override: -1,
              watering_adjustment_percent: 100,
              cycle_soak_enable: false,
              cycle_custom_time_minutes: null,
              soak_custom_time_minutes: null,
              flow_monitoring_method: null,
              current_monitoring_method: null,
              flow_monitoring_value: null,
              current_monitoring_value: null,
              watering_mode: null,
              global_master_valve: null,
              schedule_adjustment_ids: null,
              watering_type: null,
              run_time_minutes: null,
              watering_frequency_mode: null,
              fixed_watering_frequency_minutes: null,
              smart_watering_frequency_seconds: null,
              virtual_solar_sync_watering_frequency_minutes: null,
              run_next_available_start_time: null,
              pre_configured_watering_schedule_id: null,
              monthly_adjustment_percents: null,
              sensor_ids: null,
              reusable_schedule: null,
              reusable_schedule_name: null,
              _unreadable_fields: ['watering_mode', 'global_master_valve'],
            },
          },
        ],
      }),
    );
    const programStep = recipe.find((s) => s.tool === 'update_standard_program');
    const zoneStep = recipe.find((s) => s.tool === 'update_zone_settings');
    expect(zoneStep).toBeDefined();
    expect(zoneStep!.depends_on).toContain(programStep!.order);
    expect(zoneStep!.notes).toMatch(/unreadable fields/);
  });
});

// =============================================================================
// Notes
// =============================================================================

describe('buildRestoreRecipe — notes', () => {
  it('emits create_controller_note for each controller note', () => {
    const recipe = buildRestoreRecipe(
      makeMinimalSnapshot({
        controller_notes: [
          { id: 1, note: 'Spring tune-up done', type: 'comment', pinned_to_top: false },
          { id: 2, note: 'Cracked head zone 5', type: 'fault', pinned_to_top: true },
        ],
      }),
    );
    const noteSteps = recipe.filter((s) => s.tool === 'create_controller_note');
    expect(noteSteps).toHaveLength(2);
    expect(noteSteps[0]!.args).toEqual({
      controller_id: 317416,
      note: 'Spring tune-up done',
      type: 'comment',
      pinned_to_top: false,
    });
  });
});

// =============================================================================
// Caveats
// =============================================================================

describe('buildRestoreCaveats', () => {
  it('emits no caveats for a minimal STANDARD snapshot with no zones / sensors / triggers', () => {
    const caveats = buildRestoreCaveats(makeMinimalSnapshot());
    expect(caveats).toEqual([]);
  });

  it('emits a caveat when zones have unreadable fields', () => {
    const caveats = buildRestoreCaveats(
      makeMinimalSnapshot({
        zones: [
          {
            id: 100,
            name: 'Front',
            number: 1,
            program_start_times: [],
            settings: {
              zone_id: 100,
              name: 'Front',
              number: 1,
              icon: null,
              master_valve_override: -1,
              watering_adjustment_percent: null,
              cycle_soak_enable: null,
              cycle_custom_time_minutes: null,
              soak_custom_time_minutes: null,
              flow_monitoring_method: null,
              current_monitoring_method: null,
              flow_monitoring_value: null,
              current_monitoring_value: null,
              watering_mode: null,
              global_master_valve: null,
              schedule_adjustment_ids: null,
              watering_type: null,
              run_time_minutes: null,
              watering_frequency_mode: null,
              fixed_watering_frequency_minutes: null,
              smart_watering_frequency_seconds: null,
              virtual_solar_sync_watering_frequency_minutes: null,
              run_next_available_start_time: null,
              pre_configured_watering_schedule_id: null,
              monthly_adjustment_percents: null,
              sensor_ids: null,
              reusable_schedule: null,
              reusable_schedule_name: null,
              _unreadable_fields: ['watering_mode', 'global_master_valve'],
            },
          },
        ],
      }),
    );
    expect(caveats.some((c) => c.includes('unreadable'))).toBe(true);
  });

  it('emits a caveat when zones reference reusable schedule_adjustment_ids', () => {
    const caveats = buildRestoreCaveats(
      makeMinimalSnapshot({
        zones: [
          {
            id: 100,
            name: 'Front',
            number: 1,
            program_start_times: [],
            settings: {
              zone_id: 100,
              name: 'Front',
              number: 1,
              icon: null,
              master_valve_override: -1,
              watering_adjustment_percent: 100,
              cycle_soak_enable: false,
              cycle_custom_time_minutes: null,
              soak_custom_time_minutes: null,
              flow_monitoring_method: null,
              current_monitoring_method: null,
              flow_monitoring_value: null,
              current_monitoring_value: null,
              watering_mode: null,
              global_master_valve: null,
              schedule_adjustment_ids: [17, 23],
              watering_type: null,
              run_time_minutes: null,
              watering_frequency_mode: null,
              fixed_watering_frequency_minutes: null,
              smart_watering_frequency_seconds: null,
              virtual_solar_sync_watering_frequency_minutes: null,
              run_next_available_start_time: null,
              pre_configured_watering_schedule_id: null,
              monthly_adjustment_percents: null,
              sensor_ids: null,
              reusable_schedule: null,
              reusable_schedule_name: null,
              _unreadable_fields: [],
            },
          },
        ],
      }),
    );
    expect(caveats.some((c) => c.includes('reusable schedule_adjustment_ids') && c.includes('17') && c.includes('23'))).toBe(true);
  });

  it('emits a caveat when sensors reference custom types (customer_id non-null and non-zero)', () => {
    const caveats = buildRestoreCaveats(
      makeMinimalSnapshot({
        sensors: [
          {
            id: 1,
            name: 'Custom',
            model_id: 999,
            input_number: 1,
            zone_ids: [100],
            _observed: {
              model_name: 'My Custom',
              sensor_type: 'FLOW',
              mode_type: 'REPORT',
              customer_id: 4242,
              delay_seconds: null,
              off_timer_seconds: null,
              flow_rate: 1.5,
            },
          },
        ],
      }),
    );
    expect(caveats.some((c) => c.includes('custom sensor types') && c.includes('My Custom'))).toBe(true);
  });

  it('emits an ADVANCED-mode caveat when program_mode is ADVANCED', () => {
    const caveats = buildRestoreCaveats(makeMinimalSnapshot({ program_mode: 'ADVANCED' }));
    expect(caveats.some((c) => c.includes('ADVANCED-mode controller'))).toBe(true);
  });

  it('emits a hardware re-wiring caveat whenever any sensor is captured', () => {
    const caveats = buildRestoreCaveats(
      makeMinimalSnapshot({
        sensors: [
          {
            id: 1,
            name: 'Rain',
            model_id: 12,
            input_number: 1,
            zone_ids: [100],
            _observed: {
              model_name: 'Rain (NC)',
              sensor_type: 'LEVEL_CLOSED',
              mode_type: 'STOP',
              customer_id: null,
              delay_seconds: 0,
              off_timer_seconds: null,
              flow_rate: null,
            },
          },
        ],
      }),
    );
    // Hardware re-wiring caveat is FYI-tier (low-stakes; the skill does not block on it)
    // — the prefix is the structural marker the skill uses to differentiate from
    // safety-critical caveats. Assert both the prefix AND the wiring content.
    const wiringCaveat = caveats.find((c) => c.includes('input_number values reflect physical wiring'));
    expect(wiringCaveat).toBeDefined();
    expect(wiringCaveat!.startsWith('FYI: ')).toBe(true);
  });

  it('emits a unit-pref drift caveat when watering_triggers values include unit strings', () => {
    const caveats = buildRestoreCaveats(
      makeMinimalSnapshot({
        watering_triggers: {
          extend_water_temperature: { value: 96, unit: 'F' },
          extend_water_temperature_enabled: true,
          extend_water_temperature_percent: 10,
          extend_water_humidity_percent: 80,
          extend_water_humidity_enabled: true,
          suspend_water_week_rain: null,
          suspend_water_rain_days: 3,
          suspend_water_week_rain_enabled: false,
          suspend_water_rain: null,
          suspend_water_rain_enabled: false,
          suspend_water_temperature: null,
          suspend_water_temperature_enabled: false,
          suspend_probability_of_precipitation_percent: 60,
          suspend_probability_of_precipitation_enabled: true,
          suspend_wind: { value: 25, unit: 'mph' },
          suspend_wind_enabled: true,
          enable_evapotranspiration_forecast_temperature: true,
          enable_evapotranspiration_forecast_rain: true,
          reduce_water_temperature_enabled: false,
          reduce_water_temperature: null,
          reduce_water_temperature_percent: 0,
        },
      }),
    );
    expect(caveats.some((c) => c.includes('captured with units') && c.includes('F') && c.includes('mph'))).toBe(true);
  });
});

// =============================================================================
// Tool catalog — every tool the recipe could emit must be in RECIPE_TOOL_NAMES
// =============================================================================

describe('RECIPE_TOOL_NAMES', () => {
  it('includes every tool emitted by the recipe builder across all fixtures', () => {
    // Build a richly-populated snapshot exercising every emit path.
    const rich = makeMinimalSnapshot({
      program_mode: 'STANDARD',
      location: { address: '1', latitude: 1, longitude: 1 },
      master_valve: { zone_number: 12 },
      watering_triggers: {
        extend_water_temperature: { value: 96, unit: 'F' },
        extend_water_temperature_enabled: true,
        extend_water_temperature_percent: 10,
        extend_water_humidity: 80,
        extend_water_humidity_enabled: true,
        suspend_water_week_rain: null,
        suspend_water_rain_days: 3,
        suspend_water_week_rain_enabled: false,
        suspend_water_rain: null,
        suspend_water_rain_enabled: false,
        suspend_water_temperature: null,
        suspend_water_temperature_enabled: false,
        suspend_probability_of_precipitation: 60,
        suspend_probability_of_precipitation_enabled: true,
        suspend_wind: null,
        suspend_wind_enabled: false,
        enable_evapotranspiration_forecast_temperature: true,
        enable_evapotranspiration_forecast_rain: true,
        reduce_water_temperature_enabled: false,
        reduce_water_temperature: null,
        reduce_water_temperature_percent: 0,
      },
      sensors: [
        {
          id: 1,
          name: 'Custom',
          model_id: 999,
          input_number: 1,
          zone_ids: [100],
          _observed: {
            model_name: 'Custom',
            sensor_type: 'FLOW',
            mode_type: 'REPORT',
            customer_id: 4242,
            delay_seconds: null,
            off_timer_seconds: null,
            flow_rate: 1,
          },
        },
      ],
      programs: [
        {
          id: 100,
          name: 'Lawn',
          program_type: 'Standard',
          standard_program_day_pattern: 'EVERY_DAY',
          scheduling_method: 3,
          monthly_watering_adjustments: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
          schedule_adjustment_ids: [],
          valid_from: null,
          valid_to: null,
          periodicity: null,
          start_times: ['06:00'],
          days_run: ['MONDAY'],
          per_zone_run_times: [],
        },
      ],
      zones: [
        {
          id: 100,
          name: 'Front',
          number: 1,
          program_start_times: [{ id: 1, type_value: 1, time: '06:00', watering_days: 0, apply_all: false, zone_ids: [100] }],
          settings: {
            zone_id: 100,
            name: 'Front',
            number: 1,
            icon: null,
            master_valve_override: -1,
            watering_adjustment_percent: 100,
            cycle_soak_enable: false,
            cycle_custom_time_minutes: null,
            soak_custom_time_minutes: null,
            flow_monitoring_method: null,
            current_monitoring_method: null,
            flow_monitoring_value: null,
            current_monitoring_value: null,
            watering_mode: null,
            global_master_valve: null,
            schedule_adjustment_ids: null,
            watering_type: null,
            run_time_minutes: null,
            watering_frequency_mode: null,
            fixed_watering_frequency_minutes: null,
            smart_watering_frequency_seconds: null,
            virtual_solar_sync_watering_frequency_minutes: null,
            run_next_available_start_time: null,
            pre_configured_watering_schedule_id: null,
            factors: null,
            sensor_ids: null,
            reusable_schedule: null,
            reusable_schedule_name: null,
            _unreadable_fields: [],
          },
        },
      ],
      controller_notes: [{ id: 1, note: 'Tune-up', type: 'comment', pinned_to_top: false }],
    });
    // Add a zone note via cast (the recipe reads zone_notes off settings).
    (rich.controller.zones[0]!.settings as unknown as { zone_notes: unknown[] }).zone_notes = [
      { id: 99, note: 'Cracked head', type: 'fault', pinned_to_top: true },
    ];
    const recipe = buildRestoreRecipe(rich);
    const emittedTools = new Set(recipe.map((s) => s.tool));
    for (const t of emittedTools) {
      expect(RECIPE_TOOL_NAMES).toContain(t as (typeof RECIPE_TOOL_NAMES)[number]);
    }
    // Sanity: rich fixture covers every distinct emit path.
    expect(emittedTools).toContain('update_controller_program_mode');
    expect(emittedTools).toContain('update_location');
    expect(emittedTools).toContain('update_controller_master_valve');
    expect(emittedTools).toContain('update_seasonal_adjustments');
    expect(emittedTools).toContain('update_watering_triggers');
    expect(emittedTools).toContain('create_custom_sensor_type');
    expect(emittedTools).toContain('create_sensor');
    expect(emittedTools).toContain('update_standard_program');
    expect(emittedTools).toContain('update_zone_settings');
    expect(emittedTools).toContain('create_program_start_time');
    expect(emittedTools).toContain('create_controller_note');
    expect(emittedTools).toContain('create_zone_note');
  });
});
