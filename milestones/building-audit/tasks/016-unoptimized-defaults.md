# Task 016: Unoptimized Defaults Check

**Track:** B
**Phase:** B2
**Status:** done
**Depends on:** Task 007
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.2.9 (Unoptimized Defaults spec), peer review Issue 5 (overlap with Layer 2 checks), DAY-ZERO.md Section 15 (deduplication convention)

## What to Build

The Unoptimized Defaults Layer 1 check. Scans for common performance and security anti-patterns.

Patterns detected:
- Database queries without `LIMIT` or pagination.
- Unsanitized input reaching SQL queries (string interpolation in query strings): severity critical.
- Unsanitized input reaching shell commands (`exec` with string interpolation): severity critical.
- Missing debounce on scroll/resize event handlers: severity warning.

## Files

- Create: `tools/building-audit/src/checks/layer1/unoptimized-defaults.ts`
- Create: `tools/building-audit/test/checks/layer1/unoptimized-defaults.test.ts`
- Do not touch: `src/checks/layer1/resource-drain.ts`

## Contracts

Implements `Check` interface (DAY-ZERO.md Section 3).

Consumes `ProjectContext.sourceFiles` and `ProjectContext.rawFiles`.

Per DAY-ZERO.md Section 15 (deduplication): when this check and a Layer 2 check (React Fluidity, Performance Critical Path) detect the same pattern at the same file+location, the Layer 2 finding supersedes. This check should tag its findings with sufficient location data for the report builder to deduplicate.

## Acceptance Criteria

1. Database query without LIMIT or pagination produces a warning finding.
2. Unsanitized input in SQL query (template literal interpolation) produces a critical finding.
3. Unsanitized input in shell command (`exec` with interpolation) produces a critical finding.
4. Missing debounce on scroll/resize handler produces a warning finding.
5. Query with LIMIT present produces no finding.
6. Findings include file path, line number, pattern description, and severity rationale.

## Tests

- [x] UD-001: Database query without LIMIT or pagination -- warning
- [x] UD-002: Unsanitized input reaching query -- critical
- [x] UD-003: Unsanitized input reaching shell command -- critical
- [x] UD-004: Missing debounce on scroll/resize handler -- warning
- [x] UD-005: Query with LIMIT present -- clean

## Notes

Per peer review Issue 5: the overlap with Layer 2 checks is handled by the deduplication convention in DAY-ZERO.md Section 15. This check handles non-framework patterns (raw SQL, shell commands, generic event listeners). Framework-specific patterns (React re-renders, virtualized lists) are handled by React Fluidity (Task 025).

The SQL injection and shell injection detection is pattern-based (template literal interpolation reaching known query/exec calls), not flow analysis. This catches the common case without building a taint tracker.

## Execution Plan

1. Iterate `rawFiles` line-by-line for SQL/shell injection patterns.
2. Check for template literal interpolation in query/exec calls (critical).
3. Check for SQL queries without LIMIT or pagination keywords (warning).
4. Check for scroll/resize event listeners without debounce/throttle (warning).
5. Tag findings with file+location for deduplication with Layer 2 checks.

## Completed

**Date:** 2026-04-13
**Deviations:** Added additional test for scroll handler with debounce present (clean). Also added empty rawFiles edge case test.
**Insight/Implication:** None.
**Decisions made during this task:** None.
