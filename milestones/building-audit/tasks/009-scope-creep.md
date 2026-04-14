# Task 009: Scope Creep Check

**Track:** B
**Phase:** B2
**Status:** done
**Depends on:** Task 007
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.2.2 (Scope Creep spec), Decision 1 (commit convention), Decision 16 (legacy project detection), Decision 17 (no task files)

## What to Build

The Scope Creep Layer 1 check. For each task: maps commits to the task using `[TASK_ID]` prefix, diffs committed files against the declared scope (files.create, files.modify, files.doNotTouch).

Findings:
- File modified not in create or modify lists: severity warning.
- File in doNotTouch list was modified: severity critical.
- Commit without `[TASK_ID]` prefix: severity warning.
- Legacy project (>90% commits lack prefix): single info-level note instead of per-commit warnings (Decision 16).

## Files

- Create: `tools/building-audit/src/checks/layer1/scope-creep.ts`
- Create: `tools/building-audit/test/checks/layer1/scope-creep.test.ts`
- Do not touch: `src/scanner/`, `src/parser/`

## Contracts

Implements `Check` interface (DAY-ZERO.md Section 3).

Consumes `ProjectContext.taskFiles` (for file scope declarations), `ProjectContext.gitLog` (for commit-to-task mapping), and `ProjectContext.fileToTaskMapping`.

## Acceptance Criteria

1. File modified outside declared scope produces a warning finding.
2. File in doNotTouch list modified produces a critical finding.
3. Commit without `[TASK_ID]` prefix produces a warning finding.
4. All files within declared scope produces no findings for that task.
5. When >90% of commits lack `[TASK_ID]` prefix, reports single info-level note (Decision 16).
6. When zero task files exist, check reports `skipped` with reason (Decision 17).
7. Finding includes file path, task number, and description of the scope violation.

## Tests

- [x] SC-001: File modified outside declared scope -- warning
- [x] SC-002: File in do_not_touch was modified -- critical
- [x] SC-003: Commit without task ID prefix -- warning
- [x] SC-004: All files within declared scope -- clean
- [x] SC-005: Legacy project -- auto-detect missing convention
- [x] SC-006: No task files found -- check skipped

## Notes

The doNotTouch comparison should handle directory-level entries (e.g., `src/models/` matches any file under that path).

The legacy project detection (Decision 16) prevents the tool's first run against a pre-convention project from being overwhelmed with per-commit warnings.

## Execution Plan

1. Read DAY-ZERO.md contracts (Check interface, ProjectContext, GitCommit, CheckResult/Finding).
2. Read registry.ts and test factories to understand registration pattern and test helpers.
3. Implement `scope-creep.ts` in `src/checks/layer1/`:
   - `matchesDoNotTouch()` helper with directory-level matching (entries ending with `/`).
   - `isInDeclaredScope()` helper checking create + modify lists.
   - Main `run()`: skip if no task files (Decision 17), detect legacy projects (Decision 16), check per-commit prefix, check per-task file scope.
   - Self-register via `registerCheck()`.
4. Implement `scope-creep.test.ts` in `test/checks/layer1/`:
   - SC-001 through SC-006 using factory helpers.
5. Typecheck and run tests.

## Completed

**Date:** 2026-04-13

**Deviations:** None. Implementation follows the task spec exactly.

**Insight/Implication:** The severity derivation logic requires scanning findings for evidence metadata to distinguish critical (doNotTouch violation) from warning (out-of-scope or missing prefix) from info (legacy project note). This pattern of inferring CheckResult severity from Finding evidence will repeat across checks -- a shared `deriveSeverity` utility could reduce duplication if it recurs.

**Decisions made during this task:** None.
