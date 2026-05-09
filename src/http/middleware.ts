import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const JSON_RPC_PARSE_ERROR = -32700;
const JSON_RPC_INVALID_REQUEST = -32600;
const BEARER_PREFIX = /^Bearer\s+/i;

function jsonRpcError(code: number, message: string) {
  return { jsonrpc: '2.0', id: null, error: { code, message } };
}

export function originGuard(allowedOrigins: string[] | null) {
  const explicit = allowedOrigins?.map((o) => o.toLowerCase()) ?? null;
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    if (!origin) {
      next();
      return;
    }
    if (explicit) {
      if (explicit.includes(origin.toLowerCase())) {
        next();
        return;
      }
      res
        .status(403)
        .json(jsonRpcError(JSON_RPC_INVALID_REQUEST, `origin not allowed: ${origin}`));
      return;
    }
    if (isLoopbackOrigin(origin)) {
      next();
      return;
    }
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

export function hostGuard(boundHost: string, _boundPort: number) {
  const expectedHostnames = new Set<string>();
  if (boundHost === '0.0.0.0' || boundHost === '::') {
    for (const h of LOOPBACK_HOSTS) expectedHostnames.add(stripBrackets(h).toLowerCase());
  } else {
    expectedHostnames.add(boundHost.toLowerCase());
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const host = req.get('host');
    if (!host) {
      res.status(403).json(jsonRpcError(JSON_RPC_INVALID_REQUEST, 'missing Host header'));
      return;
    }
    const hostname = parseHostname(host);
    if (hostname && expectedHostnames.has(hostname.toLowerCase())) {
      next();
      return;
    }
    res.status(403).json(jsonRpcError(JSON_RPC_INVALID_REQUEST, `host not allowed: ${host}`));
  };
}

function stripBrackets(s: string): string {
  return s.startsWith('[') && s.endsWith(']') ? s.slice(1, -1) : s;
}

function parseHostname(hostHeader: string): string | null {
  // Bracketed IPv6: [::1]:port  or  [::1]
  if (hostHeader.startsWith('[')) {
    const end = hostHeader.indexOf(']');
    return end > 0 ? hostHeader.slice(1, end) : null;
  }
  const colon = hostHeader.lastIndexOf(':');
  // No colon, or a colon that is part of a bare IPv6 (multiple colons) → take whole thing
  const firstColon = hostHeader.indexOf(':');
  if (colon === -1) return hostHeader;
  if (firstColon !== colon) return hostHeader; // bare IPv6, no port
  return hostHeader.slice(0, colon);
}

export function bearerGuard(authToken: string | null) {
  if (!authToken) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  const expected = Buffer.from(authToken, 'utf8');
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.get('authorization');
    if (!header) {
      res.status(401).json(jsonRpcError(JSON_RPC_PARSE_ERROR, 'missing Authorization header'));
      return;
    }
    if (!BEARER_PREFIX.test(header)) {
      res.status(401).json(jsonRpcError(JSON_RPC_PARSE_ERROR, 'malformed Authorization header'));
      return;
    }
    const token = header.replace(BEARER_PREFIX, '').trim();
    const provided = Buffer.from(token, 'utf8');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      res.status(401).json(jsonRpcError(JSON_RPC_PARSE_ERROR, 'invalid bearer token'));
      return;
    }
    next();
  };
}
