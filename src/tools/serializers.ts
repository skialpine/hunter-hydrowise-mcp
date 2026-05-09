import type { Controller, User, Zone } from '../hydrawise/queries.js';

export function serializeUser(user: User): Record<string, unknown> {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

export function serializeController(controller: Controller): Record<string, unknown> {
  return {
    id: controller.id,
    name: controller.name,
    online: controller.online,
    serial_number: controller.hardware?.serialNumber ?? null,
    last_contact_time: controller.lastContactTime?.value ?? null,
  };
}

export function serializeZone(zone: Zone): Record<string, unknown> {
  return {
    id: zone.id,
    name: zone.name,
    number: zone.number.value,
    suspended_until: zone.status.suspendedUntil?.value ?? null,
    last_run: zone.status.lastRun?.value ?? null,
    next_run: zone.status.nextRun?.value ?? null,
  };
}
