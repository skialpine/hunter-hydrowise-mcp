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

function makeConfig(): Config {
  return {
    username: 'alice',
    password: 'sekret',
    host: '127.0.0.1',
    port: 8765,
    allowedOrigins: null,
    authToken: null,
    sessionTtlSeconds: 60,
    logLevel: 'error',
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeProgram = {
  __typename: 'StandardProgram' as const,
  id: 8621589,
  name: 'Morning',
  appliesToZones: [
    { id: 100, number: { value: 1 }, name: 'Front Lawn' },
    { id: 101, number: { value: 2 }, name: 'Back Yard' },
  ],
  schedulingMethod: { value: 1, label: 'Fixed' },
  monthlyWateringAdjustments: Array(12).fill(100) as number[],
  startTimes: ['06:00'],
  ignoreRainSensor: false,
  daysRun: ['MONDAY', 'THURSDAY'],
  standardProgramDayPattern: 'dow',
  periodicity: null,
  timeRange: { validFrom: null, validTo: null },
  conditionalWateringAdjustments: [],
  applications: [
    {
      zone: { id: 100, number: { value: 1 } },
      runTimeGroup: { id: 201, name: 'Group A', duration: 20 },
    },
    {
      zone: { id: 101, number: { value: 2 } },
      runTimeGroup: { id: 202, name: 'Group B', duration: 15 },
    },
  ],
};

const fakeZone = {
  id: 100,
  name: 'Front Lawn',
  number: { value: 1 },
  icon: { id: 10, customImage: null },
  masterValve: -1,
  wateringSettings: {
    fixedWateringAdjustment: 100,
    cycleAndSoakSettings: null,
  },
  monitoringSettings: null,
  status: { suspendedUntil: null },
};

const fakeZoneWithCustomImage = {
  ...fakeZone,
  icon: { id: 890232, customImage: { id: 890232 } },
};

const fakeZoneWithCycleSoak = {
  ...fakeZone,
  wateringSettings: {
    fixedWateringAdjustment: 100,
    cycleAndSoakSettings: { cycleDuration: 5, soakDuration: 10 },
  },
};

const fakeControllerStandard = {
  id: 317416,
  deviceId: 5,
  name: 'Test Controller',
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
};

const fakeControllerAdvanced = {
  ...fakeControllerStandard,
  programMode: 'ADVANCED' as const,
};

// ---------------------------------------------------------------------------
// update_zone_run_time_in_program
// ---------------------------------------------------------------------------

describe('update_zone_run_time_in_program', () => {
  it('changes only the target zone run time and dispatches update (preview: false)', async () => {
    let capturedPayload: unknown;
    const app = makeApp({
      getStandardProgram: async () => fakeProgram,
      updateStandardProgram: async (p) => {
        capturedPayload = p;
        return { id: fakeProgram.id, name: fakeProgram.name };
      },
    });
    const resp = await callTool(app, 'update_zone_run_time_in_program', {
      controller_id: 317416,
      program_id: 8621589,
      zone_id: 100,
      run_duration_minutes: 30,
    });
    expect(resp.result?.isError).toBeFalsy();
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      before: { run_duration_minutes: number };
      after: { run_duration_minutes: number };
      preview: boolean;
    };
    expect(payload.preview).toBe(false);
    expect(payload.before.run_duration_minutes).toBe(20);
    expect(payload.after.run_duration_minutes).toBe(30);

    // Only the target zone's run_duration should change; zone 101 must remain 15.
    const mutated = capturedPayload as {
      zone_run_times: { run_duration: number }[];
    };
    expect(mutated.zone_run_times[0]!.run_duration).toBe(30);
    expect(mutated.zone_run_times[1]!.run_duration).toBe(15);
  });

  it('preview: true returns planned_call and does NOT dispatch', async () => {
    let called = false;
    const app = makeApp({
      getStandardProgram: async () => fakeProgram,
      updateStandardProgram: async () => {
        called = true;
        return { id: fakeProgram.id, name: fakeProgram.name };
      },
    });
    const resp = await callTool(app, 'update_zone_run_time_in_program', {
      controller_id: 317416,
      program_id: 8621589,
      zone_id: 100,
      run_duration_minutes: 30,
      preview: true,
    });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(false);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      preview: boolean;
      planned_call: { tool: string; variables: { program_id: number } };
    };
    expect(payload.preview).toBe(true);
    expect(payload.planned_call.tool).toBe('update_standard_program');
    expect(payload.planned_call.variables.program_id).toBe(8621589);
  });

  it('returns config_error when zone is not in the program', async () => {
    const app = makeApp({
      getStandardProgram: async () => fakeProgram,
    });
    const resp = await callTool(app, 'update_zone_run_time_in_program', {
      controller_id: 317416,
      program_id: 8621589,
      zone_id: 9999,
      run_duration_minutes: 30,
    });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result!.content[0]!.text).toMatch(/config_error/);
    expect(resp.result!.content[0]!.text).toMatch(/9999/);
  });

  it('returns config_error when program is not found', async () => {
    const app = makeApp({
      getStandardProgram: async () => null,
    });
    const resp = await callTool(app, 'update_zone_run_time_in_program', {
      controller_id: 317416,
      program_id: 9999,
      zone_id: 100,
      run_duration_minutes: 30,
    });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result!.content[0]!.text).toMatch(/config_error/);
  });
});

