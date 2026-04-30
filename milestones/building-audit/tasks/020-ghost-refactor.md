# Task 020: Ghost Refactor Check

**Track:** C
**Phase:** C2
**Status:** done
**Depends on:** Task 019
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.3.1 (Ghost Refactor spec), Decision 7 (skip LLM on zero candidates)

## What to Build

The Ghost Refactor Layer 2 check. Two phases:

**Code phase:** Identifies commits with large diffs (above configurable line threshold, default 200 lines) attributed to tasks not labeled as refactoring. Extracts before/after code for each candidate.

**LLM phase:** For each candidate, asks the LLM: "This diff was produced by a task that is not a refactoring task. Was this rewrite necessary to accomplish the task's stated goal, or is it a stylistic rewrite of working code?" Provides the task's What to Build section and the diff.

Severity: warning if LLM rules unnecessary, info if ambiguous.

## Files

- Create: `tools/building-audit/src/checks/layer2/ghost-refactor.ts`
- Create: `tools/building-audit/test/checks/layer2/ghost-refactor.test.ts`
- Do not touch: `src/llm/`, `src/scanner/`

## Contracts

Implements `Check` interface (DAY-ZERO.md Section 3). Uses `LLMClient` (DAY-ZERO.md Section 7).

Consumes `ProjectContext.gitLog` (for diff sizes), `ProjectContext.taskFiles` (for task labels and What to Build).

## Acceptance Criteria

1. Large diff on non-refactor task identified as a candidate in the evidence phase.
2. Prompt sent to LLM includes the task's "What to Build" text and the diff.
3. LLM ruling "unnecessary" produces a warning finding.
4. LLM ruling "necessary" produces no finding.
5. Zero candidates means LLM is never called (Decision 7).
6. Token usage tracked for LLM calls.

## Tests

- [x] GR-001: Large diff on non-refactor task -- evidence phase
- [x] GR-002: Prompt construction includes task goal and diff
- [x] GR-003: LLM rules unnecessary -- warning finding
- [x] GR-004: LLM rules necessary -- clean
- [x] GR-005: Zero candidates -- LLM never called

## Notes

The "refactoring task" label detection: check if the task's short name or What to Build section contains "refactor" or "restructure" (case-insensitive). A more sophisticated approach could check for tags, but this suffices for v1.

The configurable line threshold (default 200) should be a constant at the top of the file, documented for future configuration support.
