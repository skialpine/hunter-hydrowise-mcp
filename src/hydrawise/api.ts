import { HydrawiseMutationError, HydrawiseNotFoundError } from '../errors.js';
import type { HydrawiseClient } from './client.js';
import {
  CONTROLLER_NOTES_QUERY,
  CONTROLLER_QUERY,
  CONTROLLER_SENSORS_QUERY,
  CONTROLLERS_QUERY,
  CREATE_CONTROLLER_NOTE_MUTATION,
  CREATE_CUSTOM_SENSOR_TYPE_MUTATION,
  CREATE_EXPANDER_MUTATION,
  CREATE_SENSOR_MUTATION,
  CREATE_PROGRAM_START_TIME_MUTATION,
  CREATE_SMART_WATERING_PROGRAM_MUTATION,
  CREATE_STANDARD_PROGRAM_MUTATION,
  CREATE_TIME_WATERING_PROGRAM_MUTATION,
  CREATE_VSS_WATERING_PROGRAM_MUTATION,
  CREATE_ZONE_ADVANCED_MUTATION,
  CREATE_ZONE_NOTE_MUTATION,
  DELETE_CONTROLLER_NOTE_MUTATION,
  DELETE_CUSTOM_SENSOR_TYPE_MUTATION,
  DELETE_EXPANDER_MUTATION,
  DELETE_PROGRAM_START_TIME_MUTATION,
  DELETE_SENSOR_MUTATION,
  DELETE_STANDARD_PROGRAM_MUTATION,
  DELETE_ZONE_MUTATION,
  DELETE_ZONE_NOTE_MUTATION,
  HIBERNATE_CONTROLLER_MUTATION,
  ME_QUERY,
  PROGRAM_START_TIMES_QUERY,
  PROGRAMS_FULL_QUERY,
  PROGRAMS_QUERY,
  REMOVE_WATERING_PROGRAM_MUTATION,
  SET_BASELINE_VALUES_MUTATION,
  RESUME_ALL_ZONES_MUTATION,
  RESUME_ZONE_MUTATION,
  SEASONAL_ADJUSTMENTS_QUERY,
  SENSOR_MODEL_CATALOG_QUERY,
  START_ALL_ZONES_MUTATION,
  START_ZONE_MUTATION,
  STOP_ALL_ZONES_MUTATION,
  STOP_ZONE_MUTATION,
  SUSPEND_ALL_ZONES_MUTATION,
  SUSPEND_ZONE_MUTATION,
  UPDATE_CONTROLLER_MASTER_VALVE_MUTATION,
  UPDATE_CONTROLLER_NOTE_MUTATION,
  UPDATE_CONTROLLER_PROGRAM_MODE_MUTATION,
  UPDATE_CUSTOM_SENSOR_TYPE_MUTATION,
  UPDATE_EXPANDER_MUTATION,
  UPDATE_SENSOR_MUTATION,
  UPDATE_LOCATION_MUTATION,
  UPDATE_LOCATION_COORDINATES_MUTATION,
  UPDATE_PROGRAM_START_TIME_MUTATION,
  UPDATE_SEASONAL_ADJUSTMENTS_MUTATION,
  UPDATE_SMART_WATERING_PROGRAM_MUTATION,
  UPDATE_STANDARD_PROGRAM_MUTATION,
  UPDATE_TIME_WATERING_PROGRAM_MUTATION,
  UPDATE_VSS_WATERING_PROGRAM_MUTATION,
  UPDATE_WATERING_TRIGGERS_MUTATION,
  UPDATE_ZONE_ADVANCED_MUTATION,
  UPDATE_ZONE_NOTE_MUTATION,
  WAKE_CONTROLLER_MUTATION,
  CONTROLLER_SCHEDULE_QUERY,
  WATERING_REPORT_QUERY,
  WATERING_TRIGGERS_QUERY,
  ZONE_FULL_QUERY,
  ZONE_NEXT_RUN_QUERY,
  ZONE_NOTES_QUERY,
  ZONE_PAST_RUNS_QUERY,
  ZONE_QUERY,
  ZONE_RUNS_BETWEEN_QUERY,
  ZONE_RUN_SUMMARY_ANNUAL_QUERY,
  ZONE_RUN_SUMMARY_CURRENT_WEEK_QUERY,
  ZONE_RUN_SUMMARY_MONTHLY_QUERY,
  ZONE_RUN_SUMMARY_WEEKLY_QUERY,
  ZONE_SENSORS_QUERY,
  ZONES_QUERY,
  type AdvancedProgramRead,
  type Controller,
  type ControllerNoteRead,
  type CustomSensorTypeCreatePayload,
  type CustomSensorTypeUpdatePayload,
  type LocationRead,
  type MasterValveRead,
  type PastZoneRuns,
  type ProgramListEntry,
  type ScheduledZoneRun,
  type ProgramStartTimeRead,
  type ProgramStartTimeWritable,
  type RunEventType,
  type RunSummaryDetails,
  type SensorCreatePayload,
  type SensorModelCategoryRead,
  type SensorModelRead,
  type SensorRead,
  type SensorUpdatePayload,
  type SetBaselineValuesPayload,
  type StandardProgramRead,
  type StandardProgramWritable,
  type StatusCodeAndSummary,
  type User,
  type WateringProgramWritable,
  type WateringTriggersRead,
  type WateringTriggersWritable,
  type Zone,
  type ZoneCreatePayload,
  type ZoneNoteRead,
  type ZoneRichRead,
  type ZoneWritable,
} from './queries.js';

// Single source of truth for the controller program-mode enum. Consumed by the
// MCP tool layer's Zod schemas via `z.enum(CONTROLLER_PROGRAM_MODES)`.
export const CONTROLLER_PROGRAM_MODES = ['STANDARD', 'ADVANCED'] as const;
export type ControllerProgramMode = (typeof CONTROLLER_PROGRAM_MODES)[number];

// Single source of truth for note types: the runtime constant drives the
// compile-time union via `typeof NOTE_TYPES[number]`. Exported so the MCP tool
// layer (Zod) can `z.enum(NOTE_TYPES)` against the same list — adding a new note
// type here updates the literal union, the runtime guard below, AND the
// boundary-validation schema atomically.
export const NOTE_TYPES = ['fault', 'location', 'repair', 'comment'] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export interface UpdateLocationPayload {
  device_id: number;
  address?: string;
  latitude?: number;
  longitude?: number;
}

export interface ExpanderCreatePayload {
  controller_id: number;
  name: string;
  number: number;
}

export interface ExpanderUpdatePayload {
  expander_id: number;
  name: string;
  number: number;
}

export interface NotePayload {
  note: string;
  type: NoteType;
  pinned_to_top?: boolean;
}

// Single source of truth for the run-summary period enum. Consumed by the MCP
// tool layer's Zod schemas via `z.enum(RUN_SUMMARY_PERIODS)`.
export const RUN_SUMMARY_PERIODS = ['CURRENT_WEEK', 'WEEK', 'MONTH', 'YEAR'] as const;
export type RunSummaryPeriod = (typeof RUN_SUMMARY_PERIODS)[number];

