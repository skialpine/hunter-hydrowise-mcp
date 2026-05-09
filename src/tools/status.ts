import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HydrawiseApi } from '../hydrawise/api.js';
import { jsonResult, runTool } from './_helpers.js';
import { serializeController, serializeUser, serializeZone } from './serializers.js';

const ControllerIdInput = { controller_id: z.number().int() };
const ZoneIdInput = { zone_id: z.number().int() };

export function registerStatusTools(server: McpServer, api: HydrawiseApi): void {
  server.registerTool(
    'get_user',
    {
      description: 'Return the authenticated Hydrawise user (id, name, email).',
    },
    async () =>
      runTool(async () => jsonResult(serializeUser(await api.getUser()))),
  );

  server.registerTool(
    'list_controllers',
    {
      description:
        'List every controller on the authenticated Hydrawise account. Returns id, name, online status, serial number, and last contact time per controller.',
    },
    async () =>
      runTool(async () => {
        const controllers = await api.getControllers();
        return jsonResult(controllers.map(serializeController));
      }),
  );

  server.registerTool(
    'get_controller',
    {
      description: 'Return a single controller by its integer id.',
      inputSchema: ControllerIdInput,
    },
    async ({ controller_id }) =>
      runTool(async () => {
        const controller = await api.getController(controller_id);
        if (!controller) {
          return jsonResult({ error: `controller ${controller_id} not found` });
        }
        return jsonResult(serializeController(controller));
      }),
  );

  server.registerTool(
    'list_zones',
    {
      description:
        'List the zones attached to a controller. Returns id, name, zone number, suspension state, and last/next run times.',
      inputSchema: ControllerIdInput,
    },
    async ({ controller_id }) =>
      runTool(async () => {
        const zones = await api.getZones(controller_id);
        return jsonResult(zones.map(serializeZone));
      }),
  );

  server.registerTool(
    'get_zone',
    {
      description: 'Return a single zone by its integer id.',
      inputSchema: ZoneIdInput,
    },
    async ({ zone_id }) =>
      runTool(async () => {
        const zone = await api.getZone(zone_id);
        if (!zone) {
          return jsonResult({ error: `zone ${zone_id} not found` });
        }
        return jsonResult(serializeZone(zone));
      }),
  );
}
