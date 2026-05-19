# Task 003: State Management Utilities

**Track:** B
**Phase:** B1 (state management)
**Status:** complete
**Depends on:** 002
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-1 (state.json Schema), D0-7 (Directory Layout)

## What to Build

TypeScript utilities for reading, writing, and validating `state.json`. These are the foundational functions that every other component (gate scripts, orchestrator, morning-after generator) uses to interact with run state.

Implement in `tools/trellis/src/state.ts`:

1. **`readState(runDir: string): TrellisState`** — Read and parse state.json from a run directory. Throws on invalid JSON, missing file, or schema violation.

2. **`writeState(runDir: string, state: TrellisState): void`** — Atomic write: write to temp file, then rename. Validates state before writing (no invalid transitions encoded in the file).

3. **`validateTransition(current: TrellisState, next: TrellisState): { valid: boolean; reason: string | null }`** — Check whether the proposed state change is valid per D0-1 transition rules.

4. **`createInitialState(runId: string, project: string, milestone: string, briefHash: string): TrellisState`** — Produce a fresh state.json for a new run.

5. **`generateRunId(briefContent: string, timestamp?: Date): string`** — Generate a run ID in the format `YYYYMMDDTHHMMZ-<7-char-hex>`. The hex is first 7 chars of SHA-256(briefContent + ISO timestamp).

6. **`createRunDirectory(buildingDir: string, runId: string): string`** — Create the `.building/runs/<run-id>/` directory scaffold with empty subdirectories (events/, overrides/, detections/, confidence/).

## Files

- Create: `tools/trellis/src/state.ts`
- Create: `tools/trellis/src/run.ts` (generateRunId, createRunDirectory)
- Create: `tools/trellis/test/state.test.ts`
- Create: `tools/trellis/test/run.test.ts`
- Modify: `tools/trellis/src/index.ts` (add exports)
- Do not touch: `tools/building-audit/`

## Contracts

### readState

```typescript
function readState(runDir: string): TrellisState
// Throws: Error if file missing, invalid JSON, or fails schema validation
```

### writeState

```typescript
function writeState(runDir: string, state: TrellisState): void
// Atomic: temp file + rename. Never leaves a partial state.json.
// Throws: Error if state fails validation before write.
```

### validateTransition

```typescript
function validateTransition(
  current: TrellisState,
  next: TrellisState
): { valid: boolean; reason: string | null }
// Rejects: stage skip, backward without rollback, advance from halted, invalid dual-state
```

### generateRunId

```typescript
function generateRunId(briefContent: string, timestamp?: Date): string
// Returns: "YYYYMMDDTHHMMZ-<7-char-hex>"
// Uses crypto.createHash('sha256') for the hash
```

## Acceptance Criteria

1. `readState` returns a typed `TrellisState` object from a valid state.json file.
2. `readState` throws a descriptive error when the file is missing.
3. `readState` throws a descriptive error when JSON is invalid.
4. `writeState` produces a valid JSON file that `readState` can parse.
5. `writeState` uses atomic write (temp file + rename) — verified by implementation inspection.
6. `validateTransition` rejects stage skips (e.g., stage 3 to stage 5).
7. `validateTransition` rejects backward movement without rollback flag.
8. `validateTransition` rejects advancement from halted state.
9. `generateRunId` produces IDs in the correct format.
10. Same brief + different timestamps produce different IDs (STATE-002).
11. Same timestamp + different briefs produce different IDs (STATE-003).
12. `createRunDirectory` creates the full scaffold with all subdirectories.

## Tests

- [ ] STATE-001: Run ID format correctness
- [ ] STATE-002: Different timestamps produce different IDs
- [ ] STATE-003: Different briefs produce different IDs
- [ ] STATE-004: Initial state is valid after creation
- [ ] STATE-005: Stage advancement updates state correctly
- [ ] STATE-006: Task status transitions recorded correctly
- [ ] STATE-007: Atomic write (temp file + rename) verified
- [ ] STATE-015: Directory scaffold created correctly

## Notes

The `writeState` function should use `fs.writeFileSync` to a temp file in the same directory as state.json (ensuring same filesystem for atomic rename), then `fs.renameSync` to the final path.

Use Node's built-in `crypto` module for SHA-256. No external hash library needed.

The state validation in `writeState` is a safety net — the orchestrator should validate transitions before attempting a write. But defense in depth: if invalid state reaches the write function, reject it rather than persisting garbage.
