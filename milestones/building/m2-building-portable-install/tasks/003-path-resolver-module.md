# Task 003: Path Resolver Module

**Track:** A (Path Resolution)
**Phase:** 1 (Foundation)
**Status:** not started
**Depends on:** none
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-1 (Path Resolver Interface), D0-12 (Project Name Sanitization Rules)

## What to Build

The central path resolution module. Every other trellis module will import from this. The module is pure computation -- no filesystem calls, no side effects.

### Functions

1. `deriveProjectName(projectDir: string): string` -- applies D0-12 sanitization rules to `basename(projectDir)`. Throws if result is empty.

2. `resolvePaths(buildingHome: string, projectDir: string): BuildingPaths` -- given the two root paths, returns all derived paths as specified in D0-1.

3. `resolveRunDir(projectState: string, runId: string): string` -- returns `$PROJECT_STATE/runs/<runId>/`.

4. `resolveMilestoneDir(projectState: string, milestoneName: string): string` -- returns `$PROJECT_STATE/milestones/<milestoneName>/`.

### Implementation Notes

- Use `path.basename()` and `path.join()` for all path operations.
- Strip trailing slashes from `projectDir` before basename extraction: `projectDir.replace(/\/+$/, '')`.
- The `projectState` derivation uses `os.homedir()` for `~`: `path.join(os.homedir(), '.building', 'projects', projectName)`.
- Follow ESM conventions: file is `paths.ts`, imports use `.js` extensions (IC-6 from SDM review).

## Files

- Create: `tools/trellis/src/paths.ts`
- Create: `tools/trellis/test/paths.test.ts`
- Modify: `tools/trellis/src/index.ts` (add export for paths module)
- Do not touch: `state.ts`, `bootstrap.ts`, `git.ts`, hook scripts

## Contracts

```typescript
// tools/trellis/src/paths.ts

import * as path from "path";
import * as os from "os";

export interface BuildingPaths {
  buildingHome: string;
  projectDir: string;
  projectState: string;
  projectName: string;
  orchestrator: string;
  prompts: string;
  agents: string;
  hooks: string;
  gates: string;
  detections: string;
  hooksLib: string;
  trellisbin: string;
  auditbin: string;
  runs: string;
  milestones: string;
  decisions: string;
  openItems: string;
}

export function deriveProjectName(projectDir: string): string;
export function resolvePaths(buildingHome: string, projectDir: string): BuildingPaths;
export function resolveRunDir(projectState: string, runId: string): string;
export function resolveMilestoneDir(projectState: string, milestoneName: string): string;
```

### index.ts Addition

```typescript
export {
  BuildingPaths,
  deriveProjectName,
  resolvePaths,
  resolveRunDir,
  resolveMilestoneDir,
} from "./paths.js";
```

## Acceptance Criteria

1. `resolvePaths()` produces correct `BuildingPaths` for standard inputs (PATH-001).
2. `deriveProjectName()` lowercases uppercase characters (PATH-002).
3. `deriveProjectName()` replaces spaces with hyphens (PATH-003).
4. `deriveProjectName()` strips all characters not matching `[a-z0-9-]` (PATH-004).
5. `deriveProjectName()` collapses consecutive hyphens (PATH-005).
6. `deriveProjectName()` trims leading and trailing hyphens (PATH-006).
7. `deriveProjectName()` throws on empty result after sanitization (PATH-007).
8. `deriveProjectName()` handles trailing slash on directory path (PATH-008).
9. `resolvePaths()` makes no filesystem calls (PATH-009).
10. All tests pass via `vitest run`.

## Tests

- PATH-001: resolvePaths produces correct BuildingPaths for standard inputs
- PATH-002: deriveProjectName lowercases uppercase characters
- PATH-003: deriveProjectName replaces spaces with hyphens
- PATH-004: deriveProjectName strips shell metacharacters
- PATH-005: deriveProjectName collapses consecutive hyphens
- PATH-006: deriveProjectName trims leading and trailing hyphens
- PATH-007: deriveProjectName handles empty basename
- PATH-008: deriveProjectName handles trailing slash
- PATH-009: resolvePaths is pure computation -- no filesystem calls

## Notes

PATH-010 (bash/TypeScript parity) is tested in Task 006 after the bash `resolve_project_paths()` is implemented. This task only covers the TypeScript side.

The D0-12 sanitization example table is the authoritative test matrix. Every row in that table must be a test case.
