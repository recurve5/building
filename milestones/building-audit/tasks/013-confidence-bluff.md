# Task 013: Confidence Bluff Check

**Track:** B
**Phase:** B2
**Status:** done
**Depends on:** Task 007
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.2.6 (Confidence Bluff spec), Decision 14 (scoped to static verification)

## What to Build

The Confidence Bluff Layer 1 check. Parses each task's Completed section for claims and cross-references against what static analysis can verify.

Claim types and verification:
- "Created [file]" -- checks file existence on disk. Missing = critical.
- "Modified [file]" -- checks file appears in git diff for task's commits. Not present = critical.
- Function/class existence claims -- checks AST for named declarations. Missing = critical.
- "All tests pass" or test result claims -- flagged as "unverifiable by static analysis" (warning). If test result files exist (vitest JSON, JUnit XML), parsed as supplementary evidence.

## Files

- Create: `tools/building-audit/src/checks/layer1/confidence-bluff.ts`
- Create: `tools/building-audit/test/checks/layer1/confidence-bluff.test.ts`
- Do not touch: `src/scanner/`, `src/parser/`

## Contracts

Implements `Check` interface (DAY-ZERO.md Section 3).

Consumes:
- `ProjectContext.taskFiles` (Completed sections with claims)
- `ProjectContext.sourceFiles` (for function/class existence)
- `ProjectContext.gitLog` (for file modification verification)
- `ProjectContext.rawFiles` (for file existence checks)
- `ProjectContext.testResultFiles` (for supplementary test evidence)

## Acceptance Criteria

1. "Created [file]" claim where file exists produces no finding.
2. "Created [file]" claim where file does not exist produces a critical finding.
3. "Modified [file]" claim where file is not in task's git diff produces a critical finding.
4. "All tests pass" claim produces a warning finding ("unverifiable by static analysis").
5. When test result files exist, they are included as supplementary evidence in the finding.
6. Function/class existence claim where declaration is not in AST produces a critical finding.
7. Task with no Completed section produces no findings from this check.
8. Finding includes the claim text, the file path, and the verification result.

## Tests

- [x] CB-001: "Created [file]" claim -- file exists -- no finding
- [x] CB-002: "Created [file]" claim -- file does not exist -- critical
- [x] CB-003: "Modified [file]" claim -- file not in git diff -- critical
- [x] CB-004: Test result claim -- flagged as unverifiable -- warning
- [x] CB-005: Test result files parsed as supplementary evidence
- [x] CB-006: Function existence claim -- function not in AST -- critical
- [x] CB-007: Task with no Completed section -- no findings

## Notes

Per Decision 14: the check does not execute tests. It verifies what static analysis can verify and flags the rest as unverifiable. This is honest degradation.

Claim extraction from Completed sections uses pattern matching on common phrasings: "Created `path`", "Modified `path`", "Implemented `ClassName`", "All tests pass", etc. The patterns should be documented in the code for future extension.

## Execution Plan

1. Iterate task files with non-null `completed` sections.
2. Extract claims via regex patterns for Created, Modified, Implemented, and test results.
3. Verify Created claims against `sourceFiles` + `rawFiles` existence.
4. Verify Modified claims against `gitLog` filtered by task ID.
5. Verify Implemented claims against AST declarations.
6. Flag test result claims as unverifiable (warning), attach supplementary test result data if available.

## Completed

**Date:** 2026-04-13
**Deviations:** None.
**Insight/Implication:** None.
**Decisions made during this task:** None.
