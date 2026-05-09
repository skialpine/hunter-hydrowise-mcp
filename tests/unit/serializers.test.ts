import { describe, expect, it } from 'vitest';
import type { ZoneRichRead } from '../../src/hydrawise/queries.js';
import { serializeZoneSettings } from '../../src/tools/serializers.js';

const baseZone: ZoneRichRead = {
  id: 42,
  name: 'Front Drip',
  number: { value: 13 },
  icon: { id: 4 },
  wateringSettings: {
    fixedWateringAdjustment: 100,
    cycleAndSoakSettings: { cycleDuration: 10, soakDuration: 30 },
  },
  monitoringSettings: {
    operatingRanges: {
      waterFlowRate: { value: 1.2 },
      electricCurrent: { value: 380 },
    },
    measuredMedians: {
      waterFlowRate: { value: 1.18 },
      electricCurrent: { value: 402 },
    },
  },
  status: { suspendedUntil: null },
};

describe('serializeZoneSettings', () => {
  it('emits cycle_soak_enable as boolean true when cycleAndSoakSettings is present', () => {
    const out = serializeZoneSettings(baseZone);
    expect(out.cycle_soak_enable).toBe(true);
    expect(out.cycle_custom_time).toBe(10);
    expect(out.soak_custom_time).toBe(30);
  });

  it('emits cycle_soak_enable as false when cycleAndSoakSettings is null', () => {
    const out = serializeZoneSettings({
      ...baseZone,
      wateringSettings: { fixedWateringAdjustment: 100, cycleAndSoakSettings: null },
    });
    expect(out.cycle_soak_enable).toBe(false);
  });

  it('attaches monitoring_observed with operating_ranges and measured_medians', () => {
    const out = serializeZoneSettings(baseZone);
    expect(out.monitoring_observed).toEqual({
      operating_ranges: { water_flow_rate: 1.2, electric_current: 380 },
      measured_medians: { water_flow_rate: 1.18, electric_current: 402 },
    });
  });

  it('returns null monitoring_observed when monitoringSettings is absent', () => {
    const out = serializeZoneSettings({ ...baseZone, monitoringSettings: null });
    expect(out.monitoring_observed).toBeNull();
  });

  it('writable monitoring fields default to null on read (must be set explicitly on write)', () => {
    const out = serializeZoneSettings(baseZone);
    expect(out.flow_monitoring_method).toBeNull();
    expect(out.current_monitoring_method).toBeNull();
    expect(out.flow_monitoring_value).toBeNull();
    expect(out.current_monitoring_value).toBeNull();
  });
});
