import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Config } from '../../src/config.js';
import { HydrawiseApi } from '../../src/hydrawise/api.js';
import type { HydrawiseClient, Variables } from '../../src/hydrawise/client.js';
import type { StatusCodeAndSummary } from '../../src/hydrawise/queries.js';
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

function makeApp(apiOverrides: Partial<HydrawiseApi> = {}) {
  const api = Object.assign(new HydrawiseApi(fakeClient()), apiOverrides);
  return buildApp(makeConfig(), () => buildMcpServer(api), createLogger('error'));
}

const INITIALIZE_BODY = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'vitest', version: '0' },
  },
};

async function callTool(
  app: ReturnType<typeof makeApp>,
  toolName: string,
  toolArgs: Record<string, unknown>,
) {
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
    .send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: toolName, arguments: toolArgs },
    });

  const body = res.text
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => JSON.parse(l.slice('data:'.length).trim()));
  return body.find((b: { id?: number }) => b.id === 2) as {
    result?: { content: { text: string }[]; isError?: boolean };
  };
}

describe('preview/apply contract', () => {
  it('preview=true returns the planned variables and does NOT call the API', async () => {
    let called = false;
    const app = makeApp({
      updateSeasonalAdjustments: async () => {
        called = true;
        return true;
      },
    });
    const resp = await callTool(app, 'update_seasonal_adjustments', {
      controller_id: 7,
      monthly_adjustment_percents: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      preview: true,
    });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(false);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      preview: boolean;
      operation: string;
      variables: { controller_id: number; monthly_adjustment_percents: number[] };
    };
    expect(payload.preview).toBe(true);
    expect(payload.operation).toBe('updateSeasonalAdjustments');
    expect(payload.variables.controller_id).toBe(7);
    expect(payload.variables.monthly_adjustment_percents).toHaveLength(12);
  });

  it('preview=false invokes the API and reports the result', async () => {
    let called = false;
    const app = makeApp({
      updateSeasonalAdjustments: async () => {
        called = true;
        return true;
      },
    });
    const resp = await callTool(app, 'update_seasonal_adjustments', {
      controller_id: 7,
      monthly_adjustment_percents: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      preview: false,
    });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(true);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      preview: boolean;
      operation: string;
      result: unknown;
    };
    expect(payload.preview).toBe(false);
    expect(payload.operation).toBe('updateSeasonalAdjustments');
    expect(payload.result).toBe(true);
  });

  it('omitted preview defaults to apply (preview=false)', async () => {
    let called = false;
    const app = makeApp({
      updateSeasonalAdjustments: async () => {
        called = true;
        return true;
      },
    });
    await callTool(app, 'update_seasonal_adjustments', {
      controller_id: 7,
      monthly_adjustment_percents: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
    });
    expect(called).toBe(true);
  });

  it('watering-program preview routes via the subtype-specific operation name', async () => {
    let called = false;
    const app = makeApp({
      createWateringProgram: async () => {
        called = true;
        return { id: 1, name: 'mock' };
      },
    });
    const resp = await callTool(app, 'create_watering_program', {
      program_type: 'Smart',
      watering_program_name: 'morning',
      watering_program_type: null,
      controller_id: 99,
      schedule_adjustment_ids: [],
      seasonal_adjustment_percents: null,
      smart_watering_run_time: 600,
      smart_watering_frequency_value: 3,
      preview: true,
    });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(false);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      preview: boolean;
      operation: string;
    };
    expect(payload.operation).toBe('createSmartWateringProgram');
  });

  it('update_location resolves device_id server-side from controller_id (preview)', async () => {
    let called = false;
    const app = makeApp({
      // The tool now looks up device_id from getController(controller_id) — never accepts it as input.
      getController: async () => ({
        id: 317416,
        deviceId: 5,
        name: 'Test',
        online: true,
        softwareVersion: null,
        programMode: 'STANDARD' as const,
        hardware: null,
        lastContactTime: null,
        location: null,
        settings: null,
        masterZone: null,
        expanders: null,
        runTimeGroups: [],
        controllerNotes: [],
      }),
      updateLocation: async () => {
        called = true;
        return { id: 1, coordinates: null, address: '...', country: null, state: null, locality: null };
      },
    });
    const resp = await callTool(app, 'update_location', {
      controller_id: 317416,
      address: '1 Tufts Ln',
      latitude: 39.6,
      longitude: -104.9,
      preview: true,
    });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(false);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      preview: boolean;
      operation: string;
      variables: { controller_id: number; device_id: number; address: string; latitude: number; longitude: number };
    };
    expect(payload.operation).toBe('updateLocation');
    expect(payload.variables.controller_id).toBe(317416);
    expect(payload.variables.device_id).toBe(5); // server-resolved, not passed in by caller
    expect(payload.variables.address).toBe('1 Tufts Ln');
    expect(payload.variables.latitude).toBe(39.6);
    expect(payload.variables.longitude).toBe(-104.9);
  });

  it('update_location with no fields returns config_error', async () => {
    const app = makeApp();
    const resp = await callTool(app, 'update_location', {
      controller_id: 317416,
      preview: true,
    });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result?.content[0]?.text).toMatch(/config_error/);
  });

  it('update_controller_program_mode preview shows the planned mode', async () => {
    let called = false;
    const app = makeApp({
      updateControllerProgramMode: async () => {
        called = true;
        return { id: 317416, programMode: 'ADVANCED' };
      },
    });
    const resp = await callTool(app, 'update_controller_program_mode', {
      controller_id: 317416,
      program_mode: 'ADVANCED',
      preview: true,
    });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(false);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      operation: string;
      variables: { controller_id: number; program_mode: string };
    };
    expect(payload.operation).toBe('updateControllerProgramMode');
    expect(payload.variables.program_mode).toBe('ADVANCED');
  });

  it('create_zone_note preview shows the planned note', async () => {
    let called = false;
    const app = makeApp({
      createZoneNote: async () => {
        called = true;
        return {
          id: 1,
          note: 'cracked head',
          type: 'fault',
          pinnedToTop: false,
          lastUpdatedAt: null,
        };
      },
    });
    const resp = await callTool(app, 'create_zone_note', {
      zone_id: 2062869,
      note: 'cracked head',
      type: 'fault',
      preview: true,
    });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(false);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      operation: string;
      variables: { zone_id: number; note: string; type: string };
    };
    expect(payload.operation).toBe('createZoneNote');
    expect(payload.variables.zone_id).toBe(2062869);
    expect(payload.variables.note).toBe('cracked head');
    expect(payload.variables.type).toBe('fault');
  });

  it('create_zone preview shows the full payload', async () => {
    let called = false;
    const app = makeApp({
      createZoneAdvanced: async () => {
        called = true;
        return { id: 9999, name: 'New Zone', number: { value: 25 } };
      },
    });
    const resp = await callTool(app, 'create_zone', {
      controller_id: 317416,
      name: 'New Zone',
      number: 25,
      watering_mode: 1,
      global_master_valve: 1,
      schedule_adjustment_ids: [],
      watering_adjustment_percent: 100,
      watering_type: 1,
      watering_frequency_mode: 1,
      preview: true,
    });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(false);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      operation: string;
      variables: { controller_id: number; name: string; number: number };
    };
    expect(payload.operation).toBe('createZoneAdvanced');
    expect(payload.variables.name).toBe('New Zone');
    expect(payload.variables.number).toBe(25);
  });

  it('delete_zone preview shows just the zone_id', async () => {
    let called = false;
    const app = makeApp({
      deleteZone: async () => {
        called = true;
        return true as const;
      },
    });
    const resp = await callTool(app, 'delete_zone', { zone_id: 9999, preview: true });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(false);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      operation: string;
      variables: { zone_id: number };
    };
    expect(payload.operation).toBe('deleteZone');
    expect(payload.variables.zone_id).toBe(9999);
  });

  // -------------------------------------------------------------------------
  // Sensor tool preview/apply
  // -------------------------------------------------------------------------

  const fakeCreatedSensor = {
    id: 5001,
    name: 'Rain',
    model: { id: 12, name: 'Rain Sensor', modeType: 'STOP' as const, mode: 'STOP' as const, active: true, offLevel: null, offTimer: null, delay: 0, divisor: null, flowRate: null, customerId: null, sensorType: 'LEVEL_CLOSED' as const, type: { value: 1, label: 'Hunter Clik' }, category: { id: 1, name: 'Hunter Clik' } },
    input: { number: 1, label: 'SEN-1' },
    zones: [{ id: 100, name: 'Front Lawn' }],
  };

  it('create_sensor preview returns planned variables and does NOT call the API', async () => {
    let called = false;
    const app = makeApp({
      createSensor: async () => {
        called = true;
        return fakeCreatedSensor;
      },
    });
    const resp = await callTool(app, 'create_sensor', {
      controller_id: 317416,
      name: 'Rain',
      model_id: 12,
      input_number: 1,
      zone_ids: [100, 101],
      preview: true,
    });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(false);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      preview: boolean;
      operation: string;
      variables: { controller_id: number; name: string; model_id: number; zone_ids: number[] };
    };
    expect(payload.preview).toBe(true);
    expect(payload.operation).toBe('createSensor');
    expect(payload.variables).toEqual({
      controller_id: 317416,
      name: 'Rain',
      model_id: 12,
      input_number: 1,
      zone_ids: [100, 101],
    });
  });

  it('create_sensor preview=false invokes the API and returns the serialized sensor', async () => {
    let called = false;
    const app = makeApp({
      createSensor: async () => {
        called = true;
        return fakeCreatedSensor;
      },
    });
    const resp = await callTool(app, 'create_sensor', {
      controller_id: 317416,
      name: 'Rain',
      model_id: 12,
      input_number: 1,
      zone_ids: [100],
      preview: false,
    });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(true);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      preview: boolean;
      result: { id: number; name: string; model_id: number; zone_ids: number[] };
    };
    expect(payload.preview).toBe(false);
    expect(payload.result.id).toBe(5001);
    expect(payload.result.model_id).toBe(12);
    expect(payload.result.zone_ids).toEqual([100]);
  });

  // -------------------------------------------------------------------------
  // get_program(Advanced) integration — Phase 3 (add-advanced-mode-support)
  // -------------------------------------------------------------------------
  // The previewApply test file is the closest existing integration harness for tool
  // dispatch. get_program is a read-only tool (no preview/apply), but the same callTool
  // helper works.

  const fakeAdvancedProgram = {
    __typename: 'AdvancedProgram' as const,
    id: 6390999,
    name: 'Lawn Smart',
    appliesToZones: [{ id: 100, number: { value: 1 }, name: 'Front Lawn' }],
    schedulingMethod: { value: 3, label: 'Smart' },
    monthlyWateringAdjustments: Array(12).fill(100),
    zoneSpecific: false,
    advancedProgramId: 99999,
    scope: 'CUSTOMER' as const,
    conditionalWateringAdjustments: [],
    wateringFrequency: { label: 'Daily', description: 'Run every day', period: { value: 1, label: 'day' } },
    runTimeGroup: { id: 12345, name: 'Default 15min', duration: 15 },
  };

  it('get_program with program_type: Advanced returns serialized AdvancedProgram detail', async () => {
    const app = makeApp({ getAdvancedProgram: async () => fakeAdvancedProgram });
    const resp = await callTool(app, 'get_program', {
      controller_id: 317416,
      program_id: 6390999,
      program_type: 'Advanced',
    });
    expect(resp.result?.isError).toBeFalsy();
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      id: number;
      program_type: string;
      advanced_program_id: number;
      scope: string;
      watering_frequency: { label: string; period_value: number; period_label: string };
      run_time_group: { duration_minutes: number };
    };
    expect(payload.id).toBe(6390999);
    expect(payload.program_type).toBe('Advanced');
    expect(payload.advanced_program_id).toBe(99999);
    expect(payload.scope).toBe('CUSTOMER');
    expect(payload.watering_frequency.label).toBe('Daily');
    expect(payload.watering_frequency.period_value).toBe(1);
    expect(payload.run_time_group.duration_minutes).toBe(15);
  });

  it('get_program with program_type: Advanced returns config_error when the id is not Advanced', async () => {
    const app = makeApp({ getAdvancedProgram: async () => null });
    const resp = await callTool(app, 'get_program', {
      controller_id: 317416,
      program_id: 6390999,
      program_type: 'Advanced',
    });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result?.content[0]?.text).toMatch(/^config_error:.*Advanced program 6390999 not found/);
  });

  // -------------------------------------------------------------------------
  // update_zone_standard: icon is required upstream
  // -------------------------------------------------------------------------

  it('update_zone_standard preview succeeds when icon is supplied (typical no-icon-change call)', async () => {
    let called = false;
    const app = makeApp({
      updateZoneStandard: async () => {
        called = true;
        return { id: 2063156 };
      },
    });
    // Typical call: updating cycle/soak, passing current icon from get_zone_settings.
    const resp = await callTool(app, 'update_zone_standard', {
      zone_id: 2063156,
      name: '21. Patio Hill',
      number: 21,
      icon: 10,
      global_master_valve: -1,
      watering_adjustment_percent: 100,
      cycle_soak_enable: true,
      cycle_custom_time_minutes: 6,
      soak_custom_time_minutes: 50,
      preview: true,
    });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(false);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      preview: boolean;
      operation: string;
      variables: { zone_id: number; icon: number; cycle_soak_enable: boolean };
    };
    expect(payload.preview).toBe(true);
    expect(payload.operation).toBe('updateZoneStandard');
    expect(payload.variables.zone_id).toBe(2063156);
    expect(payload.variables.icon).toBe(10);
    expect(payload.variables.cycle_soak_enable).toBe(true);
  });

  it('update_zone_standard rejects when icon is omitted (Zod enforces required)', async () => {
    const app = makeApp();
    const resp = await callTool(app, 'update_zone_standard', {
      zone_id: 2063156,
      name: '21. Patio Hill',
      number: 21,
      global_master_valve: -1,
      watering_adjustment_percent: 100,
      cycle_soak_enable: true,
      // icon intentionally omitted — upstream would return "Missing icon"
    });
    expect(resp.result?.isError).toBe(true);
  });
});