export type RunSummaryArgs =
  | { period: 'CURRENT_WEEK' }
  | { period: 'WEEK'; start_week: number; end_week: number; year: number }
  | { period: 'MONTH'; start_month: number; end_month: number; year: number }
  | { period: 'YEAR'; start_year: number; end_year: number };

export interface StartZoneOptions {
  durationSeconds?: number;
  markRunAsScheduled?: boolean;
  stackRuns?: boolean;
  learnCurrentFromNextRun?: boolean;
  learnFlowFromNextRun?: boolean;
}

export interface StartAllZonesOptions {
  durationSeconds?: number;
  markRunAsScheduled?: boolean;
  learnCurrentFromNextRun?: boolean;
  learnFlowFromNextRun?: boolean;
}

export class HydrawiseApi {
  constructor(private readonly client: HydrawiseClient) {}

  async getUser(): Promise<User> {
    const data = await this.client.query<{ me: User }>(ME_QUERY);
    return data.me;
  }

  async getControllers(): Promise<Controller[]> {
    const data = await this.client.query<{ me: { controllers: Controller[] | null } }>(
      CONTROLLERS_QUERY,
    );
    return data.me.controllers ?? [];
  }

  async getController(controllerId: number): Promise<Controller> {
    const data = await this.client.query<{ controller: Controller | null }>(CONTROLLER_QUERY, {
      controllerId,
    });
    if (!data.controller) {
      throw new HydrawiseNotFoundError(`controller ${controllerId} not found`);
    }
    return data.controller;
  }

  async getZones(controllerId: number): Promise<Zone[]> {
    const data = await this.client.query<{ controller: { zones: Zone[] | null } | null }>(
      ZONES_QUERY,
      { controllerId },
    );
    if (!data.controller) {
      throw new HydrawiseNotFoundError(`controller ${controllerId} not found`);
    }
    return data.controller.zones ?? [];
  }

  async getZone(zoneId: number): Promise<Zone> {
    const data = await this.client.query<{ zone: Zone | null }>(ZONE_QUERY, { zoneId });
    if (!data.zone) {
      throw new HydrawiseNotFoundError(`zone ${zoneId} not found`);
    }
    return data.zone;
  }

