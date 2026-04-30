# Task 022: Deep Heresy Check

**Track:** C
**Phase:** C2
**Status:** done
**Depends on:** Task 019
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.3.3 (Deep Heresy spec), Decision 7 (skip LLM on zero candidates)

## What to Build

The Deep Heresy Layer 2 check. Two phases:

**Code phase:** Extracts killed decision descriptions from `DECISIONS.md` `[HARD KILL]` entries. Parses the rationale to identify the behavioral intent of the killed approach. Expands keywords from the kill rationale and searches the codebase for code sections that match.

**LLM phase:** For each candidate, asks: "This decision killed [approach]. Does any code in the project implement this behavior under a different name?" Provides the decision text and relevant code sections.

Severity: critical if LLM identifies an active implementation of a killed approach, warning if uncertain.

## Files

- Create: `tools/building-audit/src/checks/layer2/deep-heresy.ts`
- Create: `tools/building-audit/test/checks/layer2/deep-heresy.test.ts`
- Do not touch: `src/llm/`, `src/parser/decisions-parser.ts`

## Contracts

Implements `Check` interface (DAY-ZERO.md Section 3). Uses `LLMClient` (DAY-ZERO.md Section 7).

Consumes `ProjectContext.decisions` (for Hard Kill entries), `ProjectContext.sourceFiles` and `ProjectContext.rawFiles` (for code search).

## Acceptance Criteria

1. Killed behavior implemented under a different name detected and confirmed by LLM produces a critical finding.
2. No Hard Kill entries means LLM is never called, check reports clean.
3. LLM uncertain about whether behavior matches produces a warning finding.
4. Code phase extracts behavioral intent keywords from kill rationale for code search.

## Tests

- [x] DH-001: Killed behavior implemented under different name -- critical
- [x] DH-002: No Hard Kill entries -- clean, LLM not called
- [x] DH-003: LLM uncertain -- warning

## Notes

The difference between Surface Heresy (Task 012) and Deep Heresy: Surface Heresy checks for the exact killed terminology. Deep Heresy checks whether the killed *behavior* is reimplemented under a different name. Surface Heresy is deterministic; Deep Heresy requires LLM judgment.

Keyword expansion from kill rationale: extract nouns, verbs, and technical terms from the rationale. Search for code that matches clusters of these keywords. This narrows the evidence before sending to the LLM.
