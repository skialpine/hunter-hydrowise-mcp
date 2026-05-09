import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../src/hydrawise/auth.js';
import { createLogger, redactAuthHeader } from '../../src/logger.js';

const SECRETS = {
  username: 'alice@example.com',
  password: 'sekret-pass-9000',
  accessToken: 'AT-NEVER-LOGGED',
  refreshToken: 'RT-NEVER-LOGGED',
};

describe('credential leak guards', () => {
  let writes: string[] = [];
  let originalWrite: typeof process.stderr.write;

  beforeEach(() => {
    writes = [];
    originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  it('redactAuthHeader replaces Authorization regardless of casing', () => {
    expect(redactAuthHeader({ Authorization: 'Bearer AT' })).toEqual({
      Authorization: '<redacted>',
    });
    expect(redactAuthHeader({ authorization: 'Bearer AT' })).toEqual({
      authorization: '<redacted>',
    });
  });

  it('logger never emits redacted secrets at any log level', () => {
    const logger = createLogger('debug');
    logger.error('failed call', redactAuthHeader({ Authorization: `Bearer ${SECRETS.accessToken}` }));
    logger.warn('refresh required');
    logger.info('serving on http://127.0.0.1');
    logger.debug('handler entered', { method: 'POST' });

    const all = writes.join('');
    expect(all).not.toContain(SECRETS.accessToken);
    expect(all).not.toContain(SECRETS.password);
    expect(all).not.toContain(SECRETS.refreshToken);
    expect(all).not.toContain(SECRETS.username);
  });

  it('Auth never logs the password or token even on a happy path', async () => {
    const fetchFn = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'ok',
        json: async () => ({
          access_token: SECRETS.accessToken,
          refresh_token: SECRETS.refreshToken,
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      }) as unknown as Response,
    );
    const auth = new Auth(SECRETS.username, SECRETS.password, fetchFn as unknown as typeof fetch);
    const header = await auth.getAuthHeader();
    expect(header).toBe(`Bearer ${SECRETS.accessToken}`);

    const all = writes.join('');
    expect(all).not.toContain(SECRETS.password);
    expect(all).not.toContain(SECRETS.accessToken);
    expect(all).not.toContain(SECRETS.refreshToken);
  });
});
