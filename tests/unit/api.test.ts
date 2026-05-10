import { describe, expect, it } from 'vitest';
import { HydrawiseMutationError, HydrawiseNotFoundError } from '../../src/errors.js';
import { HydrawiseApi } from '../../src/hydrawise/api.js';
import type { HydrawiseClient, Variables } from '../../src/hydrawise/client.js';
import type { StatusCodeAndSummary } from '../../src/hydrawise/queries.js';

function fakeClient() {
  const queryCalls: Array<{ document: string; variables?: Variables }> = [];
  const mutateCalls: Array<{ document: string; variables: Variables }> = [];

  let queryResult: unknown = null;
  let mutateResult: StatusCodeAndSummary = { status: 'OK', summary: '' };
  let mutateThrow: Error | null = null;

  const client: HydrawiseClient = {
    async query<TResult>(document: string, variables?: Variables): Promise<TResult> {
      queryCalls.push({ document, variables });
      return queryResult as TResult;
    },
    async mutate(
      document: string,
      variables: Variables,
      _extract: (data: Record<string, unknown>) => StatusCodeAndSummary,
    ): Promise<StatusCodeAndSummary> {
      mutateCalls.push({ document, variables });
      if (mutateThrow) throw mutateThrow;
      if (mutateResult.status !== 'OK' && mutateResult.status !== 'WARNING') {
        throw new HydrawiseMutationError(mutateResult.summary);
      }
      return mutateResult;
    },
    async mutateRaw<TResult>(
      _document: string,
      _variables: Variables,
      extract: (data: Record<string, unknown>) => TResult,
    ): Promise<TResult> {
      return extract({});
    },
  };

  return {
    client,
    queryCalls,
    mutateCalls,
    setQueryResult: (v: unknown) => {
      queryResult = v;
    },
    setMutateResult: (v: StatusCodeAndSummary) => {
      mutateResult = v;
    },
    setMutateThrow: (err: Error) => {
      mutateThrow = err;
    },
  };
}

describe('HydrawiseApi', () => {
  it('startZone converts minutes to seconds and sets stackRuns: true', async () => {
    const harness = fakeClient();
    const api = new HydrawiseApi(harness.client);
    await api.startZone(42, { durationSeconds: 600 });
    expect(harness.mutateCalls[0]?.variables).toEqual({
      zoneId: 42,
      markRunAsScheduled: false,
      stackRuns: true,
      customRunDuration: 600,
      learnCurrentFromNextRun: null,
      learnFlowFromNextRun: null,
    });
  });

  it('startZone forwards learn_flow_from_next_run when set', async () => {
    const harness = fakeClient();
    const api = new HydrawiseApi(harness.client);
    await api.startZone(42, { durationSeconds: 600, learnFlowFromNextRun: true });
    expect(harness.mutateCalls[0]?.variables).toMatchObject({
      learnFlowFromNextRun: true,
      learnCurrentFromNextRun: null,
    });
  });

  it('startZone sends customRunDuration: null when no duration given', async () => {
    const harness = fakeClient();
    const api = new HydrawiseApi(harness.client);
    await api.startZone(42);
    expect(harness.mutateCalls[0]?.variables).toMatchObject({ customRunDuration: null });
  });

  it('suspendZone serializes the until Date as ISO-8601', async () => {
    const harness = fakeClient();
    const api = new HydrawiseApi(harness.client);
    const target = new Date('2026-05-20T08:00:00Z');
    await api.suspendZone(42, target);
    expect(harness.mutateCalls[0]?.variables).toEqual({
      zoneId: 42,
      until: '2026-05-20T08:00:00.000Z',
    });
  });

  it('startAllZones sends customRunDuration when provided', async () => {
    const harness = fakeClient();
    const api = new HydrawiseApi(harness.client);
    await api.startAllZones(7, { durationSeconds: 300 });
    expect(harness.mutateCalls[0]?.variables).toMatchObject({
      controllerId: 7,
      customRunDuration: 300,
    });
  });

  it('propagates HydrawiseMutationError on non-OK status', async () => {
    const harness = fakeClient();
    harness.setMutateThrow(new HydrawiseMutationError('Zone is already running'));
    const api = new HydrawiseApi(harness.client);
    await expect(api.startZone(42)).rejects.toThrow(/Zone is already running/);
  });

  it('getZones throws HydrawiseNotFoundError when controller is null', async () => {
    const harness = fakeClient();
    harness.setQueryResult({ controller: null });
    const api = new HydrawiseApi(harness.client);
    await expect(api.getZones(7)).rejects.toThrow(HydrawiseNotFoundError);
  });

  it('getZones returns an empty array when controller exists but has no zones', async () => {
    const harness = fakeClient();
    harness.setQueryResult({ controller: { zones: null } });
    const api = new HydrawiseApi(harness.client);
    const result = await api.getZones(7);
    expect(result).toEqual([]);
  });

  it('setBaselineValues maps fields to camelCase', async () => {
    const harness = fakeClient();
    const api = new HydrawiseApi(harness.client);
    await api.setBaselineValues({
      zone_id: 42,
      flow_monitoring_method: 'MANUAL',
      current_monitoring_method: 'MANUAL',
      flow_monitoring_value: 1.5,
      current_monitoring_value: 402,
    });
    expect(harness.mutateCalls[0]?.variables).toEqual({
      zoneId: 42,
      flowMonitoringMethod: 'MANUAL',
      currentMonitoringMethod: 'MANUAL',
      flowMonitoringValue: 1.5,
      currentMonitoringValue: 402,
    });
  });
});

