import { describe, expect, it, vi } from 'vitest';
import { ConfigError } from '../../src/errors.js';
import type { ScheduledZoneRun } from '../../src/hydrawise/queries.js';
import { resolveWindow } from '../../src/tools/schedule-reads.js';
import { serializeUpcomingRun } from '../../src/tools/serializers.js';

// ---------------------------------------------------------------------------
// resolveWindow
// ---------------------------------------------------------------------------

const SEVEN_DAYS = 7 * 86_400;

describe('resolveWindow', () => {
  it('defaults from to now and until to from + 7 days when both omitted', () => {
    const now = 1_700_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
    try {
      const { from, until } = resolveWindow(undefined, undefined);
      expect(from).toBe(now);
      expect(until).toBe(now + SEVEN_DAYS);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('uses provided from and defaults until to from + 7 days', () => {
    const from = 1_700_000_100;
    const { from: f, until } = resolveWindow(from, undefined);
    expect(f).toBe(from);
    expect(until).toBe(from + SEVEN_DAYS);
  });

  it('uses provided until and defaults from to now', () => {
    const now = 1_700_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
    try {
      const until = now + 3600;
      const { from, until: u } = resolveWindow(undefined, until);
      expect(from).toBe(now);
      expect(u).toBe(until);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('throws ConfigError when from >= until (both provided)', () => {
    expect(() => resolveWindow(1000, 1000)).toThrow(ConfigError);
    expect(() => resolveWindow(1001, 1000)).toThrow(ConfigError);
  });

  it('throws ConfigError with "is in the past" when only until provided and it is <= now', () => {
    const now = 1_700_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
    try {
      expect(() => resolveWindow(undefined, now - 1)).toThrow(/in the past/);
      expect(() => resolveWindow(undefined, now)).toThrow(/in the past/);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('accepts both provided and valid', () => {
    const { from, until } = resolveWindow(1_000, 2_000);
    expect(from).toBe(1_000);
    expect(until).toBe(2_000);
  });
});

// ---------------------------------------------------------------------------
// serializeUpcomingRun
// ---------------------------------------------------------------------------

const futureRun: ScheduledZoneRun = {
  id: 'sched-1',
  startTime: { value: '2026-05-10T08:00:00.000Z' },
  endTime: { value: '2026-05-10T08:15:00.000Z' },
  normalDuration: 15,
  duration: 15,
  remainingTime: 79333,
  status: { value: 1, label: 'Scheduled' },
};

describe('serializeUpcomingRun', () => {
  it('serializes all fields with correct unit-suffixed names', () => {
    const out = serializeUpcomingRun(futureRun);
    expect(out.id).toBe('sched-1');
    expect(out.start_time).toBe('2026-05-10T08:00:00.000Z');
    expect(out.end_time).toBe('2026-05-10T08:15:00.000Z');
    expect(out.normal_duration_minutes).toBe(15);
    expect(out.scheduled_duration_minutes).toBe(15);
    expect(out.remaining_time_seconds).toBe(79333);
    expect(out.status).toBe('Scheduled');
  });

  it('returns null status when label is null', () => {
    const out = serializeUpcomingRun({ ...futureRun, status: { value: null, label: null } });
    expect(out.status).toBeNull();
  });

  it('remaining_time_seconds is 0 when run has already begun', () => {
    const out = serializeUpcomingRun({ ...futureRun, remainingTime: 0 });
    expect(out.remaining_time_seconds).toBe(0);
  });
});
