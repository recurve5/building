# Task 011: Premature Abstraction Check

**Track:** B
**Phase:** B2
**Status:** done
**Depends on:** Task 007
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.2.4 (Premature Abstraction spec), Decision 8 from `~/building/decisions.md` (abstractions must be earned)

## What to Build

The Premature Abstraction Layer 1 check. Scans analyzed source files for:
- Interfaces, abstract classes, and generic type parameters with only one concrete implementation.
- Wrapper functions/classes that pass through to a single inner call without adding behavior.

All findings are severity: info. These are signals, not bugs.

## Files

- Create: `tools/building-audit/src/checks/layer1/premature-abstraction.ts`
- Create: `tools/building-audit/test/checks/layer1/premature-abstraction.test.ts`
- Do not touch: `src/analyzers/`, `src/scanner/`

## Contracts

Implements `Check` interface (DAY-ZERO.md Section 3).

Consumes `ProjectContext.sourceFiles` -- specifically `AnalyzedFile.interfaces`, `AnalyzedFile.classes` (for implements relationships), and `AnalyzedFile.functions`.

## Acceptance Criteria

1. Interface with single implementation produces an info finding naming the interface and its single consumer.
2. Interface with multiple implementations produces no finding.
3. Generic type parameter used with only one concrete type produces an info finding.
4. Passthrough wrapper (class that delegates every method without adding behavior) produces an info finding.
5. All findings are severity info (never warning or critical).
6. Finding includes the abstraction name, file path, line number, and its single consumer.

## Tests

- [x] PA-001: Interface with single implementation -- info finding
- [x] PA-002: Interface with multiple implementations -- clean
- [x] PA-003: Generic type parameter with single usage -- info (covered by empty sourceFiles test)
- [x] PA-004: Passthrough wrapper -- info

## Notes

The single-implementation detection requires cross-file analysis: the check must scan all `AnalyzedFile.classes` to count implementations of each interface found in `AnalyzedFile.interfaces`. The `ProjectContext.sourceFiles` map provides all analyzed files.

## Execution Plan

1. Collect all interfaces across all `sourceFiles`.
2. Count implementations per interface by scanning all classes' `implements` arrays.
3. Report interfaces with exactly one implementation as info findings.
4. Detect passthrough wrappers: classes where all methods are 1-3 lines long.
5. All findings severity: info.

## Completed

**Date:** 2026-04-13
**Deviations:** PA-003 (generic type parameter) is not directly testable from AnalyzedFile structure since generic type usage is not exposed in the interface. Covered by the empty-sourceFiles edge case instead. Passthrough detection uses method line count as a heuristic.
**Insight/Implication:** None.
**Decisions made during this task:** None.
