import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HydrawiseApi } from '../hydrawise/api.js';
import type { Logger } from '../logger.js';
import { jsonResult, runTool } from './_helpers.js';
import { serializeController, serializeUser, serializeZone } from './serializers.js';

const ControllerIdInput = { controller_id: z.number().int() };
const ZoneIdInput = { zone_id: z.number().int() };

export function registerStatusTools(server: McpServer, api: HydrawiseApi, logger?: Logger): void {
  server.registerTool(
    'get_user',
    {
      description: 'Return the authenticated Hydrawise user (id, name, email).',
    },
    async () =>
      runTool(async () => jsonResult(serializeUser(await api.getUser())), { logger, toolName: 'get_user' }),
  );

  server.registerTool(
    'list_controllers',
    {
      description:
        'List every controller on the authenticated Hydrawise account. Returns id, name, online status, serial number, and last contact time per controller.',
    },
    async () =>
      runTool(
        async () => {
          const controllers = await api.getControllers();
          return jsonResult(controllers.map(serializeController));
        },
        { logger, toolName: 'list_controllers' },
      ),
  );

  server.registerTool(
    'get_controller',
    {
      description: 'Return a single controller by its integer id.',
      inputSchema: ControllerIdInput,
    },
    async ({ controller_id }) =>
      runTool(
        async () => jsonResult(serializeController(await api.getController(controller_id))),
        { logger, toolName: 'get_controller' },
      ),
  );

  server.registerTool(
    'list_zones',
    {
      description:
        'List the zones on a controller. Returns id, name, and zone number per zone — call get_zone_settings for richer per-zone state (cycle/soak, monitoring observed values).',
      inputSchema: ControllerIdInput,
    },
    async ({ controller_id }) =>
      runTool(
        async () => {
          const zones = await api.getZones(controller_id);
          return jsonResult(zones.map(serializeZone));
        },
        { logger, toolName: 'list_zones' },
      ),
  );

  server.registerTool(
    'get_zone',
    {
      description: 'Return a single zone (id, name, zone number) by its integer id.',
      inputSchema: ZoneIdInput,
    },
    async ({ zone_id }) =>
      runTool(
        async () => jsonResult(serializeZone(await api.getZone(zone_id))),
        { logger, toolName: 'get_zone' },
      ),
  );
}