  async startZone(zoneId: number, options: StartZoneOptions = {}): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      START_ZONE_MUTATION,
      {
        zoneId,
        markRunAsScheduled: options.markRunAsScheduled ?? false,
        stackRuns: options.stackRuns ?? true,
        customRunDuration: options.durationSeconds && options.durationSeconds > 0
          ? options.durationSeconds
          : null,
        learnCurrentFromNextRun: options.learnCurrentFromNextRun ?? null,
        learnFlowFromNextRun: options.learnFlowFromNextRun ?? null,
      },
      (data) => data.startZone as StatusCodeAndSummary,
    );
  }

  async stopZone(zoneId: number): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      STOP_ZONE_MUTATION,
      { zoneId },
      (data) => data.stopZone as StatusCodeAndSummary,
    );
  }

  async startAllZones(
    controllerId: number,
    options: StartAllZonesOptions = {},
  ): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      START_ALL_ZONES_MUTATION,
      {
        controllerId,
        markRunAsScheduled: options.markRunAsScheduled ?? false,
        customRunDuration: options.durationSeconds && options.durationSeconds > 0
          ? options.durationSeconds
          : null,
        learnCurrentFromNextRun: options.learnCurrentFromNextRun ?? null,
        learnFlowFromNextRun: options.learnFlowFromNextRun ?? null,
      },
      (data) => data.startAllZones as StatusCodeAndSummary,
    );
  }

  async stopAllZones(controllerId: number): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      STOP_ALL_ZONES_MUTATION,
      { controllerId },
      (data) => data.stopAllZones as StatusCodeAndSummary,
    );
  }

  async suspendZone(zoneId: number, until: Date): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      SUSPEND_ZONE_MUTATION,
      { zoneId, until: until.toISOString() },
      (data) => data.suspendZone as StatusCodeAndSummary,
    );
  }

  async resumeZone(zoneId: number): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      RESUME_ZONE_MUTATION,
      { zoneId },
      (data) => data.resumeZone as StatusCodeAndSummary,
    );
  }

  async suspendAllZones(controllerId: number, until: Date): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      SUSPEND_ALL_ZONES_MUTATION,
      { controllerId, until: until.toISOString() },
      (data) => data.suspendAllZones as StatusCodeAndSummary,
    );
  }

  async resumeAllZones(controllerId: number): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      RESUME_ALL_ZONES_MUTATION,
      { controllerId },
      (data) => data.resumeAllZones as StatusCodeAndSummary,
    );
  }

  // Schedule management

  async getZoneFull(zoneId: number): Promise<ZoneRichRead> {
    const data = await this.client.query<{ zone: ZoneRichRead | null }>(ZONE_FULL_QUERY, {
      zoneId,
    });
    if (!data.zone) {
      throw new HydrawiseNotFoundError(`zone ${zoneId} not found`);
    }
    return data.zone;
  }


  // controllerNotes and zoneNotes are subscription-gated: fetching them as part of
  // CONTROLLER_FIELDS or ZONE_FULL_QUERY causes Hydrawise to null the entire parent
  // object on free accounts. These dedicated methods let callers handle the error
  // independently (e.g. backup.ts falls back to [] and emits a warn on subscription
  // errors, propagating all other errors).

  async getControllerNotes(controllerId: number): Promise<ControllerNoteRead[]> {
    const data = await this.client.query<{
      controller: { controllerNotes: (ControllerNoteRead | null)[] | null } | null;
    }>(CONTROLLER_NOTES_QUERY, { controllerId });
    if (!data.controller) {
      throw new HydrawiseNotFoundError(`controller ${controllerId} not found`);
    }
    return (data.controller.controllerNotes ?? []).filter(
      (n): n is ControllerNoteRead => n !== null,
    );
  }

  async getZoneNotes(zoneId: number): Promise<ZoneNoteRead[]> {
    const data = await this.client.query<{
      zone: { zoneNotes: (ZoneNoteRead | null)[] | null } | null;
    }>(ZONE_NOTES_QUERY, { zoneId });
    if (!data.zone) {
      throw new HydrawiseNotFoundError(`zone ${zoneId} not found`);
    }
    return (data.zone.zoneNotes ?? []).filter((n): n is ZoneNoteRead => n !== null);
  }

  async getSeasonalAdjustments(controllerId: number): Promise<number[]> {
    const data = await this.client.query<{
      controller: { settings: { offline: { seasonalAdjustments: number[] | null } } | null } | null;
    }>(SEASONAL_ADJUSTMENTS_QUERY, { controllerId });
    if (!data.controller) {
      throw new HydrawiseNotFoundError(`controller ${controllerId} not found`);
    }
    return data.controller.settings?.offline?.seasonalAdjustments ?? [];
  }

  async getWateringTriggers(controllerId: number): Promise<WateringTriggersRead | null> {
    const data = await this.client.query<{
      controller: { wateringTriggers: WateringTriggersRead | null } | null;
    }>(WATERING_TRIGGERS_QUERY, { controllerId });
    if (!data.controller) {
      throw new HydrawiseNotFoundError(`controller ${controllerId} not found`);
    }
    return data.controller.wateringTriggers ?? null;
  }

  async getStandardProgram(
    controllerId: number,
    programId: number,
  ): Promise<StandardProgramRead | null> {
    const data = await this.client.query<{
      controller: { programs: (StandardProgramRead & { __typename: string })[] | null } | null;
    }>(PROGRAMS_FULL_QUERY, { controllerId, includeZoneSpecific: true });
    if (!data.controller) {
      throw new HydrawiseNotFoundError(`controller ${controllerId} not found`);
    }
    const found = (data.controller.programs ?? []).find(
      (p) => p.id === programId && p.__typename === 'StandardProgram',
    );
    return found ?? null;
  }

  // Mirrors getStandardProgram for ADVANCED-mode programs. Both reuse PROGRAMS_FULL_QUERY
  // (which selects fragments for both subtypes); the __typename filter ensures we only
  // surface programs of the requested concrete type. A program-id-mismatch (e.g. the id
  // exists but is a StandardProgram) returns null rather than mis-typing the result.
  async getAdvancedProgram(
    controllerId: number,
    programId: number,
  ): Promise<AdvancedProgramRead | null> {
    const data = await this.client.query<{
      controller: { programs: (AdvancedProgramRead & { __typename: string })[] | null } | null;
    }>(PROGRAMS_FULL_QUERY, { controllerId, includeZoneSpecific: true });
    if (!data.controller) {
      throw new HydrawiseNotFoundError(`controller ${controllerId} not found`);
    }
    const found = (data.controller.programs ?? []).find(
      (p) => p.id === programId && p.__typename === 'AdvancedProgram',
    );
    return found ?? null;
  }

  async getPrograms(controllerId: number, includeZoneSpecific = true): Promise<ProgramListEntry[]> {
    const data = await this.client.query<{
      controller: {
        programs:
          | {
              __typename: string;
              id: number;
              name: string;
              schedulingMethod: { value: number } | null;
              appliesToZones: { id: number }[] | null;
            }[]
          | null;
      } | null;
    }>(PROGRAMS_QUERY, { controllerId, includeZoneSpecific });
    if (!data.controller) {
      throw new HydrawiseNotFoundError(`controller ${controllerId} not found`);
    }
    return (data.controller.programs ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      // Normalize __typename to the discriminator used by serializeStandardProgram and the
      // get_program tool's input enum, so snapshot.controller.programs[] has consistent
      // program_type values whether the entry is the thin list shape or the inlined detail.
      program_type:
        p.__typename === 'StandardProgram' ? 'Standard' :
        p.__typename === 'AdvancedProgram' ? 'Advanced' :
        p.__typename,
      scheduling_method: p.schedulingMethod?.value ?? null,
      applies_to_zone_ids: (p.appliesToZones ?? []).map((z) => z.id),
    }));
  }

  async getProgramStartTimesForZone(zoneId: number): Promise<ProgramStartTimeRead[]> {
    const data = await this.client.query<{
      zone: {
        wateringSettings: { programStartTimes: ProgramStartTimeRead[] | null } | null;
      } | null;
    }>(PROGRAM_START_TIMES_QUERY, { zoneId });
    if (!data.zone) {
      throw new HydrawiseNotFoundError(`zone ${zoneId} not found`);
    }
    return data.zone.wateringSettings?.programStartTimes ?? [];
  }

  async updateZoneAdvanced(payload: ZoneWritable): Promise<{ id: number }> {
    return this.client.mutateRaw(
      UPDATE_ZONE_ADVANCED_MUTATION,
      zoneWritableToVars(payload),
      (data) => requireMutationResult('updateZoneAdvanced', data.updateZoneAdvanced),
    );
  }

  async setBaselineValues(payload: SetBaselineValuesPayload): Promise<StatusCodeAndSummary> {
    return this.client.mutate(
      SET_BASELINE_VALUES_MUTATION,
      {
        zoneId: payload.zone_id,
        flowMonitoringMethod: payload.flow_monitoring_method,
        currentMonitoringMethod: payload.current_monitoring_method,
        flowMonitoringValue: payload.flow_monitoring_value,
        currentMonitoringValue: payload.current_monitoring_value,
      },
      (data) => data.setBaselineValues as StatusCodeAndSummary,
    );
  }

  async updateSeasonalAdjustments(controllerId: number, factors: number[]): Promise<true> {
    return this.client.mutateRaw(
      UPDATE_SEASONAL_ADJUSTMENTS_MUTATION,
      { controllerId, factors },
      (data) => {
        const value = data.updateSeasonalAdjustments;
        if (value !== true) {
          throw new HydrawiseMutationError(
            `updateSeasonalAdjustments returned ${JSON.stringify(value)}; the operation may not have taken effect`,
          );
        }
        return true;
      },
    );
  }

  async updateWateringTriggers(payload: WateringTriggersWritable): Promise<{ id: number }> {
    return this.client.mutateRaw(
      UPDATE_WATERING_TRIGGERS_MUTATION,
      wateringTriggersWritableToVars(payload),
      (data) => requireMutationResult('updateWateringTriggers', data.updateWateringTriggers),
    );
  }

  async createProgramStartTime(payload: ProgramStartTimeWritable): Promise<{ id: number }> {
    return this.client.mutateRaw(
      CREATE_PROGRAM_START_TIME_MUTATION,
      programStartTimeWritableToVars(payload, false),
      (data) => requireMutationResult('createProgramStartTime', data.createProgramStartTime),
    );
  }

  async updateProgramStartTime(
    payload: ProgramStartTimeWritable & { id: number },
  ): Promise<{ id: number }> {
    return this.client.mutateRaw(
      UPDATE_PROGRAM_START_TIME_MUTATION,
      programStartTimeWritableToVars(payload, true),
      (data) => requireMutationResult('updateProgramStartTime', data.updateProgramStartTime),
    );
  }

  async deleteProgramStartTime(id: number, controllerId: number): Promise<number> {
    return this.client.mutateRaw(
      DELETE_PROGRAM_START_TIME_MUTATION,
      { id, controllerId, isContractor: false },
      (data) => requireDeletedId('deleteProgramStartTime', data.deleteProgramStartTime),
    );
  }

  async createStandardProgram(payload: StandardProgramWritable): Promise<{ id: number; name: string }> {
    return this.client.mutateRaw(
      CREATE_STANDARD_PROGRAM_MUTATION,
      standardProgramToVars(payload, false),
      (data) => requireMutationResultNamed('createStandardProgram', data.createStandardProgram),
    );
  }

  async updateStandardProgram(payload: StandardProgramWritable & { program_id: number }): Promise<{ id: number; name: string }> {
    return this.client.mutateRaw(
      UPDATE_STANDARD_PROGRAM_MUTATION,
      standardProgramToVars(payload, true),
      (data) => requireMutationResultNamed('updateStandardProgram', data.updateStandardProgram),
    );
  }

  async deleteStandardProgram(programId: number, controllerId: number): Promise<number> {
    return this.client.mutateRaw(
      DELETE_STANDARD_PROGRAM_MUTATION,
      { programId, controllerId },
      (data) => requireDeletedId('deleteStandardProgram', data.deleteStandardProgram),
    );
  }

  async createWateringProgram(payload: WateringProgramWritable): Promise<{ id: number; name: string }> {
    return this.dispatchWateringProgram(payload, false);
  }

  async updateWateringProgram(
    payload: WateringProgramWritable & { program_id: number },
  ): Promise<{ id: number; name: string }> {
    return this.dispatchWateringProgram(payload, true);
  }

  async removeWateringProgram(programId: number): Promise<number> {
    return this.client.mutateRaw(
      REMOVE_WATERING_PROGRAM_MUTATION,
      { wateringProgramId: programId },
      (data) => requireDeletedId('removeWateringProgram', data.removeWateringProgram),
    );
  }

  // Reporting

  async getWateringReport(
    controllerId: number,
    from: number,
    until: number,
  ): Promise<RunEventType[]> {
    const data = await this.client.query<{
      controller: {
        reports: { watering: { runEvent: RunEventType | null }[] } | null;
      } | null;
    }>(WATERING_REPORT_QUERY, { controllerId, from, until });
    if (!data.controller) {
      throw new HydrawiseNotFoundError(`controller ${controllerId} not found`);
    }
    return (data.controller.reports?.watering ?? [])
      .map((e) => e.runEvent)
      .filter((e): e is RunEventType => e !== null);
  }

  async getZonePastRuns(zoneId: number): Promise<PastZoneRuns> {
    const data = await this.client.query<{
      zone: { pastRuns: PastZoneRuns | null } | null;
    }>(ZONE_PAST_RUNS_QUERY, { zoneId });
    if (!data.zone) {
      throw new HydrawiseNotFoundError(`zone ${zoneId} not found`);
    }
    return data.zone.pastRuns ?? { lastRun: null, runs: null };
  }

  async getZoneRunsBetween(zoneId: number, from: number, until: number): Promise<ScheduledZoneRun[]> {
    const data = await this.client.query<{ zone: { runsBetween: ScheduledZoneRun[] } | null }>(
      ZONE_RUNS_BETWEEN_QUERY,
      { zoneId, from, until },
    );
    if (!data.zone) {
      throw new HydrawiseNotFoundError(`zone ${zoneId} not found`);
    }
    return data.zone.runsBetween ?? [];
  }

  async getZoneNextRun(zoneId: number): Promise<ScheduledZoneRun | null> {
    const data = await this.client.query<{
      zone: { scheduledRuns: { nextRun: ScheduledZoneRun | null } } | null;
    }>(ZONE_NEXT_RUN_QUERY, { zoneId });
    if (!data.zone) {
      throw new HydrawiseNotFoundError(`zone ${zoneId} not found`);
    }
    return data.zone.scheduledRuns.nextRun;
  }

  async getControllerSchedule(
    controllerId: number,
    from: number,
    until: number,
  ): Promise<{ zoneId: number; zoneName: string; zoneNumber: number; runs: ScheduledZoneRun[] }[]> {
    const data = await this.client.query<{
      controller: {
        zones: { id: number; name: string; number: { value: number }; runsBetween: ScheduledZoneRun[] }[] | null;
      } | null;
    }>(CONTROLLER_SCHEDULE_QUERY, { controllerId, from, until });
    if (!data.controller) {
      throw new HydrawiseNotFoundError(`controller ${controllerId} not found`);
    }
    return (data.controller.zones ?? []).map((z) => ({
      zoneId: z.id,
      zoneName: z.name,
      zoneNumber: z.number.value,
      runs: z.runsBetween ?? [],
    }));
  }

  async getZoneRunSummary(zoneId: number, args: RunSummaryArgs): Promise<RunSummaryDetails | null> {
    if (args.period === 'CURRENT_WEEK') {
      const data = await this.client.query<{
        zone: { runSummary: { currentWeek: RunSummaryDetails | null } | null } | null;
      }>(ZONE_RUN_SUMMARY_CURRENT_WEEK_QUERY, { zoneId });
      if (!data.zone) throw new HydrawiseNotFoundError(`zone ${zoneId} not found`);
      return data.zone.runSummary?.currentWeek ?? null;
    }
    if (args.period === 'WEEK') {
      const data = await this.client.query<{
        zone: { runSummary: { weekly: RunSummaryDetails | null } | null } | null;
      }>(ZONE_RUN_SUMMARY_WEEKLY_QUERY, {
        zoneId,
        startWeek: args.start_week,
        endWeek: args.end_week,
        year: args.year,
      });
      if (!data.zone) throw new HydrawiseNotFoundError(`zone ${zoneId} not found`);
      return data.zone.runSummary?.weekly ?? null;
    }
    if (args.period === 'MONTH') {
      const data = await this.client.query<{
        zone: { runSummary: { monthly: RunSummaryDetails | null } | null } | null;
      }>(ZONE_RUN_SUMMARY_MONTHLY_QUERY, {
        zoneId,
        startMonth: args.start_month,
        endMonth: args.end_month,
        year: args.year,
      });
      if (!data.zone) throw new HydrawiseNotFoundError(`zone ${zoneId} not found`);
      return data.zone.runSummary?.monthly ?? null;
    }
    const data = await this.client.query<{
      zone: { runSummary: { annual: RunSummaryDetails | null } | null } | null;
    }>(ZONE_RUN_SUMMARY_ANNUAL_QUERY, {
      zoneId,
      startYear: args.start_year,
      endYear: args.end_year,
    });
    if (!data.zone) throw new HydrawiseNotFoundError(`zone ${zoneId} not found`);
    return data.zone.runSummary?.annual ?? null;
  }

  private async dispatchWateringProgram(
    payload: WateringProgramWritable,
    isUpdate: boolean,
  ): Promise<{ id: number; name: string }> {
    const vars = wateringProgramToVars(payload, isUpdate);
    const op = wateringProgramOperationName(payload.program_type, isUpdate);
    const mutation = wateringProgramMutation(payload.program_type, isUpdate);
    return this.client.mutateRaw(mutation, vars, (data) =>
      requireMutationResultNamed(op, data[op]),
    );
  }

  // Controller config — location, master valve, program mode, hibernate, expanders

  async updateLocation(payload: UpdateLocationPayload): Promise<LocationRead> {
    // address must be a non-empty string; empty string would clear the location server-side, which we don't intend.
    const hasAddress = typeof payload.address === 'string' && payload.address.length > 0;
    const hasCoords = typeof payload.latitude === 'number' && typeof payload.longitude === 'number';
    if (!hasAddress && !hasCoords) {
      throw new HydrawiseMutationError('updateLocation requires at least one of address, latitude+longitude');
    }
    let addressResult: LocationRead | null = null;
    if (hasAddress) {
      addressResult = await this.client.mutateRaw(
        UPDATE_LOCATION_MUTATION,
        { deviceId: payload.device_id, address: payload.address },
        (data) => requireLocation('updateLocation', data.updateLocation),
      );
    }
    let coordsResult: LocationRead | null = null;
    if (hasCoords) {
      try {
        coordsResult = await this.client.mutateRaw(
          UPDATE_LOCATION_COORDINATES_MUTATION,
          { deviceId: payload.device_id, latitude: payload.latitude, longitude: payload.longitude },
          (data) => requireLocation('updateLocationCoordinates', data.updateLocationCoordinates),
        );
      } catch (err) {
        if (addressResult) {
          // The address mutation already committed upstream — surface the partial state explicitly.
          const cause = err instanceof Error ? err.message : String(err);
          throw new HydrawiseMutationError(
            `updateLocationCoordinates failed AFTER updateLocation succeeded — controller is in a partial state: address committed (id=${addressResult.id}) but coordinates were not applied. Original error: ${cause}`,
            { cause: err instanceof Error ? err : undefined },
          );
        }
        throw err;
      }
    }
    return coordsResult ?? addressResult!;
  }

  async updateControllerMasterValve(controllerId: number, zoneNumber: number): Promise<MasterValveRead> {
    return this.client.mutateRaw(
      UPDATE_CONTROLLER_MASTER_VALVE_MUTATION,
      { controllerId, zoneNumber },
      (data) => {
        const v = data.updateControllerMasterValve as MasterValveRead | null;
        if (!v) {
          throw new HydrawiseMutationError('updateControllerMasterValve returned null');
        }
        return v;
      },
    );
  }

  async updateControllerProgramMode(controllerId: number, mode: ControllerProgramMode): Promise<{ id: number; programMode: ControllerProgramMode }> {
    return this.client.mutateRaw(
      UPDATE_CONTROLLER_PROGRAM_MODE_MUTATION,
      { controllerId, programMode: mode },
      (data) => {
        const v = data.updateControllerProgramMode as { id: number; programMode: ControllerProgramMode } | null;
        if (!v || typeof v.id !== 'number') {
          throw new HydrawiseMutationError('updateControllerProgramMode returned null or malformed');
        }
        return v;
      },
    );
  }

  async hibernateController(controllerId: number): Promise<true> {
    return this.client.mutateRaw(
      HIBERNATE_CONTROLLER_MUTATION,
      { controllerId },
      (data) => {
        if (data.hibernateController !== true) {
          throw new HydrawiseMutationError(`hibernateController returned ${JSON.stringify(data.hibernateController)}`);
        }
        return true;
      },
    );
  }

  async wakeController(controllerId: number): Promise<true> {
    return this.client.mutateRaw(
      WAKE_CONTROLLER_MUTATION,
      { controllerId },
      (data) => {
        if (data.wakeController !== true) {
          throw new HydrawiseMutationError(`wakeController returned ${JSON.stringify(data.wakeController)}`);
        }
        return true;
      },
    );
  }

  async createExpander(payload: ExpanderCreatePayload): Promise<{ id: number; name: string; number: number }> {
    return this.client.mutateRaw(
      CREATE_EXPANDER_MUTATION,
      { controllerId: payload.controller_id, name: payload.name, number: payload.number },
      (data) => requireExpander('createExpander', data.createExpander),
    );
  }

  async updateExpander(payload: ExpanderUpdatePayload): Promise<{ id: number; name: string; number: number }> {
    return this.client.mutateRaw(
      UPDATE_EXPANDER_MUTATION,
      { expanderId: payload.expander_id, name: payload.name, number: payload.number },
      (data) => requireExpander('updateExpander', data.updateExpander),
    );
  }

  async deleteExpander(expanderId: number): Promise<true> {
    return this.client.mutateRaw(
      DELETE_EXPANDER_MUTATION,
      { expanderId },
      (data) => {
        if (data.deleteExpander !== true) {
          throw new HydrawiseMutationError(`deleteExpander returned ${JSON.stringify(data.deleteExpander)}; the operation may not have taken effect`);
        }
        return true;
      },
    );
  }

  // Notes — controller and zone variants

  async createControllerNote(controllerId: number, payload: NotePayload): Promise<ControllerNoteRead> {
    return this.client.mutateRaw(
      CREATE_CONTROLLER_NOTE_MUTATION,
      { controllerId, note: payload.note, type: payload.type, pinnedToTop: payload.pinned_to_top ?? false },
      (data) => requireNote('createControllerNote', data.createControllerNote) as ControllerNoteRead,
    );
  }

  async updateControllerNote(noteId: number, controllerId: number, payload: NotePayload): Promise<ControllerNoteRead> {
    return this.client.mutateRaw(
      UPDATE_CONTROLLER_NOTE_MUTATION,
      { noteId, controllerId, note: payload.note, type: payload.type, pinnedToTop: payload.pinned_to_top ?? false },
      (data) => requireNote('updateControllerNote', data.updateControllerNote) as ControllerNoteRead,
    );
  }

  async deleteControllerNote(noteId: number): Promise<StatusCodeAndSummary> {
    return this.client.mutateRaw(
      DELETE_CONTROLLER_NOTE_MUTATION,
      { noteId },
      (data) => requireStatus('deleteControllerNote', data.deleteControllerNote),
    );
  }

  async createZoneNote(zoneId: number, payload: NotePayload): Promise<ZoneNoteRead> {
    return this.client.mutateRaw(
      CREATE_ZONE_NOTE_MUTATION,
      { zoneId, note: payload.note, type: payload.type, pinnedToTop: payload.pinned_to_top ?? false },
      (data) => requireNote('createZoneNote', data.createZoneNote) as ZoneNoteRead,
    );
  }

  async updateZoneNote(noteId: number, zoneId: number, payload: NotePayload): Promise<ZoneNoteRead> {
    return this.client.mutateRaw(
      UPDATE_ZONE_NOTE_MUTATION,
      { noteId, zoneId, note: payload.note, type: payload.type, pinnedToTop: payload.pinned_to_top ?? false },
      (data) => requireNote('updateZoneNote', data.updateZoneNote) as ZoneNoteRead,
    );
  }

  async deleteZoneNote(noteId: number): Promise<StatusCodeAndSummary> {
    return this.client.mutateRaw(
      DELETE_ZONE_NOTE_MUTATION,
      { noteId },
      (data) => requireStatus('deleteZoneNote', data.deleteZoneNote),
    );
  }

  // Zone CRUD (Advanced variant only — deprecated `createZone` not wrapped)

  async createZoneAdvanced(payload: ZoneCreatePayload): Promise<{ id: number; name: string; number: { value: number } }> {
    return this.client.mutateRaw(
      CREATE_ZONE_ADVANCED_MUTATION,
      zoneCreatePayloadToVars(payload),
      (data) => {
        const z = data.createZoneAdvanced as { id: number; name: string; number: { value: number } } | null;
        if (!z || typeof z.id !== 'number') {
          throw new HydrawiseMutationError('createZoneAdvanced returned null or malformed');
        }
        return z;
      },
    );
  }

  async deleteZone(zoneId: number): Promise<true> {
    return this.client.mutateRaw(
      DELETE_ZONE_MUTATION,
      { zoneId },
      (data) => {
        if (data.deleteZone !== true) {
          throw new HydrawiseMutationError(`deleteZone returned ${JSON.stringify(data.deleteZone)}; the operation may not have taken effect`);
        }
        return true;
      },
    );
  }

  // Sensors — controller- and zone-scoped reads, plus full CRUD

  async getControllerSensors(controllerId: number): Promise<SensorRead[]> {
    const data = await this.client.query<{
      controller: { sensors: (SensorRead | null)[] | null } | null;
    }>(CONTROLLER_SENSORS_QUERY, { controllerId });
    if (!data.controller) {
      throw new HydrawiseNotFoundError(`controller ${controllerId} not found`);
    }
    return (data.controller.sensors ?? []).filter((s): s is SensorRead => s != null);
  }

  async getZoneSensors(zoneId: number): Promise<SensorRead[]> {
    const data = await this.client.query<{
      zone: { sensors: (SensorRead | null)[] | null } | null;
    }>(ZONE_SENSORS_QUERY, { zoneId });
    if (!data.zone) {
      throw new HydrawiseNotFoundError(`zone ${zoneId} not found`);
    }
    return (data.zone.sensors ?? []).filter((s): s is SensorRead => s != null);
  }

  // listSensorModels does not pass controllerId — Configuration.sensorCategories is account-wide
  // (the live schema does not accept a controller scope on the catalog query). The controllerId
  // parameter is kept on the public API for tool-symmetry and future-proofing should the schema add a
  // per-controller filter; see SENSOR_MODEL_CATALOG_QUERY in queries.ts.
  async listSensorModels(_controllerId: number): Promise<SensorModelRead[]> {
    const data = await this.client.query<{
      configuration: { sensorCategories: (SensorModelCategoryRead | null)[] | null } | null;
    }>(SENSOR_MODEL_CATALOG_QUERY);
    const cats = (data.configuration?.sensorCategories ?? []).filter(
      (c): c is SensorModelCategoryRead => c != null,
    );
    // Flatten the category->models tree. The category info is preserved on each model via
    // SensorModel.category (selected by SENSOR_MODEL_FIELDS), so callers can group by category
    // without needing the parent traversal.
    return cats.flatMap((c) => (c.models ?? []).filter((m): m is SensorModelRead => m != null));
  }

  async createSensor(payload: SensorCreatePayload): Promise<SensorRead> {
    return this.client.mutateRaw(
      CREATE_SENSOR_MUTATION,
      {
        controllerId: payload.controller_id,
        name: payload.name,
        modelId: payload.model_id,
        inputNumber: payload.input_number,
        zoneIds: payload.zone_ids,
      },
      (data) => requireSensor('createSensor', data.createSensor),
    );
  }

  async updateSensor(payload: SensorUpdatePayload): Promise<SensorRead> {
    return this.client.mutateRaw(
      UPDATE_SENSOR_MUTATION,
      {
        sensorId: payload.sensor_id,
        controllerId: payload.controller_id,
        name: payload.name,
        modelId: payload.model_id,
        inputNumber: payload.input_number,
        zoneIds: payload.zone_ids,
      },
      (data) => requireSensor('updateSensor', data.updateSensor),
    );
  }

  async deleteSensor(sensorId: number): Promise<true> {
    return this.client.mutateRaw(
      DELETE_SENSOR_MUTATION,
      { sensorId },
      (data) => {
        if (data.deleteSensor !== true) {
          throw new HydrawiseMutationError(
            `deleteSensor returned ${JSON.stringify(data.deleteSensor)}; the operation may not have taken effect`,
          );
        }
        return true;
      },
    );
  }

  async createCustomSensorType(payload: CustomSensorTypeCreatePayload): Promise<SensorModelRead> {
    return this.client.mutateRaw(
      CREATE_CUSTOM_SENSOR_TYPE_MUTATION,
      {
        customerId: payload.customer_id,
        name: payload.name,
        customSensorType: payload.custom_sensor_type,
        modeType: payload.mode_type,
        delay: payload.delay_seconds ?? null,
        offTimer: payload.off_timer_seconds ?? null,
        flowSensorRate: payload.flow_sensor_rate ?? null,
      },
      (data) => requireSensorModel('createCustomSensorType', data.createCustomSensorType),
    );
  }

  async updateCustomSensorType(payload: CustomSensorTypeUpdatePayload): Promise<SensorModelRead> {
    return this.client.mutateRaw(
      UPDATE_CUSTOM_SENSOR_TYPE_MUTATION,
      {
        customSensorTypeId: payload.custom_sensor_type_id,
        customerId: payload.customer_id,
        controllerId: payload.controller_id,
        name: payload.name,
        customSensorType: payload.custom_sensor_type,
        modeType: payload.mode_type,
        delay: payload.delay_seconds ?? null,
        offTimer: payload.off_timer_seconds ?? null,
        flowSensorRate: payload.flow_sensor_rate ?? null,
      },
      (data) => requireSensorModel('updateCustomSensorType', data.updateCustomSensorType),
    );
  }

  // deleteCustomSensorType returns Int per the live schema (typically 1 = one row deleted).
  // We coerce to true on a positive count and throw on 0/null/non-number — the AI caller cares only
  // about success vs. failure, not the row count.
  async deleteCustomSensorType(id: number): Promise<true> {
    return this.client.mutateRaw(
      DELETE_CUSTOM_SENSOR_TYPE_MUTATION,
      { id },
      (data) => {
        const n = data.deleteCustomSensorType;
        if (typeof n !== 'number' || n <= 0) {
          throw new HydrawiseMutationError(
            `deleteCustomSensorType returned ${JSON.stringify(n)}; the operation may not have taken effect`,
          );
        }
        return true;
      },
    );
  }
}

