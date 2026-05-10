import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HydrawiseApi } from '../hydrawise/api.js';
import { CUSTOM_SENSOR_MODE_TYPES, CUSTOM_SENSOR_TYPES } from '../hydrawise/queries.js';
import type { Logger } from '../logger.js';
import { serializeSensor, serializeSensorModel } from './serializers.js';
import { jsonResult, previewOrApply, runTool } from './_helpers.js';

const PHYSICAL = 'PHYSICAL ACTION:';

// Zod enums derived from the runtime tuples in queries.ts — single source of truth.
// Adding a new value to CUSTOM_SENSOR_TYPES / CUSTOM_SENSOR_MODE_TYPES propagates to
// both the TS literal union and the Zod runtime check; the two cannot drift.
const CustomSensorTypeEnumZ = z.enum(CUSTOM_SENSOR_TYPES);
const CustomSensorModeTypeEnumZ = z.enum(CUSTOM_SENSOR_MODE_TYPES);

const ListSensorsInput = { controller_id: z.number().int() };
const ListZoneSensorsInput = { zone_id: z.number().int() };
const ListSensorModelsInput = { controller_id: z.number().int() };

// zone_ids is required (non-empty) for create — sensor with zero zones is meaningless;
// upstream `[Int]!` would accept an empty array but Hydrawise rejects it with a 422 at
// runtime, so fail earlier with a Zod error.
const CreateSensorInput = {
  controller_id: z.number().int(),
  name: z.string().min(1),
  model_id: z.number().int(),
  input_number: z.number().int(),
  zone_ids: z.array(z.number().int()).min(1),
  preview: z.boolean().optional(),
};

// zone_ids on update is optional + nullable. Per the live schema (`[Int]`), passing
// null leaves existing zone associations alone; passing [] would explicitly clear them.
// We forbid [] here for symmetry with create — zone-clearing isn't a documented use case
// and would orphan a sensor.
const UpdateSensorInput = {
  sensor_id: z.number().int(),
  controller_id: z.number().int(),
  name: z.string().min(1),
  model_id: z.number().int(),
  input_number: z.number().int(),
  zone_ids: z.array(z.number().int()).min(1).nullable().optional(),
  preview: z.boolean().optional(),
};

const DeleteSensorInput = {
  sensor_id: z.number().int(),
  preview: z.boolean().optional(),
};

const CreateCustomSensorTypeInput = {
  customer_id: z.number().int(),
  name: z.string().min(1),
  custom_sensor_type: CustomSensorTypeEnumZ,
  mode_type: CustomSensorModeTypeEnumZ,
  delay: z.number().int().nullable().optional(),
  off_timer: z.number().int().nullable().optional(),
  flow_sensor_rate: z.number().nullable().optional(),
  preview: z.boolean().optional(),
};

const UpdateCustomSensorTypeInput = {
  custom_sensor_type_id: z.number().int(),
  customer_id: z.number().int(),
  controller_id: z.number().int(),
  name: z.string().min(1),
  custom_sensor_type: CustomSensorTypeEnumZ,
  mode_type: CustomSensorModeTypeEnumZ,
  delay: z.number().int().nullable().optional(),
  off_timer: z.number().int().nullable().optional(),
  flow_sensor_rate: z.number().nullable().optional(),
  preview: z.boolean().optional(),
};

const DeleteCustomSensorTypeInput = {
  id: z.number().int(),
  preview: z.boolean().optional(),
};

