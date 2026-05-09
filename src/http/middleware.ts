import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../logger.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const JSON_RPC_INVALID_REQUEST = -32600;
const BEARER_PREFIX = /^Bearer\s+/i;

function jsonRpcError(code: number, message: string) {
  return { jsonrpc: '2.0', id: null, error: { code, message } };
}

export function originGuard(allowedOrigins: string[] | null, logger?: Logger) {
  const explicit = allowedOrigins?.map((o) => o.toLowerCase()) ?? null;
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    if (!origin) {
      next();
      return;
    }
    const allowed = explicit
      ? explicit.includes(origin.toLowerCase())
      : isLoopbackOrigin(origin);
    if (allowed) {
      next();
      return;
    }
    logger?.warn('rejected request: origin not allowed', { origin, ip: req.ip });
    res
      .status(403)
      .json(jsonRpcError(JSON_RPC_INVALID_REQUEST, `origin not allowed: ${origin}`));
  };
}

function isLoopbackOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return LOOPBACK_HOSTS.has(url.hostname) || LOOPBACK_HOSTS.has(`[${url.hostname}]`);
}

export function hostGuard(boundHost: string, _boundPort: number, logger?: Logger) {
  const expectedHostnames = new Set<string>();
  if (boundHost === '0.0.0.0' || boundHost === '::') {
    for (const h of LOOPBACK_HOSTS) expectedHostnames.add(stripBrackets(h).toLowerCase());
  } else {
    expectedHostnames.add(boundHost.toLowerCase());
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const host = req.get('host');
    if (!host) {
      logger?.warn('rejected request: missing Host header', { ip: req.ip });
      res.status(403).json(jsonRpcError(JSON_RPC_INVALID_REQUEST, 'missing Host header'));
      return;
    }
    const hostname = parseHostname(host);
    if (hostname && expectedHostnames.has(hostname.toLowerCase())) {
      next();
      return;
    }
    logger?.warn('rejected request: host not allowed', { host, ip: req.ip });
    res.status(403).json(jsonRpcError(JSON_RPC_INVALID_REQUEST, `host not allowed: ${host}`));
  };
}

function stripBrackets(s: string): string {
  return s.startsWith('[') && s.endsWith(']') ? s.slice(1, -1) : s;
}

function parseHostname(hostHeader: string): string | null {
  if (hostHeader.startsWith('[')) {
    const end = hostHeader.indexOf(']');
    return end > 0 ? hostHeader.slice(1, end) : null;
  }
  const colon = hostHeader.lastIndexOf(':');
  const firstColon = hostHeader.indexOf(':');
  if (colon === -1) return hostHeader;
  // Bare IPv6 with no port has multiple colons but no brackets.
  if (firstColon !== colon) return hostHeader;
  return hostHeader.slice(0, colon);
}

export function bearerGuard(authToken: string | null, logger?: Logger) {
  if (!authToken) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  // Hash both sides to a fixed-length digest before timingSafeEqual so the comparison itself doesn't leak token length.
  const expectedDigest = createHash('sha256').update(authToken, 'utf8').digest();
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.get('authorization');
    if (!header) {
      logger?.warn('rejected request: missing Authorization header', { ip: req.ip });
      res.status(401).json(jsonRpcError(JSON_RPC_INVALID_REQUEST, 'missing Authorization header'));
      return;
    }
    if (!BEARER_PREFIX.test(header)) {
      logger?.warn('rejected request: malformed Authorization header', { ip: req.ip });
      res.status(401).json(jsonRpcError(JSON_RPC_INVALID_REQUEST, 'malformed Authorization header'));
      return;
    }
    const token = header.replace(BEARER_PREFIX, '').trim();
    const providedDigest = createHash('sha256').update(token, 'utf8').digest();
    if (!timingSafeEqual(providedDigest, expectedDigest)) {
      logger?.warn('rejected request: invalid bearer token', { ip: req.ip });
      res.status(401).json(jsonRpcError(JSON_RPC_INVALID_REQUEST, 'invalid bearer token'));
      return;
    }
    next();
  };
}
