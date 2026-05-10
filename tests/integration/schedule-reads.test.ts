import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Config } from '../../src/config.js';
import { HydrawiseAPIError, HydrawiseNotFoundError } from '../../src/errors.js';
import { HydrawiseApi } from '../../src/hydrawise/api.js';
import type { HydrawiseClient, Variables } from '../../src/hydrawise/client.js';
import type { ScheduledZoneRun, StatusCodeAndSummary } from '../../src/hydrawise/queries.js';
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

const futureRun: ScheduledZoneRun = {
  id: 'sched-1',
  startTime: { value: '2026-05-10T08:00:00.000Z' },
  endTime: { value: '2026-05-10T08:15:00.000Z' },
  normalDuration: 15,
  duration: 15,
  remainingTime: 79333,
  status: { value: 1, label: 'Scheduled' },
};

// ---------------------------------------------------------------------------
// get_zone_scheduled_runs
// ---------------------------------------------------------------------------

describe('get_zone_scheduled_runs integration', () => {
  const validWindow = { zone_id: 10, from_epoch_seconds: 1000, until_epoch_seconds: 90000 };

  it('returns serialized runs when zone has upcoming runs', async () => {
    const app = makeApp({ getZoneRunsBetween: async () => [futureRun] });
    const resp = await callTool(app, 'get_zone_scheduled_runs', validWindow);
    expect(resp.result?.isError).toBeFalsy();
    const runs = JSON.parse(resp.result!.content[0]!.text);
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe('sched-1');
    expect(runs[0].normal_duration_minutes).toBe(15);
    expect(runs[0].scheduled_duration_minutes).toBe(15);
    expect(runs[0].remaining_time_seconds).toBe(79333);
    expect(runs[0].status).toBe('Scheduled');
  });

  it('returns empty array when zone has no upcoming runs', async () => {
    const app = makeApp({ getZoneRunsBetween: async () => [] });
    const resp = await callTool(app, 'get_zone_scheduled_runs', validWindow);
    expect(resp.result?.isError).toBeFalsy();
    const runs = JSON.parse(resp.result!.content[0]!.text);
    expect(runs).toEqual([]);
  });

  it('returns not_found when zone does not exist', async () => {
    const app = makeApp({
      getZoneRunsBetween: async () => {
        throw new HydrawiseNotFoundError('zone 10 not found');
      },
    });
    const resp = await callTool(app, 'get_zone_scheduled_runs', validWindow);
    expect(resp.result?.isError).toBe(true);
    expect(resp.result?.content[0]?.text).toMatch(/^not_found:/);
  });

  it('returns config_error when from >= until', async () => {
    const app = makeApp({ getZoneRunsBetween: async () => [] });
    const resp = await callTool(app, 'get_zone_scheduled_runs', {
      zone_id: 10,
      from_epoch_seconds: 5000,
      until_epoch_seconds: 5000,
    });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result?.content[0]?.text).toMatch(/^config_error:/);
  });

  it('returns config_error when only until_epoch_seconds provided and is in the past', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const app = makeApp({ getZoneRunsBetween: async () => [] });
    const resp = await callTool(app, 'get_zone_scheduled_runs', {
      zone_id: 10,
      until_epoch_seconds: past,
    });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result?.content[0]?.text).toMatch(/^config_error:/);
  });
});

// ---------------------------------------------------------------------------
// get_zone_next_run
// ---------------------------------------------------------------------------

