# Task 009: Bootstrap Rewrite

**Track:** C (Bootstrap Rewrite)
**Phase:** 2 (Infrastructure)
**Status:** not started
**Depends on:** 003, 004
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-3 (Bootstrap Contract), D0-1 (Path Resolver Interface), D0-2 (State Schema v2), Peer Review Issue 1, Issue 5, SDM Review Section 1 (bootstrap.ts is a full rewrite)

## What to Build

Complete rewrite of `tools/trellis/src/bootstrap.ts`. Zero lines of the current implementation survive. The new bootstrap creates the project state directory under `~/.building/projects/<project-name>/`, writes `project.lock` for collision detection, and returns a minimal `BootstrapResult`.

### New Bootstrap Behavior

1. Receive `projectName`, `projectState`, `projectDir` as parameters.
2. Check `project.lock` at `$projectState/project.lock`:
   - If exists and `project_dir` does not match `projectDir`: throw collision error.
   - If exists and matches: return `{ created: [], alreadyBootstrapped: true }`.
   - If does not exist: proceed to create.
3. Create directories: `$projectState/`, `$projectState/runs/`, `$projectState/milestones/`.
4. Write stub `DECISIONS.md` (header: `# Decisions Log`).
5. Write stub `OPEN-ITEMS.md` (header: `# Open Items`).
6. Write `project.lock` (D0-3 format).
7. Return `{ created: [...list of created paths...], alreadyBootstrapped: false }`.

### Removed Behavior

- Does NOT create `.building/` in the project directory.
- Does NOT write to `.claude/settings.local.json`.
- Does NOT run `npm install` or `npm run build`.
- Does NOT create git commits.
- Does NOT return `hooksInstalled`, `dependenciesInstalled`, or `commitHash` in result.

### Idempotency

Running bootstrap on an already-bootstrapped project (lockfile matches) returns without modifying anything. DECISIONS.md and OPEN-ITEMS.md content is not overwritten.

## Files

- Modify: `tools/trellis/src/bootstrap.ts` (complete rewrite)
- Modify: `tools/trellis/test/bootstrap.test.ts` (complete rewrite)
- Do not touch: `state.ts` (already updated in Task 004), hook scripts, install script

## Contracts

```typescript
export interface BootstrapResult {
  created: string[];
  alreadyBootstrapped: boolean;
}

export async function bootstrap(
  projectName: string,
  projectState: string,
  projectDir: string
): Promise<BootstrapResult>;
```

### project.lock Content

```json
{
  "project_dir": "/absolute/path/to/project",
  "project_name": "derived-name",
  "created": "2026-05-12T12:00:00.000Z"
}
```

### Collision Error

Thrown as a standard Error with message:
```
Project name '<name>' is already in use by <existing_project_dir>.
Rename one directory or use a symlink.
```

### File Write Pattern

Use atomic writes (temp file + rename) for `project.lock`, `DECISIONS.md`, and `OPEN-ITEMS.md`. Follow the established pattern in `state.ts` (IC-1 from SDM review).

## Acceptance Criteria

1. Bootstrap creates correct directory structure (BOOT-001).
2. Bootstrap writes project.lock with correct content (BOOT-002).
3. Bootstrap detects collision via lockfile mismatch (BOOT-003).
4. Bootstrap passes when projectDir matches lockfile (BOOT-004).
5. Bootstrap is idempotent -- DECISIONS.md content preserved on re-run (BOOT-005).
6. Bootstrap does NOT create `.building/` in project directory (BOOT-006).
7. Bootstrap does NOT write to `.claude/settings.local.json` (BOOT-007).
8. Bootstrap does NOT create git commits (BOOT-008).
9. BootstrapResult has correct shape -- no removed fields (BOOT-009).

## Tests

- BOOT-001: Bootstrap creates project state directory structure
- BOOT-002: Bootstrap writes project.lock with correct content
- BOOT-003: Bootstrap detects project name collision via lockfile
- BOOT-004: Bootstrap collision check passes when projectDir matches lockfile
- BOOT-005: Bootstrap is idempotent
- BOOT-006: Bootstrap does NOT create .building/ in project directory
- BOOT-007: Bootstrap does NOT write to .claude/settings.local.json
- BOOT-008: Bootstrap does NOT commit to git
- BOOT-009: BootstrapResult interface has correct shape

### Test Strategy

Tests use temp directories (IC-4 from SDM review). Create isolated `projectState` and `projectDir` paths under `os.tmpdir()`. For BOOT-008, initialize a git repo in the temp project directory and verify no new commits after bootstrap.

## Notes

This is a clean rewrite. Do not attempt to refactor the existing code -- delete it and write fresh implementation based on D0-3.

The current `bootstrap()` signature is `bootstrap(projectRoot: string, projectName: string): Promise<BootstrapResult>`. The new signature is different (three parameters, different order). Update the `index.ts` export to match. Any existing caller will get a build error, which is intentional -- the old calling convention is invalid.

The removed fields (`hooksInstalled`, `dependenciesInstalled`, `commitHash`) have no callers per the SDM review. The current skill file does not read these fields. Confirm by checking the skill file before deleting.
