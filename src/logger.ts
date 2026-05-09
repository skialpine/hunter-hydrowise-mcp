export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_RANK: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export interface Logger {
  error(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

export function redactAuthHeader<T extends Record<string, unknown>>(headers: T): T {
  const out: Record<string, unknown> = { ...headers };
  for (const key of Object.keys(out)) {
    if (key.toLowerCase() === 'authorization') {
      out[key] = '<redacted>';
    }
  }
  return out as T;
}

export function createLogger(level: LogLevel = 'warn'): Logger {
  const min = LEVEL_RANK[level];
  const emit = (lvl: LogLevel, msg: string, meta?: Record<string, unknown>) => {
    if (LEVEL_RANK[lvl] > min) return;
    const line =
      meta && Object.keys(meta).length > 0
        ? `[${lvl}] ${msg} ${JSON.stringify(meta)}`
        : `[${lvl}] ${msg}`;
    process.stderr.write(`${line}\n`);
  };
  return {
    error: (msg, meta) => emit('error', msg, meta),
    warn: (msg, meta) => emit('warn', msg, meta),
    info: (msg, meta) => emit('info', msg, meta),
    debug: (msg, meta) => emit('debug', msg, meta),
  };
}
