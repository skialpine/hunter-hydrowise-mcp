# irrigation-notes Specification

## Purpose
TBD - created by archiving change extend-snapshot-completeness. Update Purpose after archive.
## Requirements
### Requirement: list_controller_notes tool reads notes attached to a controller

The server SHALL expose a read-only tool named `list_controller_notes` that accepts a required integer `controller_id`. It SHALL return an array of note objects, each containing `id`, `note`, `type` (one of `fault | location | repair | comment`), `pinned_to_top`, and `last_updated_at`.

#### Scenario: Controller has notes

- **WHEN** an MCP client calls `list_controller_notes` with a valid `controller_id`
- **THEN** the response is an array of note objects, possibly empty if no notes exist

### Requirement: list_zone_notes tool reads notes attached to a single zone

The server SHALL expose a read-only tool named `list_zone_notes` that accepts a required integer `zone_id`. It SHALL return an array of note objects with the same shape as `list_controller_notes`.

#### Scenario: Zone has notes

- **WHEN** an MCP client calls `list_zone_notes` with a valid `zone_id`
- **THEN** the response is an array of note objects, possibly empty

### Requirement: create_controller_note and create_zone_note tools add new notes

The server SHALL expose `create_controller_note` (accepting `controller_id`, `note`, `type`, optional `pinned_to_top` defaulting to `false`) and `create_zone_note` (accepting `zone_id`, `note`, `type`, optional `pinned_to_top` defaulting to `false`). Both are `PHYSICAL ACTION:` tools and accept a `preview` boolean. The `type` argument SHALL be constrained to one of `fault | location | repair | comment`.

#### Scenario: Create a comment-type controller note

- **WHEN** an MCP client calls `create_controller_note` with `note: "..."` and `type: "comment"`
- **THEN** the tool dispatches `createControllerNote(controllerId, note, type: comment, pinnedToTop: false)` and returns the created `ControllerNote`

#### Scenario: Reject unknown note type

- **WHEN** an MCP client calls a note-creation tool with `type: "something-else"`
- **THEN** the tool returns a `config_error`

### Requirement: update_controller_note and update_zone_note tools modify existing notes

The server SHALL expose `update_controller_note` (accepting `note_id`, `controller_id`, `note`, `type`, optional `pinned_to_top`) and `update_zone_note` (accepting `note_id`, `zone_id`, `note`, `type`, optional `pinned_to_top`). Both are `PHYSICAL ACTION:` and accept a `preview` boolean.

#### Scenario: Update a zone note

- **WHEN** an MCP client calls `update_zone_note` with valid arguments
- **THEN** the tool dispatches `updateZoneNote(noteId, zoneId, note, type, pinnedToTop)` and returns the updated `ZoneNote`

### Requirement: delete_controller_note and delete_zone_note tools remove notes

The server SHALL expose `delete_controller_note` and `delete_zone_note`, each accepting only `note_id`. Both are `PHYSICAL ACTION:` and accept a `preview` boolean.

#### Scenario: Delete a controller note

- **WHEN** an MCP client calls `delete_controller_note` with a valid `note_id`
- **THEN** the tool dispatches `deleteControllerNote(noteId)` and returns the upstream `StatusCodeAndSummary`