describe('HydrawiseApi — controller-config mutations', () => {
  function fakeRawClient() {
    const calls: Array<{ document: string; variables: Variables }> = [];
    let nextResult: Record<string, unknown> = {};
    const client: HydrawiseClient = {
      async query() {
        throw new Error('no queries expected');
      },
      async mutate() {
        throw new Error('no StatusCodeAndSummary mutations expected');
      },
      async mutateRaw<TResult>(
        document: string,
        variables: Variables,
        extract: (data: Record<string, unknown>) => TResult,
      ): Promise<TResult> {
        calls.push({ document, variables });
        return extract(nextResult);
      },
    };
    return { client, calls, setNextResult: (r: Record<string, unknown>) => { nextResult = r; } };
  }

  it('updateLocation dispatches updateLocation when only address is provided', async () => {
    const harness = fakeRawClient();
    harness.setNextResult({ updateLocation: { id: 1, address: '1 Tufts', country: 'US', state: 'CO', locality: 'Centennial', coordinates: null } });
    const api = new HydrawiseApi(harness.client);
    await api.updateLocation({ device_id: 5, address: '1 Tufts' });
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.document).toContain('updateLocation');
    expect(harness.calls[0]?.variables).toEqual({ deviceId: 5, address: '1 Tufts' });
  });

  it('updateLocation dispatches both mutations when address + coords are provided', async () => {
    const harness = fakeRawClient();
    harness.setNextResult({
      updateLocation: { id: 1, address: '1 Tufts', country: 'US', state: 'CO', locality: 'Centennial', coordinates: null },
      updateLocationCoordinates: { id: 1, address: '1 Tufts', coordinates: { latitude: 39.6, longitude: -104.9 } },
    });
    const api = new HydrawiseApi(harness.client);
    await api.updateLocation({ device_id: 5, address: '1 Tufts', latitude: 39.6, longitude: -104.9 });
    expect(harness.calls).toHaveLength(2);
    expect(harness.calls[0]?.document).toContain('updateLocation');
    expect(harness.calls[1]?.document).toContain('updateLocationCoordinates');
    expect(harness.calls[1]?.variables).toEqual({ deviceId: 5, latitude: 39.6, longitude: -104.9 });
  });

  it('updateControllerMasterValve maps controller_id + zone_number to camelCase', async () => {
    const harness = fakeRawClient();
    harness.setNextResult({ updateControllerMasterValve: { zoneNumber: { value: 12 }, delay: 0, postTimer: 0 } });
    const api = new HydrawiseApi(harness.client);
    await api.updateControllerMasterValve(317416, 12);
    expect(harness.calls[0]?.variables).toEqual({ controllerId: 317416, zoneNumber: 12 });
  });

  it('updateControllerProgramMode passes mode literal verbatim', async () => {
    const harness = fakeRawClient();
    harness.setNextResult({ updateControllerProgramMode: { id: 317416, programMode: 'ADVANCED' } });
    const api = new HydrawiseApi(harness.client);
    const out = await api.updateControllerProgramMode(317416, 'ADVANCED');
    expect(harness.calls[0]?.variables).toEqual({ controllerId: 317416, programMode: 'ADVANCED' });
    expect(out.programMode).toBe('ADVANCED');
  });

  it('hibernateController throws when upstream returns non-true', async () => {
    const harness = fakeRawClient();
    harness.setNextResult({ hibernateController: false });
    const api = new HydrawiseApi(harness.client);
    await expect(api.hibernateController(317416)).rejects.toThrow(/hibernateController returned false/);
  });

  it('createExpander returns the new {id, name, number}', async () => {
    const harness = fakeRawClient();
    harness.setNextResult({ createExpander: { id: 99, name: 'Expander A', number: 2 } });
    const api = new HydrawiseApi(harness.client);
    const out = await api.createExpander({ controller_id: 317416, name: 'Expander A', number: 2 });
    expect(out).toEqual({ id: 99, name: 'Expander A', number: 2 });
  });

  it('createZoneAdvanced maps the full payload', async () => {
    const harness = fakeRawClient();
    harness.setNextResult({ createZoneAdvanced: { id: 9999, name: 'New Zone', number: { value: 25 } } });
    const api = new HydrawiseApi(harness.client);
    await api.createZoneAdvanced({
      controller_id: 317416,
      icon: null,
      name: 'New Zone',
      number: 25,
      watering_mode: 1,
      global_master_valve: 1,
      schedule_adjustment_ids: [],
      watering_adjustment: 100,
      watering_type: 1,
      run_time: null,
      watering_frequency_mode: 1,
      fixed_watering_frequency: null,
      smart_watering_frequency: null,
      virtual_solar_sync_watering_frequency: null,
      run_next_available_start_time: null,
      pre_configured_watering_schedule_id: null,
      cycle_soak_enable: null,
      cycle_custom_time: null,
      soak_custom_time: null,
      factors: null,
      sensor_ids: null,
      reusable_schedule: null,
      reusable_schedule_name: null,
      flow_monitoring_method: null,
      current_monitoring_method: null,
      flow_monitoring_value: null,
      current_monitoring_value: null,
    });
    expect(harness.calls[0]?.variables).toMatchObject({
      controllerId: 317416,
      name: 'New Zone',
      number: 25,
      wateringAdjustment: 100,
    });
  });

  it('deleteZone throws on non-true result', async () => {
    const harness = fakeRawClient();
    harness.setNextResult({ deleteZone: null });
    const api = new HydrawiseApi(harness.client);
    await expect(api.deleteZone(9999)).rejects.toThrow(/deleteZone returned/);
  });

  it('createZoneNote dispatches with note + type + pinnedToTop default false', async () => {
    const harness = fakeRawClient();
    harness.setNextResult({ createZoneNote: { id: 7, note: 'cracked head', type: 'fault', pinnedToTop: false, lastUpdatedAt: { value: '2026-05-09T12:00:00Z' } } });
    const api = new HydrawiseApi(harness.client);
    await api.createZoneNote(2062869, { note: 'cracked head', type: 'fault' });
    expect(harness.calls[0]?.variables).toEqual({
      zoneId: 2062869,
      note: 'cracked head',
      type: 'fault',
      pinnedToTop: false,
    });
  });

  it('createZoneNote throws when API returns an unknown note `type` value', async () => {
    const harness = fakeRawClient();
    // upstream returns a type the schema's NoteType enum doesn't include
    harness.setNextResult({ createZoneNote: { id: 7, note: 'x', type: 'warning', pinnedToTop: false, lastUpdatedAt: null } });
    const api = new HydrawiseApi(harness.client);
    await expect(api.createZoneNote(2062869, { note: 'x', type: 'fault' }))
      .rejects.toThrow(/unexpected note type/);
  });

  it('createZoneNote throws when API returns malformed lastUpdatedAt', async () => {
    const harness = fakeRawClient();
    harness.setNextResult({ createZoneNote: { id: 7, note: 'x', type: 'fault', pinnedToTop: false, lastUpdatedAt: { value: 12345 } } });
    const api = new HydrawiseApi(harness.client);
    await expect(api.createZoneNote(2062869, { note: 'x', type: 'fault' }))
      .rejects.toThrow(/unexpected lastUpdatedAt shape/);
  });

  it('createZoneNote normalizes undefined lastUpdatedAt to null (no type lie)', async () => {
    const harness = fakeRawClient();
    // Upstream omits lastUpdatedAt entirely (vs. setting it to null) — the helper should normalize.
    harness.setNextResult({ createZoneNote: { id: 7, note: 'x', type: 'fault', pinnedToTop: false } });
    const api = new HydrawiseApi(harness.client);
    const out = await api.createZoneNote(2062869, { note: 'x', type: 'fault' });
    expect(out.lastUpdatedAt).toBeNull();
  });

  it('deleteZoneNote throws (not silently passes) when upstream returns WARNING', async () => {
    const harness = fakeRawClient();
    // WARNING typically means "the note didn't exist" — the AI restoring needs to know
    harness.setNextResult({ deleteZoneNote: { status: 'WARNING', summary: 'Note not found' } });
    const api = new HydrawiseApi(harness.client);
    await expect(api.deleteZoneNote(99)).rejects.toThrow(/WARNING.*Note not found/);
  });

  it('deleteZoneNote throws on ERROR with summary', async () => {
    const harness = fakeRawClient();
    harness.setNextResult({ deleteZoneNote: { status: 'ERROR', summary: 'permission denied' } });
    const api = new HydrawiseApi(harness.client);
    await expect(api.deleteZoneNote(99)).rejects.toThrow(/ERROR.*permission denied/);
  });

  it('deleteZoneNote returns OK status as success', async () => {
    const harness = fakeRawClient();
    harness.setNextResult({ deleteZoneNote: { status: 'OK', summary: 'Note deleted' } });
    const api = new HydrawiseApi(harness.client);
    const out = await api.deleteZoneNote(99);
    expect(out.status).toBe('OK');
  });

  it('updateLocation throws on per-call null (no silent overwrite)', async () => {
    const harness = fakeRawClient();
    harness.setNextResult({ updateLocation: null });
    const api = new HydrawiseApi(harness.client);
    await expect(api.updateLocation({ device_id: 5, address: '1 Tufts' }))
      .rejects.toThrow(/updateLocation returned/);
  });

  it('updateLocation surfaces partial-state when coords fail after address succeeds', async () => {
    const calls: string[] = [];
    const client: HydrawiseClient = {
      async query() { throw new Error('no'); },
      async mutate() { throw new Error('no'); },
      async mutateRaw<TResult>(
        document: string,
        _vars: Variables,
        extract: (data: Record<string, unknown>) => TResult,
      ): Promise<TResult> {
        if (document.includes('updateLocationCoordinates')) {
          calls.push('coords-throw');
          throw new HydrawiseMutationError('coords mutation failed');
        }
        calls.push('address-ok');
        return extract({ updateLocation: { id: 99, coordinates: null, address: '1 Tufts', country: 'US', state: 'CO', locality: 'X' } });
      },
    };
    const api = new HydrawiseApi(client);
    await expect(api.updateLocation({ device_id: 5, address: '1 Tufts', latitude: 39.6, longitude: -104.9 }))
      .rejects.toThrow(/AFTER updateLocation succeeded/);
    expect(calls).toEqual(['address-ok', 'coords-throw']);
  });

  it('updateLocation rejects empty-string address (would clear server-side location)', async () => {
    const harness = fakeRawClient();
    const api = new HydrawiseApi(harness.client);
    await expect(api.updateLocation({ device_id: 5, address: '' }))
      .rejects.toThrow(/at least one of address, latitude\+longitude/);
  });
});

