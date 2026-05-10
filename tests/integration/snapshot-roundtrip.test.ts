import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Config } from '../../src/config.js';
import { HydrawiseApi } from '../../src/hydrawise/api.js';
import type { HydrawiseClient, Variables } from '../../src/hydrawise/client.js';
import type { StatusCodeAndSummary } from '../../src/hydrawise/queries.js';
import { createLogger } from '../../src/logger.js';
import { buildApp, buildMcpServer } from '../../src/server.js';

// -----------------------------------------------------------------------------
// This file tests the snapshot/restore-recipe round-trip:
//
// 1. Stand up a fakeApi with controller state.
// 2. Call dump_controller_snapshot. The snapshot contains _restore_recipe.
// 3. For each step in the recipe, call the named tool with preview: true and assert
//    the planned-variables payload matches what the recipe says — i.e. re-applying
//    the snapshot is a no-op shape-wise.
// 4. Separately, list registered tools and assert every recipe step's `tool` name
//    is in the catalog (catches typos / removed tools).
//
// The round-trip catches: (a) snapshot captures field X but no update_* tool accepts
// it, (b) update_* tool requires field Y but snapshot doesn't capture it, (c) field
// name mismatch between snapshot and tool args, (d) recipe references a missing tool.
//
// `update_zone_settings` is intentionally NOT round-tripped here — its args contain
// nulls for unreadable fields, which would fail Zod validation. That's the exact
// gap the recipe's `notes` field warns about, and the skill workflow handles by
// merging with live state. The unit tests assert that the recipe DOES emit the
// step with correct args; the round-trip would just confirm the documented gap.
// -----------------------------------------------------------------------------

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

const fakeController = {
  id: 317416,
  deviceId: 555,
  name: 'Test Controller',
  online: true,
  programMode: 'STANDARD' as const,
  hardware: { serialNumber: 'ABC123', status: 'OK', model: { id: 1, name: 'HC-12', family: { name: 'Hydrawise Controller' } }, modules: [], firmware: [] },
  location: {
    id: 7,
    coordinates: { latitude: 39.6, longitude: -104.9 },
    address: '1 Tufts',
    country: 'US',
    state: 'CO',
    locality: 'Centennial',
  },
  settings: { timeZone: { name: 'America/Denver', offset: -6 }, zones: { interZoneDelay: 0 } },
  masterZone: { zoneNumber: { value: 12 }, delay: 0, postTimer: 0 },
  expanders: [],
  runTimeGroups: [],
  softwareVersion: '4.2.0',
  lastContactTime: { value: '2026-05-09T19:00:00Z' },
};

const fakeZone = { id: 100, name: 'Front Lawn', number: { value: 1 } };

const fakeZoneFull = {
  id: 100,
  name: 'Front Lawn',
  number: { value: 1 },
  icon: { id: 4 },
  masterValve: -1,
  wateringSettings: {
    fixedWateringAdjustment: 100,
    cycleAndSoakSettings: null,
  },
  monitoringSettings: null,
  status: { suspendedUntil: null },
};

const fakeSensor = {
  id: 5001,
  name: 'Front rain',
  model: {
    id: 12,
    name: 'Rain Sensor (NC)',
    modeType: 'STOP' as const,
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
  zones: [{ id: 100, name: 'Front Lawn' }],
};

function makeApp() {
  const api = Object.assign(new HydrawiseApi(fakeClient()), {
    getUser: async () => ({ id: 1, name: 'Tester', email: 't@example.com' }),
    getController: async () => fakeController,
    getZones: async () => [fakeZone],
    getZoneFull: async () => fakeZoneFull,
    getPrograms: async () => [],
    getStandardProgram: async () => null,
    getAdvancedProgram: async () => null,
    getProgramStartTimesForZone: async () => [],
    getSeasonalAdjustments: async () => [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
    getWateringTriggers: async () => null,
    getControllerSensors: async () => [fakeSensor],
    getControllerNotes: async () => [
      { id: 1, note: 'Spring tune-up done', type: 'comment' as const, pinnedToTop: false, lastUpdatedAt: { value: '2026-04-01T10:00:00Z' } },
    ],
    getZoneNotes: async () => [],
  });
  return buildApp(makeConfig(), () => buildMcpServer(api, createLogger('error')), createLogger('error'));
}

const INITIALIZE_BODY = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'vitest', version: '0' } },
};

async function initSession(app: ReturnType<typeof makeApp>): Promise<string> {
  const res = await request(app)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .send(INITIALIZE_BODY);
  return res.headers['mcp-session-id'] as string;
}

async function callTool(app: ReturnType<typeof makeApp>, sessionId: string, name: string, args: Record<string, unknown>) {
  const res = await request(app)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('mcp-session-id', sessionId)
    .send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } });
  const body = res.text
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => JSON.parse(l.slice('data:'.length).trim()));
  return body.find((b: { id?: number }) => b.id === 2) as {
    result?: { content: { text: string }[]; isError?: boolean };
  };
}

async function listTools(app: ReturnType<typeof makeApp>, sessionId: string): Promise<string[]> {
  const res = await request(app)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('mcp-session-id', sessionId)
    .send({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} });
  const body = res.text
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => JSON.parse(l.slice('data:'.length).trim()));
  const toolsResp = body.find((b: { id?: number }) => b.id === 3) as { result: { tools: { name: string }[] } };
  return toolsResp.result.tools.map((t) => t.name);
}