// ---------------------------------------------------------------------------
// update_program_day_pattern
// ---------------------------------------------------------------------------

describe('update_program_day_pattern', () => {
  it('changes day pattern and dispatches update (preview: false)', async () => {
    let capturedPayload: unknown;
    const app = makeApp({
      getStandardProgram: async () => fakeProgram,
      updateStandardProgram: async (p) => {
        capturedPayload = p;
        return { id: fakeProgram.id, name: fakeProgram.name };
      },
    });
    const resp = await callTool(app, 'update_program_day_pattern', {
      controller_id: 317416,
      program_id: 8621589,
      standard_program_day_pattern: 'dow',
      day_pattern: '0010010',
    });
    expect(resp.result?.isError).toBeFalsy();
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      before: { standard_program_day_pattern: string; day_pattern: string | null };
      after: { standard_program_day_pattern: string; day_pattern: string };
      preview: boolean;
    };
    expect(payload.preview).toBe(false);
    expect(payload.before.standard_program_day_pattern).toBe('dow');
    // daysRun: ['MONDAY', 'THURSDAY'] → positions 1,4 → bitmap: 0100100
    expect(payload.before.day_pattern).toBe('0100100');
    expect(payload.after.standard_program_day_pattern).toBe('dow');
    expect(payload.after.day_pattern).toBe('0010010');

    const mutated = capturedPayload as {
      standard_program_day_pattern: string;
      day_pattern: string;
    };
    expect(mutated.standard_program_day_pattern).toBe('dow');
    expect(mutated.day_pattern).toBe('0010010');
  });

  it('preview: true returns planned_call and does NOT dispatch', async () => {
    let called = false;
    const app = makeApp({
      getStandardProgram: async () => fakeProgram,
      updateStandardProgram: async () => {
        called = true;
        return { id: fakeProgram.id, name: fakeProgram.name };
      },
    });
    const resp = await callTool(app, 'update_program_day_pattern', {
      controller_id: 317416,
      program_id: 8621589,
      standard_program_day_pattern: 'even',
      day_pattern: '1111111',
      preview: true,
    });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(false);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      preview: boolean;
      planned_call: { tool: string };
    };
    expect(payload.preview).toBe(true);
    expect(payload.planned_call.tool).toBe('update_standard_program');
  });

  it('returns config_error when interval mode is used without interval_days', async () => {
    const app = makeApp({
      getStandardProgram: async () => fakeProgram,
    });
    const resp = await callTool(app, 'update_program_day_pattern', {
      controller_id: 317416,
      program_id: 8621589,
      standard_program_day_pattern: 'interval',
      day_pattern: '1111111',
      // interval_days intentionally omitted
    });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result!.content[0]!.text).toMatch(/config_error/);
    expect(resp.result!.content[0]!.text).toMatch(/interval_days/);
  });
});

