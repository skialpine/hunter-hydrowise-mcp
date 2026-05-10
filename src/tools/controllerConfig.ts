import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ConfigError } from '../errors.js';
import { CONTROLLER_PROGRAM_MODES, type HydrawiseApi } from '../hydrawise/api.js';
import { MONITORING_METHODS } from '../hydrawise/queries.js';
import type { Logger } from '../logger.js';
import {
  serializeLocation,
  serializeMasterValve,
} from './serializers.js';
import { jsonResult, previewOrApply, runTool } from './_helpers.js';

const PHYSICAL = 'PHYSICAL ACTION:';

// Zod enums derived from the runtime tuples in queries.ts / api.ts — single source
// of truth (see NOTE_TYPES / CUSTOM_SENSOR_TYPES for the same idiom).
const MonitoringMethodEnum = z.enum(MONITORING_METHODS);
const ProgramModeEnum = z.enum(CONTROLLER_PROGRAM_MODES);

const UpdateLocationInput = {
  controller_id: z.number().int(),
  // device_id is intentionally NOT accepted as input — looked up server-side from controller_id
  // so the AI cannot accidentally pass a stale device_id from another controller's snapshot.
  address: z.string().min(1).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
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
  watering_adjustment_percent: z.number().int().describe('Zone-level watering adjustment, in percent (createZoneAdvanced.wateringAdjustment Int).'),
  watering_type: z.number().int(),
  watering_frequency_mode: z.number().int(),
  icon: z.number().int().nullable().optional(),
  run_time_minutes: z.number().int().nullable().optional().describe('Per-zone run-time override, in minutes (createZoneAdvanced.runTime Int).'),
  fixed_watering_frequency_minutes: z.number().int().nullable().optional().describe('Fixed-program repeat interval, in minutes (createZoneAdvanced.fixedWateringFrequency Int).'),
  smart_watering_frequency_seconds: z.number().int().nullable().optional().describe('Smart-program repeat interval, in seconds (createZoneAdvanced.smartWateringFrequency Int; default 86400 = 24 h).'),
  virtual_solar_sync_watering_frequency_minutes: z.number().int().nullable().optional().describe('Virtual Solar Sync repeat interval, in minutes (createZoneAdvanced.virtualSolarSyncWateringFrequency Int).'),
  run_next_available_start_time: z.boolean().nullable().optional(),
  pre_configured_watering_schedule_id: z.number().int().nullable().optional(),
  cycle_soak_enable: z.boolean().nullable().optional(),
  cycle_custom_time_minutes: z.number().int().nullable().optional().describe('Cycle duration for cycle-and-soak, in minutes (CycleAndSoakSettings.cycleDuration Int).'),
  soak_custom_time_minutes: z.number().int().nullable().optional().describe('Soak duration for cycle-and-soak, in minutes (CycleAndSoakSettings.soakDuration Int).'),
  monthly_adjustment_percents: z.array(z.number().int()).nullable().optional().describe('12 monthly watering adjustment factors Jan–Dec, in percent (createZoneAdvanced.factors [Int]).'),
  sensor_ids: z.array(z.number().int()).nullable().optional(),
  reusable_schedule: z.boolean().nullable().optional(),
  reusable_schedule_name: z.string().nullable().optional(),
  flow_monitoring_method: MonitoringMethodEnum.nullable().optional(),
  current_monitoring_method: MonitoringMethodEnum.nullable().optional(),
  flow_monitoring_value: z.number().nullable().optional().describe('Flow monitoring baseline, in account-preferred units (createZoneAdvanced.flowMonitoringValue Float).'),
  current_monitoring_value: z.number().int().nullable().optional().describe('Current monitoring baseline, in account-preferred units (createZoneAdvanced.currentMonitoringValue Int).'),
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
      description: `${PHYSICAL} update the controller's geolocation (address, coordinates, or both). Required for Virtual Solar Sync to look up local weather. Pass \`controller_id\` plus at least one of \`address\` or both of \`latitude\`/\`longitude\`. The controller's \`device_id\` (distinct from id, required by the upstream mutations) is resolved server-side — you don't pass it. When both address and coords are provided, both upstream mutations dispatch sequentially; if the second one fails after the first commits, the partial state is surfaced explicitly. Pass \`preview: true\` to dry-run.`,
      inputSchema: UpdateLocationInput,
    },
    async (input) =>
      wrap('update_location', async () => {
        const { preview, controller_id, address, latitude, longitude } = input;
        const hasAddress = typeof address === 'string' && address.length > 0;
        const hasCoords = typeof latitude === 'number' && typeof longitude === 'number';
        if (!hasAddress && !hasCoords) {
          throw new ConfigError('update_location requires at least one of address, latitude+longitude');
        }
        // Resolve device_id from controller — the AI never sees / supplies it, eliminating the
        // "wrong-controller via copy-pasted device_id" failure mode.
        const controller = await api.getController(controller_id);
        const planned = { controller_id, device_id: controller.deviceId, address, latitude, longitude };
        return previewOrApply('updateLocation', planned, preview, async () => {
          const result = await api.updateLocation({
            device_id: controller.deviceId,
            address,
            latitude,
            longitude,
          });
          return serializeLocation(result);
        });
      }),
  );

  server.registerTool(
    'update_controller_master_valve',
    {
      description: `${PHYSICAL} assign a controller's master valve by zone number. Per the schema's \`Zone.masterValve\` doc: pass \`zone_number: -1\` to accept the controller's global default; \`0\` to force always-disabled (overrides the global setting); any other integer designates that zone as the master valve. Pass \`preview: true\` to dry-run.`,
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
      description: `${PHYSICAL} switch the controller between STANDARD and ADVANCED programming modes. The two modes use different schedule data structures (Standard has shared programs with per-zone run-times; Advanced has per-zone watering programs); switching modes may invalidate or hide prior-mode schedule data — verify with \`list_programs\` after switching, and re-create the schedule for the new mode if needed. Pass \`preview: true\` to dry-run.`,
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
      description: `${PHYSICAL} remove a hardware expander. Irreversible — the expander disappears from \`list_controllers\` / snapshot. Verify with the snapshot before relying on the deletion. Pass \`preview: true\` to dry-run.`,
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
          watering_adjustment_percent: partial.watering_adjustment_percent,
          watering_type: partial.watering_type,
          watering_frequency_mode: partial.watering_frequency_mode,
          icon: partial.icon ?? null,
          run_time_minutes: partial.run_time_minutes ?? null,
          fixed_watering_frequency_minutes: partial.fixed_watering_frequency_minutes ?? null,
          smart_watering_frequency_seconds: partial.smart_watering_frequency_seconds ?? null,
          virtual_solar_sync_watering_frequency_minutes:
            partial.virtual_solar_sync_watering_frequency_minutes ?? null,
          run_next_available_start_time: partial.run_next_available_start_time ?? null,
          pre_configured_watering_schedule_id: partial.pre_configured_watering_schedule_id ?? null,
          cycle_soak_enable: partial.cycle_soak_enable ?? null,
          cycle_custom_time_minutes: partial.cycle_custom_time_minutes ?? null,
          soak_custom_time_minutes: partial.soak_custom_time_minutes ?? null,
          monthly_adjustment_percents: partial.monthly_adjustment_percents ?? null,
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
      description: `${PHYSICAL} delete a zone from the controller. Irreversible — the zone disappears from \`list_zones\`. Any sensor that referenced this zone will silently lose the association on its next read; verify with \`list_sensors\` (Phase 2) and \`list_zones\` after. Pass \`preview: true\` to dry-run.`,
      inputSchema: DeleteZoneInput,
    },
    async ({ zone_id, preview }) =>
      wrap('delete_zone', async () =>
        previewOrApply('deleteZone', { zone_id }, preview, async () => api.deleteZone(zone_id)),
      ),
  );
}
