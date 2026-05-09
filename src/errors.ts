export type ErrorKind =
  | 'config_error'
  | 'auth_error'
  | 'api_error'
  | 'mutation_error';

abstract class HydrawiseError extends Error {
  abstract readonly kind: ErrorKind;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ConfigError extends HydrawiseError {
  readonly kind = 'config_error' as const;
}

export class HydrawiseAuthError extends HydrawiseError {
  readonly kind = 'auth_error' as const;
}

export class HydrawiseAPIError extends HydrawiseError {
  readonly kind = 'api_error' as const;
}

export class HydrawiseMutationError extends HydrawiseError {
  readonly kind = 'mutation_error' as const;
  readonly summary: string;
  constructor(summary: string, options?: { cause?: unknown }) {
    super(summary, options);
    this.summary = summary;
  }
}

export function isHydrawiseError(value: unknown): value is HydrawiseError {
  return value instanceof HydrawiseError;
}
