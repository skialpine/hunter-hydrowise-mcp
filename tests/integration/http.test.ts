import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Config } from '../../src/config.js';
import { HydrawiseApi } from '../../src/hydrawise/api.js';
import type { HydrawiseClient, Variables } from '../../src/hydrawise/client.js';
import type { StatusCodeAndSummary } from '../../src/hydrawise/queries.js';
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

function makeApp(cfg: Config = makeConfig()) {
  const api = new HydrawiseApi(fakeClient());
  return buildApp(cfg, () => buildMcpServer(api), createLogger('error'));
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

const TOOLS_LIST_BODY = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };

async function initialize(app: ReturnType<typeof makeApp>, headers: Record<string, string> = {}) {
  return request(app)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(INITIALIZE_BODY);
}

function parseInitResponse(body: string): { sessionId: string | undefined; payload: unknown } {
  // Streamable HTTP returns SSE by default for an initialize response.
  // The first `data:` line carries the JSON-RPC response.
  const dataLine = body
    .split('\n')
    .find((l) => l.startsWith('data:'))
    ?.slice('data:'.length)
    .trim();
  return {
    sessionId: undefined,
    payload: dataLine ? JSON.parse(dataLine) : null,
  };
}

describe('streamable HTTP transport', () => {
  afterEach(() => {
    // Vitest will tear down between tests; nothing to clean explicitly.
  });

  it('initializes a session and returns MCP-Session-Id', async () => {
    const app = makeApp();
    const res = await initialize(app);
    expect(res.status).toBe(200);
    const sessionId = res.headers['mcp-session-id'];
    expect(typeof sessionId).toBe('string');
    expect(sessionId.length).toBeGreaterThan(0);
    const { payload } = parseInitResponse(res.text);
    expect((payload as { result?: { protocolVersion?: string } } | null)?.result?.protocolVersion)
      .toBe('2025-11-25');
  });

  it('lists every expected tool on tools/list', async () => {
    const app = makeApp();
    const init = await initialize(app);
    const sessionId = init.headers['mcp-session-id'];

    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('mcp-session-id', sessionId)
      .send(TOOLS_LIST_BODY);

    expect(res.status).toBe(200);
    const body = res.text
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => JSON.parse(l.slice('data:'.length).trim()));
    const toolsResp = body.find((b) => b.id === 2) as { result: { tools: { name: string }[] } };
    const names = toolsResp.result.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        // v1 status
        'get_user',
        'list_controllers',
        'get_controller',
        'list_zones',
        'get_zone',
        // v1 control
        'start_zone',
        'stop_zone',
        'start_all_zones',
        'stop_all_zones',
        'suspend_zone',
        'resume_zone',
        'suspend_all_zones',
        'resume_all_zones',
        // schedule reads
        'get_zone_settings',
        'list_programs',
        'get_program',
        'list_program_start_times_for_zone',
        'get_seasonal_adjustments',
        'get_watering_triggers',
        // schedule writes
        'update_zone_settings',
        'set_zone_baseline',
        'update_seasonal_adjustments',
        'update_watering_triggers',
        'create_program_start_time',
        'update_program_start_time',
        'delete_program_start_time',
        'create_standard_program',
        'update_standard_program',
        'delete_standard_program',
        'create_watering_program',
        'update_watering_program',
        'delete_watering_program',
        // backup
        'dump_controller_snapshot',
      ].sort(),
    );
  });

  it('returns 404 for an unknown MCP-Session-Id', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('mcp-session-id', 'no-such-session')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    expect(res.status).toBe(404);
  });

  it('rejects evil Origin with 403 + JSON-RPC error body', async () => {
    const app = makeApp();
    const res = await initialize(app, { Origin: 'https://evil.example.com' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ jsonrpc: '2.0', id: null });
    expect(res.body.error).toBeDefined();
  });

  it('allows a loopback Origin', async () => {
    const app = makeApp();
    const res = await initialize(app, { Origin: 'http://127.0.0.1:8765' });
    expect(res.status).toBe(200);
  });

  it('rejects a Host header that does not match the bound interface', async () => {
    const app = makeApp(makeConfig({ host: '127.0.0.1', port: 8765 }));
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('Host', 'evil.example.com')
      .send(INITIALIZE_BODY);
    expect(res.status).toBe(403);
  });

  it('every write tool description begins with PHYSICAL ACTION:', async () => {
    const app = makeApp();
    const init = await initialize(app);
    const sessionId = init.headers['mcp-session-id'];
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('mcp-session-id', sessionId)
      .send({ jsonrpc: '2.0', id: 9, method: 'tools/list', params: {} });
    const body = res.text
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => JSON.parse(l.slice('data:'.length).trim()));
    const toolsResp = body.find((b) => b.id === 9) as {
      result: { tools: { name: string; description?: string }[] };
    };
    const writeTools = toolsResp.result.tools.filter(
      (t) =>
        t.name.startsWith('update_') ||
        t.name.startsWith('create_') ||
        (t.name.startsWith('delete_') && t.name !== 'delete_program_start_time') ||
        t.name === 'delete_program_start_time' ||
        t.name === 'delete_standard_program' ||
        t.name === 'delete_watering_program' ||
        t.name.startsWith('start_') ||
        t.name.startsWith('stop_') ||
        t.name.startsWith('suspend_') ||
        t.name.startsWith('resume_'),
    );
    expect(writeTools.length).toBeGreaterThan(0);
    for (const tool of writeTools) {
      expect(tool.description ?? '').toMatch(/^PHYSICAL ACTION:/);
    }
  });

  it('terminates a session on DELETE', async () => {
    const app = makeApp();
    const init = await initialize(app);
    const sessionId = init.headers['mcp-session-id'];

    const del = await request(app)
      .delete('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('mcp-session-id', sessionId);
    expect([200, 204]).toContain(del.status);

    const after = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('mcp-session-id', sessionId)
      .send({ jsonrpc: '2.0', id: 99, method: 'tools/list', params: {} });
    expect(after.status).toBe(404);
  });

  it('enforces bearer auth when configured', async () => {
    const cfg = makeConfig({ authToken: 'sekret' });
    const app = makeApp(cfg);

    const noAuth = await initialize(app);
    expect(noAuth.status).toBe(401);

    const wrongAuth = await initialize(app, { Authorization: 'Bearer wrong' });
    expect(wrongAuth.status).toBe(401);

    const goodAuth = await initialize(app, { Authorization: 'Bearer sekret' });
    expect(goodAuth.status).toBe(200);
  });
});
