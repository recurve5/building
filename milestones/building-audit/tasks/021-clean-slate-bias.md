# Task 021: Clean Slate Bias Check

**Track:** C
**Phase:** C2
**Status:** done
**Depends on:** Task 019
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.3.2 (Clean Slate Bias spec), Decision 7 (skip LLM on zero candidates)

## What to Build

The Clean Slate Bias Layer 2 check. Two phases:

**Code phase:** Finds functions, classes, and files with similar names or signatures across the codebase. Uses string similarity on identifiers and function signatures (name + parameter count + return type).

**LLM phase:** For each candidate pair, asks: "Do these two implementations serve the same purpose? Could one be eliminated by extending the other?" Provides both implementations.

Severity: warning if duplicates confirmed, info if related but distinct.

## Files

- Create: `tools/building-audit/src/checks/layer2/clean-slate-bias.ts`
- Create: `tools/building-audit/test/checks/layer2/clean-slate-bias.test.ts`
- Do not touch: `src/llm/`, `src/analyzers/`

## Contracts

Implements `Check` interface (DAY-ZERO.md Section 3). Uses `LLMClient` (DAY-ZERO.md Section 7).

Consumes `ProjectContext.sourceFiles` (for identifier and signature comparison).

## Acceptance Criteria

1. Similar function names/signatures across files detected as candidate pairs.
2. LLM confirming duplication produces a warning finding.
3. LLM saying related but distinct produces an info finding.
4. No similar identifiers found means LLM not called, check reports clean.
5. String similarity threshold is reasonable (catches `formatDate` vs `formatDate` in different files, does not flag `format` vs `formatDate`).

## Tests

- [x] CSB-001: Similar function names/signatures detected -- evidence phase
- [x] CSB-002: LLM confirms duplication -- warning
- [x] CSB-003: LLM says related but distinct -- info
- [x] CSB-004: No similar identifiers found -- clean

## Notes

String similarity: use a combination of exact name matching and Levenshtein distance on function signatures. The threshold should be tuned to avoid false positives (matching every `get`/`set` pair). Start conservative -- exact name match across files is the highest-signal case.
