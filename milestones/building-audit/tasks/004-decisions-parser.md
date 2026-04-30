# Task 004: DECISIONS.md Parser

**Track:** A
**Phase:** A2
**Status:** done
**Depends on:** Task 001
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.2.5 (Surface Heresy), SDM Section 4 (decision logging format), `~/building/decisions.md` (example of actual format), peer review Issue 7 (tag detection)

## What to Build

A parser for DECISIONS.md files that extracts structured `DecisionEntry[]` objects. Detects `[HARD KILL]` and `[DEFERRED]` tags from decision text and rationale. The Surface Heresy and Deep Heresy checks depend on this parser to identify killed terminology.

## Files

- Create: `tools/building-audit/src/parser/decisions-parser.ts`
- Create: `tools/building-audit/test/parser/decisions-parser.test.ts`
- Create: `tools/building-audit/test/fixtures/decisions-with-kills.md`
- Do not touch: `src/types/index.ts`, `src/parser/task-file-parser.ts`

## Contracts

**Input:** Raw markdown content of a DECISIONS.md file.

**Output:** `DecisionEntry[]` per DAY-ZERO.md Section 9.

**Public API:**
```typescript
function parseDecisions(content: string): DecisionEntry[]
```

## Acceptance Criteria

1. Parses a DECISIONS.md table with standard format (columns: #, Decision, Rationale, Date) into `DecisionEntry[]`.
2. Detects `[HARD KILL]` tag in either the Decision or Rationale column.
3. Detects `[DEFERRED]` tag in either the Decision or Rationale column.
4. Returns correct `number`, `decision`, `rationale`, and `date` fields for each entry.
5. Handles DECISIONS.md with no Hard Kill entries (returns entries with empty `tags` arrays).
6. Handles empty or missing DECISIONS.md content (returns empty array, no crash).
7. Handles DECISIONS.md with non-standard formatting (extra whitespace, missing columns) gracefully.

## Tests

- [x] SH-004: No Hard Kill entries in DECISIONS.md -- clean
- [x] SH-005: No DECISIONS.md file -- check degrades gracefully (data layer)
- [x] DH-002: No Hard Kill entries -- clean, LLM not called (data layer)

## Execution Plan

1. Create test fixture `decisions-with-kills.md` with realistic DECISIONS.md content including: standard entries with no tags, entries with `[HARD KILL]` in decision text, entries with `[DEFERRED]` in rationale text, entries with both tags, and multiple tables under section headers (matching the real `~/building/decisions.md` format).
2. Create `src/parser/decisions-parser.ts` with `parseDecisions(content: string): DecisionEntry[]`. Strategy: split content by lines, identify table rows by pipe-delimited format, skip header and separator rows, parse each data row into DecisionEntry fields, scan decision and rationale text for `[HARD KILL]` and `[DEFERRED]` bracketed markers. Handle multiple tables (section headers reset nothing -- all rows accumulate). Skip malformed rows gracefully.
3. Create `test/parser/decisions-parser.test.ts` covering all 7 acceptance criteria plus the 3 test IDs (SH-004, SH-005, DH-002).
4. Run tests, fix any failures.

## Notes

Per peer review Issue 7: the tag detection must handle both explicit `[HARD KILL]` markers AND entries where the rationale describes permanent rejection. For v1, require explicit `[HARD KILL]` bracketed markers. If a future project's DECISIONS.md uses a different convention, the parser can be extended.

The `~/building/decisions.md` file (cross-project decisions) currently has no Hard Kill entries. The fixture file must create realistic ones for testing.

## Completed

**Date:** 2026-04-13

**Deviations:** None. Implementation matches the contract exactly.

**Insight/Implication:** The real `~/building/decisions.md` uses pipe-delimited tables with enriched rationale (containing `**Insight:**`, `**Implication:**`, `**Decision:**` sub-fields within single cells). The parser handles this transparently because it treats the rationale as an opaque string -- no need to parse sub-fields for tag detection. This means future checks that need to distinguish insight-format rationale from simple rationale can do so downstream without parser changes.

**Decisions made during this task:** None.