// ---------------------------------------------------------------------------
// update_program_start_times
// ---------------------------------------------------------------------------

describe('update_program_start_times', () => {
  it('replaces start times and dispatches update (preview: false)', async () => {
    let capturedPayload: unknown;
    const app = makeApp({
      getStandardProgram: async () => fakeProgram,
      updateStandardProgram: async (p) => {
        capturedPayload = p;
        return { id: fakeProgram.id, name: fakeProgram.name };
      },
    });
    const resp = await callTool(app, 'update_program_start_times', {
      controller_id: 317416,
      program_id: 8621589,
      start_times: ['07:00', '18:00'],
    });
    expect(resp.result?.isError).toBeFalsy();
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      before: { start_times: string[] };
      after: { start_times: string[] };
      preview: boolean;
    };
    expect(payload.preview).toBe(false);
    expect(payload.before.start_times).toEqual(['06:00']);
    expect(payload.after.start_times).toEqual(['07:00', '18:00']);

    const mutated = capturedPayload as { start_times: string[] };
    expect(mutated.start_times).toEqual(['07:00', '18:00']);
  });

  it('preview: true returns planned_call and does NOT dispatch', async () => {
    let called = false;
    const app = makeApp({
      getStandardProgram: async () => fakeProgram,
      updateStandardProgram: async () => {
        called = true;
        return { id: fakeProgram.id, name: fakeProgram.name };
      },
    });
    const resp = await callTool(app, 'update_program_start_times', {
      controller_id: 317416,
      program_id: 8621589,
      start_times: ['07:00'],
      preview: true,
    });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(false);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      preview: boolean;
      planned_call: { tool: string; variables: { start_times: string[] } };
    };
    expect(payload.preview).toBe(true);
    expect(payload.planned_call.tool).toBe('update_standard_program');
    expect(payload.planned_call.variables.start_times).toEqual(['07:00']);
  });
});

// ---------------------------------------------------------------------------
// update_zone_cycle_soak
// ---------------------------------------------------------------------------

