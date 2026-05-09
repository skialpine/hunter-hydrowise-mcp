import { describe, expect, it, vi } from 'vitest';
import { ConfigError } from '../../src/errors.js';
import { previewOrApply } from '../../src/tools/_helpers.js';

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
