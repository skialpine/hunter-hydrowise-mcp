import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ConfigError } from '../errors.js';
import type { HydrawiseApi } from '../hydrawise/api.js';
import type { Logger } from '../logger.js';
import {
  serializeLocation,
  serializeMasterValve,
} from './serializers.js';
import { jsonResult, previewOrApply, runTool } from './_helpers.js';

const PHYSICAL = 'PHYSICAL ACTION:';

const MonitoringMethodEnum = z.enum(['MANUAL', 'LEARN_FROM_NEXT_RUN'] as const);
const ProgramModeEnum = z.enum(['STANDARD', 'ADVANCED'] as const);

const UpdateLocationInput = {
  controller_id: z.number().int(),
  device_id: z.number().int(),
  address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  preview: z.boolean().optional(),
};

const UpdateControllerMasterValveInput = {
  controller_id: z.number().int(),
  zone_number: z.number().int(),
  preview: z.boolean().optional(),
};

const UpdateControllerProgramModeInput = {
  controller_id: z.number().int(),
  program_mode: ProgramModeEnum,
  preview: z.boolean().optional(),
};

const ControllerOnlyInput = {
  controller_id: z.number().int(),
  preview: z.boolean().optional(),
};

const CreateExpanderInput = {
  controller_id: z.number().int(),
  name: z.string(),
  number: z.number().int(),
  preview: z.boolean().optional(),
};

const UpdateExpanderInput = {
  expander_id: z.number().int(),
  name: z.string(),
  number: z.number().int(),
  preview: z.boolean().optional(),
};

const DeleteExpanderInput = {
  expander_id: z.number().int(),
  preview: z.boolean().optional(),
};

// Zone CRUD payload mirrors update_zone_settings minus zone_id, plus controller_id.
const CreateZoneInput = {
  controller_id: z.number().int(),
  name: z.string(),
  number: z.number().int(),
  watering_mode: z.number().int(),
  global_master_valve: z.number().int(),
  schedule_adjustment_ids: z.array(z.number().int()),
  watering_adjustment: z.number().int(),
  watering_type: z.number().int(),
  watering_frequency_mode: z.number().int(),
  icon: z.number().int().nullable().optional(),
  run_time: z.number().int().nullable().optional(),
  fixed_watering_frequency: z.number().int().nullable().optional(),
  smart_watering_frequency: z.number().int().nullable().optional(),
  virtual_solar_sync_watering_frequency: z.number().int().nullable().optional(),
  run_next_available_start_time: z.boolean().nullable().optional(),
  pre_configured_watering_schedule_id: z.number().int().nullable().optional(),
  cycle_soak_enable: z.boolean().nullable().optional(),
  cycle_custom_time: z.number().int().nullable().optional(),
  soak_custom_time: z.number().int().nullable().optional(),
  factors: z.array(z.number().int()).nullable().optional(),
  sensor_ids: z.array(z.number().int()).nullable().optional(),
  reusable_schedule: z.boolean().nullable().optional(),
  reusable_schedule_name: z.string().nullable().optional(),
  flow_monitoring_method: MonitoringMethodEnum.nullable().optional(),
  current_monitoring_method: MonitoringMethodEnum.nullable().optional(),
  flow_monitoring_value: z.number().nullable().optional(),
  current_monitoring_value: z.number().int().nullable().optional(),
  preview: z.boolean().optional(),
};

const DeleteZoneInput = {
  zone_id: z.number().int(),
  preview: z.boolean().optional(),
};

