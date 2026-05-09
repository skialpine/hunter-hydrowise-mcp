import type { RunSummaryArgs } from '../hydrawise/api.js';
import { ConfigError, isHydrawiseError } from '../errors.js';

const MS_PER_DAY = 86_400_000;

export function resolveUntil(
  days: number | undefined,
  until: string | undefined,
  now: () => number = Date.now,
): Date {
  const hasDays = typeof days === 'number';
  const hasUntil = typeof until === 'string' && until.length > 0;
  if (hasDays && hasUntil) {
    throw new ConfigError("provide exactly one of 'days' or 'until', not both");
  }
  if (!hasDays && !hasUntil) {
    throw new ConfigError("provide one of 'days' or 'until'");
  }
  if (hasDays) {
    if (!Number.isFinite(days) || (days as number) <= 0) {
      throw new ConfigError("'days' must be a positive number");
    }
    return new Date(now() + (days as number) * MS_PER_DAY);
  }
  const parsed = new Date(until as string);
  if (Number.isNaN(parsed.getTime())) {
    throw new ConfigError(`'until' is not a valid ISO-8601 timestamp: ${until}`);
  }
  return parsed;
}

export interface ToolText {
  type: 'text';
  text: string;
}

export interface ToolResult {
  [key: string]: unknown;
  content: ToolText[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function jsonResult(value: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

export function errorResult(kind: string, message: string): ToolResult {
  return {
    content: [{ type: 'text', text: `${kind}: ${message}` }],
    isError: true,
  };
}

export async function runTool(handler: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await handler();
  } catch (err) {
    if (isHydrawiseError(err)) {
      return errorResult(err.kind, err.message);
    }
    if (err instanceof Error) {
      return errorResult('internal_error', err.message);
    }
    return errorResult('internal_error', 'unknown error');
  }
}

export function parseUnixTimestamp(iso: string): number {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) {
    throw new ConfigError(`not a valid date string: ${iso}`);
  }
  return Math.floor(ms / 1000);
}

export function validateRunSummaryArgs(
  period: string,
  args: Record<string, unknown>,
): RunSummaryArgs {
  if (period === 'CURRENT_WEEK') return { period: 'CURRENT_WEEK' };
  if (period === 'WEEK') {
    const { start_week, end_week, year } = args;
    if (start_week == null || end_week == null || year == null) {
      throw new ConfigError("period 'WEEK' requires start_week, end_week, and year");
    }
    return { period: 'WEEK', start_week: start_week as number, end_week: end_week as number, year: year as number };
  }
  if (period === 'MONTH') {
    const { start_month, end_month, year } = args;
    if (start_month == null || end_month == null || year == null) {
      throw new ConfigError("period 'MONTH' requires start_month, end_month, and year");
    }
    return { period: 'MONTH', start_month: start_month as number, end_month: end_month as number, year: year as number };
  }
  // YEAR
  const { start_year, end_year } = args;
  if (start_year == null || end_year == null) {
    throw new ConfigError("period 'YEAR' requires start_year and end_year");
  }
  return { period: 'YEAR', start_year: start_year as number, end_year: end_year as number };
}

/** When `preview` is true, return the planned mutation as a JSON Tool result
 *  without invoking `apply`. Otherwise call `apply` and serialize its result. */
export async function previewOrApply<TVars, TResult>(
  operation: string,
  variables: TVars,
  preview: boolean | undefined,
  apply: () => Promise<TResult>,
): Promise<ToolResult> {
  if (preview) {
    return jsonResult({ preview: true, operation, variables });
  }
  const result = await apply();
  return jsonResult({ preview: false, operation, result });
}
