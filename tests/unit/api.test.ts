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
});
