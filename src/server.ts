import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { config as loadDotenv } from 'dotenv';
import express from 'express';
import { loadConfig, type Config } from './config.js';
import { ConfigError } from './errors.js';
import { Auth } from './hydrawise/auth.js';
import { HydrawiseApi } from './hydrawise/api.js';
import { getClient } from './hydrawise/client.js';
import { bearerGuard, hostGuard, originGuard } from './http/middleware.js';
import { SessionRegistry } from './http/sessions.js';
import { createLogger, type Logger } from './logger.js';
import { registerBackupTools } from './tools/backup.js';
import { registerControlTools } from './tools/control.js';
import { registerSchedulingTools } from './tools/scheduling.js';
import { registerStatusTools } from './tools/status.js';

const PROTOCOL_VERSION = '2025-11-25';
const PACKAGE_VERSION = '0.2.0';

export function buildMcpServer(api: HydrawiseApi): McpServer {
  const server = new McpServer({
    name: 'hydrowise-mcp',
    version: PACKAGE_VERSION,
  });
  registerStatusTools(server, api);
  registerControlTools(server, api);
  registerSchedulingTools(server, api);
  registerBackupTools(server, api);
  return server;
}

export function buildApp(
  cfg: Config,
  serverFactory: () => McpServer,
  logger: Logger,
): express.Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(originGuard(cfg.allowedOrigins));
  app.use(hostGuard(cfg.host, cfg.port));
  app.use(bearerGuard(cfg.authToken));

  const sessions = new SessionRegistry(cfg.sessionTtlSeconds * 1000);

  const handler: express.RequestHandler = async (req, res) => {
    const sessionHeader = req.get('mcp-session-id');

    if (req.method === 'POST') {
      if (sessionHeader) {
        const transport = sessions.get(sessionHeader);
        if (!transport) {
          res.status(404).json({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32001, message: `unknown session id: ${sessionHeader}` },
          });
          return;
        }
        await transport.handleRequest(req, res, req.body);
        return;
      }

      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'first request without MCP-Session-Id must be an initialize request',
          },
        });
        return;
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.register(sid, transport);
          logger.info('mcp session initialized', { sessionId: sid });
        },
      });
      const sessionServer = serverFactory();
      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
          logger.info('mcp session closed', { sessionId: transport.sessionId });
        }
        // sessionServer is captured by this closure; releasing it here lets
        // GC reclaim the McpServer once the transport is fully unwound.
      };
      await sessionServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (req.method === 'GET' || req.method === 'DELETE') {
      if (!sessionHeader) {
        res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'MCP-Session-Id header required' },
        });
        return;
      }
      const transport = sessions.get(sessionHeader);
      if (!transport) {
        res.status(404).json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32001, message: `unknown session id: ${sessionHeader}` },
        });
        return;
      }
      await transport.handleRequest(req, res);
      return;
    }

    res.set('Allow', 'GET, POST, DELETE').status(405).end();
  };

  app.all('/mcp', handler);
  return app;
}

export async function main(): Promise<void> {
  if (process.stdin.isTTY && existsSync('.env')) {
    loadDotenv();
  }

  let cfg: Config;
  try {
    cfg = loadConfig();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`config error: ${msg}\n`);
    process.exit(1);
  }

  const logger = createLogger(cfg.logLevel);
  const auth = new Auth(cfg.username, cfg.password);
  const api = new HydrawiseApi(getClient(auth));
  const app = buildApp(cfg, () => buildMcpServer(api), logger);

  const httpServer = app.listen(cfg.port, cfg.host, () => {
    process.stderr.write(
      `hydrowise-mcp listening on http://${cfg.host}:${cfg.port}/mcp (MCP ${PROTOCOL_VERSION})\n`,
    );
  });

  const shutdown = (signal: string) => {
    logger.info(`received ${signal}, shutting down`);
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    process.stderr.write(`unhandled rejection: ${String(reason)}\n`);
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    process.stderr.write(`uncaught exception: ${err.stack ?? err.message}\n`);
    process.exit(1);
  });
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  // Using void to satisfy no-floating-promises
  void main();
}

// Re-export for tests
export { ConfigError };
