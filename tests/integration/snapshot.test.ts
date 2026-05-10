import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Config } from '../../src/config.js';
import { HydrawiseApi } from '../../src/hydrawise/api.js';
import type { HydrawiseClient, Variables } from '../../src/hydrawise/client.js';
import { HydrawiseAPIError } from '../../src/errors.js';
import type {
  Controller,
  StandardProgramRead,
  StatusCodeAndSummary,
  WateringTriggersRead,
  Zone,
  ZoneRichRead,
} from '../../src/hydrawise/queries.js';
import { createLogger } from '../../src/logger.js';
import { buildApp, buildMcpServer } from '../../src/server.js';

function fakeClient(): HydrawiseClient {
  return {
    async query<TResult>(): Promise<TResult> {
      return {} as TResult;
    },
    async mutate(): Promise<StatusCodeAndSummary> {
      return { status: 'OK', summary: '' };
    },
    async mutateRaw<TResult>(
      _document: string,
      _variables: Variables,
      extract: (data: Record<string, unknown>) => TResult,
    ): Promise<TResult> {
      return extract({});
    },
  };
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    username: 'alice',
    password: 'sekret',
    host: '127.0.0.1',
    port: 8765,
    allowedOrigins: null,
    authToken: null,
    sessionTtlSeconds: 60,
    logLevel: 'error',
    ...overrides,
  };
}

const fakeController: Controller = {
  id: 317416,
  deviceId: 555,
  name: 'Heller Tufts',
  online: true,
  softwareVersion: '4.55',
  programMode: 'STANDARD',
  hardware: {
    serialNumber: '05acb63e',
    status: 'Linked',
    installationTime: { value: '2020-06-12T20:38:32Z' },
    model: { id: 'hydrawise724', name: '24 Zones', family: { name: 'Pro-HC' } },
    modules: [
      { id: '1001', name: 'Wifi', serialNumber: 'WIFI-1', moduleType: 'wifi', firmwareVersion: '1.2.3' },
    ],
  },
  lastContactTime: { value: '2026-05-09T16:49:46Z' },
  location: {
    id: 7,
    coordinates: { latitude: 39.6, longitude: -104.9 },
    address: '1 Tufts Ln',
    country: 'US',
    state: 'CO',
    locality: 'Centennial',
  },
  settings: {
    hibernateStatus: false,
    timeZone: { name: 'America/Denver', offset: -25200 },
    zones: { interZoneDelay: 0, masterZone: null },
  },
  status: {
    online: true,
    summary: 'All good!',
    icon: 'ok.png',
    accumulatedWaterSavings: 100,
  },
  masterZone: { zoneNumber: { value: 0 }, delay: 0, postTimer: 0 },
  expanders: [
    {
      id: 11,
      name: 'Expander A',
      number: 1,
      hardware: { model: { id: 'EXP-12' }, firmware: [{ type: 'main', version: 1.2, bank: 0 }] },
    },
  ],
  runTimeGroups: [{ id: 200, name: null, duration: 10 }],
};

const fakeZone: Zone = { id: 100, name: 'Test Zone', number: { value: 1 } };

