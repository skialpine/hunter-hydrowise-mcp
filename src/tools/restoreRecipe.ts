/**
 * Restore-recipe builder for the snapshot envelope.
 *
 * The recipe encodes the choreography an AI must follow to restore a snapshot to a
 * Hydrawise controller. Each step is `{ order, tool, args, depends_on, notes? }`. The
 * AI's restore loop is: for each step in order, call `step.tool` with `step.args` and
 * `preview: true` first, show the diff, get user confirmation, then call again with
 * `preview: false`. The restore-irrigation-backup skill is the runtime executor of
 * this plan.
 *
 * Design constraints (from openspec/changes/add-restore-guidance/design.md):
 * - Pure function over the snapshot data — no live API calls, no I/O, no state.
 * - Snapshot file is self-sufficient: anyone with the snapshot can re-derive the recipe.
 * - Hard-coded restore order encoded here in source so it's reviewable / testable.
 * - depends_on encodes the deterministic dependency graph (custom sensor types before
 *   sensors that reference them, programs before zone settings that reference them).
 * - args are the same shape the AI would pass to the named tool MINUS the `preview`
 *   field — the AI injects preview at call time (true first, then false).
 */

export interface RestoreStep {
  order: number;
  tool: string;
  args: Record<string, unknown>;
  depends_on: number[];
  notes?: string;
}

// =============================================================================
// Snapshot input shape (narrowed reads — the recipe builder only touches what it
// needs; everything else stays Record<string, unknown> from the snapshot envelope)
// =============================================================================

interface UnitValue {
  value: number | null;
  unit: string | null;
}

interface SnapshotZoneSettings {
  zone_id: number;
  name: string;
  number: number;
  icon: number | null;
  master_valve_override: number;
  watering_adjustment: number | null;
  cycle_soak_enable: boolean | null;
  cycle_custom_time: number | null;
  soak_custom_time: number | null;
  flow_monitoring_method: string | null;
  current_monitoring_method: string | null;
  flow_monitoring_value: number | null;
  current_monitoring_value: number | null;
  // Read schema doesn't expose these — null in snapshot, AI must supply at restore.
  watering_mode: number | null;
  global_master_valve: number | null;
  schedule_adjustment_ids: number[] | null;
  watering_type: number | null;
  run_time: number | null;
  watering_frequency_mode: number | null;
  fixed_watering_frequency: number | null;
  smart_watering_frequency: number | null;
  virtual_solar_sync_watering_frequency: number | null;
  run_next_available_start_time: boolean | null;
  pre_configured_watering_schedule_id: number | null;
  factors: number[] | null;
  sensor_ids: number[] | null;
  reusable_schedule: boolean | null;
  reusable_schedule_name: string | null;
  _unreadable_fields: string[];
  advanced_program?: { id: number; name: string; advanced_program_id: number } | null;
}

interface SnapshotZone {
  id: number;
  name: string;
  number: number;
  settings: SnapshotZoneSettings | null;
  program_start_times: Array<Record<string, unknown>>;
}

interface SnapshotSensor {
  id: number;
  name: string;
  model_id: number;
  input_number: number;
  zone_ids: number[];
  _observed: {
    model_name: string | null;
    sensor_type: string | null;
    mode_type: string;
    customer_id: number | null;
    delay: number | null;
    off_timer: number | null;
    flow_rate: number | null;
  };
}

interface SnapshotNote {
  id: number;
  note: string;
  type: string;
  pinned_to_top: boolean;
}

interface SnapshotStandardProgram {
  id: number;
  name: string;
  program_type: 'Standard';
  start_times: string[];
  days_run: string[];
  standard_program_day_pattern: string | null;
  scheduling_method: number | null;
  monthly_watering_adjustments: number[];
  schedule_adjustment_ids: number[];
  valid_from: number | null;
  valid_to: number | null;
  periodicity: { period: number; series_start: string | null } | null;
  per_zone_run_times: Array<{ zone_id: number; zone_number: number; run_time_group_id: number; duration_minutes: number }>;
}

