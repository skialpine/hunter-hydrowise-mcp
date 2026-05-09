import { ClientError, GraphQLClient } from 'graphql-request';
import { HydrawiseAPIError, HydrawiseAuthError, HydrawiseMutationError } from '../errors.js';
import { Auth } from './auth.js';
import type { StatusCodeAndSummary } from './queries.js';

const GRAPHQL_URL = 'https://app.hydrawise.com/api/v2/graph';

export type Variables = Record<string, unknown>;

export interface HydrawiseClient {
  query<TResult>(document: string, variables?: Variables): Promise<TResult>;
  mutate(
    document: string,
    variables: Variables,
    extract: (data: Record<string, unknown>) => StatusCodeAndSummary,
  ): Promise<StatusCodeAndSummary>;
}

class GraphQLHydrawiseClient implements HydrawiseClient {
  private readonly client: GraphQLClient;

  constructor(private readonly auth: Auth) {
    this.client = new GraphQLClient(GRAPHQL_URL);
  }

  async query<TResult>(document: string, variables?: Variables): Promise<TResult> {
    const headers = { Authorization: await this.auth.getAuthHeader() };
    try {
      return await this.client.request<TResult>(document, variables ?? {}, headers);
    } catch (err) {
      throw mapClientError(err);
    }
  }

  async mutate(
    document: string,
    variables: Variables,
    extract: (data: Record<string, unknown>) => StatusCodeAndSummary,
  ): Promise<StatusCodeAndSummary> {
    const headers = { Authorization: await this.auth.getAuthHeader() };
    let data: Record<string, unknown>;
    try {
      data = await this.client.request<Record<string, unknown>>(document, variables, headers);
    } catch (err) {
      throw mapClientError(err);
    }
    const result = extract(data);
    if (result.status !== 'OK' && result.status !== 'WARNING') {
      throw new HydrawiseMutationError(result.summary || `mutation returned ${result.status}`);
    }
    return result;
  }
}

function mapClientError(err: unknown): Error {
  if (err instanceof HydrawiseAuthError) return err;
  if (err instanceof ClientError) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      return new HydrawiseAuthError(`Hydrawise rejected the access token (HTTP ${status})`, {
        cause: err,
      });
    }
    const gqlMessage = err.response?.errors?.[0]?.message;
    return new HydrawiseAPIError(gqlMessage ?? err.message, { cause: err });
  }
  if (err instanceof Error) {
    return new HydrawiseAPIError(err.message, { cause: err });
  }
  return new HydrawiseAPIError('unknown Hydrawise client error');
}

let singleton: HydrawiseClient | null = null;

export function getClient(auth: Auth): HydrawiseClient {
  if (!singleton) {
    singleton = new GraphQLHydrawiseClient(auth);
  }
  return singleton;
}

export function resetClientForTesting(): void {
  singleton = null;
}