describe('get_zone_next_run integration', () => {
  it('returns serialized run when zone has a next run', async () => {
    const app = makeApp({ getZoneNextRun: async () => futureRun });
    const resp = await callTool(app, 'get_zone_next_run', { zone_id: 10 });
    expect(resp.result?.isError).toBeFalsy();
    const run = JSON.parse(resp.result!.content[0]!.text);
    expect(run.id).toBe('sched-1');
    expect(run.scheduled_duration_minutes).toBe(15);
    expect(run.remaining_time_seconds).toBe(79333);
  });

  it('returns null when zone has no next run', async () => {
    const app = makeApp({ getZoneNextRun: async () => null });
    const resp = await callTool(app, 'get_zone_next_run', { zone_id: 10 });
    expect(resp.result?.isError).toBeFalsy();
    const run = JSON.parse(resp.result!.content[0]!.text);
    expect(run).toBeNull();
  });

  it('returns not_found when zone does not exist', async () => {
    const app = makeApp({
      getZoneNextRun: async () => {
        throw new HydrawiseNotFoundError('zone 10 not found');
      },
    });
    const resp = await callTool(app, 'get_zone_next_run', { zone_id: 10 });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result?.content[0]?.text).toMatch(/^not_found:/);
  });

  it('returns null (not crash) when scheduledRuns.nextRun is null (zone exists, no upcoming run)', async () => {
    const app = makeApp({ getZoneNextRun: async () => null });
    const resp = await callTool(app, 'get_zone_next_run', { zone_id: 10 });
    expect(resp.result?.isError).toBeFalsy();
    expect(JSON.parse(resp.result!.content[0]!.text)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// get_controller_schedule
// ---------------------------------------------------------------------------

describe('get_controller_schedule integration', () => {
  const validWindow = {
    controller_id: 1,
    from_epoch_seconds: 1000,
    until_epoch_seconds: 90000,
  };

  const zones = [
    { zoneId: 10, zoneName: 'Front Lawn', zoneNumber: 1, runs: [futureRun] },
    { zoneId: 11, zoneName: 'Back Yard', zoneNumber: 2, runs: [] },
  ];

  it('returns array with all zones including zones with no runs', async () => {
    const app = makeApp({ getControllerSchedule: async () => zones });
    const resp = await callTool(app, 'get_controller_schedule', validWindow);
    expect(resp.result?.isError).toBeFalsy();
    const result = JSON.parse(resp.result!.content[0]!.text);
    expect(result).toHaveLength(2);

    const front = result.find((z: { zone_id: number }) => z.zone_id === 10);
    expect(front.zone_name).toBe('Front Lawn');
    expect(front.zone_number).toBe(1);
    expect(front.runs).toHaveLength(1);
    expect(front.runs[0].id).toBe('sched-1');

    const back = result.find((z: { zone_id: number }) => z.zone_id === 11);
    expect(back.zone_name).toBe('Back Yard');
    expect(back.runs).toEqual([]);
  });

  it('returns not_found when controller does not exist', async () => {
    const app = makeApp({
      getControllerSchedule: async () => {
        throw new HydrawiseNotFoundError('controller 1 not found');
      },
    });
    const resp = await callTool(app, 'get_controller_schedule', validWindow);
    expect(resp.result?.isError).toBe(true);
    expect(resp.result?.content[0]?.text).toMatch(/^not_found:/);
  });

  it('returns api_error when the API throws (entire call fails, no partial result)', async () => {
    const app = makeApp({
      getControllerSchedule: async () => {
        throw new HydrawiseAPIError('upstream failure');
      },
    });
    const resp = await callTool(app, 'get_controller_schedule', validWindow);
    expect(resp.result?.isError).toBe(true);
    expect(resp.result?.content[0]?.text).toMatch(/^api_error:/);
  });

  it('returns config_error when from >= until', async () => {
    const app = makeApp({ getControllerSchedule: async () => [] });
    const resp = await callTool(app, 'get_controller_schedule', {
      controller_id: 1,
      from_epoch_seconds: 5000,
      until_epoch_seconds: 5000,
    });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result?.content[0]?.text).toMatch(/^config_error:/);
  });

  it('returns config_error when only until_epoch_seconds provided and is in the past', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const app = makeApp({ getControllerSchedule: async () => [] });
    const resp = await callTool(app, 'get_controller_schedule', {
      controller_id: 1,
      until_epoch_seconds: past,
    });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result?.content[0]?.text).toMatch(/^config_error:/);
  });
});