export interface SnapshotForRecipe {
  snapshot_version: number;
  controller: {
    id: number;
    program_mode?: string | null;
    location?: { address: string | null; latitude: number | null; longitude: number | null } | null;
    master_valve?: { zone_number: number | null } | null;
    seasonal_adjustments: { factors: number[] };
    watering_triggers: Record<string, unknown> | null;
    zones: SnapshotZone[];
    programs: Array<Record<string, unknown>>;
    sensors: SnapshotSensor[];
    advanced_programs: Array<Record<string, unknown>>;
    controller_notes: SnapshotNote[];
  };
}

// =============================================================================
// Caveats
// =============================================================================

export function buildRestoreCaveats(snapshot: SnapshotForRecipe): string[] {
  const caveats: string[] = [];
  const c = snapshot.controller;

  // Caveat: zones with _unreadable_fields populated. update_zone_settings requires
  // many fields the read schema doesn't expose; AI must supply them at restore time
  // (typically by reading live state and merging) or the Zod validation will fail.
  const zonesWithUnreadable = c.zones
    .filter((z) => z.settings && z.settings._unreadable_fields.length > 0)
    .map((z) => `${z.name} (id ${z.id})`);
  if (zonesWithUnreadable.length > 0) {
    caveats.push(
      `Zones with unreadable writable fields (${zonesWithUnreadable.join(', ')}): the snapshot cannot capture watering_mode, global_master_valve, schedule_adjustment_ids, sensor_ids, factors, monitoring_method, etc. Before applying update_zone_settings, the AI must fetch live state via get_zone_settings and merge — or accept that null values in the recipe args will fail Zod validation.`,
    );
  }

  // Caveat: any zone references a reusable schedule. Account-managed records with
  // no exposed CRUD; if the referenced id has been removed since capture, restore fails.
  const scheduleAdjustmentIds = new Set<number>();
  for (const z of c.zones) {
    for (const id of z.settings?.schedule_adjustment_ids ?? []) scheduleAdjustmentIds.add(id);
  }
  if (scheduleAdjustmentIds.size > 0) {
    caveats.push(
      `Snapshot references reusable schedule_adjustment_ids: [${Array.from(scheduleAdjustmentIds).sort().join(', ')}]. These are account-managed with no exposed CRUD — if any has been removed between capture and restore, update_zone_settings will fail. Verify with the GUI before applying.`,
    );
  }

  // Caveat: custom sensor types. Their ids are reallocated on re-creation, so the
  // recipe's create_sensor model_id values are snapshot-time — restore must re-resolve.
  const customSensors = c.sensors.filter(
    (s) => s._observed.customer_id != null && s._observed.customer_id !== 0,
  );
  if (customSensors.length > 0) {
    const names = customSensors.map((s) => s._observed.model_name ?? `model ${s.model_id}`);
    caveats.push(
      `Snapshot references custom sensor types (${names.join(', ')}). Custom-type ids are reallocated on re-creation — after running create_custom_sensor_type, the AI must re-resolve the new model_id and patch each create_sensor step accordingly. The recipe's model_id values are snapshot-time references.`,
    );
  }

  // Caveat: ADVANCED-mode snapshots have inherent restore-side complexity that the
  // recipe doesn't fully encode (no createAdvancedProgram mutation; AdvancedProgram
  // state is derived from per-zone watering frequency + WateringProgram subtype).
  if (c.program_mode === 'ADVANCED') {
    caveats.push(
      'Snapshot is from an ADVANCED-mode controller. AdvancedProgram has no direct mutation — restore happens via update_zone_settings (per-zone watering frequency + watering_program references) plus create/update_watering_program for the referenced Time/Smart/VSS subtype. The recipe captures the AdvancedProgram view but not the underlying WateringProgram subtype config; the AI must reconstruct the watering programs from current Hydrawise state if they differ.',
    );
  }

  // Caveat: hardware re-wiring is out-of-band for sensors. The snapshot captures
  // input_number (e.g. 1 = SEN-1); if the user has since rewired, restore writes the
  // wrong physical-pin assignment. Cannot be detected programmatically.
  if (c.sensors.length > 0) {
    caveats.push(
      'Sensor input_number values reflect physical wiring at capture time. If sensor wiring has changed between capture and restore (e.g. rain sensor moved from SEN-1 to SEN-2), the recipe will write the wrong physical-pin assignment. Verify hardware wiring before applying create_sensor / update_sensor steps.',
    );
  }

  // Caveat: watering_triggers values include unit strings — if the account's unit
  // preference (F vs C, in vs mm, mph vs kph) has changed between capture and restore,
  // a numeric value applied without converting becomes incorrect.
  if (c.watering_triggers) {
    const wt = c.watering_triggers;
    const unitFields = [
      'extend_water_temperature',
      'suspend_water_week_rain',
      'suspend_water_rain',
      'suspend_water_temperature',
      'suspend_wind',
      'reduce_water_temperature',
    ];
    const units = new Set<string>();
    for (const f of unitFields) {
      const v = wt[f] as UnitValue | null | undefined;
      if (v?.unit) units.add(v.unit);
    }
    if (units.size > 0) {
      caveats.push(
        `Watering triggers were captured with units: [${Array.from(units).sort().join(', ')}]. Hydrawise mutations take bare numbers; if the account's unit preference has changed between capture and restore, the AI MUST convert values before applying update_watering_triggers — otherwise the controller will receive unconverted numbers (e.g. 97°F captured → 97 restored as °C = scorched lawn).`,
      );
    }
  }

  return caveats;
}

