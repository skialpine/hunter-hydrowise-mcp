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