export function registerControllerConfigTools(
  server: McpServer,
  api: HydrawiseApi,
  logger?: Logger,
): void {
  const wrap = (toolName: string, fn: () => Promise<ReturnType<typeof jsonResult>>) =>
    runTool(fn, { logger, toolName });

  server.registerTool(
    'update_location',
    {
      description: `${PHYSICAL} update the controller's geolocation (address, coordinates, or both). Required for Virtual Solar Sync to look up local weather. Provide \`device_id\` (from the snapshot's \`controller.device_id\` — distinct from \`controller.id\`) plus at least one of \`address\` or both of \`latitude\`/\`longitude\`. When both address and coords are provided, dispatches both upstream mutations. Pass \`preview: true\` to dry-run.`,
      inputSchema: UpdateLocationInput,
    },
    async (input) =>
      wrap('update_location', async () => {
        // controller_id is collected for context (snapshot/restore plumbing) but the upstream mutations key off device_id only.
        const { preview, controller_id: _controllerId, ...rest } = input;
        void _controllerId;
        const hasAddress = typeof rest.address === 'string' && rest.address.length > 0;
        const hasCoords = typeof rest.latitude === 'number' && typeof rest.longitude === 'number';
        if (!hasAddress && !hasCoords) {
          throw new ConfigError('update_location requires at least one of address, latitude+longitude');
        }
        return previewOrApply('updateLocation', rest, preview, async () => {
          const result = await api.updateLocation({
            device_id: rest.device_id,
            address: rest.address,
            latitude: rest.latitude,
            longitude: rest.longitude,
          });
          return serializeLocation(result);
        });
      }),
  );

  server.registerTool(
    'update_controller_master_valve',
    {
      description: `${PHYSICAL} assign a controller's master valve by zone number. Pass \`preview: true\` to dry-run.`,
      inputSchema: UpdateControllerMasterValveInput,
    },
    async ({ controller_id, zone_number, preview }) =>
      wrap('update_controller_master_valve', async () =>
        previewOrApply(
          'updateControllerMasterValve',
          { controller_id, zone_number },
          preview,
          async () => serializeMasterValve(await api.updateControllerMasterValve(controller_id, zone_number)),
        ),
      ),
  );

  server.registerTool(
    'update_controller_program_mode',
    {
      description: `${PHYSICAL} switch the controller between STANDARD and ADVANCED programming modes. Mode switches discard schedule state belonging to the prior mode — use cautiously. Pass \`preview: true\` to dry-run.`,
      inputSchema: UpdateControllerProgramModeInput,
    },
    async ({ controller_id, program_mode, preview }) =>
      wrap('update_controller_program_mode', async () =>
        previewOrApply(
          'updateControllerProgramMode',
          { controller_id, program_mode },
          preview,
          async () => api.updateControllerProgramMode(controller_id, program_mode),
        ),
      ),
  );

  server.registerTool(
    'hibernate_controller',
    {
      description: `${PHYSICAL} put the controller into hibernation (no scheduled runs). Use \`wake_controller\` to resume. Pass \`preview: true\` to dry-run.`,
      inputSchema: ControllerOnlyInput,
    },
    async ({ controller_id, preview }) =>
      wrap('hibernate_controller', async () =>
        previewOrApply('hibernateController', { controller_id }, preview, async () =>
          api.hibernateController(controller_id),
        ),
      ),
  );

  server.registerTool(
    'wake_controller',
    {
      description: `${PHYSICAL} wake a hibernated controller, restoring scheduled runs. Pass \`preview: true\` to dry-run.`,
      inputSchema: ControllerOnlyInput,
    },
    async ({ controller_id, preview }) =>
      wrap('wake_controller', async () =>
        previewOrApply('wakeController', { controller_id }, preview, async () =>
          api.wakeController(controller_id),
        ),
      ),
  );

  server.registerTool(
    'create_expander',
    {
      description: `${PHYSICAL} register a hardware expander (e.g. for zones beyond the controller's built-in count). Pass \`preview: true\` to dry-run.`,
      inputSchema: CreateExpanderInput,
    },
    async ({ controller_id, name, number, preview }) =>
      wrap('create_expander', async () =>
        previewOrApply(
          'createExpander',
          { controller_id, name, number },
          preview,
          async () => api.createExpander({ controller_id, name, number }),
        ),
      ),
  );

  server.registerTool(
    'update_expander',
    {
      description: `${PHYSICAL} rename / renumber an existing hardware expander. Pass \`preview: true\` to dry-run.`,
      inputSchema: UpdateExpanderInput,
    },
    async ({ expander_id, name, number, preview }) =>
      wrap('update_expander', async () =>
        previewOrApply(
          'updateExpander',
          { expander_id, name, number },
          preview,
          async () => api.updateExpander({ expander_id, name, number }),
        ),
      ),
  );

  server.registerTool(
    'delete_expander',
    {
      description: `${PHYSICAL} remove a hardware expander. Zones on the expander become unaddressable. Irreversible. Pass \`preview: true\` to dry-run.`,
      inputSchema: DeleteExpanderInput,
    },
    async ({ expander_id, preview }) =>
      wrap('delete_expander', async () =>
        previewOrApply('deleteExpander', { expander_id }, preview, async () =>
          api.deleteExpander(expander_id),
        ),
      ),
  );

  server.registerTool(
    'create_zone',
    {
      description: `${PHYSICAL} create a new zone on the controller via \`createZoneAdvanced\`. Same writable shape as \`update_zone_settings\` minus \`zone_id\` and plus \`controller_id\`. Pass \`preview: true\` to dry-run.`,
      inputSchema: CreateZoneInput,
    },
    async (input) =>
      wrap('create_zone', async () => {
        const { preview, ...partial } = input;
        const payload = {
          controller_id: partial.controller_id,
          name: partial.name,
          number: partial.number,
          watering_mode: partial.watering_mode,
          global_master_valve: partial.global_master_valve,
          schedule_adjustment_ids: partial.schedule_adjustment_ids,
          watering_adjustment: partial.watering_adjustment,
          watering_type: partial.watering_type,
          watering_frequency_mode: partial.watering_frequency_mode,
          icon: partial.icon ?? null,
          run_time: partial.run_time ?? null,
          fixed_watering_frequency: partial.fixed_watering_frequency ?? null,
          smart_watering_frequency: partial.smart_watering_frequency ?? null,
          virtual_solar_sync_watering_frequency:
            partial.virtual_solar_sync_watering_frequency ?? null,
          run_next_available_start_time: partial.run_next_available_start_time ?? null,
          pre_configured_watering_schedule_id: partial.pre_configured_watering_schedule_id ?? null,
          cycle_soak_enable: partial.cycle_soak_enable ?? null,
          cycle_custom_time: partial.cycle_custom_time ?? null,
          soak_custom_time: partial.soak_custom_time ?? null,
          factors: partial.factors ?? null,
          sensor_ids: partial.sensor_ids ?? null,
          reusable_schedule: partial.reusable_schedule ?? null,
          reusable_schedule_name: partial.reusable_schedule_name ?? null,
          flow_monitoring_method: partial.flow_monitoring_method ?? null,
          current_monitoring_method: partial.current_monitoring_method ?? null,
          flow_monitoring_value: partial.flow_monitoring_value ?? null,
          current_monitoring_value: partial.current_monitoring_value ?? null,
        };
        return previewOrApply('createZoneAdvanced', payload, preview, async () =>
          api.createZoneAdvanced(payload),
        );
      }),
  );

  server.registerTool(
    'delete_zone',
    {
      description: `${PHYSICAL} delete a zone from the controller. Irreversible — the zone's run history, settings, and sensor associations are removed. Pass \`preview: true\` to dry-run.`,
      inputSchema: DeleteZoneInput,
    },
    async ({ zone_id, preview }) =>
      wrap('delete_zone', async () =>
        previewOrApply('deleteZone', { zone_id }, preview, async () => api.deleteZone(zone_id)),
      ),
  );
}