function requireExpander(op: string, value: unknown): { id: number; name: string; number: number } {
  if (!value || typeof value !== 'object') {
    throw new HydrawiseMutationError(`${op} returned ${JSON.stringify(value ?? null)}; the operation may not have taken effect`);
  }
  const v = value as { id?: unknown; name?: unknown; number?: unknown };
  if (typeof v.id !== 'number' || typeof v.name !== 'string' || typeof v.number !== 'number') {
    throw new HydrawiseMutationError(`${op} returned an unexpected shape`);
  }
  return { id: v.id, name: v.name, number: v.number };
}

// Sensor extractor — validates only the fields callers depend on (id, name, model.id,
// input.number). The full SensorRead shape is much larger but those four are the ones
// downstream consumers (snapshot, restore workflow) cannot proceed without. The cast to
// SensorRead is safe because the GraphQL response is shape-validated by the server before
// it reaches us; we trust it once the structural sanity check above passes.
function requireSensor(op: string, value: unknown): SensorRead {
  if (!value || typeof value !== 'object') {
    throw new HydrawiseMutationError(
      `${op} returned ${JSON.stringify(value ?? null)}; the operation may not have taken effect`,
    );
  }
  const v = value as {
    id?: unknown;
    name?: unknown;
    model?: { id?: unknown } | null;
    input?: { number?: unknown } | null;
  };
  if (
    typeof v.id !== 'number' ||
    typeof v.name !== 'string' ||
    !v.model ||
    typeof v.model.id !== 'number' ||
    !v.input ||
    typeof v.input.number !== 'number'
  ) {
    throw new HydrawiseMutationError(`${op} returned an unexpected shape`);
  }
  return value as SensorRead;
}

