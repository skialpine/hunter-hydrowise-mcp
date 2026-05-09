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
      factors: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      preview: true,
    });
    expect(resp.result?.isError).toBeFalsy();
    expect(called).toBe(false);
    const payload = JSON.parse(resp.result!.content[0]!.text) as {
      preview: boolean;
      operation: string;
      variables: { controller_id: number; factors: number[] };
    };
    expect(payload.preview).toBe(true);
    expect(payload.operation).toBe('updateSeasonalAdjustments');
    expect(payload.variables.controller_id).toBe(7);
    expect(payload.variables.factors).toHaveLength(12);
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
      factors: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
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
      factors: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
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
      seasonal_adjustment: null,
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
});