const fakeZoneFull: ZoneRichRead = {
  id: 100,
  name: 'Test Zone',
  number: { value: 1 },
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

const fakeStandardProgram: StandardProgramRead = {
  __typename: 'StandardProgram',
  id: 6390589,
  name: 'Lawn',
  appliesToZones: [{ id: 100, number: { value: 1 }, name: 'Test Zone' }],
  schedulingMethod: { value: 3, label: 'Virtual Solar Sync' },
  monthlyWateringAdjustments: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  startTimes: ['22:00'],
  ignoreRainSensor: false,
  daysRun: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
  standardProgramDayPattern: 'interval',
  periodicity: { period: 2, seriesStart: { value: 'Thu, 26 Jun 25 00:00:00 -0600' } },
  timeRange: { validFrom: null, validTo: null },
  conditionalWateringAdjustments: [],
  applications: [
    {
      zone: { id: 100, number: { value: 1 } },
      runTimeGroup: { id: 200, name: null, duration: 10 },
    },
  ],
};

const fakeWateringTriggers: WateringTriggersRead = {
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

function makeApp(apiOverrides: Partial<HydrawiseApi> = {}) {
  const api = Object.assign(new HydrawiseApi(fakeClient()), {
    getUser: async () => ({ id: 1, name: 'Tester', email: 't@example.com' }),
    getController: async () => fakeController,
    getZones: async () => [fakeZone],
    getZoneFull: async () => fakeZoneFull,
    getPrograms: async () => [
      // program_type is the normalized discriminator ('Standard' | 'Advanced'), not the raw __typename.
      { id: 6390589, name: 'Lawn', program_type: 'Standard', scheduling_method: 3, applies_to_zone_ids: [100] },
    ],
    getStandardProgram: async () => fakeStandardProgram,
    // Default: no Advanced program details. Tests that include Advanced programs in their
    // getPrograms fixture must override this — otherwise the snapshot's integrity check
    // (Advanced thin entry must be fetchable as full Advanced) will throw.
    getAdvancedProgram: async () => null,
    getProgramStartTimesForZone: async () => [],
    getSeasonalAdjustments: async () => [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
    getWateringTriggers: async () => fakeWateringTriggers,
    // Default: no sensors. Tests that exercise the sensor-capture path override this.
    getControllerSensors: async () => [],
    // Notes are fetched separately (subscription-gated). Defaults provide one note each
    // so tests that assert presence of notes don't need to override.
    getControllerNotes: async () => [
      { id: 5, note: 'Winterized 2025-10-01', type: 'repair' as const, pinnedToTop: false, lastUpdatedAt: { value: '2025-10-01T08:00:00Z' } },
    ],
    getZoneNotes: async () => [
      { id: 99, note: 'cracked head fixed 2025-08', type: 'repair' as const, pinnedToTop: false, lastUpdatedAt: { value: '2025-08-12T10:00:00Z' } },
    ],
    ...apiOverrides,
  });
  return buildApp(makeConfig(), () => buildMcpServer(api, createLogger('error')), createLogger('error'));
}

const INITIALIZE_BODY = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'vitest', version: '0' } },
};

async function callTool(app: ReturnType<typeof makeApp>, toolName: string, args: Record<string, unknown>) {
  const init = await request(app)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .send(INITIALIZE_BODY);
  const sessionId = init.headers['mcp-session-id'] as string;
  const res = await request(app)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('mcp-session-id', sessionId)
    .send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: args } });
  const body = res.text
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => JSON.parse(l.slice('data:'.length).trim()));
  return body.find((b: { id?: number }) => b.id === 2) as {
    result?: { content: { text: string }[]; isError?: boolean };
  };
}

