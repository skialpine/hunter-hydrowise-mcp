import type { HydrawiseClient } from './client.js';
import {
  CONTROLLER_QUERY,
  CONTROLLERS_QUERY,
  ME_QUERY,
  RESUME_ALL_ZONES_MUTATION,
  RESUME_ZONE_MUTATION,
  START_ALL_ZONES_MUTATION,
  START_ZONE_MUTATION,
  STOP_ALL_ZONES_MUTATION,
  STOP_ZONE_MUTATION,
  SUSPEND_ALL_ZONES_MUTATION,
  SUSPEND_ZONE_MUTATION,
  ZONE_QUERY,
  ZONES_QUERY,
  type Controller,
  type StatusCodeAndSummary,
  type User,
  type Zone,
} from './queries.js';

export interface StartZoneOptions {
  durationSeconds?: number;
  markRunAsScheduled?: boolean;
  stackRuns?: boolean;
}

export interface StartAllZonesOptions {
  durationSeconds?: number;
  markRunAsScheduled?: boolean;
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

  async getController(controllerId: number): Promise<Controller | null> {
    const data = await this.client.query<{ controller: Controller | null }>(CONTROLLER_QUERY, {
      controllerId,
    });
    return data.controller;
  }

  async getZones(controllerId: number): Promise<Zone[]> {
    const data = await this.client.query<{ controller: { zones: Zone[] | null } | null }>(
      ZONES_QUERY,
      { controllerId },
    );
    return data.controller?.zones ?? [];
  }

  async getZone(zoneId: number): Promise<Zone | null> {
    const data = await this.client.query<{ zone: Zone | null }>(ZONE_QUERY, { zoneId });
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
}
