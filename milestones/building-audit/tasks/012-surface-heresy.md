# Task 012: Surface Heresy Check

**Track:** B
**Phase:** B2
**Status:** done
**Depends on:** Task 007
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.2.5 (Surface Heresy spec)

## What to Build

The Surface Heresy Layer 1 check. Parses `DECISIONS.md` for `[HARD KILL]` entries, extracts killed terminology (class names, field names, feature names, specific phrasing), and searches the entire codebase and project documents for matches.

Severity:
- Critical: killed terminology found in source code.
- Warning: killed terminology found in documentation (not DECISIONS.md itself).

Matches within the DECISIONS.md kill entry itself are excluded.

## Files

- Create: `tools/building-audit/src/checks/layer1/surface-heresy.ts`
- Create: `tools/building-audit/test/checks/layer1/surface-heresy.test.ts`
- Do not touch: `src/parser/decisions-parser.ts`, `src/scanner/`

## Contracts

Implements `Check` interface (DAY-ZERO.md Section 3).

Consumes `ProjectContext.decisions` (for Hard Kill entries), `ProjectContext.sourceFiles` (for source code search), `ProjectContext.rawFiles` (for documentation search).

## Acceptance Criteria

1. Hard Kill terminology found in source code produces a critical finding.
2. Hard Kill terminology found in documentation (non-DECISIONS.md) produces a warning finding.
3. Terminology appearing only in the DECISIONS.md kill entry itself produces no finding.
4. No Hard Kill entries in DECISIONS.md produces no findings (clean).
5. No DECISIONS.md file produces no findings (clean, no error).
6. Finding includes the killed term, the file where it was found, and the kill decision reference.

## Tests

- [x] SH-001: Hard Kill terminology found in source code -- critical
- [x] SH-002: Hard Kill terminology found in documentation -- warning
- [x] SH-003: Terminology only in DECISIONS.md kill entry -- clean
- [x] SH-004: No Hard Kill entries in DECISIONS.md -- clean
- [x] SH-005: No DECISIONS.md file -- check degrades gracefully

## Notes

Terminology extraction from kill entries: split the decision text on common delimiters, extract quoted strings, backtick-wrapped identifiers, and PascalCase/camelCase words that appear to be code identifiers. The search is case-sensitive for code identifiers and case-insensitive for prose terms.

## Execution Plan

1. Filter `decisions` for `HARD KILL` tagged entries.
2. Extract terms: backtick-wrapped, quoted, PascalCase, camelCase identifiers.
3. Search `sourceFiles` identifiers for matches (critical).
4. Search `rawFiles` content for matches, excluding DECISIONS.md itself (warning).
5. Return clean if no hard kills exist.

## Completed

**Date:** 2026-04-13
**Deviations:** Source file search uses `AnalyzedFile.identifiers` array for fast matching. Documentation search is case-insensitive. Terms shorter than 3 characters are excluded to reduce noise.
**Insight/Implication:** None.
**Decisions made during this task:** None.