// =============================================================================
// Recipe
// =============================================================================

export function buildRestoreRecipe(snapshot: SnapshotForRecipe): RestoreStep[] {
  const steps: RestoreStep[] = [];
  const c = snapshot.controller;
  const controllerId = c.id;

  // Local helper: append a step and return its order number for later depends_on.
  const push = (
    tool: string,
    args: Record<string, unknown>,
    depends_on: number[] = [],
    notes?: string,
  ): number => {
    const order = steps.length + 1;
    const step: RestoreStep = { order, tool, args, depends_on };
    if (notes !== undefined) step.notes = notes;
    steps.push(step);
    return order;
  };

  // -------------------------------------------------------------------------
  // 1. Controller-level prerequisites (no inter-step dependencies — these all
  //    operate on different fields)
  // -------------------------------------------------------------------------

  // 1a. update_controller_program_mode — set FIRST because switching modes can
  // invalidate prior-mode schedule data. Skipped if program_mode is missing
  // (older snapshots) or unknown.
  if (c.program_mode === 'STANDARD' || c.program_mode === 'ADVANCED') {
    push(
      'update_controller_program_mode',
      { controller_id: controllerId, program_mode: c.program_mode },
      [],
      'Set program mode first. Switching modes invalidates per-mode schedule data, so this must precede any program / zone-settings calls.',
    );
  }

  // 1b. update_location — only if at least one of address / coords is present.
  if (c.location) {
    const args: Record<string, unknown> = { controller_id: controllerId };
    if (c.location.address) args.address = c.location.address;
    if (c.location.latitude != null && c.location.longitude != null) {
      args.latitude = c.location.latitude;
      args.longitude = c.location.longitude;
    }
    if (Object.keys(args).length > 1) {
      push(
        'update_location',
        args,
        [],
        'Required for Virtual Solar Sync watering programs. controller_id resolves device_id server-side.',
      );
    }
  }

  // 1c. update_controller_master_valve — only if zone_number is captured.
  if (c.master_valve?.zone_number != null) {
    push(
      'update_controller_master_valve',
      { controller_id: controllerId, zone_number: c.master_valve.zone_number },
      [],
      'Per Zone.masterValve schema doc: -1 = controller global default; 0 = always disabled; else specific zone number.',
    );
  }

  // 1d. update_seasonal_adjustments — always emit if 12 factors are present.
  if (c.seasonal_adjustments.factors.length === 12) {
    push(
      'update_seasonal_adjustments',
      { controller_id: controllerId, factors: c.seasonal_adjustments.factors },
      [],
    );
  }

  // 1e. update_watering_triggers — extract bare values from {value, unit} wrappers
  // (the unit is captured for caveat detection only; the mutation takes bare numbers).
  // The CLAUDE.md gotcha re unit-pref drift between capture and restore is documented
  // in buildRestoreCaveats above.
  if (c.watering_triggers) {
    const wt = c.watering_triggers;
    const unwrap = (k: string): number | null => {
      const v = wt[k] as UnitValue | null | undefined;
      return v?.value ?? null;
    };
    const passthrough = (k: string): unknown => wt[k];
    const args: Record<string, unknown> = {
      controller_id: controllerId,
      extend_water_temperature: unwrap('extend_water_temperature'),
      extend_water_temperature_enabled: passthrough('extend_water_temperature_enabled'),
      extend_water_temperature_percentage: passthrough('extend_water_temperature_percentage'),
      extend_water_humidity: passthrough('extend_water_humidity'),
      extend_water_humidity_enabled: passthrough('extend_water_humidity_enabled'),
      suspend_water_week_rain: unwrap('suspend_water_week_rain'),
      suspend_water_rain_days: passthrough('suspend_water_rain_days'),
      suspend_water_week_rain_enabled: passthrough('suspend_water_week_rain_enabled'),
      suspend_water_rain: unwrap('suspend_water_rain'),
      suspend_water_rain_enabled: passthrough('suspend_water_rain_enabled'),
      suspend_water_temperature: unwrap('suspend_water_temperature'),
      suspend_water_temperature_enabled: passthrough('suspend_water_temperature_enabled'),
      suspend_probability_of_precipitation: passthrough('suspend_probability_of_precipitation'),
      suspend_probability_of_precipitation_enabled: passthrough('suspend_probability_of_precipitation_enabled'),
      suspend_wind: unwrap('suspend_wind'),
      suspend_wind_enabled: passthrough('suspend_wind_enabled'),
      enable_evapotranspiration_forecast_temperature: passthrough('enable_evapotranspiration_forecast_temperature'),
      enable_evapotranspiration_forecast_rain: passthrough('enable_evapotranspiration_forecast_rain'),
      reduce_water_temperature_enabled: passthrough('reduce_water_temperature_enabled'),
      reduce_water_temperature: unwrap('reduce_water_temperature'),
      reduce_water_temperature_percentage: passthrough('reduce_water_temperature_percentage'),
    };
    push(
      'update_watering_triggers',
      args,
      [],
      'Bare numbers per the schema; unit metadata is captured separately. See _caveats for unit-pref drift warning.',
    );
  }

  // -------------------------------------------------------------------------
  // 2. Sensor universe — custom types first, then sensors that reference them
  // -------------------------------------------------------------------------

  // 2a. create_custom_sensor_type — for each unique custom-type model referenced
  // by a captured sensor. Custom types are marked by customer_id != null && != 0
  // (built-in types are customer_id null/0). Dedup by model_id.
  const customTypeOrderByModelId = new Map<number, number>();
  const customTypesEmitted = new Set<number>();
  for (const sensor of c.sensors) {
    const obs = sensor._observed;
    if (obs.customer_id == null || obs.customer_id === 0) continue;
    if (customTypesEmitted.has(sensor.model_id)) continue;
    customTypesEmitted.add(sensor.model_id);
    const order = push(
      'create_custom_sensor_type',
      {
        customer_id: obs.customer_id,
        name: obs.model_name ?? `Restored custom type for sensor ${sensor.id}`,
        custom_sensor_type: obs.sensor_type,
        mode_type: obs.mode_type,
        delay: obs.delay,
        off_timer: obs.off_timer,
        flow_sensor_rate: obs.flow_rate,
      },
      [],
      'Custom sensor type ids are reallocated on creation. After this step succeeds, the AI must re-resolve the new model_id and patch the create_sensor step below that references this model_id.',
    );
    customTypeOrderByModelId.set(sensor.model_id, order);
  }

  // 2b. create_sensor — depends on the matching custom_type step (if any).
  for (const sensor of c.sensors) {
    const customTypeOrder = customTypeOrderByModelId.get(sensor.model_id);
    push(
      'create_sensor',
      {
        controller_id: controllerId,
        name: sensor.name,
        model_id: sensor.model_id,
        input_number: sensor.input_number,
        zone_ids: sensor.zone_ids,
      },
      customTypeOrder !== undefined ? [customTypeOrder] : [],
      customTypeOrder !== undefined
        ? 'model_id refers to the custom type created above. Re-resolve after that step.'
        : undefined,
    );
  }

  // -------------------------------------------------------------------------
  // 3. Programs (depends on sensors / master valve being in place)
  // -------------------------------------------------------------------------

  // 3a. update_standard_program — for each Standard program with full inlined detail.
  // Thin entries (those that didn't get inlined) are skipped because we don't have
  // the full payload. ADVANCED programs are NOT emitted as discrete steps because
  // there's no create/updateAdvancedProgram mutation — see ADVANCED-mode caveat above.
  const programStepOrders: number[] = [];
  for (const p of c.programs) {
    if (p.program_type !== 'Standard') continue;
    // Only emit if the program is the full inlined shape (has start_times etc.).
    if (!Array.isArray((p as { start_times?: unknown }).start_times)) continue;
    const sp = p as unknown as SnapshotStandardProgram;
    const order = push(
      'update_standard_program',
      {
        program_id: sp.id,
        controller_id: controllerId,
        name: sp.name,
        // The mutation expects program_type as Int (the type-id, not the discriminator
        // string); the snapshot's "Standard" discriminator doesn't map here. Pass null
        // — the AI must resolve from get_program before applying. Captured in notes.
        program_type: null,
        day_pattern: null,
        standard_program_day_pattern: sp.standard_program_day_pattern,
        interval: sp.periodicity?.period ?? null,
        series_start: null,
        start_times: sp.start_times,
        zone_run_times: sp.per_zone_run_times.map((r) => ({
          zone_number: r.zone_number,
          run_time_group_id: r.run_time_group_id,
          run_duration: null,
        })),
        schedule_adjustment_ids: sp.schedule_adjustment_ids,
        seasonal_adjustment_factors: sp.monthly_watering_adjustments,
        valid_from: sp.valid_from,
        valid_to: sp.valid_to,
        ignore_rain_sensor: null,
      },
      [],
      'program_type, day_pattern, series_start, run_duration, ignore_rain_sensor are not exposed by the read schema and arrive null. Resolve from get_program(controller_id, program_id, "Standard") before applying.',
    );
    programStepOrders.push(order);
  }

  // -------------------------------------------------------------------------
  // 4. Per-zone settings — depends on programs (zone_settings can reference
  //    sensor_ids and schedule_adjustment_ids that programs / sensors created above)
  // -------------------------------------------------------------------------

  for (const zone of c.zones) {
    if (!zone.settings) continue;
    const s = zone.settings;
    push(
      'update_zone_settings',
      {
        zone_id: s.zone_id,
        name: s.name,
        number: s.number,
        icon: s.icon,
        // Many of these are null in the snapshot (read schema doesn't expose them).
        // The AI must merge with live state before applying — see _caveats and notes.
        watering_mode: s.watering_mode,
        global_master_valve: s.global_master_valve,
        schedule_adjustment_ids: s.schedule_adjustment_ids ?? [],
        watering_adjustment: s.watering_adjustment,
        watering_type: s.watering_type,
        run_time: s.run_time,
        watering_frequency_mode: s.watering_frequency_mode,
        fixed_watering_frequency: s.fixed_watering_frequency,
        smart_watering_frequency: s.smart_watering_frequency,
        virtual_solar_sync_watering_frequency: s.virtual_solar_sync_watering_frequency,
        run_next_available_start_time: s.run_next_available_start_time,
        pre_configured_watering_schedule_id: s.pre_configured_watering_schedule_id,
        cycle_soak_enable: s.cycle_soak_enable,
        cycle_custom_time: s.cycle_custom_time,
        soak_custom_time: s.soak_custom_time,
        factors: s.factors,
        sensor_ids: s.sensor_ids,
        reusable_schedule: s.reusable_schedule,
        reusable_schedule_name: s.reusable_schedule_name,
        flow_monitoring_method: s.flow_monitoring_method,
        current_monitoring_method: s.current_monitoring_method,
        flow_monitoring_value: s.flow_monitoring_value,
        current_monitoring_value: s.current_monitoring_value,
      },
      programStepOrders,
      s._unreadable_fields.length > 0
        ? `Zone has ${s._unreadable_fields.length} unreadable fields (${s._unreadable_fields.join(', ')}); the args above contain nulls for them. The AI must read live state via get_zone_settings, merge non-null snapshot values over live values, and pass the merged payload — applying the recipe args verbatim will fail Zod validation on the required fields.`
        : undefined,
    );
  }

  // -------------------------------------------------------------------------
  // 5. Per-zone start times (ADVANCED-mode populates these; STANDARD leaves them
  //    empty since start times live on the StandardProgram itself)
  // -------------------------------------------------------------------------

  for (const zone of c.zones) {
    for (const _start of zone.program_start_times) {
      // The snapshot captures the start time but the underlying schema requires many
      // fields (controller_id, apply_all, zones, schedules, time, watering_type,
      // time_type, days-of-week ints) that aren't all in the captured shape. Emit a
      // step with controller_id + the captured fields and a notes block guiding the AI
      // to merge with live state before applying.
      push(
        'create_program_start_time',
        {
          controller_id: controllerId,
          // The full payload requires apply_all, zones, schedules, time, watering_type,
          // time_type, sunday..saturday — captured fields are passed through; missing
          // ones must be supplied by the AI from live state or user prompt.
          ..._start,
        },
        [],
        'create_program_start_time requires fields the snapshot does not fully capture (apply_all, zones, schedules, days-of-week ints). Read live start times via list_program_start_times_for_zone and merge before applying, or treat this as advisory.',
      );
    }
  }

  // -------------------------------------------------------------------------
  // 6. Notes (no inter-step dependencies; emitted last so the rest of restore is
  //    in place before tagging it with notes)
  // -------------------------------------------------------------------------

  for (const note of c.controller_notes) {
    push(
      'create_controller_note',
      {
        controller_id: controllerId,
        note: note.note,
        type: note.type,
        pinned_to_top: note.pinned_to_top,
      },
      [],
    );
  }

  for (const zone of c.zones) {
    if (!zone.settings) continue;
    // zone_notes lives inside the zone settings record — narrow type here.
    const zoneNotes = (zone.settings as unknown as { zone_notes?: SnapshotNote[] }).zone_notes ?? [];
    for (const note of zoneNotes) {
      push(
        'create_zone_note',
        {
          zone_id: zone.id,
          note: note.note,
          type: note.type,
          pinned_to_top: note.pinned_to_top,
        },
        [],
      );
    }
  }

  return steps;
}

// =============================================================================
// Tool catalog (for round-trip test)
// =============================================================================

// Every tool name the recipe builder might emit. Used by the integration test to
// guarantee the builder doesn't reference a tool that doesn't exist on the server.
// Keep in sync with the registerTool calls in src/tools/*.ts. The catalog test
// verifies the OTHER direction (every emitted name appears in this list).
export const RECIPE_TOOL_NAMES = [
  'update_controller_program_mode',
  'update_location',
  'update_controller_master_valve',
  'update_seasonal_adjustments',
  'update_watering_triggers',
  'create_custom_sensor_type',
  'create_sensor',
  'update_standard_program',
  'update_zone_settings',
  'create_program_start_time',
  'create_controller_note',
  'create_zone_note',
] as const;

export type RecipeToolName = (typeof RECIPE_TOOL_NAMES)[number];