describe('dump_controller_snapshot v6', () => {
  it('returns snapshot_version 8', async () => {
    const app = makeApp();
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    expect(resp.result?.isError).toBeFalsy();
    const snap = JSON.parse(resp.result!.content[0]!.text) as { snapshot_version: number };
    expect(snap.snapshot_version).toBe(8);
  });

  it('controller block includes location, time_zone, master_valve, expanders, modules, run_time_groups, controller_notes, device_id', async () => {
    const app = makeApp();
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    const snap = JSON.parse(resp.result!.content[0]!.text) as {
      controller: Record<string, unknown>;
    };
    expect(snap.controller.device_id).toBe(555);
    expect(snap.controller.location).toMatchObject({ latitude: 39.6, longitude: -104.9, address: '1 Tufts Ln' });
    expect(snap.controller.time_zone).toEqual({ name: 'America/Denver', offset: -25200 });
    expect(snap.controller.master_valve).toEqual({ zone_number: 0, delay_seconds: 0, post_timer_seconds: 0 });
    expect(snap.controller.expanders).toHaveLength(1);
    expect(snap.controller.modules).toHaveLength(1);
    expect(snap.controller.run_time_groups).toEqual([{ id: 200, name: null, duration_minutes: 10 }]);
    expect((snap.controller.controller_notes as Array<unknown>)).toHaveLength(1);
  });

  it('zone block includes master_valve_override, zone_notes, _unreadable_fields, and units on monitoring_observed', async () => {
    const app = makeApp();
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    const snap = JSON.parse(resp.result!.content[0]!.text) as {
      controller: { zones: Array<Record<string, unknown>> };
    };
    const zone = snap.controller.zones[0]!;
    const settings = zone.settings as Record<string, unknown>;
    expect(settings.master_valve_override).toBe(-1);
    expect(settings.zone_notes).toHaveLength(1);
    expect(settings._unreadable_fields).toContain('watering_mode');
    expect(settings._unreadable_fields).toContain('flow_monitoring_method');
    expect(settings.monitoring_observed).toMatchObject({
      operating_ranges: {
        water_flow_rate: { value: 1.2, unit: 'gpm' },
        electric_current: { value: 380, unit: 'mA' },
      },
    });
  });

  it('inlines StandardProgram detail per program', async () => {
    const app = makeApp();
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    const snap = JSON.parse(resp.result!.content[0]!.text) as {
      controller: { programs: Array<Record<string, unknown>> };
    };
    const program = snap.controller.programs[0]!;
    expect(program.id).toBe(6390589);
    expect(program.name).toBe('Lawn');
    expect(program.program_type).toBe('Standard');
    expect(program.start_times).toEqual(['22:00']);
    expect(program.days_run).toHaveLength(7);
    expect(program.periodicity).toMatchObject({ period: 2 });
    expect(program.per_zone_run_times).toHaveLength(1);
  });

  it('throws snapshot integrity error (api_error kind) when getStandardProgram returns null for a Standard program in the list', async () => {
    const app = makeApp({
      // list_programs claims this is a Standard program, but getStandardProgram returns null —
      // an upstream contract violation that should surface as api_error (not internal_error,
      // which would suggest our bug).
      getStandardProgram: async () => null,
    });
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result?.content[0]?.text).toMatch(/^api_error: Snapshot integrity violation/);
  });

  it('program_type discriminator is consistent between thin entries and inlined details', async () => {
    // Two programs returned by list_programs: one Standard, one Advanced. Both should
    // be inlined (Standard via getStandardProgram, Advanced via getAdvancedProgram), and
    // both should report program_type using the same vocabulary ("Standard" | "Advanced")
    // so a restore tool can key off the field uniformly without having to recognise raw
    // __typename suffixes.
    const fakeAdvancedProgram = {
      __typename: 'AdvancedProgram' as const,
      id: 6390999,
      name: 'Adv',
      appliesToZones: [{ id: 100, number: { value: 1 }, name: 'Test Zone' }],
      schedulingMethod: { value: 3, label: 'Smart' },
      monthlyWateringAdjustments: Array(12).fill(100),
      zoneSpecific: false,
      advancedProgramId: 99999,
      scope: 'CUSTOMER' as const,
      conditionalWateringAdjustments: [],
      wateringFrequency: {
        label: 'Daily',
        description: 'Run every day',
        period: { value: 1, label: 'day' },
      },
      runTimeGroup: { id: 12345, name: 'Default', duration: 15 },
    };
    const app = makeApp({
      getPrograms: async () => [
        { id: 6390589, name: 'Lawn', program_type: 'Standard', scheduling_method: 3, applies_to_zone_ids: [100] },
        { id: 6390999, name: 'Adv',  program_type: 'Advanced', scheduling_method: 3, applies_to_zone_ids: [100] },
      ],
      getAdvancedProgram: async () => fakeAdvancedProgram,
    });
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    const snap = JSON.parse(resp.result!.content[0]!.text) as {
      controller: { programs: Array<Record<string, unknown>> };
    };
    const types = snap.controller.programs.map((p) => p.program_type);
    expect(types).toContain('Standard');
    expect(types).toContain('Advanced');
    // No raw __typename leaks
    expect(types.some((t) => typeof t === 'string' && t.endsWith('Program'))).toBe(false);
  });

  it('watering_triggers values include unit fields', async () => {
    const app = makeApp();
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    const snap = JSON.parse(resp.result!.content[0]!.text) as {
      controller: { watering_triggers: Record<string, unknown> };
    };
    const wt = snap.controller.watering_triggers;
    expect(wt.extend_water_temperature).toEqual({ value: 96.99998, unit: 'F' });
    expect(wt.suspend_water_temperature).toEqual({ value: 50, unit: 'F' });
    expect(wt.suspend_wind).toEqual({ value: 25, unit: 'mph' });
    expect(wt.suspend_water_rain).toEqual({ value: 0.2, unit: 'in' });
  });

  it('controller.sensors[] is captured and per-zone sensors[] are denormalised cross-references', async () => {
    const fakeRainSensor = {
      id: 5001,
      name: 'Front yard rain',
      model: {
        id: 12,
        name: 'Rain Sensor (normally closed wire)',
        modeType: 'STOP' as const,
        mode: 'STOP' as const,
        active: true,
        offLevel: null,
        offTimer: null,
        delay: 0,
        divisor: null,
        flowRate: null,
        customerId: null,
        sensorType: 'LEVEL_CLOSED' as const,
        type: { value: 1, label: 'Hunter Clik' },
        category: { id: 1, name: 'Hunter Clik' },
      },
      input: { number: 1, label: 'SEN-1' },
      // fakeZone in this file is id: 100 — the sensor guards that zone, so we expect a cross-ref.
      zones: [{ id: 100, name: 'Front Lawn' }],
    };
    const app = makeApp({ getControllerSensors: async () => [fakeRainSensor] });
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    expect(resp.result?.isError).toBeFalsy();
    const snap = JSON.parse(resp.result!.content[0]!.text) as {
      controller: {
        sensors: Array<Record<string, unknown>>;
        zones: Array<{ id: number; sensors: Array<{ id: number; name: string }> }>;
      };
    };
    // Controller-level sensors[] is the canonical source — full writable shape + _observed block.
    expect(snap.controller.sensors).toHaveLength(1);
    expect(snap.controller.sensors[0]).toMatchObject({
      id: 5001,
      name: 'Front yard rain',
      model_id: 12,
      input_number: 1,
      zone_ids: [100],
    });
    expect((snap.controller.sensors[0] as { _observed: { sensor_type: string } })._observed.sensor_type).toBe('LEVEL_CLOSED');
    // Per-zone sensors[] is the denormalised cross-ref ({id, name} only) — derived from
    // controller-level sensors, not a separate fetch.
    const zoneEntry = snap.controller.zones.find((z) => z.id === 100);
    expect(zoneEntry?.sensors).toEqual([{ id: 5001, name: 'Front yard rain' }]);
  });

  it('controller.sensors is empty array when controller has no sensors (default fake fixture)', async () => {
    const app = makeApp(); // default fake returns no sensors
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    const snap = JSON.parse(resp.result!.content[0]!.text) as {
      controller: { sensors: unknown[]; zones: Array<{ sensors: unknown[] }> };
    };
    expect(snap.controller.sensors).toEqual([]);
    // Per-zone sensors[] also empty — no controller-level sensor to denormalise from.
    for (const z of snap.controller.zones) {
      expect(z.sensors).toEqual([]);
    }
  });

  it('ADVANCED-mode snapshot populates controller.advanced_programs[] and per-zone advanced_program reference', async () => {
    const fakeAdvancedProgram = {
      __typename: 'AdvancedProgram' as const,
      id: 6390999,
      name: 'Lawn Smart',
      appliesToZones: [{ id: 100, number: { value: 1 }, name: 'Test Zone' }],
      schedulingMethod: { value: 3, label: 'Smart' },
      monthlyWateringAdjustments: Array(12).fill(100),
      zoneSpecific: false,
      advancedProgramId: 99999,
      scope: 'CUSTOMER' as const,
      conditionalWateringAdjustments: [],
      wateringFrequency: { label: 'Daily', description: 'Run every day', period: { value: 1, label: 'day' } },
      runTimeGroup: { id: 12345, name: 'Default 15min', duration: 15 },
    };
    // ADVANCED-mode zone: wateringSettings includes the advancedProgram reference (the
    // `... on AdvancedWateringSettings` fragment matches at the GraphQL layer).
    const advancedZoneFull = {
      ...fakeZoneFull,
      wateringSettings: {
        fixedWateringAdjustment: 100,
        cycleAndSoakSettings: null,
        advancedProgram: { id: 6390999, name: 'Lawn Smart', advancedProgramId: 99999 },
      },
    };
    const app = makeApp({
      getController: async () => ({ ...fakeController, programMode: 'ADVANCED' }),
      getZoneFull: async () => advancedZoneFull,
      getPrograms: async () => [
        { id: 6390999, name: 'Lawn Smart', program_type: 'Advanced', scheduling_method: 3, applies_to_zone_ids: [100] },
      ],
      getAdvancedProgram: async () => fakeAdvancedProgram,
    });
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    expect(resp.result?.isError).toBeFalsy();
    const snap = JSON.parse(resp.result!.content[0]!.text) as {
      controller: {
        program_mode: string;
        advanced_programs: Array<Record<string, unknown>>;
        zones: Array<{ id: number; settings: { advanced_program: Record<string, unknown> | null } }>;
      };
    };

    // Controller-level advanced_programs[] is the canonical source — full inlined detail.
    expect(snap.controller.program_mode).toBe('ADVANCED');
    expect(snap.controller.advanced_programs).toHaveLength(1);
    expect(snap.controller.advanced_programs[0]).toMatchObject({
      id: 6390999,
      name: 'Lawn Smart',
      program_type: 'Advanced',
      advanced_program_id: 99999,
      scope: 'CUSTOMER',
    });

    // Per-zone advanced_program is the denormalised cross-reference ({id, name,
    // advanced_program_id} only) — derived from zone.wateringSettings.advancedProgram,
    // which got populated by the AdvancedWateringSettings fragment.
    const zoneEntry = snap.controller.zones.find((z) => z.id === 100);
    expect(zoneEntry?.settings.advanced_program).toEqual({
      id: 6390999,
      name: 'Lawn Smart',
      advanced_program_id: 99999,
    });
  });

  it('STANDARD-mode snapshot leaves controller.advanced_programs empty and per-zone advanced_program null', async () => {
    // Default fake fixture is STANDARD-mode, no Advanced programs in getPrograms.
    const app = makeApp();
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    const snap = JSON.parse(resp.result!.content[0]!.text) as {
      controller: {
        advanced_programs: unknown[];
        zones: Array<{ settings: { advanced_program: unknown } }>;
      };
    };
    expect(snap.controller.advanced_programs).toEqual([]);
    for (const z of snap.controller.zones) {
      // Per-zone advanced_program is `null` (not omitted) — convention matches sensors.
      expect(z.settings.advanced_program).toBeNull();
    }
  });

  it('degrades gracefully when controller notes are subscription-gated (returns [] not error)', async () => {
    const app = makeApp({
      getControllerNotes: async () => {
        throw new HydrawiseAPIError('Feature is not available under your subscription.');
      },
    });
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    expect(resp.result?.isError).toBeFalsy();
    const snap = JSON.parse(resp.result!.content[0]!.text) as {
      controller: { controller_notes: unknown[] };
    };
    expect(snap.controller.controller_notes).toEqual([]);
  });

  it('propagates non-subscription HydrawiseAPIError from getControllerNotes', async () => {
    const app = makeApp({
      getControllerNotes: async () => {
        throw new HydrawiseAPIError('Internal server error');
      },
    });
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    expect(resp.result?.isError).toBe(true);
  });

  it('degrades gracefully when zone notes are subscription-gated (returns [] not error)', async () => {
    const app = makeApp({
      getZoneNotes: async () => {
        throw new HydrawiseAPIError('Feature is not available under your subscription.');
      },
    });
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    expect(resp.result?.isError).toBeFalsy();
    const snap = JSON.parse(resp.result!.content[0]!.text) as {
      controller: { zones: Array<{ settings: { zone_notes: unknown[] } }> };
    };
    for (const zone of snap.controller.zones) {
      expect(zone.settings.zone_notes).toEqual([]);
    }
  });

  it('propagates non-subscription HydrawiseAPIError from getZoneNotes', async () => {
    const app = makeApp({
      getZoneNotes: async () => {
        throw new HydrawiseAPIError('Internal server error');
      },
    });
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    expect(resp.result?.isError).toBe(true);
  });

  // Task 5.3: hibernated controller snapshot includes hibernation caveat in _caveats
  it('includes hibernation caveat in _caveats when controller is hibernated', async () => {
    const app = makeApp({
      getController: async () => ({
        ...fakeController,
        settings: { ...fakeController.settings!, hibernateStatus: true },
        status: { online: false, summary: 'Sleeping', icon: 'moon.png', accumulatedWaterSavings: 100 },
      }),
    });
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    expect(resp.result?.isError).toBeFalsy();
    const snap = JSON.parse(resp.result!.content[0]!.text) as { _caveats: string[] };
    expect(snap._caveats.some((c) => c.includes('hibernated'))).toBe(true);
  });

  // Task 5.4: non-hibernated controller snapshot does NOT include hibernation caveat
  it('does NOT include hibernation caveat in _caveats when controller is not hibernated', async () => {
    const app = makeApp();
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    expect(resp.result?.isError).toBeFalsy();
    const snap = JSON.parse(resp.result!.content[0]!.text) as { _caveats: string[] };
    expect(snap._caveats.some((c) => c.includes('hibernated'))).toBe(false);
  });
});
