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

// `tool` is constrained to RecipeToolName (declared near the bottom of this file).
// This moves the catalog test invariant ("recipe never emits an unknown tool name")
// from runtime assertion into the type system: forgetting to add a new tool to
// RECIPE_TOOL_NAMES now produces a compile error in the push() helper below rather
// than a delayed test failure.
export interface RestoreStep {
  order: number;
  tool: RecipeToolName;
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
  watering_adjustment_percent: number | null;
  cycle_soak_enable: boolean | null;
  cycle_custom_time_minutes: number | null;
  soak_custom_time_minutes: number | null;
  flow_monitoring_method: string | null;
  current_monitoring_method: string | null;
  flow_monitoring_value: number | null;
  current_monitoring_value: number | null;
  // Read schema doesn't expose these — null in snapshot, AI must supply at restore.
  watering_mode: number | null;
  global_master_valve: number | null;
  schedule_adjustment_ids: number[] | null;
  watering_type: number | null;
  run_time_minutes: number | null;
  watering_frequency_mode: number | null;
  fixed_watering_frequency_seconds: number | null;
  smart_watering_frequency_seconds: number | null;
  virtual_solar_sync_watering_frequency_seconds: number | null;
  run_next_available_start_time: boolean | null;
  pre_configured_watering_schedule_id: number | null;
  monthly_adjustment_percents: number[] | null;
  sensor_ids: number[] | null;
  reusable_schedule: boolean | null;
  reusable_schedule_name: string | null;
  _unreadable_fields: string[];
  advanced_program?: { id: number; name: string; advanced_program_id: number } | null;
  // Injected by backup.ts after serializeZoneSettings — not part of the ZoneRichRead
  // read shape. Always populated in snapshots built by the current code (empty array
  // when no notes). The `?` makes this type compatible with older snapshots that
  // predate this field — use `?? []` when reading rather than direct array access.
  zone_notes?: SnapshotNote[];
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
    delay_seconds: number | null;
    off_timer_seconds: number | null;
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
  monthly_watering_adjustment_percents: number[];
  schedule_adjustment_ids: number[];
  valid_from_epoch_seconds: number | null;
  valid_to_epoch_seconds: number | null;
  periodicity: { period: number; series_start_epoch_seconds: number | null } | null;
  per_zone_run_times: Array<{ zone_id: number; zone_number: number; run_time_group_id: number; duration_minutes: number }>;
}

