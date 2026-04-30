# Task 003: Git Client

**Track:** A
**Phase:** A2
**Status:** done
**Depends on:** Task 001
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.2.2 (Scope Creep -- commit attribution), PRD Section 3.5 (git attribution convention), Decision 1 (commit convention), Decision 19 (--convention-start flag), Decision 18 (milestone git scoping), XRD Section 10 (FINDING-1 -- no exec with string interpolation)

## What to Build

A Git client wrapper around `simple-git` that extracts commit history as `GitCommit[]` objects with `[TASK_ID]` parsing, file change lists, and diff stats. Supports milestone scoping (filter commits by task IDs in a milestone directory).

## Files

- Create: `tools/building-audit/src/scanner/git-client.ts`
- Create: `tools/building-audit/test/scanner/git-client.test.ts`
- Do not touch: `src/types/index.ts`, `src/parser/`

## Contracts

**Input:** Project path (string), optional milestone task IDs (number[]).

**Output:** `GitCommit[]` per DAY-ZERO.md Section 8.

**Public API:**
```typescript
async function getGitLog(projectPath: string, options?: { milestoneTaskIds?: number[]; conventionStartHash?: string }): Promise<GitCommit[]>
```

When `milestoneTaskIds` is provided, filters to commits whose parsed `taskId` is in the list, plus commits with no `taskId` that touch files in the milestone directory.

When `conventionStartHash` is provided (Decision 19), only commits after that hash are checked for `[TASK_ID]` prefixes. Commits before that hash have `taskId = null` and are excluded from attribution checks.

Also produces `fileToTaskMapping: Map<string, number[]>` by joining gitLog commit file lists with parsed task IDs.

```typescript
async function buildFileToTaskMapping(commits: GitCommit[]): Map<string, number[]>
```

## Acceptance Criteria

1. Extracts commits from a git repo with hash, message, date, filesChanged, insertions, deletions.
2. Parses `[TASK_ID]` prefix from commit messages: `[003] implement feature` -> `taskId = 3`.
3. Commits without `[TASK_ID]` prefix have `taskId = null`.
4. Milestone filtering returns only commits matching milestone task IDs plus unattributed commits touching milestone files.
5. `buildFileToTaskMapping` correctly maps file paths to task ID arrays.
6. Uses `simple-git` library functions, never `child_process.exec` with string interpolation (XRD Section 10 FINDING-1).
7. Handles repos with no commits gracefully (returns empty array).
8. When `conventionStartHash` is provided, commits before that hash have `taskId = null` regardless of their message content.

## Tests

- [x] SCN-001: Scanner assembles ProjectContext (git portion)
- [x] SCN-002: Milestone scoping filters correctly
- [x] SC-003: Commit without task ID prefix -- warning (data layer)
- [x] SC-005: Legacy project -- auto-detect (data layer -- >90% without prefix)

## Notes

Security: Per XRD Section 10 Resolution for FINDING-1, all subprocess invocations must use argument arrays, never string interpolation. The `simple-git` library handles this when used via its API methods. Do not shell out with `exec`.

Decision 19: The `--convention-start` flag value is passed through from the CLI to the git client. The client filters commits by hash ordering. The scope-creep check consumes the filtered result.

## Execution Plan

1. Create `src/scanner/git-client.ts` with three exports:
   - `parseTaskId(message)`: regex `/^\[(\d+)\]/` extraction, returns number | null
   - `getGitLog(projectPath, options?)`: uses simple-git `.log(['--stat'])` to get commits with diff stats, applies conventionStartHash filtering (index-based in newest-first log), applies milestoneTaskIds filtering (include matching taskId + null taskId commits)
   - `buildFileToTaskMapping(commits)`: iterate commits with non-null taskId, map file paths to deduplicated task ID arrays
2. Create `test/scanner/git-client.test.ts` with real git repos (mkdtemp + simpleGit init per test):
   - parseTaskId unit tests (valid, absent, malformed)
   - SCN-001: full commit extraction with fields
   - SC-003: commits without prefix get taskId=null
   - Empty repo and non-git directory graceful handling
   - SCN-002: milestone filtering includes matching + unattributed, excludes non-matching
   - Convention-start: commits before hash get null taskId, works with abbreviated hashes
   - SC-005: legacy project data layer (90%+ without prefix)
   - buildFileToTaskMapping: maps files to task IDs, excludes null taskId, deduplicates, empty input
3. Run tests, fix failures, verify full suite still passes.

## Completed

**Date:** 2026-04-13

**Deviations:** None. Implementation matches the contract exactly.

**Insight/Implication:** simple-git's `.log(['--stat'])` returns diff stats via the `diff` property on each log entry, including a `files` array with per-file data. This means we get file change lists and insertion/deletion counts without needing a separate `git diff-tree` call per commit. **Implication:** The scanner's git phase will be a single pass, not N+1 queries.

**Decisions made during this task:** None.
