import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { ConfigError } from '../../src/errors.js';

const minimal = {
  HYDRAWISE_USERNAME: 'alice@example.com',
  HYDRAWISE_PASSWORD: 'sekret',
} as NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('parses minimal config with defaults', () => {
    const cfg = loadConfig(minimal);
    expect(cfg).toMatchObject({
      username: 'alice@example.com',
      password: 'sekret',
      host: '127.0.0.1',
      port: 8765,
      authToken: null,
      sessionTtlSeconds: 3600,
      logLevel: 'warn',
    });
  });

  it('throws when HYDRAWISE_USERNAME is missing', () => {
    expect(() => loadConfig({ HYDRAWISE_PASSWORD: 'x' })).toThrow(ConfigError);
  });

  it('throws when HYDRAWISE_PASSWORD is empty', () => {
    expect(() =>
      loadConfig({ HYDRAWISE_USERNAME: 'alice', HYDRAWISE_PASSWORD: '' }),
    ).toThrow(ConfigError);
  });

  it('mentions the missing field in the error', () => {
    let caught: unknown = null;
    try {
      loadConfig({ HYDRAWISE_USERNAME: 'alice' });
    } catch (err) {
      caught = err;
    }
    expect((caught as Error).message).toContain('HYDRAWISE_PASSWORD');
  });

  it('refuses non-loopback host without auth token', () => {
    expect(() =>
      loadConfig({ ...minimal, HYDRAWISE_MCP_HOST: '0.0.0.0' }),
    ).toThrow(/HYDRAWISE_MCP_AUTH_TOKEN/);
  });

  it('allows non-loopback host when auth token is set', () => {
    const cfg = loadConfig({
      ...minimal,
      HYDRAWISE_MCP_HOST: '0.0.0.0',
      HYDRAWISE_MCP_AUTH_TOKEN: 'abc',
    });
    expect(cfg.host).toBe('0.0.0.0');
    expect(cfg.authToken).toBe('abc');
  });

  it('parses allowed origins as a comma-separated list', () => {
    const cfg = loadConfig({
      ...minimal,
      HYDRAWISE_MCP_ALLOWED_ORIGINS: 'http://a:1,http://b:2',
    });
    expect(cfg.allowedOrigins).toEqual(['http://a:1', 'http://b:2']);
  });

  it('rejects out-of-range port', () => {
    expect(() => loadConfig({ ...minimal, HYDRAWISE_MCP_PORT: '0' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...minimal, HYDRAWISE_MCP_PORT: '70000' })).toThrow(ConfigError);
  });
});
