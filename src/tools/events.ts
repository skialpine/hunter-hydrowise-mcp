import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HydrawiseApi } from '../hydrawise/api.js';
import type { Logger } from '../logger.js';
import { serializeEvent } from './serializers.js';
import { jsonResult, previewOrApply, runTool } from './_helpers.js';

const PHYSICAL = 'PHYSICAL ACTION:';

// Defaults mirror the schema's own (length 1000, page 0) so an unqualified call
// behaves the same as the upstream field.
const ListEventsInput = {
  controller_id: z.number().int(),
  length: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('Maximum events to return (schema default 1000).'),
  page: z.number().int().min(0).optional().describe('Page index, 0 = most recent.'),
};

const ListAlertEventsInput = {
  controller_id: z.number().int(),
  after: z
    .string()
    .optional()
    .describe('Opaque cursor from a previous page; omit for the first page.'),
};

export function registerEventTools(server: McpServer, api: HydrawiseApi, logger?: Logger): void {
  const wrap = (toolName: string, fn: () => Promise<ReturnType<typeof jsonResult>>) =>
    runTool(fn, { logger, toolName });

  server.registerTool(
    'list_controller_events',
    {
      description:
        "List the controller's event log: what the controller itself reported, such as connectivity changes, sensor state changes, and skipped irrigation. Each entry has a severity, a human-readable message, and an is_alert flag. Use this to explain why a run did not happen the way the schedule implies. Read-only.",
      inputSchema: ListEventsInput,
    },
    async ({ controller_id, length, page }) =>
      wrap('list_controller_events', async () => {
        const events = await api.getControllerEvents(controller_id, length ?? 1000, page ?? 0);
        return jsonResult(events.map(serializeEvent));
      }),
  );

  server.registerTool(
    'list_controller_alert_events',
    {
      description:
        "List only the alert-flagged entries of the controller's event log. Despite the upstream field being named `alerts`, these are events, not alert configuration: the alert rules themselves live on the account, not the controller. Read-only.",
      inputSchema: ListAlertEventsInput,
    },
    async ({ controller_id, after }) =>
      wrap('list_controller_alert_events', async () => {
        const events = await api.getControllerAlertEvents(controller_id, after ?? '');
        return jsonResult(events.map(serializeEvent));
      }),
  );

  server.registerTool(
    'acknowledge_event',
    {
      description: `${PHYSICAL} acknowledge a single event, clearing it from the controller's outstanding list. Takes the event's string id from \`list_controller_events\`. This changes account state but does not touch irrigation. Pass \`preview: true\` to dry-run.`,
      inputSchema: {
        controller_id: z.number().int(),
        // String, not Int: the schema types Event.id as String!.
        event_id: z.string().min(1),
        preview: z.boolean().optional(),
      },
    },
    async ({ controller_id, event_id, preview }) =>
      wrap('acknowledge_event', async () =>
        previewOrApply(
          'acknowledgeEvent',
          { eventId: event_id, controllerId: controller_id },
          preview,
          async () => api.acknowledgeEvent(event_id, controller_id),
        ),
      ),
  );

  server.registerTool(
    'acknowledge_all_events',
    {
      description: `${PHYSICAL} acknowledge every outstanding event on a controller. Scoped to one controller. Prefer \`acknowledge_event\` when you only mean to clear specific entries, since this cannot be undone selectively. Pass \`preview: true\` to dry-run.`,
      inputSchema: {
        controller_id: z.number().int(),
        preview: z.boolean().optional(),
      },
    },
    async ({ controller_id, preview }) =>
      wrap('acknowledge_all_events', async () =>
        previewOrApply('acknowledgeAllEvents', { controllerId: controller_id }, preview, async () =>
          api.acknowledgeAllEvents(controller_id),
        ),
      ),
  );
}