describe('HydrawiseApi — sensor reads + mutations', () => {
  // Reuse the fakeRawClient shape locally — the api.test.ts file's fakeRawClient is scoped
  // inside the controller-config describe block, so duplicating the harness here is the
  // path of least resistance. Both helpers share the same upstream HydrawiseClient interface.
  function fakeSensorClient() {
    const queryCalls: Array<{ document: string; variables?: Variables }> = [];
    const mutateCalls: Array<{ document: string; variables: Variables }> = [];
    let queryResult: unknown = null;
    let mutateResult: Record<string, unknown> = {};
    const client: HydrawiseClient = {
      async query<TResult>(document: string, variables?: Variables): Promise<TResult> {
        queryCalls.push({ document, variables });
        return queryResult as TResult;
      },
      async mutate() {
        throw new Error('no StatusCodeAndSummary mutations expected');
      },
      async mutateRaw<TResult>(
        document: string,
        variables: Variables,
        extract: (data: Record<string, unknown>) => TResult,
      ): Promise<TResult> {
        mutateCalls.push({ document, variables });
        return extract(mutateResult);
      },
    };
    return {
      client,
      queryCalls,
      mutateCalls,
      setQueryResult: (v: unknown) => { queryResult = v; },
      setMutateResult: (v: Record<string, unknown>) => { mutateResult = v; },
    };
  }

  const fakeSensorReturn = {
    id: 5001,
    name: 'Rain',
    model: { id: 12, name: 'Rain Sensor', modeType: 'STOP', mode: 'STOP', active: true, offLevel: null, offTimer: null, delay: 0, divisor: null, flowRate: null, customerId: null, sensorType: 'LEVEL_CLOSED', type: { value: 1, label: 'Hunter Clik' }, category: { id: 1, name: 'Hunter Clik' } },
    input: { number: 1, label: 'SEN-1' },
    zones: [{ id: 100, name: 'Front Lawn' }],
  };

  it('getControllerSensors throws HydrawiseNotFoundError when controller is null', async () => {
    const harness = fakeSensorClient();
    harness.setQueryResult({ controller: null });
    const api = new HydrawiseApi(harness.client);
    await expect(api.getControllerSensors(317416)).rejects.toThrow(HydrawiseNotFoundError);
  });

  it('getControllerSensors returns an empty array when sensors is null', async () => {
    const harness = fakeSensorClient();
    harness.setQueryResult({ controller: { sensors: null } });
    const api = new HydrawiseApi(harness.client);
    expect(await api.getControllerSensors(317416)).toEqual([]);
  });

  it('getControllerSensors strips null entries from the schema-honest list', async () => {
    const harness = fakeSensorClient();
    harness.setQueryResult({ controller: { sensors: [fakeSensorReturn, null, { ...fakeSensorReturn, id: 5002 }] } });
    const api = new HydrawiseApi(harness.client);
    const out = await api.getControllerSensors(317416);
    expect(out.map((s) => s.id)).toEqual([5001, 5002]);
  });

  it('getZoneSensors throws HydrawiseNotFoundError when zone is null', async () => {
    const harness = fakeSensorClient();
    harness.setQueryResult({ zone: null });
    const api = new HydrawiseApi(harness.client);
    await expect(api.getZoneSensors(2062869)).rejects.toThrow(HydrawiseNotFoundError);
  });

  it('listSensorModels flattens categories and preserves per-model category', async () => {
    const harness = fakeSensorClient();
    harness.setQueryResult({
      configuration: {
        sensorCategories: [
          { id: 1, name: 'Hunter Clik', models: [fakeSensorReturn.model] },
          { id: 2, name: 'US Hunter HC Flow Meters', models: [{ ...fakeSensorReturn.model, id: 99, name: '1in NPT' }] },
        ],
      },
    });
    const api = new HydrawiseApi(harness.client);
    const out = await api.listSensorModels(317416);
    expect(out).toHaveLength(2);
    expect(out[0]?.id).toBe(12);
    expect(out[1]?.id).toBe(99);
    // Catalog query is account-wide; controllerId arg should NOT be included in the GraphQL variables.
    expect(harness.queryCalls[0]?.variables).toBeUndefined();
  });

  it('createSensor maps snake_case payload to camelCase variables and returns the new sensor', async () => {
    const harness = fakeSensorClient();
    harness.setMutateResult({ createSensor: fakeSensorReturn });
    const api = new HydrawiseApi(harness.client);
    const out = await api.createSensor({
      controller_id: 317416,
      name: 'Rain',
      model_id: 12,
      input_number: 1,
      zone_ids: [100, 101],
    });
    expect(harness.mutateCalls[0]?.variables).toEqual({
      controllerId: 317416,
      name: 'Rain',
      modelId: 12,
      inputNumber: 1,
      zoneIds: [100, 101],
    });
    expect(out.id).toBe(5001);
  });

  it('updateSensor passes zone_ids verbatim including null (signals "leave existing associations alone")', async () => {
    const harness = fakeSensorClient();
    harness.setMutateResult({ updateSensor: fakeSensorReturn });
    const api = new HydrawiseApi(harness.client);
    await api.updateSensor({
      sensor_id: 5001,
      controller_id: 317416,
      name: 'Rain',
      model_id: 12,
      input_number: 1,
      zone_ids: null,
    });
    expect(harness.mutateCalls[0]?.variables).toEqual({
      sensorId: 5001,
      controllerId: 317416,
      name: 'Rain',
      modelId: 12,
      inputNumber: 1,
      zoneIds: null,
    });
  });

  it('createSensor throws HydrawiseMutationError when extractor sees a malformed shape', async () => {
    const harness = fakeSensorClient();
    harness.setMutateResult({ createSensor: { id: 'not-a-number', name: 'Rain' } });
    const api = new HydrawiseApi(harness.client);
    await expect(api.createSensor({ controller_id: 1, name: 'Rain', model_id: 1, input_number: 1, zone_ids: [1] }))
      .rejects.toThrow(HydrawiseMutationError);
  });

  it('deleteSensor throws on non-true result (no silent failure)', async () => {
    const harness = fakeSensorClient();
    harness.setMutateResult({ deleteSensor: false });
    const api = new HydrawiseApi(harness.client);
    await expect(api.deleteSensor(5001)).rejects.toThrow(/deleteSensor returned false/);
  });

  it('deleteSensor returns true on true result', async () => {
    const harness = fakeSensorClient();
    harness.setMutateResult({ deleteSensor: true });
    const api = new HydrawiseApi(harness.client);
    expect(await api.deleteSensor(5001)).toBe(true);
  });

  it('createCustomSensorType maps payload and returns the new SensorModel', async () => {
    const harness = fakeSensorClient();
    harness.setMutateResult({ createCustomSensorType: { ...fakeSensorReturn.model, id: 999, customerId: 4242 } });
    const api = new HydrawiseApi(harness.client);
    const out = await api.createCustomSensorType({
      customer_id: 4242,
      name: 'Custom Flow',
      custom_sensor_type: 'FLOW',
      mode_type: 'REPORT',
      delay: 5,
      off_timer: 30,
      flow_sensor_rate: 1.5,
    });
    expect(harness.mutateCalls[0]?.variables).toEqual({
      customerId: 4242,
      name: 'Custom Flow',
      customSensorType: 'FLOW',
      modeType: 'REPORT',
      delay: 5,
      offTimer: 30,
      flowSensorRate: 1.5,
    });
    expect(out.id).toBe(999);
    expect(out.customerId).toBe(4242);
  });

  it('createCustomSensorType emits null (not undefined) for omitted optional calibration fields', async () => {
    const harness = fakeSensorClient();
    harness.setMutateResult({ createCustomSensorType: { ...fakeSensorReturn.model, id: 999, customerId: 4242 } });
    const api = new HydrawiseApi(harness.client);
    await api.createCustomSensorType({
      customer_id: 4242,
      name: 'Custom Level',
      custom_sensor_type: 'LEVEL_OPEN',
      mode_type: 'STOP',
    });
    expect(harness.mutateCalls[0]?.variables).toMatchObject({
      delay: null,
      offTimer: null,
      flowSensorRate: null,
    });
  });

  it('deleteCustomSensorType throws when upstream returns 0 or non-number (failure)', async () => {
    const harness = fakeSensorClient();
    harness.setMutateResult({ deleteCustomSensorType: 0 });
    const api = new HydrawiseApi(harness.client);
    await expect(api.deleteCustomSensorType(999)).rejects.toThrow(/deleteCustomSensorType returned 0/);
    harness.setMutateResult({ deleteCustomSensorType: null });
    await expect(api.deleteCustomSensorType(999)).rejects.toThrow(/deleteCustomSensorType returned null/);
  });

  it('deleteCustomSensorType coerces a positive Int (Hydrawise returns deleted-row count) to true', async () => {
    const harness = fakeSensorClient();
    harness.setMutateResult({ deleteCustomSensorType: 1 });
    const api = new HydrawiseApi(harness.client);
    expect(await api.deleteCustomSensorType(999)).toBe(true);
  });
});