// SensorModel extractor — validates only id and modeType (the discriminator the schema
// guarantees is non-null). name is nullable per schema (built-in catalog entries always have a
// name; custom types may briefly lack one between create and rename).
function requireSensorModel(op: string, value: unknown): SensorModelRead {
  if (!value || typeof value !== 'object') {
    throw new HydrawiseMutationError(
      `${op} returned ${JSON.stringify(value ?? null)}; the operation may not have taken effect`,
    );
  }
  const v = value as { id?: unknown; modeType?: unknown };
  if (typeof v.id !== 'number' || typeof v.modeType !== 'string') {
    throw new HydrawiseMutationError(`${op} returned an unexpected shape`);
  }
  return value as SensorModelRead;
}

function isNoteType(x: unknown): x is NoteType {
  // Cast to `readonly string[]` is a localized concession: the `as const`
  // tuple narrows `.includes()` to NoteType arguments only, but here we are
  // explicitly testing whether an unknown value is a NoteType.
  return typeof x === 'string' && (NOTE_TYPES as readonly string[]).includes(x);
}

function requireNote(op: string, value: unknown): { id: number; note: string; type: NoteType; pinnedToTop: boolean; lastUpdatedAt: { value: string } | null } {
  if (!value || typeof value !== 'object') {
    throw new HydrawiseMutationError(`${op} returned ${JSON.stringify(value ?? null)}; the operation may not have taken effect`);
  }
  const v = value as { id?: unknown; note?: unknown; type?: unknown; pinnedToTop?: unknown; lastUpdatedAt?: unknown };
  if (typeof v.id !== 'number' || typeof v.note !== 'string' || typeof v.pinnedToTop !== 'boolean') {
    throw new HydrawiseMutationError(`${op} returned an unexpected shape`);
  }
  if (!isNoteType(v.type)) {
    throw new HydrawiseMutationError(`${op} returned unexpected note type: ${JSON.stringify(v.type)}`);
  }
  // lastUpdatedAt: must be either null or { value: string }. Reject undefined explicitly so the
  // returned shape exactly matches what the type signature claims.
  let normalizedLua: { value: string } | null;
  if (v.lastUpdatedAt === null || v.lastUpdatedAt === undefined) {
    normalizedLua = null;
  } else if (typeof v.lastUpdatedAt === 'object' && typeof (v.lastUpdatedAt as { value?: unknown }).value === 'string') {
    normalizedLua = v.lastUpdatedAt as { value: string };
  } else {
    throw new HydrawiseMutationError(`${op} returned unexpected lastUpdatedAt shape`);
  }
  return {
    id: v.id,
    note: v.note,
    type: v.type,
    pinnedToTop: v.pinnedToTop,
    lastUpdatedAt: normalizedLua,
  };
}

