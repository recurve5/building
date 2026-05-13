# Task 004: State Schema v2 and State Snapshots

**Track:** A (Path Resolution)
**Phase:** 1 (Foundation)
**Status:** not started
**Depends on:** 003
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-2 (State Schema v2, including State Snapshots), SDM IP-4 (state.ts validateSchema)

## What to Build

Update the state schema to version 2 with a `project_dir` field. Maintain backward compatibility: version 1 files can be read, version 2 files are always written. Add a state snapshot function for forensic debugging.

### Changes to types.ts

1. Add `project_dir: string` to the `TrellisState` interface.
2. Change `version: 1` to `version: 1 | 2`.

### Changes to state.ts

1. `validateSchema()`: Accept both version 1 and version 2.
   - Version 1: do not require `project_dir`. This is read-only compatibility.
   - Version 2: require `project_dir` as a non-empty string.
   - The current check `state.version !== 1` at line 125 becomes a set check: `![1, 2].includes(state.version)`.

2. `createInitialState()`: Add `projectDir` parameter.
   - New signature: `createInitialState(runId: string, project: string, milestone: string, briefHash: string, projectDir: string)`.
   - Set `version: 2` and `project_dir: projectDir` in the returned state.

3. `readState()`: No signature change. Validation accepts both versions.

4. `writeState()`: Ensure version is set to 2 before writing. If a version 1 state was read and modified, the written file has `version: 2`. Add `project_dir` if missing (use empty string as sentinel for upgraded v1 state -- this is acceptable because v1 state is from pre-portable builds that are out of scope per PRD Decision 8).

### Changes to state.ts (State Snapshots)

5. Add `snapshotState(runDir: string, stageNumber: number): void` function.
   - Copies `state.json` to `state.json.stage-N` where N is the stage number being exited.
   - Simple file copy (not atomic write — the source state.json is stable at snapshot time).
   - Called by the skill before each stage transition.
   - Snapshots are never read by the pipeline — they exist for developer debugging only.

## Files

- Modify: `tools/trellis/src/types.ts`
- Modify: `tools/trellis/src/state.ts`
- Modify: `tools/trellis/test/state.test.ts`
- Do not touch: `paths.ts`, `bootstrap.ts`, `git.ts`, hook scripts

## Contracts

### types.ts Changes

```typescript
// Before
version: 1;

// After
version: 1 | 2;
project_dir: string;
```

### state.ts Changes

```typescript
// createInitialState new signature
function createInitialState(
  runId: string,
  project: string,
  milestone: string,
  briefHash: string,
  projectDir: string
): TrellisState;

// validateSchema behavior
function validateSchema(state: unknown): asserts state is TrellisState;
// - version 1: project_dir not required
// - version 2: project_dir required, non-empty string
// - version other: throw

// writeState behavior
function writeState(runDir: string, state: TrellisState): void;
// - Always writes version: 2
// - Uses atomic write (temp file + rename) -- unchanged

// snapshotState behavior
function snapshotState(runDir: string, stageNumber: number): void;
// - Copies state.json to state.json.stage-N
// - Simple file copy, not atomic write
// - No-op if state.json does not exist
```

## Acceptance Criteria

1. `createInitialState()` with new signature produces version 2 state with `project_dir` (STATE-001).
2. `readState()` accepts version 1 state files without `project_dir` (STATE-002).
3. `validateSchema()` rejects version 2 state missing `project_dir` (STATE-003).
4. `writeState()` always produces version 2 output (STATE-004).
5. Atomic write pattern preserved (STATE-005).
6. `snapshotState()` copies state.json to state.json.stage-N (SNAP-001).
7. All existing state tests continue to pass (updated for new signature).

## Tests

- STATE-001: Version 2 state includes project_dir field
- STATE-002: Version 1 state files are readable
- STATE-003: Version 2 state requires project_dir
- STATE-004: Writing state always produces version 2
- STATE-005: Atomic write integrity preserved
- SNAP-001: snapshotState copies state.json to state.json.stage-N

## Notes

The `createInitialState` signature change means the caller must pass `projectDir`. The only caller is the orchestrator (via the skill file instructions). Task 012 (skill template) must reflect this new parameter. Until then, the existing skill file's instructions for state creation will be stale -- this is acceptable because M2 is built under the old model and the new skill file is not active until install.

For STATE-005, verify the temp-file-rename pattern is still used. Do not change the write implementation, only the data written.
