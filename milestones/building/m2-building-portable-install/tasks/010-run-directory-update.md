# Task 010: Run Directory Update

**Track:** C (Bootstrap Rewrite)
**Phase:** 2 (Infrastructure)
**Status:** not started
**Depends on:** 003
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-1 (Path Resolver Interface), SDM IP (run.ts parameter name)

## What to Build

Update `tools/trellis/src/run.ts` to accept `projectState` instead of `buildingDir` as the first parameter of `createRunDirectory()`. The function body logic is identical -- only the parameter name and semantics change.

### Change

```typescript
// BEFORE
export function createRunDirectory(buildingDir: string, runId: string): string {
  const runDir = path.join(buildingDir, "runs", runId);
  // ... create directory, subdirectories ...
  return runDir;
}

// AFTER
export function createRunDirectory(projectState: string, runId: string): string {
  const runDir = path.join(projectState, "runs", runId);
  // ... create directory, subdirectories (unchanged) ...
  return runDir;
}
```

The old `buildingDir` was the `.building/` directory inside the project. The new `projectState` is `~/.building/projects/<project-name>/`. Both have the same internal structure (`runs/<id>/`), so the function body does not change.

### generateRunId()

No change. Already a pure function that generates a timestamp-based ID.

## Files

- Modify: `tools/trellis/src/run.ts` (parameter rename)
- Modify: `tools/trellis/test/run.test.ts` (update parameter name in test calls, if needed)
- Do not touch: state.ts, bootstrap.ts, git.ts, hook scripts

## Contracts

```typescript
// Updated signature
export function createRunDirectory(projectState: string, runId: string): string;

// Unchanged
export function generateRunId(): string;
```

The `runDir` returned is `$projectState/runs/$runId/`. Callers that previously passed `.building/` now pass `~/.building/projects/<name>/`.

## Acceptance Criteria

1. `createRunDirectory()` accepts `projectState` parameter and creates run directory under it.
2. `generateRunId()` is unchanged.
3. Existing run tests pass with updated parameter.
4. The run directory structure (`events/`, `overrides/`, `detections/`, `confidence/`, `state.json`) is created correctly under the new root.

## Tests

- Existing run.test.ts cases updated for parameter rename
- Verify run directory structure is correct under new root path

## Notes

This is a mechanical change. The function logic is identical; only the parameter name and its semantic meaning change. The key value of this task is making the parameter name self-documenting: `projectState` clearly signals the new three-path model, whereas `buildingDir` implied the old in-project `.building/` directory.

This task is small and can be done quickly. It is separated from Task 009 (bootstrap rewrite) because `run.ts` and `bootstrap.ts` are independent modules with different callers.
