# Task 011: Git Module Rewrite

**Track:** D (Git Protocol)
**Phase:** 2 (Infrastructure)
**Status:** not started
**Depends on:** 003
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-7 (Git Commit Protocol), SDM IP-5 (index.ts re-exports), SDM Section 1 (git.ts is a full rewrite)

## What to Build

Rewrite `tools/trellis/src/git.ts`. Remove all five state-commit functions. Add one function: `commitProjectCode()`. Update `index.ts` to remove old exports and add the new one.

### Functions to Remove

- `commitRunStart(buildingDir, runId, project, milestone)`
- `commitStageComplete(buildingDir, runId, stage)`
- `commitHalt(buildingDir, runId, reason)`
- `commitOverride(buildingDir, runId, stage)`
- `commitMorningAfter(buildingDir, runId)`

These functions committed state files from `.building/runs/` to git. In the portable model, state lives at `~/.building/projects/` which is not a git repo. State persistence relies on filesystem writes only.

### Function to Add

```typescript
export interface CommitResult {
  hash: string;
  filesCommitted: string[];
}

export async function commitProjectCode(
  projectDir: string,
  files: string[],
  message: string
): Promise<CommitResult>;
```

**Behavior:**
1. Run `git -C $projectDir add <files>` to stage the specified files.
2. Run `git -C $projectDir commit -m "<message>"` to commit.
3. Return the commit hash and list of committed files.
4. If no files to stage or nothing to commit, return with empty `filesCommitted`.

**Commit message rules (D0-7):**
- No `[trellis]` prefix.
- No `[building]` prefix.
- No task IDs in `task-NNN` format.
- Messages use neutral developer conventions.

### index.ts Changes

Remove exports:
```typescript
// Remove these lines
export { commitRunStart } from "./git.js";
export { commitStageComplete } from "./git.js";
export { commitHalt } from "./git.js";
export { commitOverride } from "./git.js";
export { commitMorningAfter } from "./git.js";
```

Add export:
```typescript
export { commitProjectCode, CommitResult } from "./git.js";
```

## Files

- Modify: `tools/trellis/src/git.ts` (complete rewrite)
- Modify: `tools/trellis/src/index.ts` (update exports)
- Modify: `tools/trellis/test/git.test.ts` (complete rewrite)
- Do not touch: state.ts, bootstrap.ts, hook scripts

## Contracts

```typescript
export interface CommitResult {
  hash: string;
  filesCommitted: string[];
}

export async function commitProjectCode(
  projectDir: string,
  files: string[],
  message: string
): Promise<CommitResult>;
```

### Constraints

- `commitProjectCode` operates only on the project repo at `projectDir`.
- It does not commit in `~/.building/` or in the Building repo.
- It uses `git -C projectDir` to avoid relying on the current working directory.
- The commit message is used verbatim. The function does not modify, prefix, or append to it.

## Acceptance Criteria

1. `commitProjectCode()` commits in the project repo (GIT-001).
2. Commit messages use neutral developer conventions (GIT-002).
3. Old state-commit functions are removed from exports (GIT-003).
4. State changes produce no git commits (GIT-004 -- verified by confirming removed functions have no callers).
5. `index.ts` exports `commitProjectCode` and `CommitResult`.
6. `index.ts` does not export any of the five removed functions.
7. Build succeeds (`npm run build` in `tools/trellis/`).

## Tests

- GIT-001: commitProjectCode commits in the project repo
- GIT-002: Commit messages use neutral developer conventions
- GIT-003: Old state-commit functions are removed
- GIT-004: State changes are NOT git-committed

### Test Strategy

Tests create a temp directory, `git init`, create files, and call `commitProjectCode()`. Verify via `git log` that the commit exists with the correct message and files. For GIT-003, verify the removed function names are not exported from the module.

## Notes

This is a clean rewrite. Delete the existing git.ts content and write fresh.

The current git.ts uses `child_process.execSync` for git commands. The new implementation should do the same for consistency. Use `git -C <dir>` for all operations to avoid depending on the shell's working directory.

Verify no other module imports the removed functions before deleting. The SDM review says the skill file references "commit via git" at multiple points -- this is prose read by the LLM, not executable imports. The skill file will be rewritten in Task 012 with the new commit protocol.
