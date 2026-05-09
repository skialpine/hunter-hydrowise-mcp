import { HydrawiseMutationError, HydrawiseNotFoundError } from '../errors.js';
import type { HydrawiseClient } from './client.js';
import {
  CONTROLLER_QUERY,
  CONTROLLERS_QUERY,
  CREATE_CONTROLLER_NOTE_MUTATION,
  CREATE_EXPANDER_MUTATION,
  CREATE_PROGRAM_START_TIME_MUTATION,
  CREATE_SMART_WATERING_PROGRAM_MUTATION,
  CREATE_STANDARD_PROGRAM_MUTATION,
  CREATE_TIME_WATERING_PROGRAM_MUTATION,
  CREATE_VSS_WATERING_PROGRAM_MUTATION,
  CREATE_ZONE_ADVANCED_MUTATION,
  CREATE_ZONE_NOTE_MUTATION,
  DELETE_CONTROLLER_NOTE_MUTATION,
  DELETE_EXPANDER_MUTATION,
  DELETE_PROGRAM_START_TIME_MUTATION,
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
  START_ALL_ZONES_MUTATION,
  START_ZONE_MUTATION,
  STOP_ALL_ZONES_MUTATION,
  STOP_ZONE_MUTATION,
  SUSPEND_ALL_ZONES_MUTATION,
  SUSPEND_ZONE_MUTATION,
  UPDATE_CONTROLLER_MASTER_VALVE_MUTATION,
  UPDATE_CONTROLLER_NOTE_MUTATION,
  UPDATE_CONTROLLER_PROGRAM_MODE_MUTATION,
  UPDATE_EXPANDER_MUTATION,
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
  WATERING_REPORT_QUERY,
  WATERING_TRIGGERS_QUERY,
  ZONE_FULL_QUERY,
  ZONE_PAST_RUNS_QUERY,
  ZONE_QUERY,
  ZONE_RUN_SUMMARY_ANNUAL_QUERY,
  ZONE_RUN_SUMMARY_CURRENT_WEEK_QUERY,
  ZONE_RUN_SUMMARY_MONTHLY_QUERY,
  ZONE_RUN_SUMMARY_WEEKLY_QUERY,
  ZONES_QUERY,
  type Controller,
  type ControllerNoteRead,
  type LocationRead,
  type MasterValveRead,
  type PastZoneRuns,
  type ProgramListEntry,
  type ProgramStartTimeRead,
  type ProgramStartTimeWritable,
  type RunEventType,
  type RunSummaryDetails,
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

export type ControllerProgramMode = 'STANDARD' | 'ADVANCED';
export type NoteType = 'fault' | 'location' | 'repair' | 'comment';

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

export type RunSummaryPeriod = 'CURRENT_WEEK' | 'WEEK' | 'MONTH' | 'YEAR';

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
      program_type: p.__typename,
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
    const hasAddress = typeof payload.address === 'string';
    const hasCoords = typeof payload.latitude === 'number' && typeof payload.longitude === 'number';
    if (!hasAddress && !hasCoords) {
      throw new HydrawiseMutationError('updateLocation requires at least one of address, latitude+longitude');
    }
    let result: LocationRead | null = null;
    if (hasAddress) {
      result = await this.client.mutateRaw(
        UPDATE_LOCATION_MUTATION,
        { deviceId: payload.device_id, address: payload.address },
        (data) => data.updateLocation as LocationRead | null,
      );
    }
    if (hasCoords) {
      result = await this.client.mutateRaw(
        UPDATE_LOCATION_COORDINATES_MUTATION,
        { deviceId: payload.device_id, latitude: payload.latitude, longitude: payload.longitude },
        (data) => data.updateLocationCoordinates as LocationRead | null,
      );
    }
    if (!result) {
      throw new HydrawiseMutationError('updateLocation returned null; the operation may not have taken effect');
    }
    return result;
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

function requireNote(op: string, value: unknown): { id: number; note: string; type: NoteType; pinnedToTop: boolean; lastUpdatedAt: { value: string } | null } {
  if (!value || typeof value !== 'object') {
    throw new HydrawiseMutationError(`${op} returned ${JSON.stringify(value ?? null)}; the operation may not have taken effect`);
  }
  const v = value as { id?: unknown; note?: unknown; type?: unknown; pinnedToTop?: unknown; lastUpdatedAt?: unknown };
  if (typeof v.id !== 'number' || typeof v.note !== 'string' || typeof v.pinnedToTop !== 'boolean') {
    throw new HydrawiseMutationError(`${op} returned an unexpected shape`);
  }
  return value as ReturnType<typeof requireNote>;
}

function requireStatus(op: string, value: unknown): StatusCodeAndSummary {
  if (!value || typeof value !== 'object') {
    throw new HydrawiseMutationError(`${op} returned ${JSON.stringify(value ?? null)}; the operation may not have taken effect`);
  }
  const v = value as { status?: unknown };
  if (v.status !== 'OK' && v.status !== 'WARNING') {
    throw new HydrawiseMutationError(`${op} returned non-OK status: ${JSON.stringify(value)}`);
  }
  return value as StatusCodeAndSummary;
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
    wateringAdjustment: p.watering_adjustment,
    wateringType: p.watering_type,
    runTime: p.run_time,
    wateringFrequencyMode: p.watering_frequency_mode,
    fixedWateringFrequency: p.fixed_watering_frequency,
    smartWateringFrequency: p.smart_watering_frequency,
    virtualSolarSyncWateringFrequency: p.virtual_solar_sync_watering_frequency,
    runNextAvailableStartTime: p.run_next_available_start_time,
    preConfiguredWateringScheduleId: p.pre_configured_watering_schedule_id,
    cycleSoakEnable: p.cycle_soak_enable,
    cycleCustomTime: p.cycle_custom_time,
    soakCustomTime: p.soak_custom_time,
    factors: p.factors,
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
    wateringAdjustment: p.watering_adjustment,
    wateringType: p.watering_type,
    runTime: p.run_time,
    wateringFrequencyMode: p.watering_frequency_mode,
    fixedWateringFrequency: p.fixed_watering_frequency,
    smartWateringFrequency: p.smart_watering_frequency,
    virtualSolarSyncWateringFrequency: p.virtual_solar_sync_watering_frequency,
    runNextAvailableStartTime: p.run_next_available_start_time,
    preConfiguredWateringScheduleId: p.pre_configured_watering_schedule_id,
    cycleSoakEnable: p.cycle_soak_enable,
    cycleCustomTime: p.cycle_custom_time,
    soakCustomTime: p.soak_custom_time,
    factors: p.factors,
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
    extendWaterTemperaturePercentage: p.extend_water_temperature_percentage,
    extendWaterHumidity: p.extend_water_humidity,
    extendWaterHumidityEnabled: p.extend_water_humidity_enabled,
    suspendWaterWeekRain: p.suspend_water_week_rain,
    suspendWaterRainDays: p.suspend_water_rain_days,
    suspendWaterWeekRainEnabled: p.suspend_water_week_rain_enabled,
    suspendWaterRain: p.suspend_water_rain,
    suspendWaterRainEnabled: p.suspend_water_rain_enabled,
    suspendWaterTemperature: p.suspend_water_temperature,
    suspendWaterTemperatureEnabled: p.suspend_water_temperature_enabled,
    suspendProbabilityOfPrecipitation: p.suspend_probability_of_precipitation,
    suspendProbabilityOfPrecipitationEnabled: p.suspend_probability_of_precipitation_enabled,
    suspendWind: p.suspend_wind,
    suspendWindEnabled: p.suspend_wind_enabled,
    enableEvapotranspirationForecastTemperature: p.enable_evapotranspiration_forecast_temperature,
    enableEvapotranspirationForecastRain: p.enable_evapotranspiration_forecast_rain,
    reduceWaterTemperatureEnabled: p.reduce_water_temperature_enabled,
    reduceWaterTemperature: p.reduce_water_temperature,
    reduceWaterTemperaturePercentage: p.reduce_water_temperature_percentage,
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
    interval: p.interval,
    seriesStart: p.series_start,
    startTimes: p.start_times,
    zoneRunTimes: p.zone_run_times.map((z) => ({
      zoneNumber: z.zone_number,
      runTimeGroupId: z.run_time_group_id ?? null,
      runDuration: z.run_duration ?? null,
    })),
    scheduleAdjustmentIds: p.schedule_adjustment_ids,
    seasonalAdjustmentFactors: p.seasonal_adjustment_factors,
    validFrom: p.valid_from,
    validTo: p.valid_to,
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
    seasonalAdjustment: p.seasonal_adjustment,
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