describe('update_zone_cycle_soak', () => {
  it('enables cycle/soak on STANDARD-mode zone and dispatches (preview: false)', async () => {
    let capturedPayload: unknown;
    const app = makeApp({
      getZoneFull: async () => fakeZone,
      getController: async () => fakeControllerStandard,
      updateZoneStandard: async (p) => {
        capturedPayload = p;
        return { id: fakeZone.id };
      },
    });
    const resp = await callTool(app, 'update_zone_cycle_soak', {
      controller_id: 317416,
      zone_id: 100,
      cycle_soak_enable: true,
      cycle_custom_time_minutes: 5,
      soak_custom_time_minutes: 10,
    });
    expect(resp.result?.isError).toBeFalsy();
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      before: { cycle_soak_enable: boolean };
      after: { cycle_soak_enable: boolean; cycle_custom_time_minutes: number; soak_custom_time_minutes: number };
      preview: boolean;
    };
    expect(payload.preview).toBe(false);
    expect(payload.before.cycle_soak_enable).toBe(false);
    expect(payload.after.cycle_soak_enable).toBe(true);
    expect(payload.after.cycle_custom_time_minutes).toBe(5);
    expect(payload.after.soak_custom_time_minutes).toBe(10);

    const mutated = capturedPayload as { icon: number; cycle_soak_enable: boolean };
    expect(mutated.icon).toBe(10); // icon threaded through from zone read
    expect(mutated.cycle_soak_enable).toBe(true);
  });

  it('disables cycle/soak and preserves existing durations from read result', async () => {
    let capturedPayload: unknown;
    const app = makeApp({
      getZoneFull: async () => fakeZoneWithCycleSoak,
      getController: async () => fakeControllerStandard,
      updateZoneStandard: async (p) => {
        capturedPayload = p;
        return { id: fakeZone.id };
      },
    });
    const resp = await callTool(app, 'update_zone_cycle_soak', {
      controller_id: 317416,
      zone_id: 100,
      cycle_soak_enable: false,
      // cycle_custom_time_minutes and soak_custom_time_minutes omitted — should be preserved
    });
    expect(resp.result?.isError).toBeFalsy();
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      before: { cycle_soak_enable: boolean; cycle_custom_time_minutes: number | null };
      after: { cycle_soak_enable: boolean; cycle_custom_time_minutes: number | null; soak_custom_time_minutes: number | null };
    };
    expect(payload.before.cycle_soak_enable).toBe(true);
    expect(payload.before.cycle_custom_time_minutes).toBe(5);
    expect(payload.after.cycle_soak_enable).toBe(false);
    expect(payload.after.cycle_custom_time_minutes).toBe(5); // preserved from read
    expect(payload.after.soak_custom_time_minutes).toBe(10); // preserved from read

    const mutated = capturedPayload as { cycle_soak_enable: boolean };
    expect(mutated.cycle_soak_enable).toBe(false);
  });

  it('preview: true returns planned_call and does NOT dispatch', async () => {
    let called = false;
    const app = makeApp({
      getZoneFull: async () => fakeZone,
      getController: async () => fakeControllerStandard,
      updateZoneStandard: async () => {
        called = true;
        return { id: fakeZone.id };
      },
    });
    const resp = await callTool(app, 'update_zone_cycle_soak', {
      controller_id: 317416,
      zone_id: 100,
      cycle_soak_enable: true,
      cycle_custom_time_minutes: 3,
      soak_custom_time_minutes: 7,
      preview: true,
    });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(false);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      preview: boolean;
      planned_call: { tool: string; variables: { icon: number } };
    };
    expect(payload.preview).toBe(true);
    expect(payload.planned_call.tool).toBe('update_zone_standard');
    expect(payload.planned_call.variables.icon).toBe(10);
  });

  it('routes icon_file_id (not icon) for zones with custom uploaded images', async () => {
    let capturedPayload: unknown;
    const app = makeApp({
      getZoneFull: async () => fakeZoneWithCustomImage,
      getController: async () => fakeControllerStandard,
      updateZoneStandard: async (p) => {
        capturedPayload = p;
        return { id: fakeZone.id };
      },
    });
    const resp = await callTool(app, 'update_zone_cycle_soak', {
      controller_id: 317416,
      zone_id: 100,
      cycle_soak_enable: true,
      cycle_custom_time_minutes: 3,
      soak_custom_time_minutes: 7,
    });
    expect(resp.result?.isError).toBeFalsy();
    const mutated = capturedPayload as { icon: number | null; icon_file_id: number | null };
    expect(mutated.icon).toBeNull();
    expect(mutated.icon_file_id).toBe(890232);
  });

  it('returns config_error for ADVANCED-mode controller', async () => {
    const app = makeApp({
      getZoneFull: async () => fakeZone,
      getController: async () => fakeControllerAdvanced,
    });
    const resp = await callTool(app, 'update_zone_cycle_soak', {
      controller_id: 317416,
      zone_id: 100,
      cycle_soak_enable: true,
    });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result!.content[0]!.text).toMatch(/config_error/);
    expect(resp.result!.content[0]!.text).toMatch(/ADVANCED/);
  });

  it('returns config_error when zone has no icon', async () => {
    const zoneNoIcon = { ...fakeZone, icon: null };
    const app = makeApp({
      getZoneFull: async () => zoneNoIcon,
      getController: async () => fakeControllerStandard,
    });
    const resp = await callTool(app, 'update_zone_cycle_soak', {
      controller_id: 317416,
      zone_id: 100,
      cycle_soak_enable: true,
    });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result!.content[0]!.text).toMatch(/config_error/);
    expect(resp.result!.content[0]!.text).toMatch(/icon/);
  });
});

