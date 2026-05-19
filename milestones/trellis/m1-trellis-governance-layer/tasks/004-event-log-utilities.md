# Task 004: Event Log Utilities

**Track:** B
**Phase:** B1 (state management)
**Status:** complete
**Depends on:** 002
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-2 (Event Schema), D0-7 (Directory Layout)

## What to Build

TypeScript utilities for writing and reading the event log. Events are individual numbered JSON files in `.building/runs/<run-id>/events/`.

Implement in `tools/trellis/src/events.ts`:

1. **`appendEvent(runDir: string, event: Omit<TrellisEvent, 'timestamp'>): string`** — Write a new event file. Auto-assigns the next sequence number and adds the timestamp. Returns the filename of the created event.

2. **`readEvents(runDir: string): TrellisEvent[]`** — Read all events from a run directory, sorted by sequence number.

3. **`readEventsByType(runDir: string, type: EventType): TrellisEvent[]`** — Filter events by type.

4. **`readEventsForTask(runDir: string, taskId: string): TrellisEvent[]`** — Filter events by task ID.

5. **`nextEventNumber(eventsDir: string): number`** — Determine the next sequence number by scanning existing files. Uses max+1, handles gaps.

## Files

- Create: `tools/trellis/src/events.ts`
- Create: `tools/trellis/test/events.test.ts`
- Modify: `tools/trellis/src/index.ts` (add exports)
- Do not touch: `tools/building-audit/`, `tools/trellis/src/state.ts`

## Contracts

### appendEvent

```typescript
function appendEvent(
  runDir: string,
  event: Omit<TrellisEvent, 'timestamp'>
): string
// Returns: filename like "004-stage_complete.json"
// Adds timestamp automatically (ISO 8601 UTC)
// File written atomically (write to temp, rename)
```

### readEvents

```typescript
function readEvents(runDir: string): TrellisEvent[]
// Returns events sorted by sequence number (parsed from filename)
// Skips files that fail JSON parsing (logs warning, does not throw)
```

### nextEventNumber

```typescript
function nextEventNumber(eventsDir: string): number
// Returns max existing number + 1, or 1 if directory is empty
// Handles gaps: [001, 002, 004] -> returns 5
```

## Acceptance Criteria

1. `appendEvent` creates a correctly numbered file in the events directory.
2. Event files contain valid JSON matching the TrellisEvent schema.
3. Timestamps are ISO 8601 UTC format.
4. Sequential calls produce incrementing file numbers with no gaps.
5. `nextEventNumber` returns max+1 when gaps exist (STATE-010).
6. `readEvents` returns events sorted by sequence number.
7. `readEvents` skips malformed files without crashing.
8. `readEventsForTask` correctly filters by task ID.

## Tests

- [ ] STATE-008: Event files numbered sequentially
- [ ] STATE-009: Event file contains required fields
- [ ] STATE-010: Event numbering handles gaps gracefully
- [ ] Events filtered by type return correct subset
- [ ] Events filtered by task return correct subset
- [ ] Malformed event file is skipped with warning

## Notes

Event file names use the event type as a suffix for human readability when listing the directory: `001-run_started.json`, `002-stage_started.json`. The number is the primary sort key; the suffix is purely informational.

The `appendEvent` function should use the same atomic write pattern as `writeState` (temp file + rename) to prevent partial event files.

Zero-pad to 3 digits by default. If the number exceeds 999, use 4 digits. The `readEvents` sort must handle variable-width numbers correctly (parse the numeric prefix, sort numerically, not lexicographically).