export interface SnapshotForRecipe {
  snapshot_version: number;
  controller: {
    id: number;
    program_mode?: string | null;
    // Boolean (nullable) — null means older firmware / unknown; true means hibernated at capture time.
    hibernate_status?: boolean | null;
    location?: { address: string | null; latitude: number | null; longitude: number | null } | null;
    master_valve?: { zone_number: number | null } | null;
    seasonal_adjustments: { monthly_adjustment_percents: number[] };
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

  // NOTE: The v5-compatibility guard below is intentionally unreachable in all current callers.
  // buildRestoreCaveats is called from backup.ts at capture time (always passes a freshly-built
  // v7 snapshot) and from unit tests (all fixtures hardcode snapshot_version: 7), so
  // snapshot_version < 6 can never be true here. The guard is retained so that any future
  // caller that passes an older snapshot gets the warning rather than silently proceeding.
  // The user-facing v5 incompatibility block lives in the restore-irrigation-backup skill
  // (SKILL.md), which explicitly hard-stops and warns before replaying a pre-v6 recipe.
  if (snapshot.snapshot_version < 6) {
    caveats.push(
      `This snapshot was captured by server version ${snapshot.snapshot_version} (pre-v6). The _restore_recipe args use the old un-suffixed field names (e.g. cycle_custom_time, factors, interval) which are incompatible with the current server's v6 naming convention. Do NOT replay this snapshot's recipe against the current server — field names will fail Zod validation. Use the server version that captured this snapshot, or manually translate field names to the v6 convention.`,
    );
  }

  // Caveat: controller was hibernated at capture time — scheduler was not running.
  if (c.hibernate_status === true) {
    caveats.push(
      'Controller was hibernated when this snapshot was captured. The scheduler was not running; some live values (seasonal adjustments, sensor states) may reflect a suspended baseline. Verify actual state after waking before restoring.',
    );
  }

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

  // FYI-level note about sensor wiring. We DON'T emit this when capture and restore
  // controllers are the same (the common case — restoring back to where you captured
  // from), because it would fire on every restore and train the user to ack-and-ignore.
  // The skill renders FYI-prefixed caveats as a single info line, not as a separate
  // ack prompt. This keeps the ack prompts focused on safety-critical caveats
  // (unit drift, custom-type id reallocation, unreadable fields).
  if (c.sensors.length > 0) {
    caveats.push(
      'FYI: Sensor input_number values reflect physical wiring at capture time. If sensor wiring has changed between capture and restore (e.g. rain sensor moved from SEN-1 to SEN-2), the create_sensor / update_sensor steps will write the wrong physical-pin assignment. Verify only if you suspect rewiring has occurred.',
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
  // The `tool` parameter is typed as RecipeToolName so the compiler rejects any
  // call site that emits a tool name not present in RECIPE_TOOL_NAMES.
  const push = (
    tool: RecipeToolName,
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
  if (c.seasonal_adjustments.monthly_adjustment_percents.length === 12) {
    push(
      'update_seasonal_adjustments',
      { controller_id: controllerId, monthly_adjustment_percents: c.seasonal_adjustments.monthly_adjustment_percents },
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
      extend_water_temperature_percent: passthrough('extend_water_temperature_percent'),
      extend_water_humidity_percent: passthrough('extend_water_humidity_percent'),
      extend_water_humidity_enabled: passthrough('extend_water_humidity_enabled'),
      suspend_water_week_rain: unwrap('suspend_water_week_rain'),
      suspend_water_rain_days: passthrough('suspend_water_rain_days'),
      suspend_water_week_rain_enabled: passthrough('suspend_water_week_rain_enabled'),
      suspend_water_rain: unwrap('suspend_water_rain'),
      suspend_water_rain_enabled: passthrough('suspend_water_rain_enabled'),
      suspend_water_temperature: unwrap('suspend_water_temperature'),
      suspend_water_temperature_enabled: passthrough('suspend_water_temperature_enabled'),
      suspend_probability_of_precipitation_percent: passthrough('suspend_probability_of_precipitation_percent'),
      suspend_probability_of_precipitation_enabled: passthrough('suspend_probability_of_precipitation_enabled'),
      suspend_wind: unwrap('suspend_wind'),
      suspend_wind_enabled: passthrough('suspend_wind_enabled'),
      enable_evapotranspiration_forecast_temperature: passthrough('enable_evapotranspiration_forecast_temperature'),
      enable_evapotranspiration_forecast_rain: passthrough('enable_evapotranspiration_forecast_rain'),
      reduce_water_temperature_enabled: passthrough('reduce_water_temperature_enabled'),
      reduce_water_temperature: unwrap('reduce_water_temperature'),
      reduce_water_temperature_percent: passthrough('reduce_water_temperature_percent'),
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
        delay_seconds: obs.delay_seconds,
        off_timer_seconds: obs.off_timer_seconds,
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
        interval_days: sp.periodicity?.period ?? null,
        series_start_epoch_seconds: sp.periodicity?.series_start_epoch_seconds ?? null,
        start_times: sp.start_times,
        zone_run_times: sp.per_zone_run_times.map((r) => ({
          zone_number: r.zone_number,
          run_time_group_id: r.run_time_group_id,
          run_duration: null,
        })),
        schedule_adjustment_ids: sp.schedule_adjustment_ids,
        seasonal_adjustment_factor_percents: sp.monthly_watering_adjustment_percents,
        valid_from_epoch_seconds: sp.valid_from_epoch_seconds,
        valid_to_epoch_seconds: sp.valid_to_epoch_seconds,
        ignore_rain_sensor: null,
      },
      [],
      'REQUIRED MERGE BEFORE APPLY: program_type, day_pattern, run_duration (every zone), and ignore_rain_sensor arrive null here — the read schema does not expose them. Call get_program(controller_id, program_id, "Standard") first, merge all non-null snapshot values over the live values, then apply. Skipping the merge and replaying null run_duration values verbatim will silently zero out every zone\'s run time.',
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
        watering_adjustment_percent: s.watering_adjustment_percent,
        watering_type: s.watering_type,
        run_time_minutes: s.run_time_minutes,
        watering_frequency_mode: s.watering_frequency_mode,
        fixed_watering_frequency_seconds: s.fixed_watering_frequency_seconds,
        smart_watering_frequency_seconds: s.smart_watering_frequency_seconds,
        virtual_solar_sync_watering_frequency_seconds: s.virtual_solar_sync_watering_frequency_seconds,
        run_next_available_start_time: s.run_next_available_start_time,
        pre_configured_watering_schedule_id: s.pre_configured_watering_schedule_id,
        cycle_soak_enable: s.cycle_soak_enable,
        cycle_custom_time_minutes: s.cycle_custom_time_minutes,
        soak_custom_time_minutes: s.soak_custom_time_minutes,
        monthly_adjustment_percents: s.monthly_adjustment_percents,
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
    for (const startTime of zone.program_start_times as Array<{
      time?: string | null;
      watering_days?: number | null;
      zone_ids?: number[];
    }>) {
      // The snapshot's serializeProgramStartTime output has DIFFERENT field names than
      // the create_program_start_time mutation requires:
      //   captured: { id, type_value, time, watering_days, apply_all, zone_ids }
      //   required: { controller_id, apply_all, zones, schedules, time, watering_type,
      //               time_type, sunday, monday, ..., saturday }
      // Spreading the captured shape verbatim would produce a malformed payload (zone_ids
      // vs zones; type_value vs watering_type; extraneous id/watering_days; missing
      // schedules / time_type / day-of-week ints). Instead we emit ONLY the fields we can
      // safely translate (`time` passes through unchanged) plus controller_id, with the
      // captured zone_ids translated to the mutation's `zones` field-name. All other
      // required fields are emitted as null with a notes block making clear the AI MUST
      // resolve them from live state via list_program_start_times_for_zone before
      // calling — applying the recipe args verbatim WILL fail Zod validation.
      push(
        'create_program_start_time',
        {
          controller_id: controllerId,
          // Translated from snapshot (the field names below match the mutation schema).
          time: startTime.time ?? null,
          zones: startTime.zone_ids ?? [zone.id],
          // Required by the mutation but not exposed by the snapshot read path. The AI
          // must supply these by inspecting list_program_start_times_for_zone(zone_id)
          // and reconstructing the per-day schedule and watering-type discriminator.
          apply_all: null,
          schedules: null,
          watering_type: null,
          time_type: null,
          sunday: null,
          monday: null,
          tuesday: null,
          wednesday: null,
          thursday: null,
          friday: null,
          saturday: null,
        },
        [],
        'create_program_start_time advisory: the snapshot captures `time` and `zone_ids` (translated to `zones`) but cannot capture the mutation\'s required apply_all / schedules / watering_type / time_type / day-of-week ints. The AI MUST call list_program_start_times_for_zone first and merge live values for the null fields before applying — or skip this step if the live controller already has a matching start time at that `time` value.',
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
    const zoneNotes = zone.settings.zone_notes ?? [];
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