function requireLocation(op: string, value: unknown): LocationRead {
  if (!value || typeof value !== 'object' || typeof (value as { id?: unknown }).id !== 'number') {
    throw new HydrawiseMutationError(`${op} returned ${JSON.stringify(value ?? null)}; the operation may not have taken effect`);
  }
  return value as LocationRead;
}

// requireStatus throws on WARNING (in addition to ERROR / null / malformed). Used by destructive
// mutations (delete_*_note) where WARNING signals "did nothing because the entity didn't exist".
// start_zone / stop_zone use client.mutate() which still accepts WARNING (zone-control ops
// legitimately return WARNING for "zone is already running").
function requireStatus(op: string, value: unknown): { status: 'OK'; summary: string } {
  if (!value || typeof value !== 'object') {
    throw new HydrawiseMutationError(`${op} returned ${JSON.stringify(value ?? null)}; the operation may not have taken effect`);
  }
  const v = value as { status?: unknown; summary?: unknown };
  if (v.status === 'OK') {
    return { status: 'OK', summary: typeof v.summary === 'string' ? v.summary : '' };
  }
  const summary = typeof v.summary === 'string' ? v.summary : 'no summary provided';
  throw new HydrawiseMutationError(`${op} returned ${String(v.status)}: ${summary}`);
}