export function registerSensorTools(
  server: McpServer,
  api: HydrawiseApi,
  logger?: Logger,
): void {
  const wrap = (toolName: string, fn: () => Promise<ReturnType<typeof jsonResult>>) =>
    runTool(fn, { logger, toolName });

  server.registerTool(
    'list_sensors',
    {
      description:
        'List all sensors wired to a controller. Each entry has the writable shape (id, name, model_id, input_number, zone_ids) plus an _observed block with model details (model_name, sensor_type LEVEL_OPEN | LEVEL_CLOSED | FLOW | THRESHOLD, mode_type START | STOP | REPORT, divisor, flow_rate, off_level, off_timer, delay, active, input_label, type_label, category, customer_id). zone_ids is the array of zone IDs the sensor protects.',
      inputSchema: ListSensorsInput,
    },
    async ({ controller_id }) =>
      wrap('list_sensors', async () => {
        const sensors = await api.getControllerSensors(controller_id);
        return jsonResult(sensors.map(serializeSensor));
      }),
  );

  server.registerTool(
    'list_zone_sensors',
    {
      description:
        'List sensors that guard a single zone. Same shape as list_sensors (with zone_ids still included even though scoped to one zone — the sensor itself may guard others).',
      inputSchema: ListZoneSensorsInput,
    },
    async ({ zone_id }) =>
      wrap('list_zone_sensors', async () => {
        const sensors = await api.getZoneSensors(zone_id);
        return jsonResult(sensors.map(serializeSensor));
      }),
  );

  server.registerTool(
    'list_sensor_models',
    {
      description:
        'List the available sensor model catalog — built-in Hydrawise types (rain/soil sensors, flow meters) plus any custom types created on this account. Each entry has id, name, sensor_type, mode_type, category, calibration fields (delay, off_timer, off_level, divisor, flow_rate), and customer_id (null for built-in, non-zero for customer-owned). Use this to map a snapshot\'s sensor model.name back to the current model.id at restore time. controller_id is currently informational; the catalog is account-wide.',
      inputSchema: ListSensorModelsInput,
    },
    async ({ controller_id }) =>
      wrap('list_sensor_models', async () => {
        const models = await api.listSensorModels(controller_id);
        return jsonResult(models.map(serializeSensorModel));
      }),
  );

  server.registerTool(
    'create_sensor',
    {
      description: `${PHYSICAL} install a sensor on a controller. Pass model_id from list_sensor_models, input_number for the physical SEN-N input, and zone_ids for the zones the sensor protects. Pass \`preview: true\` to dry-run.`,
      inputSchema: CreateSensorInput,
    },
    async ({ controller_id, name, model_id, input_number, zone_ids, preview }) =>
      wrap('create_sensor', async () =>
        previewOrApply(
          'createSensor',
          { controller_id, name, model_id, input_number, zone_ids },
          preview,
          async () =>
            serializeSensor(
              await api.createSensor({
                controller_id,
                name,
                model_id,
                input_number,
                zone_ids,
              }),
            ),
        ),
      ),
  );

  server.registerTool(
    'update_sensor',
    {
      description: `${PHYSICAL} modify an existing sensor. zone_ids is full-replace when provided (the supplied array becomes the new zone-association set). Omit zone_ids or pass null to leave existing zone associations unchanged. Pass \`preview: true\` to dry-run.`,
      inputSchema: UpdateSensorInput,
    },
    async ({ sensor_id, controller_id, name, model_id, input_number, zone_ids, preview }) =>
      wrap('update_sensor', async () =>
        previewOrApply(
          'updateSensor',
          { sensor_id, controller_id, name, model_id, input_number, zone_ids: zone_ids ?? null },
          preview,
          async () =>
            serializeSensor(
              await api.updateSensor({
                sensor_id,
                controller_id,
                name,
                model_id,
                input_number,
                zone_ids: zone_ids ?? null,
              }),
            ),
        ),
      ),
  );

  server.registerTool(
    'delete_sensor',
    {
      description: `${PHYSICAL} remove a sensor by id. Zone associations are dropped automatically. Pass \`preview: true\` to dry-run.`,
      inputSchema: DeleteSensorInput,
    },
    async ({ sensor_id, preview }) =>
      wrap('delete_sensor', async () =>
        previewOrApply('deleteSensor', { sensor_id }, preview, async () => api.deleteSensor(sensor_id)),
      ),
  );

  server.registerTool(
    'create_custom_sensor_type',
    {
      description: `${PHYSICAL} create a custom sensor model on the account. customer_id is the account owner id (from get_user). custom_sensor_type must be one of LEVEL_OPEN | LEVEL_CLOSED | FLOW | THRESHOLD. mode_type must be one of START | STOP | REPORT. delay/off_timer/flow_sensor_rate are calibration fields (semantics depend on the type — flow_sensor_rate is meaningful for FLOW only). The returned SensorModel.id can immediately be passed to create_sensor as model_id. Pass \`preview: true\` to dry-run.`,
      inputSchema: CreateCustomSensorTypeInput,
    },
    async ({
      customer_id,
      name,
      custom_sensor_type,
      mode_type,
      delay,
      off_timer,
      flow_sensor_rate,
      preview,
    }) =>
      wrap('create_custom_sensor_type', async () =>
        previewOrApply(
          'createCustomSensorType',
          {
            customer_id,
            name,
            custom_sensor_type,
            mode_type,
            delay: delay ?? null,
            off_timer: off_timer ?? null,
            flow_sensor_rate: flow_sensor_rate ?? null,
          },
          preview,
          async () =>
            serializeSensorModel(
              await api.createCustomSensorType({
                customer_id,
                name,
                custom_sensor_type,
                mode_type,
                delay,
                off_timer,
                flow_sensor_rate,
              }),
            ),
        ),
      ),
  );

  server.registerTool(
    'update_custom_sensor_type',
    {
      description: `${PHYSICAL} modify an existing custom sensor model. Requires both customer_id and controller_id (the live schema requires both). Pass \`preview: true\` to dry-run.`,
      inputSchema: UpdateCustomSensorTypeInput,
    },
    async ({
      custom_sensor_type_id,
      customer_id,
      controller_id,
      name,
      custom_sensor_type,
      mode_type,
      delay,
      off_timer,
      flow_sensor_rate,
      preview,
    }) =>
      wrap('update_custom_sensor_type', async () =>
        previewOrApply(
          'updateCustomSensorType',
          {
            custom_sensor_type_id,
            customer_id,
            controller_id,
            name,
            custom_sensor_type,
            mode_type,
            delay: delay ?? null,
            off_timer: off_timer ?? null,
            flow_sensor_rate: flow_sensor_rate ?? null,
          },
          preview,
          async () =>
            serializeSensorModel(
              await api.updateCustomSensorType({
                custom_sensor_type_id,
                customer_id,
                controller_id,
                name,
                custom_sensor_type,
                mode_type,
                delay,
                off_timer,
                flow_sensor_rate,
              }),
            ),
        ),
      ),
  );

  server.registerTool(
    'delete_custom_sensor_type',
    {
      description: `${PHYSICAL} delete a custom sensor model by id. Will fail at the upstream layer if any sensor references this model. Pass \`preview: true\` to dry-run.`,
      inputSchema: DeleteCustomSensorTypeInput,
    },
    async ({ id, preview }) =>
      wrap('delete_custom_sensor_type', async () =>
        previewOrApply('deleteCustomSensorType', { id }, preview, async () =>
          api.deleteCustomSensorType(id),
        ),
      ),
  );
}
