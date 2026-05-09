import { describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/errors.js';
import { resolveUntil } from '../../src/tools/_helpers.js';

describe('resolveUntil', () => {
  const NOW = Date.UTC(2026, 4, 9, 12, 0, 0);
  const now = () => NOW;

  it('converts days to a future Date', () => {
    const result = resolveUntil(3, undefined, now);
    expect(result.toISOString()).toBe(new Date(NOW + 3 * 86_400_000).toISOString());
  });

  it('parses an ISO-8601 until string', () => {
    const result = resolveUntil(undefined, '2026-05-20T08:00:00Z', now);
    expect(result.toISOString()).toBe('2026-05-20T08:00:00.000Z');
  });

  it('throws when both days and until are provided', () => {
    expect(() => resolveUntil(3, '2026-05-20T08:00:00Z', now)).toThrow(ConfigError);
  });

  it('throws when neither days nor until are provided', () => {
    expect(() => resolveUntil(undefined, undefined, now)).toThrow(ConfigError);
  });

  it('throws on a non-ISO-8601 until', () => {
    expect(() => resolveUntil(undefined, 'not-a-date', now)).toThrow(ConfigError);
  });

  it('throws when days is non-positive', () => {
    expect(() => resolveUntil(0, undefined, now)).toThrow(ConfigError);
    expect(() => resolveUntil(-1, undefined, now)).toThrow(ConfigError);
  });
});
