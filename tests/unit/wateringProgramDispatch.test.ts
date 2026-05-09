import { describe, expect, it, vi } from 'vitest';
import { HydrawiseApi } from '../../src/hydrawise/api.js';
import type { HydrawiseClient, Variables } from '../../src/hydrawise/client.js';
import type { WateringProgramWritable } from '../../src/hydrawise/queries.js';

function fakeClient() {
  const calls: Array<{ document: string; variables: Variables }> = [];
  const client: HydrawiseClient = {
    async query() {
      throw new Error('no queries expected');
    },
    async mutate() {
      throw new Error('no StatusCodeAndSummary mutations expected');
    },
    mutateRaw: vi.fn(async (document: string, variables: Variables) => {
      calls.push({ document, variables });
      return { id: 1, name: 'mock' };
    }) as unknown as HydrawiseClient['mutateRaw'],
  };
  return { client, calls };
}

describe('watering program subtype dispatch', () => {
  it('Time → updateTimeBasedWateringProgram with the right variables', async () => {
    const { client, calls } = fakeClient();
    const api = new HydrawiseApi(client);
    const payload: WateringProgramWritable & { program_id: number } = {
      program_id: 7,
      program_type: 'Time',
      watering_program_name: 'morning',
      watering_program_type: 0,
      controller_id: 99,
      schedule_adjustment_ids: [],
      seasonal_adjustment: null,
      fixed_watering_run_time: 600,
      fixed_watering_frequency_mode: 1,
    };
    await api.updateWateringProgram(payload);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.document).toContain('updateTimeBasedWateringProgram');
    expect(calls[0]?.variables).toMatchObject({
      wateringProgramId: 7,
      wateringProgramName: 'morning',
      fixedWateringRunTime: 600,
      fixedWateringFrequencyMode: 1,
    });
  });

  it('Smart → updateSmartBasedWateringProgram', async () => {
    const { client, calls } = fakeClient();
    const api = new HydrawiseApi(client);
    await api.updateWateringProgram({
      program_id: 8,
      program_type: 'Smart',
      watering_program_name: 'smart',
      watering_program_type: null,
      controller_id: 99,
      schedule_adjustment_ids: null,
      seasonal_adjustment: null,
      smart_watering_run_time: 900,
      smart_watering_frequency_value: 3,
    });
    expect(calls[0]?.document).toContain('updateSmartBasedWateringProgram');
    expect(calls[0]?.variables).toMatchObject({
      smartWateringRunTime: 900,
      smartWateringFrequencyValue: 3,
    });
  });

  it('VirtualSolarSync → updateVirtualSolarSyncWateringProgram', async () => {
    const { client, calls } = fakeClient();
    const api = new HydrawiseApi(client);
    await api.updateWateringProgram({
      program_id: 9,
      program_type: 'VirtualSolarSync',
      watering_program_name: 'vss',
      watering_program_type: null,
      controller_id: 99,
      schedule_adjustment_ids: [],
      seasonal_adjustment: null,
      virtual_solar_sync_watering_run_time: 1200,
      virtual_solar_sync_watering_frequency_mode: 2,
    });
    expect(calls[0]?.document).toContain('updateVirtualSolarSyncWateringProgram');
    expect(calls[0]?.variables).toMatchObject({
      virtualSolarSyncWateringRunTime: 1200,
      virtualSolarSyncWateringFrequencyMode: 2,
    });
  });
});
