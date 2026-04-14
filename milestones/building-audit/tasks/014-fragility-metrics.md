# Task 014: Fragility Metrics Check

**Track:** B
**Phase:** B2
**Status:** done
**Depends on:** Task 007
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.2.7 (Fragility Metrics spec)

## What to Build

The Fragility Metrics Layer 1 check. Computes code health signals and aggregates them into per-file findings.

Metrics computed:
- File length (lines). Threshold: 300 lines = info, 500 lines = warning.
- Function/method length (lines). Threshold: 50 lines = info, 100 lines = warning.
- Modification coupling: files touched by 5+ tasks (from `fileToTaskMapping`). Threshold: 5 = warning.
- TODO/HACK/FIXME comment density: count per file. Threshold: 5 per 100 lines = warning.
- Test setup complexity: ratio of setup lines to assertion lines in test files. Threshold: 80% setup = warning.

No individual metric is a finding by itself. The check aggregates them into a per-file health score.

## Files

- Create: `tools/building-audit/src/checks/layer1/fragility-metrics.ts`
- Create: `tools/building-audit/test/checks/layer1/fragility-metrics.test.ts`
- Do not touch: `src/analyzers/`, `src/scanner/`

## Contracts

Implements `Check` interface (DAY-ZERO.md Section 3).

Consumes `ProjectContext.sourceFiles` (for line counts, function lengths), `ProjectContext.fileToTaskMapping` (for modification coupling), `ProjectContext.rawFiles` (for TODO scanning).

## Acceptance Criteria

1. File exceeding 500 lines produces a warning finding with line count.
2. Function exceeding 100 lines produces a warning finding with function name and line range.
3. File touched by 5+ tasks produces a warning finding noting modification coupling.
4. High TODO/HACK/FIXME density produces a finding.
5. Test file with 80%+ setup-to-assertion ratio produces a finding.
6. Clean file (under all thresholds) produces no findings.
7. Findings include file path, metric name, measured value, and threshold.

## Tests

- [x] FM-001: File exceeding length threshold -- warning
- [x] FM-002: Function exceeding length threshold -- warning
- [x] FM-003: High modification coupling -- warning
- [x] FM-004: TODO/HACK/FIXME density above threshold
- [x] FM-005: Test setup complexity -- high setup-to-assertion ratio
- [x] FM-006: Clean file -- no findings

## Notes

The thresholds are hardcoded for v1. Custom rule configuration (including threshold overrides) is out of scope per PRD Section 7. The thresholds chosen here are reasonable defaults; the task agent should use the specific values listed above unless a strong reason exists to adjust.

## Execution Plan

1. For each source file: check line count against 300 (info) and 500 (warning) thresholds.
2. For each function/method: check length against 50 (info) and 100 (warning) thresholds.
3. Check `fileToTaskMapping` for files touched by 5+ tasks (warning).
4. Scan `rawFiles` for TODO/HACK/FIXME density (5 per 100 lines = warning).
5. For test files: compute setup-to-assertion ratio (80%+ = warning).
6. Aggregate into per-file findings with metric name, value, and threshold.

## Completed

**Date:** 2026-04-13
**Deviations:** None. All thresholds match the task spec exactly.
**Insight/Implication:** None.
**Decisions made during this task:** None.
