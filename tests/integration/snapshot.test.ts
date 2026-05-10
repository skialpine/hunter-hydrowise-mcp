import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Config } from '../../src/config.js';
import { HydrawiseApi } from '../../src/hydrawise/api.js';
import type { HydrawiseClient, Variables } from '../../src/hydrawise/client.js';
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
    timeZone: { name: 'America/Denver', offset: -25200 },
    zones: { interZoneDelay: 0, masterZone: null },
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
  controllerNotes: [
    {
      id: 5,
      note: 'Winterized 2025-10-01',
      type: 'repair',
      pinnedToTop: false,
      lastUpdatedAt: { value: '2025-10-01T08:00:00Z' },
    },
  ],
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
  zoneNotes: [
    {
      id: 99,
      note: 'cracked head fixed 2025-08',
      type: 'repair',
      pinnedToTop: false,
      lastUpdatedAt: { value: '2025-08-12T10:00:00Z' },
    },
  ],
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
    getProgramStartTimesForZone: async () => [],
    getSeasonalAdjustments: async () => [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
    getWateringTriggers: async () => fakeWateringTriggers,
    ...apiOverrides,
  });
  return buildApp(makeConfig(), () => buildMcpServer(api), createLogger('error'));
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

describe('dump_controller_snapshot v2', () => {
  it('returns snapshot_version 2', async () => {
    const app = makeApp();
    const resp = await callTool(app, 'dump_controller_snapshot', { controller_id: 317416 });
    expect(resp.result?.isError).toBeFalsy();
    const snap = JSON.parse(resp.result!.content[0]!.text) as { snapshot_version: number };
    expect(snap.snapshot_version).toBe(2);
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
    expect(snap.controller.master_valve).toEqual({ zone_number: 0, delay: 0, post_timer: 0 });
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
    // Two programs returned by list_programs: one Standard (will be inlined), one Advanced (stays thin).
    // Both should report program_type using the same vocabulary ("Standard" | "Advanced") so a restore
    // tool can key off the field uniformly without having to recognize __typename suffixes.
    const app = makeApp({
      getPrograms: async () => [
        { id: 6390589, name: 'Lawn', program_type: 'Standard', scheduling_method: 3, applies_to_zone_ids: [100] },
        { id: 6390999, name: 'Adv',  program_type: 'Advanced', scheduling_method: 3, applies_to_zone_ids: [100] },
      ],
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
});
