import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { config as loadDotenv } from 'dotenv';
import express from 'express';
import { loadConfig, type Config } from './config.js';
import { Auth } from './hydrawise/auth.js';
import { HydrawiseApi } from './hydrawise/api.js';
import { getClient } from './hydrawise/client.js';
import { bearerGuard, hostGuard, originGuard } from './http/middleware.js';
import { SessionRegistry } from './http/sessions.js';
import { createLogger, type Logger } from './logger.js';
import { registerBackupTools } from './tools/backup.js';
import { registerControlTools } from './tools/control.js';
import { registerReportingTools } from './tools/reporting.js';
import { registerSchedulingTools } from './tools/scheduling.js';
import { registerStatusTools } from './tools/status.js';

const PROTOCOL_VERSION = '2025-11-25';
const PACKAGE_VERSION = '0.3.0';
const JSON_RPC_INTERNAL_ERROR = -32603;

export function buildMcpServer(api: HydrawiseApi, logger?: Logger): McpServer {
  const server = new McpServer({
    name: 'hydrowise-mcp',
    version: PACKAGE_VERSION,
  });
  registerStatusTools(server, api, logger);
  registerControlTools(server, api, logger);
  registerSchedulingTools(server, api, logger);
  registerBackupTools(server, api, logger);
  registerReportingTools(server, api, logger);
  return server;
}

export interface BuildAppHandle {
  app: express.Express;
  sessions: SessionRegistry;
}

export function buildApp(
  cfg: Config,
  serverFactory: () => McpServer,
  logger: Logger,
): express.Express {
  return buildAppWithSessions(cfg, serverFactory, logger).app;
}

export function buildAppWithSessions(
  cfg: Config,
  serverFactory: () => McpServer,
  logger: Logger,
): BuildAppHandle {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(originGuard(cfg.allowedOrigins, logger));
  app.use(hostGuard(cfg.host, cfg.port, logger));
  app.use(bearerGuard(cfg.authToken, logger));

  const sessions = new SessionRegistry(cfg.sessionTtlSeconds * 1000, logger);

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
        // Don't call sessionServer.close() — Server.close() → transport.close() → onclose recursion. Let GC reclaim it.
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

  const wrappedHandler: express.RequestHandler = (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('request handler failed', { message, stack: err instanceof Error ? err.stack : undefined });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          id: null,
          error: { code: JSON_RPC_INTERNAL_ERROR, message: `internal error: ${message}` },
        });
      } else {
        res.end();
      }
    });
  };

  app.all('/mcp', wrappedHandler);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('unhandled middleware error', { message });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: JSON_RPC_INTERNAL_ERROR, message: `internal error: ${message}` },
      });
    }
  });
  return { app, sessions };
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
  const { app, sessions } = buildAppWithSessions(cfg, () => buildMcpServer(api, logger), logger);

  const httpServer = app.listen(cfg.port, cfg.host, () => {
    process.stderr.write(
      `hydrowise-mcp listening on http://${cfg.host}:${cfg.port}/mcp (MCP ${PROTOCOL_VERSION})\n`,
    );
  });

  let shuttingDown = false;
  const shutdown = (signal: string, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`received ${signal}, shutting down`);
    const force = setTimeout(() => process.exit(exitCode === 0 ? 1 : exitCode), 5000);
    force.unref();
    sessions
      .closeAll()
      .catch((err) => logger.warn('error closing sessions during shutdown', { error: String(err) }))
      .finally(() => {
        httpServer.close(() => process.exit(exitCode));
      });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', {
      reason: reason instanceof Error ? reason.stack ?? reason.message : String(reason),
    });
    shutdown('unhandledRejection', 1);
  });
  process.on('uncaughtException', (err) => {
    logger.error('uncaught exception', { stack: err.stack ?? err.message });
    shutdown('uncaughtException', 1);
  });
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  void main();
}