// ---------------------------------------------------------------------------
// update_zone_watering_adjustment
// ---------------------------------------------------------------------------

describe('update_zone_watering_adjustment', () => {
  it('changes watering adjustment on STANDARD-mode zone and dispatches (preview: false)', async () => {
    let capturedPayload: unknown;
    const app = makeApp({
      getZoneFull: async () => fakeZone,
      getController: async () => fakeControllerStandard,
      updateZoneStandard: async (p) => {
        capturedPayload = p;
        return { id: fakeZone.id };
      },
    });
    const resp = await callTool(app, 'update_zone_watering_adjustment', {
      controller_id: 317416,
      zone_id: 100,
      watering_adjustment_percent: 75,
    });
    expect(resp.result?.isError).toBeFalsy();
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      before: { watering_adjustment_percent: number | null };
      after: { watering_adjustment_percent: number };
      preview: boolean;
    };
    expect(payload.preview).toBe(false);
    expect(payload.before.watering_adjustment_percent).toBe(100);
    expect(payload.after.watering_adjustment_percent).toBe(75);

    const mutated = capturedPayload as { watering_adjustment_percent: number; icon: number };
    expect(mutated.watering_adjustment_percent).toBe(75);
    expect(mutated.icon).toBe(10);
  });

  it('preview: true returns planned_call and does NOT dispatch', async () => {
    let called = false;
    const app = makeApp({
      getZoneFull: async () => fakeZone,
      getController: async () => fakeControllerStandard,
      updateZoneStandard: async () => {
        called = true;
        return { id: fakeZone.id };
      },
    });
    const resp = await callTool(app, 'update_zone_watering_adjustment', {
      controller_id: 317416,
      zone_id: 100,
      watering_adjustment_percent: 75,
      preview: true,
    });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(false);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      preview: boolean;
      planned_call: { tool: string; variables: { watering_adjustment_percent: number } };
    };
    expect(payload.preview).toBe(true);
    expect(payload.planned_call.tool).toBe('update_zone_standard');
    expect(payload.planned_call.variables.watering_adjustment_percent).toBe(75);
  });

  it('rejects out-of-range percent (> 200) with a validation error', async () => {
    const app = makeApp();
    const resp = await callTool(app, 'update_zone_watering_adjustment', {
      controller_id: 317416,
      zone_id: 100,
      watering_adjustment_percent: 250,
    });
    expect(resp.result?.isError).toBe(true);
  });

  it('routes icon_file_id (not icon) for zones with custom uploaded images', async () => {
    let capturedPayload: unknown;
    const app = makeApp({
      getZoneFull: async () => fakeZoneWithCustomImage,
      getController: async () => fakeControllerStandard,
      updateZoneStandard: async (p) => {
        capturedPayload = p;
        return { id: fakeZone.id };
      },
    });
    const resp = await callTool(app, 'update_zone_watering_adjustment', {
      controller_id: 317416,
      zone_id: 100,
      watering_adjustment_percent: 75,
    });
    expect(resp.result?.isError).toBeFalsy();
    const mutated = capturedPayload as { icon: number | null; icon_file_id: number | null };
    expect(mutated.icon).toBeNull();
    expect(mutated.icon_file_id).toBe(890232);
  });

  it('returns config_error for ADVANCED-mode controller', async () => {
    const app = makeApp({
      getZoneFull: async () => fakeZone,
      getController: async () => fakeControllerAdvanced,
    });
    const resp = await callTool(app, 'update_zone_watering_adjustment', {
      controller_id: 317416,
      zone_id: 100,
      watering_adjustment_percent: 75,
    });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result!.content[0]!.text).toMatch(/config_error/);
    expect(resp.result!.content[0]!.text).toMatch(/ADVANCED/);
  });
});
