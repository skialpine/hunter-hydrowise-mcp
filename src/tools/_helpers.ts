import type { RunSummaryArgs } from '../hydrawise/api.js';
import { ConfigError, isHydrawiseError } from '../errors.js';
import type { Logger } from '../logger.js';

const MS_PER_DAY = 86_400_000;

export type SuspendUntil = { kind: 'days'; days: number } | { kind: 'until'; until: string };

export function pickSuspendUntil(days: number | undefined, until: string | undefined): SuspendUntil {
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
    return { kind: 'days', days: days as number };
  }
  return { kind: 'until', until: until as string };
}

export function resolveUntil(arg: SuspendUntil, now: () => number = Date.now): Date {
  if (arg.kind === 'days') {
    return new Date(now() + arg.days * MS_PER_DAY);
  }
  const parsed = new Date(arg.until);
  if (Number.isNaN(parsed.getTime())) {
    throw new ConfigError(`'until' is not a valid ISO-8601 timestamp: ${arg.until}`);
  }
  return parsed;
}

export interface ToolText {
  type: 'text';
  text: string;
}

export interface ToolResult {
  // Required by the MCP SDK's CallToolResult shape; do not remove.
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

export interface RunToolOptions {
  logger?: Logger;
  toolName?: string;
}

export async function runTool(
  handler: () => Promise<ToolResult>,
  opts: RunToolOptions = {},
): Promise<ToolResult> {
  try {
    return await handler();
  } catch (err) {
    const meta: Record<string, unknown> = opts.toolName ? { tool: opts.toolName } : {};
    if (isHydrawiseError(err)) {
      if (err.cause !== undefined) meta.cause = causeSummary(err.cause);
      opts.logger?.warn(`tool failed: ${err.kind}`, { ...meta, message: err.message });
      return errorResult(err.kind, err.message);
    }
    if (err instanceof Error) {
      opts.logger?.error('tool failed: internal_error', { ...meta, message: err.message, stack: err.stack });
      return errorResult('internal_error', err.message);
    }
    opts.logger?.error('tool failed: internal_error', { ...meta, value: String(err) });
    return errorResult('internal_error', 'unknown error');
  }
}

function causeSummary(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
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
  args: { start_week?: number; end_week?: number; start_month?: number; end_month?: number; start_year?: number; end_year?: number; year?: number },
): RunSummaryArgs {
  if (period === 'CURRENT_WEEK') return { period: 'CURRENT_WEEK' };
  if (period === 'WEEK') {
    const { start_week, end_week, year } = args;
    if (start_week == null || end_week == null || year == null) {
      throw new ConfigError("period 'WEEK' requires start_week, end_week, and year");
    }
    return { period: 'WEEK', start_week, end_week, year };
  }
  if (period === 'MONTH') {
    const { start_month, end_month, year } = args;
    if (start_month == null || end_month == null || year == null) {
      throw new ConfigError("period 'MONTH' requires start_month, end_month, and year");
    }
    return { period: 'MONTH', start_month, end_month, year };
  }
  const { start_year, end_year } = args;
  if (start_year == null || end_year == null) {
    throw new ConfigError("period 'YEAR' requires start_year and end_year");
  }
  return { period: 'YEAR', start_year, end_year };
}

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
