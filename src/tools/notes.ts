import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { NOTE_TYPES } from '../hydrawise/api.js';
import type { HydrawiseApi } from '../hydrawise/api.js';
import type { Logger } from '../logger.js';
import { nonNull, serializeNote } from './serializers.js';
import { jsonResult, previewOrApply, runTool } from './_helpers.js';

const PHYSICAL = 'PHYSICAL ACTION:';

// Zod enum derived from NOTE_TYPES in api.ts — single source of truth.
// Adding a value to NOTE_TYPES propagates to NoteType, isNoteType, and this Zod
// schema simultaneously; the three cannot drift.
const NoteTypeEnum = z.enum(NOTE_TYPES);

const ListControllerNotesInput = { controller_id: z.number().int() };
const ListZoneNotesInput = { zone_id: z.number().int() };

const CreateControllerNoteInput = {
  controller_id: z.number().int(),
  note: z.string(),
  type: NoteTypeEnum,
  pinned_to_top: z.boolean().optional(),
  preview: z.boolean().optional(),
};

const UpdateControllerNoteInput = {
  note_id: z.number().int(),
  controller_id: z.number().int(),
  note: z.string(),
  type: NoteTypeEnum,
  pinned_to_top: z.boolean().optional(),
  preview: z.boolean().optional(),
};

const DeleteNoteInput = {
  note_id: z.number().int(),
  preview: z.boolean().optional(),
};

const CreateZoneNoteInput = {
  zone_id: z.number().int(),
  note: z.string(),
  type: NoteTypeEnum,
  pinned_to_top: z.boolean().optional(),
  preview: z.boolean().optional(),
};

const UpdateZoneNoteInput = {
  note_id: z.number().int(),
  zone_id: z.number().int(),
  note: z.string(),
  type: NoteTypeEnum,
  pinned_to_top: z.boolean().optional(),
  preview: z.boolean().optional(),
};

export function registerNotesTools(server: McpServer, api: HydrawiseApi, logger?: Logger): void {
  const wrap = (toolName: string, fn: () => Promise<ReturnType<typeof jsonResult>>) =>
    runTool(fn, { logger, toolName });

  server.registerTool(
    'list_controller_notes',
    {
      description:
        'List user-written notes attached to a controller. Each note has id, note, type (fault | location | repair | comment), pinned_to_top, last_updated_at.',
      inputSchema: ListControllerNotesInput,
    },
    async ({ controller_id }) =>
      wrap('list_controller_notes', async () => {
        const controller = await api.getController(controller_id);
        return jsonResult(nonNull(controller.controllerNotes).map(serializeNote));
      }),
  );

  server.registerTool(
    'list_zone_notes',
    {
      description:
        'List user-written notes attached to a single zone. Same shape as list_controller_notes.',
      inputSchema: ListZoneNotesInput,
    },
    async ({ zone_id }) =>
      wrap('list_zone_notes', async () => {
        const zone = await api.getZoneFull(zone_id);
        return jsonResult(nonNull(zone.zoneNotes).map(serializeNote));
      }),
  );

  server.registerTool(
    'create_controller_note',
    {
      description: `${PHYSICAL} attach a note to a controller. type must be one of fault | location | repair | comment. Pass \`preview: true\` to dry-run.`,
      inputSchema: CreateControllerNoteInput,
    },
    async ({ controller_id, note, type, pinned_to_top, preview }) =>
      wrap('create_controller_note', async () =>
        previewOrApply(
          'createControllerNote',
          { controller_id, note, type, pinned_to_top: pinned_to_top ?? false },
          preview,
          async () => serializeNote(await api.createControllerNote(controller_id, { note, type, pinned_to_top })),
        ),
      ),
  );

  server.registerTool(
    'update_controller_note',
    {
      description: `${PHYSICAL} update an existing controller note. Pass \`preview: true\` to dry-run.`,
      inputSchema: UpdateControllerNoteInput,
    },
    async ({ note_id, controller_id, note, type, pinned_to_top, preview }) =>
      wrap('update_controller_note', async () =>
        previewOrApply(
          'updateControllerNote',
          { note_id, controller_id, note, type, pinned_to_top: pinned_to_top ?? false },
          preview,
          async () => serializeNote(await api.updateControllerNote(note_id, controller_id, { note, type, pinned_to_top })),
        ),
      ),
  );

  server.registerTool(
    'delete_controller_note',
    {
      description: `${PHYSICAL} delete a controller note. Pass \`preview: true\` to dry-run.`,
      inputSchema: DeleteNoteInput,
    },
    async ({ note_id, preview }) =>
      wrap('delete_controller_note', async () =>
        previewOrApply('deleteControllerNote', { note_id }, preview, async () =>
          api.deleteControllerNote(note_id),
        ),
      ),
  );

  server.registerTool(
    'create_zone_note',
    {
      description: `${PHYSICAL} attach a note to a single zone. type must be one of fault | location | repair | comment. Pass \`preview: true\` to dry-run.`,
      inputSchema: CreateZoneNoteInput,
    },
    async ({ zone_id, note, type, pinned_to_top, preview }) =>
      wrap('create_zone_note', async () =>
        previewOrApply(
          'createZoneNote',
          { zone_id, note, type, pinned_to_top: pinned_to_top ?? false },
          preview,
          async () => serializeNote(await api.createZoneNote(zone_id, { note, type, pinned_to_top })),
        ),
      ),
  );

  server.registerTool(
    'update_zone_note',
    {
      description: `${PHYSICAL} update an existing zone note. Pass \`preview: true\` to dry-run.`,
      inputSchema: UpdateZoneNoteInput,
    },
    async ({ note_id, zone_id, note, type, pinned_to_top, preview }) =>
      wrap('update_zone_note', async () =>
        previewOrApply(
          'updateZoneNote',
          { note_id, zone_id, note, type, pinned_to_top: pinned_to_top ?? false },
          preview,
          async () => serializeNote(await api.updateZoneNote(note_id, zone_id, { note, type, pinned_to_top })),
        ),
      ),
  );

  server.registerTool(
    'delete_zone_note',
    {
      description: `${PHYSICAL} delete a zone note. Pass \`preview: true\` to dry-run.`,
      inputSchema: DeleteNoteInput,
    },
    async ({ note_id, preview }) =>
      wrap('delete_zone_note', async () =>
        previewOrApply('deleteZoneNote', { note_id }, preview, async () =>
          api.deleteZoneNote(note_id),
        ),
      ),
  );
}
