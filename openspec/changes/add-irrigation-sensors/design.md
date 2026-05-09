## Context

`dump_controller_snapshot` was originally scoped with the explicit non-goal *"sensors, weather stations, gateways"*. The user's restore requirement now overrides that decision. Sensor restore is a hard requirement.

The Hydrawise schema models sensors as:

```
Sensor:
  id, name
  model: SensorModel { id, name, modeType (START|STOP|REPORT),
                       mode, active, offLevel, offTimer, delay,
                       divisor, flowRate, customerId,
                       sensorType (LEVEL_OPEN|LEVEL_CLOSED|FLOW|THRESHOLD),
                       type: SelectedOption, category }
  input: SensorInput { number, label }   # e.g. { number: 1, label: "SEN-1" }
  zones: [Zone]                          # which zones the sensor protects
  status: SensorStatus { waterFlow, active }   # runtime telemetry, NOT in backup
```

A `Sensor` belongs to a `Controller` and is wired to one of its physical inputs (`SEN-1`, `SEN-2`, etc., per the GUI). The same sensor can protect any subset of zones, identified by `zoneIds`.

`SensorModel` records come from two pools:
1. **Built-in types** (Hunter Clik rain/soil normally-closed, NPT/BSP flow meters of various sizes, "Discontinued Sensors" like normally-open variants). These are Hydrawise-managed; the API exposes a queryable catalog.
2. **Custom types** owned by the customer, manageable via `createCustomSensorType` / `updateCustomSensorType` / `deleteCustomSensorType`.

Sensor restore mutations exist:

```
createSensor(controllerId, name, modelId, inputNumber, zoneIds): Sensor
updateSensor(sensorId, controllerId, name, modelId, inputNumber, zoneIds): Sensor
deleteSensor(sensorId): Boolean
```

So restore is: for each sensor in the snapshot, look up the modelId (built-in or previously-restored custom), call `createSensor` (or `updateSensor` if the same sensor exists). Zone associations are part of the sensor mutation itself — no separate "assign-sensor-to-zone" call needed.

## Goals / Non-Goals

**Goals:**
- Sensors are first-class in the snapshot envelope and individually inspectable via dedicated read tools.
- Restore can recreate sensor configuration (model + input + zone-association) via `createSensor` / `updateSensor` for built-in models.
- Restore can recreate custom sensor types via `createCustomSensorType` before referencing them in `createSensor`.
- A sensor model catalog query exposes the available built-in `SensorModel` records, so the AI can map a snapshot's `model.name` ("Rain Sensor (normally closed wire)") to the correct `modelId` at restore time.

**Non-Goals:**
- Sensor *runtime status* (`status.waterFlow`, `status.active`) — this is telemetry, not configuration. Excluded from backup.
- Sensor flow summaries (`flowSummary`) — also runtime/historical, deprecated upstream anyway.
- Alert mutations (`createAlert`, `updateAlert`) that reference sensors — alerts are a separate domain; out of scope.
- Hardware-level concerns (which sensor is *physically* wired to which input) — captured for inspection but cannot be restored programmatically; user must rewire if hardware moved.

## Decisions

### Snapshot embeds the full sensor record per controller, plus per-zone references

The snapshot's `controller.sensors[]` is the canonical source. Each entry includes the sensor's full readable state (id, name, model, input, zone-IDs). Each zone entry in the snapshot also gets a small `sensors: [{ id, name }]` array for cross-reference convenience — denormalized for AI scanning, derived from the controller-level sensors list.

**Alternative considered:** put sensors only in the per-zone view, omit the controller-level list. Rejected because a sensor commonly protects all zones (like Heller Tufts' rain sensor protects all 22) and the duplication cost isn't worth saving the controller-level entry. AIs reasoning about restore want one canonical "what sensors does this controller have" list.

### Built-in sensor models are queryable; restore looks them up by name

`createSensor` requires a `modelId`. The model catalog is queryable (the GUI populates its dropdown from somewhere — the schema appears to expose `Controller.sensorModels` or similar; needs verification during implementation). Restore workflow:

1. Read snapshot's `controller.sensors[N].model.id` and `.model.name`.
2. Query the live `list_sensor_models(controller_id)` to find the current `id` for that name (built-in IDs may be stable, but matching by name is safer).
3. Call `create_sensor(controller_id, name, model_id, input_number, zone_ids)`.

If the snapshot's sensor uses a *custom* type, the AI restoring must first re-create the custom type via `create_custom_sensor_type` (which allocates a new id), then use that new id in the `create_sensor` call. This is documented in the restore skill (Phase 4).

**Alternative considered:** capture the full SensorModel record inline in the snapshot, restore by attempting to match by all fields. Rejected because matching is fragile (firmware updates can renumber things) — name + the sensor type discriminator are sufficient.

### Custom sensor types are scoped under `irrigation-sensors`

Custom types are conceptually a sub-domain of sensors (you don't have a custom type independent of using it for a sensor). Group them in the same capability rather than splitting into `irrigation-sensor-types`.

### `list_sensors` returns the writable shape per sensor

Following the project convention from `add-schedule-management`: reads return values in the *writable* shape so the AI can copy → modify → call `update_sensor` without translation. So `list_sensors` returns each sensor as `{ id, name, model_id, input_number, zone_ids }` — flat — plus a sibling `_observed` block with the read-only model details (sensor_type, mode_type, divisor, flow_rate, etc.) and the human-readable model name.

## Risks / Trade-offs

- **Sensor model catalog query path is unconfirmed**: the schema may expose available models via `Controller.sensorModels` or a top-level `sensorModels` query — needs investigation during implementation. If missing, restore must rely on stable built-in IDs (which we'd need to discover empirically and document).
- **Hardware re-wiring is out-of-band**: if the user moves the rain sensor from `SEN-1` to `SEN-2`, the snapshot's `input_number: 1` will be wrong. Restore would write the wrong wiring. Document this clearly: the snapshot reflects what was wired, not what is wired today.
- **Custom sensor type IDs change on re-creation**: re-creating a custom type allocates a fresh id. The AI must re-resolve the new id when calling `create_sensor`. Restore workflow has to handle this dependency (custom types before sensors that use them). Will be encoded in Phase 4's restore skill.
- **`SensorModel.divisor` and `flowRate` semantics are model-dependent**: for flow meters these are calibration constants; for rain/soil sensors they're meaningless. Captured verbatim, but the snapshot doesn't validate or interpret them.
