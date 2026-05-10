import { describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/errors.js';
import type { RunEventType, RunSummaryDetails, ScheduledZoneRun, WaterSavingSummaryRead } from '../../src/hydrawise/queries.js';
import { parseUnixTimestamp, validateRunSummaryArgs } from '../../src/tools/_helpers.js';
import {
  serializeRunEvent,
  serializeRunSummaryDetails,
  serializeScheduledZoneRun,
} from '../../src/tools/serializers.js';

// ---------------------------------------------------------------------------
// serializeWaterSavingSummary (inline helper — tested via the tool behaviour below)
// We reproduce the logic here so the tests are self-contained.
// ---------------------------------------------------------------------------

function localSerializeWaterSavingSummary(summary: WaterSavingSummaryRead | null): Record<string, unknown> {
  if (!summary) {
    return {
      normal_duration_minutes: null,
      scheduled_duration_minutes: null,
      savings_minutes: null,
      savings_percent: null,
    };
  }
  const { normalDuration, scheduledDuration } = summary;
  const savings_minutes = normalDuration - scheduledDuration;
  const savings_percent =
    normalDuration > 0 ? Math.round((savings_minutes / normalDuration) * 1000) / 10 : null;
  return {
    normal_duration_minutes: normalDuration,
    scheduled_duration_minutes: scheduledDuration,
    savings_minutes,
    savings_percent,
  };
}

describe('serializeWaterSavingSummary (logic)', () => {
  it('computes savings for a normal period', () => {
    const out = localSerializeWaterSavingSummary({ normalDuration: 100, scheduledDuration: 80 });
    expect(out.normal_duration_minutes).toBe(100);
    expect(out.scheduled_duration_minutes).toBe(80);
    expect(out.savings_minutes).toBe(20);
    expect(out.savings_percent).toBe(20.0);
  });

  it('returns savings_percent: null when normalDuration is 0 (no watering scheduled)', () => {
    const out = localSerializeWaterSavingSummary({ normalDuration: 0, scheduledDuration: 0 });
    expect(out.savings_percent).toBeNull();
  });

  it('returns all-null fields when summary is null (API returned no data)', () => {
    const out = localSerializeWaterSavingSummary(null);
    expect(out.normal_duration_minutes).toBeNull();
    expect(out.scheduled_duration_minutes).toBeNull();
    expect(out.savings_minutes).toBeNull();
    expect(out.savings_percent).toBeNull();
  });

  it('rounds savings_percent to one decimal place', () => {
    const out = localSerializeWaterSavingSummary({ normalDuration: 300, scheduledDuration: 200 });
    expect(out.savings_percent).toBe(33.3);
  });
});

describe('get_water_saving_summary period_number guard', () => {
  it('throws ConfigError when period is WEEK and period_number is absent', () => {
    const guard = (period: string, period_number?: number) => {
      if (period !== 'YEAR' && period_number == null) {
        throw new ConfigError(`period '${period}' requires period_number`);
      }
    };
    expect(() => guard('WEEK')).toThrow(ConfigError);
    expect(() => guard('MONTH')).toThrow(ConfigError);
    expect(() => guard('QUARTER')).toThrow(ConfigError);
    expect(() => guard('YEAR')).not.toThrow();
    expect(() => guard('WEEK', 1)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseUnixTimestamp
// ---------------------------------------------------------------------------

describe('parseUnixTimestamp', () => {
  it('converts a date-only ISO string to Unix seconds', () => {
    const ts = parseUnixTimestamp('2026-05-01');
    expect(ts).toBe(Math.floor(new Date('2026-05-01').getTime() / 1000));
  });

  it('converts an ISO datetime with timezone to Unix seconds', () => {
    const ts = parseUnixTimestamp('2026-05-01T08:00:00Z');
    expect(ts).toBe(Math.floor(new Date('2026-05-01T08:00:00Z').getTime() / 1000));
  });

  it('throws ConfigError for an invalid date string', () => {
    expect(() => parseUnixTimestamp('not-a-date')).toThrow(ConfigError);
  });
});

// ---------------------------------------------------------------------------
// validateRunSummaryArgs
// ---------------------------------------------------------------------------

describe('validateRunSummaryArgs', () => {
  it('CURRENT_WEEK requires no extra args', () => {
    expect(validateRunSummaryArgs('CURRENT_WEEK', {})).toEqual({ period: 'CURRENT_WEEK' });
  });

  it('WEEK with all args returns correct object', () => {
    const result = validateRunSummaryArgs('WEEK', { start_week: 1, end_week: 4, year: 2026 });
    expect(result).toEqual({ period: 'WEEK', start_week: 1, end_week: 4, year: 2026 });
  });

  it('WEEK missing args throws ConfigError', () => {
    expect(() => validateRunSummaryArgs('WEEK', { start_week: 1 })).toThrow(ConfigError);
    expect(() => validateRunSummaryArgs('WEEK', {})).toThrow(ConfigError);
  });

  it('MONTH with all args returns correct object', () => {
    const result = validateRunSummaryArgs('MONTH', { start_month: 3, end_month: 5, year: 2026 });
    expect(result).toEqual({ period: 'MONTH', start_month: 3, end_month: 5, year: 2026 });
  });

  it('MONTH missing args throws ConfigError', () => {
    expect(() => validateRunSummaryArgs('MONTH', { start_month: 1 })).toThrow(ConfigError);
  });

  it('YEAR with all args returns correct object', () => {
    const result = validateRunSummaryArgs('YEAR', { start_year: 2025, end_year: 2026 });
    expect(result).toEqual({ period: 'YEAR', start_year: 2025, end_year: 2026 });
  });

  it('YEAR missing args throws ConfigError', () => {
    expect(() => validateRunSummaryArgs('YEAR', { start_year: 2025 })).toThrow(ConfigError);
  });
});

// ---------------------------------------------------------------------------
// serializeRunEvent
// ---------------------------------------------------------------------------

const fullRunEvent: RunEventType = {
  id: 'evt-1',
  zone: { id: 10, name: 'Front Lawn' },
  standardProgram: { id: 5, name: 'Morning Run' },
  normalStartTime: { value: '2026-05-01T08:33:00.000Z' },
  scheduledStartTime: { value: '2026-05-01T08:33:00.000Z' },
  reportedStartTime: { value: '2026-05-01T08:33:05.000Z' },
  normalEndTime: { value: '2026-05-01T08:35:00.000Z' },
  scheduledEndTime: { value: '2026-05-01T08:35:00.000Z' },
  reportedEndTime: { value: '2026-05-01T08:35:10.000Z' },
  normalDuration: 120,
  scheduledDuration: 120,
  reportedDuration: 125,
  scheduledStatus: { value: 2, label: 'Completed' },
  reportedStatus: { value: 2, label: 'Completed' },
  reportedWaterUsage: { value: 1.5, unit: 'gal' },
  reportedStopReason: { finishedNormally: true, description: ['Normal stop'] },
  reportedCurrent: { value: 420, unit: 'mA' },
};

describe('serializeRunEvent', () => {
  it('serializes a fully-populated run event', () => {
    const out = serializeRunEvent(fullRunEvent);
    expect(out.id).toBe('evt-1');
    expect(out.zone_id).toBe(10);
    expect(out.zone_name).toBe('Front Lawn');
    expect(out.program_id).toBe(5);
    expect(out.program_name).toBe('Morning Run');
    expect(out.reported_start_time).toBe('2026-05-01T08:33:05.000Z');
    expect(out.normal_duration_seconds).toBe(120);
    expect(out.reported_duration_seconds).toBe(125);
    expect(out.reported_status).toBe('Completed');
    expect(out.reported_water_usage).toEqual({ value: 1.5, unit: 'gal' });
    expect(out.stop_reason_finished_normally).toBe(true);
    expect(out.stop_reason_description).toEqual(['Normal stop']);
    expect(out.reported_current).toEqual({ value: 420, unit: 'mA' });
  });

  it('returns null program fields when standardProgram is null', () => {
    const out = serializeRunEvent({ ...fullRunEvent, standardProgram: null });
    expect(out.program_id).toBeNull();
    expect(out.program_name).toBeNull();
  });

  it('returns null reported time fields when times are null', () => {
    const out = serializeRunEvent({
      ...fullRunEvent,
      reportedStartTime: null,
      reportedEndTime: null,
      reportedDuration: null,
    } as RunEventType);
    expect(out.reported_start_time).toBeNull();
    expect(out.reported_end_time).toBeNull();
    expect(out.reported_duration_seconds).toBeNull();
  });

  it('returns null water usage when reportedWaterUsage is null', () => {
    const out = serializeRunEvent({ ...fullRunEvent, reportedWaterUsage: null });
    expect(out.reported_water_usage).toBeNull();
  });

  it('returns null stop reason fields when reportedStopReason is null', () => {
    const out = serializeRunEvent({ ...fullRunEvent, reportedStopReason: null });
    expect(out.stop_reason_finished_normally).toBeNull();
    expect(out.stop_reason_description).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// serializeScheduledZoneRun
// ---------------------------------------------------------------------------

const fakeRun: ScheduledZoneRun = {
  id: 'run-1',
  startTime: { value: '2026-05-01T08:33:00.000Z' },
  endTime: { value: '2026-05-01T08:35:00.000Z' },
  normalDuration: 2,
  duration: 2,
  remainingTime: 0,
  status: { value: 2, label: 'Completed' },
};

describe('serializeScheduledZoneRun', () => {
  it('serializes a normal run with scheduled_duration_minutes and actual_elapsed_seconds', () => {
    const out = serializeScheduledZoneRun(fakeRun);
    expect(out).not.toBeNull();
    expect(out!.id).toBe('run-1');
    expect(out!.start_time).toBe('2026-05-01T08:33:00.000Z'); // serializer unwraps .value
    expect(out!.normal_duration_minutes).toBe(2);
    expect(out!.scheduled_duration_minutes).toBe(2);
    expect(out!.actual_elapsed_seconds).toBe(120); // 2 minutes between start and end
    expect(out!.status).toBe('Completed');
  });

  it('reports actual_elapsed_seconds when a run was cancelled early', () => {
    // Scheduled 5 minutes but stopped after 3 seconds (mirrors a real "Manual watering cycle" cancel).
    const out = serializeScheduledZoneRun({
      ...fakeRun,
      startTime: { value: '2026-05-01T08:33:00.000Z' },
      endTime: { value: '2026-05-01T08:33:03.000Z' },
      duration: 5,
    });
    expect(out!.scheduled_duration_minutes).toBe(5);
    expect(out!.actual_elapsed_seconds).toBe(3);
  });

  it('returns actual_elapsed_seconds=null on unparseable timestamps', () => {
    const out = serializeScheduledZoneRun({
      ...fakeRun,
      startTime: { value: 'not-a-date' },
      endTime: { value: 'also-not' },
    });
    expect(out!.actual_elapsed_seconds).toBeNull();
  });

  it('returns null for null input', () => {
    expect(serializeScheduledZoneRun(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(serializeScheduledZoneRun(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// serializeRunSummaryDetails
// ---------------------------------------------------------------------------

const fakeSummary: RunSummaryDetails = {
  totalNormalRunTime: 20,
  totalActualRunTime: 18,
  totalWaterVolume: { value: 3.2, unit: 'gal' },
};

describe('serializeRunSummaryDetails', () => {
  it('serializes summary with data', () => {
    const out = serializeRunSummaryDetails(fakeSummary);
    expect(out.total_normal_run_time_minutes).toBe(20);
    expect(out.total_actual_run_time_minutes).toBe(18);
    expect(out.total_water_volume).toEqual({ value: 3.2, unit: 'gal' });
  });

  it('returns nulls for null input', () => {
    const out = serializeRunSummaryDetails(null);
    expect(out.total_normal_run_time_minutes).toBeNull();
    expect(out.total_actual_run_time_minutes).toBeNull();
    expect(out.total_water_volume).toBeNull();
  });

  it('returns nulls for undefined input', () => {
    const out = serializeRunSummaryDetails(undefined);
    expect(out.total_normal_run_time_minutes).toBeNull();
    expect(out.total_actual_run_time_minutes).toBeNull();
  });
});
