import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Config } from '../../src/config.js';
import { HydrawiseAPIError } from '../../src/errors.js';
import { HydrawiseApi } from '../../src/hydrawise/api.js';
import type { HydrawiseClient, Variables } from '../../src/hydrawise/client.js';
import type { RunEventType, RunSummaryDetails, ScheduledZoneRun, StatusCodeAndSummary } from '../../src/hydrawise/queries.js';
import { createLogger } from '../../src/logger.js';
import { buildApp, buildMcpServer } from '../../src/server.js';

function fakeClient(): HydrawiseClient {
  return {
    async query<TResult>(_document: string, _variables?: Variables): Promise<TResult> {
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

const fakeRun: ScheduledZoneRun = {
  id: 'run-1',
  startTime: { value: '2026-05-01T08:33:00.000Z' },
  endTime: { value: '2026-05-01T08:35:00.000Z' },
  normalDuration: 2,
  duration: 2,
  remainingTime: 0,
  status: { value: 2, label: 'Completed' },
};

const fakeRunEvent: RunEventType = {
  id: 'evt-1',
  zone: { id: 10, name: 'Front Lawn' },
  standardProgram: { id: 5, name: 'Morning Run' },
  normalStartTime: { value: '2026-05-01T08:33:00.000Z' },
  scheduledStartTime: { value: '2026-05-01T08:33:00.000Z' },
  reportedStartTime: { value: '2026-05-01T08:33:05.000Z' },
  normalEndTime: { value: '2026-05-01T08:35:00.000Z' },
  scheduledEndTime: { value: '2026-05-01T08:35:00.000Z' },
  reportedEndTime: { value: '2026-05-01T08:35:10.000Z' },
  normalDuration: 120,
  scheduledDuration: 120,
  reportedDuration: 125,
  scheduledStatus: { value: 2, label: 'Completed' },
  reportedStatus: { value: 2, label: 'Completed' },
  reportedWaterUsage: { value: 1.5, unit: 'gal' },
  reportedStopReason: { finishedNormally: true, description: ['Normal stop'] },
  reportedCurrent: { value: 420, unit: 'mA' },
};

const fakeSummary: RunSummaryDetails = {
  totalNormalRunTime: 20,
  totalActualRunTime: 18,
  totalWaterVolume: { value: 3.2, unit: 'gal' },
};

function makeApiWith(overrides: Partial<HydrawiseApi>): HydrawiseApi {
  const api = new HydrawiseApi(fakeClient());
  return Object.assign(api, overrides);
}

function makeApp(apiOverrides: Partial<HydrawiseApi> = {}) {
  const api = makeApiWith(apiOverrides);
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
    error?: unknown;
  };
}

describe('get_watering_report integration', () => {
  it('serializes run events correctly', async () => {
    const app = makeApp({
      getWateringReport: async () => [fakeRunEvent],
    });
    const resp = await callTool(app, 'get_watering_report', {
      controller_id: 1,
      from: '2026-05-01',
      until: '2026-05-09',
    });
    expect(resp.result?.isError).toBeFalsy();
    const events = JSON.parse(resp.result!.content[0]!.text);
    expect(events).toHaveLength(1);
    expect(events[0].zone_id).toBe(10);
    expect(events[0].zone_name).toBe('Front Lawn');
    expect(events[0].reported_duration_seconds).toBe(125);
  });

  it('returns api_error with the upstream message when api throws HydrawiseAPIError', async () => {
    const app = makeApp({
      getWateringReport: async () => {
        throw new HydrawiseAPIError('upstream failure');
      },
    });
    const resp = await callTool(app, 'get_watering_report', {
      controller_id: 1,
      from: '2026-05-01',
      until: '2026-05-09',
    });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result?.content[0]?.text).toMatch(/^api_error: upstream failure/);
  });

  it('returns config_error for an invalid date string', async () => {
    const app = makeApp({ getWateringReport: async () => [] });
    const resp = await callTool(app, 'get_watering_report', {
      controller_id: 1,
      from: 'not-a-date',
      until: '2026-05-09',
    });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result?.content[0]?.text).toMatch(/^config_error: not a valid date string/);
  });
});

describe('get_zone_run_history integration', () => {
  it('returns last_run and runs array', async () => {
    const app = makeApp({
      getZonePastRuns: async () => ({ lastRun: fakeRun, runs: [fakeRun] }),
    });
    const resp = await callTool(app, 'get_zone_run_history', { zone_id: 10 });
    expect(resp.result?.isError).toBeFalsy();
    const data = JSON.parse(resp.result!.content[0]!.text);
    expect(data.last_run).not.toBeNull();
    expect(data.last_run.id).toBe('run-1');
    expect(data.runs).toHaveLength(1);
  });

  it('returns null last_run and empty runs when zone has no history', async () => {
    const app = makeApp({
      getZonePastRuns: async () => ({ lastRun: null, runs: null }),
    });
    const resp = await callTool(app, 'get_zone_run_history', { zone_id: 10 });
    expect(resp.result?.isError).toBeFalsy();
    const data = JSON.parse(resp.result!.content[0]!.text);
    expect(data.last_run).toBeNull();
    expect(data.runs).toHaveLength(0);
  });
});

describe('get_run_summary integration', () => {
  it('CURRENT_WEEK returns summary', async () => {
    const app = makeApp({
      getZoneRunSummary: async () => fakeSummary,
    });
    const resp = await callTool(app, 'get_run_summary', {
      zone_id: 10,
      period: 'CURRENT_WEEK',
    });
    expect(resp.result?.isError).toBeFalsy();
    const data = JSON.parse(resp.result!.content[0]!.text);
    expect(data.total_normal_run_time_minutes).toBe(20);
    expect(data.total_actual_run_time_minutes).toBe(18);
    expect(data.total_water_volume).toEqual({ value: 3.2, unit: 'gal' });
  });

  it('WEEK with missing args returns config_error', async () => {
    const app = makeApp({ getZoneRunSummary: async () => null });
    const resp = await callTool(app, 'get_run_summary', {
      zone_id: 10,
      period: 'WEEK',
      // missing start_week, end_week, year
    });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result?.content[0]?.text).toMatch(/config_error/);
  });
});