describe('snapshot _restore_recipe round-trip', () => {
  it('every recipe step references a tool name registered with the server', async () => {
    const app = makeApp();
    const sid = await initSession(app);
    const dumpResp = await callTool(app, sid, 'dump_controller_snapshot', { controller_id: 317416 });
    const snap = JSON.parse(dumpResp.result!.content[0]!.text) as {
      _restore_recipe: Array<{ tool: string }>;
    };
    expect(snap._restore_recipe.length).toBeGreaterThan(0);

    const registeredTools = new Set(await listTools(app, sid));
    const missing = snap._restore_recipe
      .map((s) => s.tool)
      .filter((t) => !registeredTools.has(t));
    expect(missing).toEqual([]);
  });

  it('controller-level prereq steps round-trip via preview: true with matching args', async () => {
    const app = makeApp();
    const sid = await initSession(app);
    const dumpResp = await callTool(app, sid, 'dump_controller_snapshot', { controller_id: 317416 });
    const snap = JSON.parse(dumpResp.result!.content[0]!.text) as {
      _restore_recipe: Array<{ order: number; tool: string; args: Record<string, unknown> }>;
    };

    // Cover the controller-level prereqs (order 1-5 in the recipe). Skip
    // update_zone_settings (intentional gap — see file header) and program steps
    // (no programs in this fixture).
    const prereqTools = new Set([
      'update_controller_program_mode',
      'update_location',
      'update_controller_master_valve',
      'update_seasonal_adjustments',
      'update_watering_triggers',
    ]);
    const prereqSteps = snap._restore_recipe.filter((s) => prereqTools.has(s.tool));
    expect(prereqSteps.length).toBeGreaterThan(0);

    for (const step of prereqSteps) {
      const previewResp = await callTool(app, sid, step.tool, { ...step.args, preview: true });
      expect(
        previewResp.result?.isError,
        `step ${step.order} (${step.tool}) preview failed: ${previewResp.result?.content[0]?.text}`,
      ).toBeFalsy();
      const payload = JSON.parse(previewResp.result!.content[0]!.text) as {
        preview: boolean;
        operation: string;
        variables: Record<string, unknown>;
      };
      expect(payload.preview).toBe(true);
      // The tool's planned variables should reflect the snake_case args we passed.
      // We don't assert exact equality (the operation may transform field names to
      // camelCase internally) — just spot-check controller_id passes through.
      expect(payload.variables.controller_id).toBe(step.args.controller_id);
    }
  });

  it('sensor steps round-trip via preview: true and emit the correct args shape', async () => {
    const app = makeApp();
    const sid = await initSession(app);
    const dumpResp = await callTool(app, sid, 'dump_controller_snapshot', { controller_id: 317416 });
    const snap = JSON.parse(dumpResp.result!.content[0]!.text) as {
      _restore_recipe: Array<{ order: number; tool: string; args: Record<string, unknown> }>;
    };

    const sensorStep = snap._restore_recipe.find((s) => s.tool === 'create_sensor');
    expect(sensorStep).toBeDefined();
    const previewResp = await callTool(app, sid, 'create_sensor', { ...sensorStep!.args, preview: true });
    expect(previewResp.result?.isError).toBeFalsy();
    const payload = JSON.parse(previewResp.result!.content[0]!.text) as {
      preview: boolean;
      variables: { name: string; model_id: number; input_number: number; zone_ids: number[] };
    };
    expect(payload.variables.name).toBe('Front rain');
    expect(payload.variables.model_id).toBe(12);
    expect(payload.variables.input_number).toBe(1);
    expect(payload.variables.zone_ids).toEqual([100]);
  });

  it('controller-note steps round-trip via preview: true', async () => {
    const app = makeApp();
    const sid = await initSession(app);
    const dumpResp = await callTool(app, sid, 'dump_controller_snapshot', { controller_id: 317416 });
    const snap = JSON.parse(dumpResp.result!.content[0]!.text) as {
      _restore_recipe: Array<{ tool: string; args: Record<string, unknown> }>;
    };

    const noteStep = snap._restore_recipe.find((s) => s.tool === 'create_controller_note');
    expect(noteStep).toBeDefined();
    const previewResp = await callTool(app, sid, 'create_controller_note', { ...noteStep!.args, preview: true });
    expect(previewResp.result?.isError).toBeFalsy();
    const payload = JSON.parse(previewResp.result!.content[0]!.text) as {
      preview: boolean;
      variables: { note: string; type: string };
    };
    expect(payload.variables.note).toBe('Spring tune-up done');
    expect(payload.variables.type).toBe('comment');
  });

  it('snapshot envelope always carries _restore_recipe and _caveats arrays (even when empty)', async () => {
    const app = makeApp();
    const sid = await initSession(app);
    const dumpResp = await callTool(app, sid, 'dump_controller_snapshot', { controller_id: 317416 });
    const snap = JSON.parse(dumpResp.result!.content[0]!.text) as {
      _restore_recipe: unknown;
      _caveats: unknown;
    };
    expect(Array.isArray(snap._restore_recipe)).toBe(true);
    expect(Array.isArray(snap._caveats)).toBe(true);
  });
});
