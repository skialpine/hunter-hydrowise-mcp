import { describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/errors.js';
import { pickSuspendUntil, resolveUntil } from '../../src/tools/_helpers.js';

describe('pickSuspendUntil', () => {
  it('returns kind=days for a positive integer days arg', () => {
    expect(pickSuspendUntil(3, undefined)).toEqual({ kind: 'days', days: 3 });
  });

  it('returns kind=until for a non-empty until string', () => {
    expect(pickSuspendUntil(undefined, '2026-05-20T08:00:00Z')).toEqual({
      kind: 'until',
      until: '2026-05-20T08:00:00Z',
    });
  });

  it('throws when both provided', () => {
    expect(() => pickSuspendUntil(3, '2026-05-20T08:00:00Z')).toThrow(ConfigError);
  });

  it('throws when neither provided', () => {
    expect(() => pickSuspendUntil(undefined, undefined)).toThrow(ConfigError);
  });

  it('throws when days is non-positive', () => {
    expect(() => pickSuspendUntil(0, undefined)).toThrow(ConfigError);
    expect(() => pickSuspendUntil(-1, undefined)).toThrow(ConfigError);
  });
});

describe('resolveUntil', () => {
  const NOW = Date.UTC(2026, 4, 9, 12, 0, 0);
  const now = () => NOW;

  it('converts kind=days to a future Date', () => {
    const result = resolveUntil({ kind: 'days', days: 3 }, now);
    expect(result.toISOString()).toBe(new Date(NOW + 3 * 86_400_000).toISOString());
  });

  it('parses kind=until ISO-8601 string', () => {
    const result = resolveUntil({ kind: 'until', until: '2026-05-20T08:00:00Z' }, now);
    expect(result.toISOString()).toBe('2026-05-20T08:00:00.000Z');
  });

  it('throws on a non-ISO-8601 until', () => {
    expect(() => resolveUntil({ kind: 'until', until: 'not-a-date' }, now)).toThrow(ConfigError);
  });
});
