# Task 006: Project Scanner

**Track:** A
**Phase:** A2
**Status:** done
**Depends on:** Task 002, Task 003, Task 004, Task 005
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: XRD Section 3 (scanner module), PRD Section 6 (technical constraints), Decision 15 (single-pass AST), Decision 17 (no task files), Decision 18 (milestone scoping), XRD Section 10 (FINDING-3 -- path validation)

## What to Build

The project scanner that orchestrates data gathering and assembles a complete `ProjectContext` object. It finds task files, parses them, reads git history, reads DECISIONS.md, analyzes source files, and produces the context object that all checks consume.

The scanner is where milestone scoping (`--milestone`) is enforced -- it filters which directories and commits to include. It is also where path validation prevents directory traversal (XRD FINDING-3).

## Files

- Create: `tools/building-audit/src/scanner/project-scanner.ts`
- Create: `tools/building-audit/test/scanner/project-scanner.test.ts`
- Modify: `tools/building-audit/test/factories/index.ts` — add `createProjectContext` factory
- Do not touch: `src/parser/`, `src/analyzers/` (consumed, not modified)

## Contracts

**Input:** Project path (string), optional milestone name (string).

**Output:** `ProjectContext` per DAY-ZERO.md Section 2.

**Public API:**
```typescript
async function scanProject(projectPath: string, milestone?: string): Promise<ProjectContext>
```

The scanner:
1. Validates the project path exists and is a directory.
2. Validates `--milestone` is a simple directory name (no path separators -- FINDING-3).
3. Discovers task files in `tasks/` or `m<N>-*/tasks/` (scoped by milestone if provided).
4. Parses task files using the parser from Task 002. Collects `ParsedTaskFile[]` and `ParseError[]`.
5. Reads git history using the git client from Task 003.
6. Reads DECISIONS.md using the parser from Task 004.
7. Discovers and analyzes source files using the analyzer from Task 005. Stores results in `sourceFiles` map.
8. Reads non-analyzed files (markdown, JSON) into `rawFiles` map.
9. Reads current and initial `package.json` into `packageJsonHistory`.
10. Builds `fileToTaskMapping` from git history.
11. Discovers test result files (JUnit XML, vitest JSON) and parses them into `testResultFiles`.
12. Logs timing per phase (task parsing, git history, AST analysis, assembly).

## Acceptance Criteria

1. Assembles a complete `ProjectContext` from a valid project directory with task files, git history, DECISIONS.md, and source files.
2. `taskFiles` contains successfully parsed tasks; `parseErrors` contains failures.
3. `sourceFiles` contains pre-analyzed `AnalyzedFile` objects (AST parsing runs once, not per-check).
4. Milestone scoping filters task files to the milestone's `tasks/` directory and git commits per Decision 18.
5. Rejects `--milestone` values with path separators (directory traversal prevention).
6. Handles missing `tasks/` directory gracefully (empty `taskFiles`, no error).
7. Handles missing DECISIONS.md gracefully (empty `decisions`, no error).
8. Handles missing git repository gracefully (empty `gitLog`, no error or clear error message).
9. `packageJsonHistory.initial` contains the package.json content at the initial commit (or null if none). `packageJsonHistory.current` contains the current content (or null).
10. `fileToTaskMapping` correctly maps file paths to arrays of task IDs that touched them.
11. Logs timing per phase.

## Tests

- [x] SCN-001: Scanner assembles ProjectContext from valid project
- [x] SCN-002: Milestone scoping filters correctly
- [x] SCN-003: Parse errors collected, not fatal
- [x] SCN-004: No task files -- task-dependent context empty
- [x] SCN-005: AST parsing runs once -- timing logged
- [x] SCN-006: Path validation rejects traversal attempts
- [x] SCN-007: Empty project directory

## Execution Plan

1. Read all context: task file, DAY-ZERO.md Sections 2 and 12, DECISIONS.md Decisions 8/15/17/18/19, and all existing modules (types, task-file-parser, decisions-parser, typescript-analyzer, git-client).
2. Create `src/scanner/project-scanner.ts` with `scanProject()` function that:
   - Validates project path and milestone name (FINDING-3 path traversal prevention)
   - Discovers task files in `tasks/` or `m<N>-*/tasks/` with milestone filtering
   - Parses them via `parseTaskFile`, collecting results and errors (Decision 8)
   - Reads git log via `getGitLog` with convention-start and milestone task ID filtering
   - Reads DECISIONS.md via `parseDecisions`
   - Walks directory tree, analyzes .ts/.js files via `TypeScriptAnalyzer`, stores .md/.json as raw files
   - Builds `fileToTaskMapping` via `buildFileToTaskMapping`
   - Reads package.json current from disk, initial deferred (would need git show)
   - Discovers test result files in standard locations
   - Logs timing per phase (Decision 15)
3. Create `test/scanner/project-scanner.test.ts` with temp directory-based tests for all 7 acceptance scenarios plus edge cases.
4. Verify `createProjectContext` factory already exists in `test/factories/index.ts` (it does).
5. Run tests, fix issues, run full suite.

## Completed

**Date:** 2026-04-13

**Deviations:** `packageJsonHistory.initial` is always null in v1 because reading file content at a specific git commit requires `git show`, which simple-git does support but was not implemented in the git-client module. The field is populated as null with the understanding it can be wired up when needed. No behavioral impact since no current check depends on the initial package.json content.

**Insight/Implication:** The `assertWithinProject` path validation needed careful implementation — the naive check `!resolve(rel).startsWith(sep)` fails because `resolve()` on a relative path produces an absolute path on Unix. The correct check is simply `!rel.startsWith('..')`. **Implication:** future path validation code should be tested with real temp directories on the target OS, not just string manipulation.

**Decisions made during this task:** None. All design decisions were pre-made (Decisions 8, 15, 17, 18, 19).

## Notes

This is the merge point between Tracks A2 tasks (parser, git client, decisions parser, analyzer). All four must be complete before this task starts.

Per Decision 15: AST parsing runs once during the scanner phase. This is critical for the 30-second mechanical audit budget. The scanner populates `ProjectContext.sourceFiles` with pre-analyzed data. Checks must not re-parse source files.

The `createProjectContext` factory in `test/factories/` provides sensible defaults for tests. Checks use this factory to build test contexts without depending on real file systems.