function zoneCreatePayloadToVars(p: ZoneCreatePayload): Record<string, unknown> {
  return {
    controllerId: p.controller_id,
    icon: p.icon,
    name: p.name,
    number: p.number,
    wateringMode: p.watering_mode,
    globalMasterValve: p.global_master_valve,
    scheduleAdjustmentIds: p.schedule_adjustment_ids,
    wateringAdjustment: p.watering_adjustment_percent,
    wateringType: p.watering_type,
    runTime: p.run_time_minutes,
    wateringFrequencyMode: p.watering_frequency_mode,
    fixedWateringFrequency: p.fixed_watering_frequency_seconds,
    smartWateringFrequency: p.smart_watering_frequency_seconds,
    virtualSolarSyncWateringFrequency: p.virtual_solar_sync_watering_frequency_seconds,
    runNextAvailableStartTime: p.run_next_available_start_time,
    preConfiguredWateringScheduleId: p.pre_configured_watering_schedule_id,
    cycleSoakEnable: p.cycle_soak_enable,
    cycleCustomTime: p.cycle_custom_time_minutes,
    soakCustomTime: p.soak_custom_time_minutes,
    factors: p.monthly_adjustment_percents,
    sensorIds: p.sensor_ids,
    reusableSchedule: p.reusable_schedule,
    reusableScheduleName: p.reusable_schedule_name,
    flowMonitoringMethod: p.flow_monitoring_method,
    currentMonitoringMethod: p.current_monitoring_method,
    flowMonitoringValue: p.flow_monitoring_value,
    currentMonitoringValue: p.current_monitoring_value,
  };
}

function wateringProgramMutation(type: WateringProgramWritable['program_type'], isUpdate: boolean): string {
  if (type === 'Time') {
    return isUpdate ? UPDATE_TIME_WATERING_PROGRAM_MUTATION : CREATE_TIME_WATERING_PROGRAM_MUTATION;
  }
  if (type === 'Smart') {
    return isUpdate ? UPDATE_SMART_WATERING_PROGRAM_MUTATION : CREATE_SMART_WATERING_PROGRAM_MUTATION;
  }
  return isUpdate ? UPDATE_VSS_WATERING_PROGRAM_MUTATION : CREATE_VSS_WATERING_PROGRAM_MUTATION;
}

function wateringProgramOperationName(
  type: WateringProgramWritable['program_type'],
  isUpdate: boolean,
): string {
  const verb = isUpdate ? 'update' : 'create';
  if (type === 'Time') return `${verb}TimeBasedWateringProgram`;
  if (type === 'Smart') return `${verb}SmartBasedWateringProgram`;
  return `${verb}VirtualSolarSyncWateringProgram`;
}

function requireMutationResult(op: string, value: unknown): { id: number } {
  if (!value || typeof value !== 'object' || typeof (value as { id?: unknown }).id !== 'number') {
    throw new HydrawiseMutationError(
      `${op} returned ${JSON.stringify(value ?? null)}; the operation may not have taken effect`,
    );
  }
  return value as { id: number };
}

