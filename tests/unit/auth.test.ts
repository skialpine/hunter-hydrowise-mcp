import { describe, expect, it, vi } from 'vitest';
import { HydrawiseAuthError } from '../../src/errors.js';
import { Auth } from '../../src/hydrawise/auth.js';

function fakeFetch(responses: Array<{ ok: boolean; status?: number; body: unknown }>) {
  let i = 0;
  const calls: Array<{ url: string; body: string }> = [];
  const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    const next = responses[i++];
    if (!next) throw new Error('unexpected fetch call');
    return {
      ok: next.ok,
      status: next.status ?? (next.ok ? 200 : 400),
      statusText: 'mocked',
      json: async () => next.body,
    } as unknown as Response;
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

describe('Auth', () => {
  it('fetches an initial token via password grant', async () => {
    const { fetchFn, calls } = fakeFetch([
      {
        ok: true,
        body: {
          access_token: 'AT-1',
          refresh_token: 'RT-1',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      },
    ]);
    const auth = new Auth('alice', 'sekret', fetchFn, () => 0);

    const header = await auth.getAuthHeader();

    expect(header).toBe('Bearer AT-1');
    expect(calls[0]?.body).toContain('grant_type=password');
    expect(calls[0]?.body).toContain('username=alice');
    expect(calls[0]?.body).toContain('client_id=hydrawise_app');
  });

  it('refreshes when the cached token is near expiry', async () => {
    let now = 0;
    const { fetchFn, calls } = fakeFetch([
      {
        ok: true,
        body: {
          access_token: 'AT-1',
          refresh_token: 'RT-1',
          token_type: 'Bearer',
          expires_in: 600,
        },
      },
      {
        ok: true,
        body: {
          access_token: 'AT-2',
          refresh_token: 'RT-2',
          token_type: 'Bearer',
          expires_in: 600,
        },
      },
    ]);
    const auth = new Auth('alice', 'sekret', fetchFn, () => now);

    expect(await auth.getAuthHeader()).toBe('Bearer AT-1');

    // 4 minutes before expiry → within the 5-minute leeway → refresh
    now = 600_000 - 4 * 60_000;
    expect(await auth.getAuthHeader()).toBe('Bearer AT-2');

    expect(calls[1]?.body).toContain('grant_type=refresh_token');
    expect(calls[1]?.body).toContain('refresh_token=RT-1');
  });

  it('throws HydrawiseAuthError on error response', async () => {
    const { fetchFn } = fakeFetch([
      { ok: false, status: 401, body: { error: 'invalid_grant', message: 'bad creds' } },
    ]);
    const auth = new Auth('alice', 'wrong', fetchFn, () => 0);
    await expect(auth.getAuthHeader()).rejects.toBeInstanceOf(HydrawiseAuthError);
  });
});
