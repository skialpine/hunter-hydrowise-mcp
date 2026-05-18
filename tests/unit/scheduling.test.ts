import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ConfigError } from '../../src/errors.js';
import { previewOrApply } from '../../src/tools/_helpers.js';
import { ZoneStandardShape } from '../../src/tools/scheduling.js';

describe('previewOrApply', () => {
  it('returns the planned payload and skips apply when preview=true', async () => {
    const apply = vi.fn(async () => 42);
    const result = await previewOrApply('updateZone', { zoneId: 1 }, true, apply);
    expect(apply).not.toHaveBeenCalled();
    const text = result.content[0]?.text ?? '';
    const parsed = JSON.parse(text) as { preview: boolean; operation: string; variables: unknown };
    expect(parsed).toEqual({
      preview: true,
      operation: 'updateZone',
      variables: { zoneId: 1 },
    });
  });

  it('calls apply exactly once and returns its result when preview=false', async () => {
    const apply = vi.fn(async () => ({ id: 7 }));
    const result = await previewOrApply('updateZone', { zoneId: 1 }, false, apply);
    expect(apply).toHaveBeenCalledTimes(1);
    const text = result.content[0]?.text ?? '';
    const parsed = JSON.parse(text) as { preview: boolean; result: unknown };
    expect(parsed.preview).toBe(false);
    expect(parsed.result).toEqual({ id: 7 });
  });

  it('treats undefined preview the same as false', async () => {
    const apply = vi.fn(async () => null);
    await previewOrApply('updateZone', { zoneId: 1 }, undefined, apply);
    expect(apply).toHaveBeenCalledOnce();
  });

  it('propagates errors thrown by apply', async () => {
    const apply = vi.fn(async () => {
      throw new ConfigError('nope');
    });
    await expect(previewOrApply('updateZone', { zoneId: 1 }, false, apply)).rejects.toThrow(
      'nope',
    );
  });
});

// =============================================================================
// ZoneStandardShape — STANDARD-mode tool input schema
// =============================================================================

const ZoneStandardSchema = z.object(ZoneStandardShape);

const validStandardPayload = {
  zone_id: 100,
  name: 'Front Lawn',
  number: 1,
  icon: 4,
  global_master_valve: -1,
  watering_adjustment_percent: 100,
  cycle_soak_enable: false,
};

describe('ZoneStandardShape', () => {
  it('accepts all required fields', () => {
    const result = ZoneStandardSchema.safeParse(validStandardPayload);
    expect(result.success).toBe(true);
  });

  it('accepts optional cycle/soak fields', () => {
    const result = ZoneStandardSchema.safeParse({
      ...validStandardPayload,
      cycle_soak_enable: true,
      cycle_custom_time_minutes: 6,
      soak_custom_time_minutes: 50,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cycle_custom_time_minutes).toBe(6);
      expect(result.data.soak_custom_time_minutes).toBe(50);
    }
  });

  it('accepts monitoring method and value fields', () => {
    const result = ZoneStandardSchema.safeParse({
      ...validStandardPayload,
      flow_monitoring_method: 'MANUAL',
      flow_monitoring_value: 1.5,
    });
    expect(result.success).toBe(true);
  });

  it('accepts sensor_ids as an array', () => {
    const result = ZoneStandardSchema.safeParse({ ...validStandardPayload, sensor_ids: [42] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sensor_ids).toEqual([42]);
  });

  it('does not include ADVANCED-mode-only keys in parsed output', () => {
    // Zod strips unknown keys — ADVANCED-only fields passed in are silently dropped.
    const result = ZoneStandardSchema.safeParse({
      ...validStandardPayload,
      watering_mode: 3,
      watering_type: 1,
      watering_frequency_mode: 2,
      schedule_adjustment_ids: [99],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('watering_mode');
      expect(result.data).not.toHaveProperty('watering_type');
      expect(result.data).not.toHaveProperty('watering_frequency_mode');
      expect(result.data).not.toHaveProperty('schedule_adjustment_ids');
    }
  });

  it('rejects when required fields are missing', () => {
    const result = ZoneStandardSchema.safeParse({ zone_id: 100, name: 'Test' });
    expect(result.success).toBe(false);
  });

  it('accepts payload with icon_file_id but no icon (custom uploaded image)', () => {
    const withoutIcon = { ...validStandardPayload, icon: undefined };
    const result = ZoneStandardSchema.safeParse({ ...withoutIcon, icon_file_id: 890232 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.icon).toBeUndefined();
      expect(result.data.icon_file_id).toBe(890232);
    }
  });

  it('accepts icon: null with icon_file_id set (custom uploaded image routing)', () => {
    const result = ZoneStandardSchema.safeParse({
      ...validStandardPayload,
      icon: null,
      icon_file_id: 890232,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.icon).toBeNull();
      expect(result.data.icon_file_id).toBe(890232);
    }
  });

  it('preview mode returns operation name updateZoneStandard without calling apply', async () => {
    const apply = vi.fn(async () => ({ id: 100 }));
    const payload = {
      zone_id: 100,
      name: 'Front Lawn',
      number: 1,
      icon: 4,
      global_master_valve: -1,
      watering_adjustment_percent: 100,
      cycle_soak_enable: false,
    };
    const result = await previewOrApply('updateZoneStandard', payload, true, apply);
    expect(apply).not.toHaveBeenCalled();
    const text = result.content[0]?.text ?? '';
    const parsed = JSON.parse(text) as { preview: boolean; operation: string; variables: unknown };
    expect(parsed.preview).toBe(true);
    expect(parsed.operation).toBe('updateZoneStandard');
    expect(parsed.variables).toMatchObject({ zone_id: 100, name: 'Front Lawn' });
  });
});