function requireMutationResultNamed(op: string, value: unknown): { id: number; name: string } {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as { id?: unknown }).id !== 'number' ||
    typeof (value as { name?: unknown }).name !== 'string'
  ) {
    throw new HydrawiseMutationError(
      `${op} returned ${JSON.stringify(value ?? null)}; the operation may not have taken effect`,
    );
  }
  return value as { id: number; name: string };
}

function requireDeletedId(op: string, value: unknown): number {
  if (typeof value !== 'number' || value <= 0) {
    throw new HydrawiseMutationError(
      `${op} returned ${JSON.stringify(value ?? null)}; the operation may not have taken effect`,
    );
  }
  return value;
}

function zoneWritableToVars(p: ZoneWritable): Record<string, unknown> {
  return {
    zoneId: p.zone_id,
    icon: p.icon,
    name: p.name,
    number: p.number,
    wateringMode: p.watering_mode,
    globalMasterValve: p.global_master_valve,
    scheduleAdjustmentIds: p.schedule_adjustment_ids,
    wateringAdjustment: p.watering_adjustment_percent,
    wateringType: p.watering_type,
    runTime: p.run_time_minutes,
    wateringFrequencyMode: p.watering_frequency_mode,
    fixedWateringFrequency: p.fixed_watering_frequency_seconds,
    smartWateringFrequency: p.smart_watering_frequency_seconds,
    virtualSolarSyncWateringFrequency: p.virtual_solar_sync_watering_frequency_seconds,
    runNextAvailableStartTime: p.run_next_available_start_time,
    preConfiguredWateringScheduleId: p.pre_configured_watering_schedule_id,
    cycleSoakEnable: p.cycle_soak_enable,
    cycleCustomTime: p.cycle_custom_time_minutes,
    soakCustomTime: p.soak_custom_time_minutes,
    factors: p.monthly_adjustment_percents,
    sensorIds: p.sensor_ids,
    reusableSchedule: p.reusable_schedule,
    reusableScheduleName: p.reusable_schedule_name,
    flowMonitoringMethod: p.flow_monitoring_method,
    currentMonitoringMethod: p.current_monitoring_method,
    flowMonitoringValue: p.flow_monitoring_value,
    currentMonitoringValue: p.current_monitoring_value,
  };
}

function wateringTriggersWritableToVars(p: WateringTriggersWritable): Record<string, unknown> {
  return {
    controllerId: p.controller_id,
    contractorId: null,
    isContractor: false,
    extendWaterTemperature: p.extend_water_temperature,
    extendWaterTemperatureEnabled: p.extend_water_temperature_enabled,
    extendWaterTemperaturePercentage: p.extend_water_temperature_percent,
    extendWaterHumidity: p.extend_water_humidity_percent,
    extendWaterHumidityEnabled: p.extend_water_humidity_enabled,
    suspendWaterWeekRain: p.suspend_water_week_rain,
    suspendWaterRainDays: p.suspend_water_rain_days,
    suspendWaterWeekRainEnabled: p.suspend_water_week_rain_enabled,
    suspendWaterRain: p.suspend_water_rain,
    suspendWaterRainEnabled: p.suspend_water_rain_enabled,
    suspendWaterTemperature: p.suspend_water_temperature,
    suspendWaterTemperatureEnabled: p.suspend_water_temperature_enabled,
    suspendProbabilityOfPrecipitation: p.suspend_probability_of_precipitation_percent,
    suspendProbabilityOfPrecipitationEnabled: p.suspend_probability_of_precipitation_enabled,
    suspendWind: p.suspend_wind,
    suspendWindEnabled: p.suspend_wind_enabled,
    enableEvapotranspirationForecastTemperature: p.enable_evapotranspiration_forecast_temperature,
    enableEvapotranspirationForecastRain: p.enable_evapotranspiration_forecast_rain,
    reduceWaterTemperatureEnabled: p.reduce_water_temperature_enabled,
    reduceWaterTemperature: p.reduce_water_temperature,
    reduceWaterTemperaturePercentage: p.reduce_water_temperature_percent,
  };
}

function programStartTimeWritableToVars(
  p: ProgramStartTimeWritable,
  includeId: boolean,
): Record<string, unknown> {
  const vars: Record<string, unknown> = {
    controllerId: p.controller_id,
    contractorId: null,
    isContractor: false,
    applyAll: p.apply_all,
    zones: p.zones,
    schedules: p.schedules,
    time: p.time,
    wateringType: p.watering_type,
    timeType: p.time_type,
    sunday: p.sunday,
    monday: p.monday,
    tuesday: p.tuesday,
    wednesday: p.wednesday,
    thursday: p.thursday,
    friday: p.friday,
    saturday: p.saturday,
  };
  if (includeId && p.id !== undefined) vars.id = p.id;
  return vars;
}

function standardProgramToVars(
  p: StandardProgramWritable,
  isUpdate: boolean,
): Record<string, unknown> {
  const vars: Record<string, unknown> = {
    controllerId: p.controller_id,
    name: p.name,
    programType: p.program_type,
    dayPattern: p.day_pattern,
    standardProgramDayPattern: p.standard_program_day_pattern,
    interval: p.interval_days,
    seriesStart: p.series_start_epoch_seconds,
    startTimes: p.start_times,
    zoneRunTimes: p.zone_run_times.map((z) => ({
      zoneNumber: z.zone_number,
      runTimeGroupId: z.run_time_group_id ?? null,
      runDuration: z.run_duration ?? null,
    })),
    scheduleAdjustmentIds: p.schedule_adjustment_ids,
    seasonalAdjustmentFactors: p.seasonal_adjustment_factor_percents,
    validFrom: p.valid_from_epoch_seconds,
    validTo: p.valid_to_epoch_seconds,
    ignoreRainSensor: p.ignore_rain_sensor,
  };
  if (isUpdate && p.program_id !== undefined) vars.programId = p.program_id;
  return vars;
}

function wateringProgramToVars(
  p: WateringProgramWritable,
  isUpdate: boolean,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    wateringProgramName: p.watering_program_name,
    wateringProgramType: p.watering_program_type,
    controllerId: p.controller_id,
    seasonalAdjustment: p.seasonal_adjustment_percents,
    scheduleAdjustmentIds: p.schedule_adjustment_ids,
  };
  if (isUpdate && p.program_id !== undefined) base.wateringProgramId = p.program_id;
  if (p.program_type === 'Time') {
    base.fixedWateringRunTime = p.fixed_watering_run_time;
    base.fixedWateringFrequencyMode = p.fixed_watering_frequency_mode;
    base.fixedWateringFrequencyValue = p.fixed_watering_frequency_value ?? null;
    base.wateringProgramAdjustment = p.watering_program_adjustment ?? null;
  } else if (p.program_type === 'Smart') {
    base.smartWateringRunTime = p.smart_watering_run_time;
    base.smartWateringFrequencyValue = p.smart_watering_frequency_value;
  } else {
    base.virtualSolarSyncWateringRunTime = p.virtual_solar_sync_watering_run_time;
    base.virtualSolarSyncWateringFrequencyMode = p.virtual_solar_sync_watering_frequency_mode;
    base.virtualSolarSyncWateringFrequencyValue = p.virtual_solar_sync_watering_frequency_value ?? null;
  }
  return base;
}