describe('HydrawiseApi — Advanced program reads', () => {
  // Local query-only client (getAdvancedProgram is a pure read; no mutations needed).
  function fakeQueryClient() {
    const calls: Array<{ document: string; variables?: Variables }> = [];
    let nextResult: unknown = null;
    const client: HydrawiseClient = {
      async query<TResult>(document: string, variables?: Variables): Promise<TResult> {
        calls.push({ document, variables });
        return nextResult as TResult;
      },
      async mutate() {
        throw new Error('no mutations expected');
      },
      async mutateRaw() {
        throw new Error('no mutations expected');
      },
    };
    return { client, calls, setNextResult: (r: unknown) => { nextResult = r; } };
  }

  const fakeAdvancedReturn = {
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

  it('getAdvancedProgram dispatches PROGRAMS_FULL_QUERY with controllerId + includeZoneSpecific:true', async () => {
    const harness = fakeQueryClient();
    harness.setNextResult({ controller: { programs: [fakeAdvancedReturn] } });
    const api = new HydrawiseApi(harness.client);
    await api.getAdvancedProgram(317416, 6390999);
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.variables).toEqual({ controllerId: 317416, includeZoneSpecific: true });
    expect(harness.calls[0]?.document).toContain('AdvancedProgram');
  });

  it('getAdvancedProgram returns the matching program when id and __typename match', async () => {
    const harness = fakeQueryClient();
    harness.setNextResult({ controller: { programs: [fakeAdvancedReturn] } });
    const api = new HydrawiseApi(harness.client);
    const out = await api.getAdvancedProgram(317416, 6390999);
    expect(out?.id).toBe(6390999);
    expect(out?.advancedProgramId).toBe(99999);
  });

  it('getAdvancedProgram returns null when the id exists but is a StandardProgram (wrong type)', async () => {
    const harness = fakeQueryClient();
    // The id matches but __typename says StandardProgram — must NOT mis-type the result.
    harness.setNextResult({
      controller: {
        programs: [{ ...fakeAdvancedReturn, __typename: 'StandardProgram' }],
      },
    });
    const api = new HydrawiseApi(harness.client);
    expect(await api.getAdvancedProgram(317416, 6390999)).toBeNull();
  });

  it('getAdvancedProgram returns null when no matching id exists', async () => {
    const harness = fakeQueryClient();
    harness.setNextResult({ controller: { programs: [fakeAdvancedReturn] } });
    const api = new HydrawiseApi(harness.client);
    expect(await api.getAdvancedProgram(317416, 9999999)).toBeNull();
  });

  it('getAdvancedProgram throws HydrawiseNotFoundError when controller is null', async () => {
    const harness = fakeQueryClient();
    harness.setNextResult({ controller: null });
    const api = new HydrawiseApi(harness.client);
    await expect(api.getAdvancedProgram(317416, 6390999)).rejects.toThrow(HydrawiseNotFoundError);
  });
});
