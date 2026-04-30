# Task 023: Document Heresy Check

**Track:** C
**Phase:** C2
**Status:** done
**Depends on:** Task 019
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.3.4 (Document Heresy spec), Decision 7 (skip LLM on zero candidates)

## What to Build

The Document Heresy Layer 2 check. Two phases:

**Code phase:** Narrows candidate sections in PRD, XRD, and task files that reference terminology adjacent to killed decisions. Extracts those sections.

**LLM phase:** For each section, asks: "This decision was killed: [decision]. Does the following document section describe the killed approach as if it were active?" Provides the decision and the document section.

Severity: warning if confirmed, info if ambiguous.

## Files

- Create: `tools/building-audit/src/checks/layer2/document-heresy.ts`
- Create: `tools/building-audit/test/checks/layer2/document-heresy.test.ts`
- Do not touch: `src/llm/`, `src/parser/`

## Contracts

Implements `Check` interface (DAY-ZERO.md Section 3). Uses `LLMClient` (DAY-ZERO.md Section 7).

Consumes `ProjectContext.decisions` (for Hard Kill entries), `ProjectContext.rawFiles` (for document search).

## Acceptance Criteria

1. Killed approach described as active in a document produces a warning finding.
2. No adjacent terminology found in documents means LLM not called, check reports clean.
3. LLM ambiguous ruling produces an info finding.
4. DECISIONS.md itself is excluded from candidates (the kill entry describes the approach by definition).

## Tests

- [x] DOH-001: Killed approach described as active in PRD -- warning
- [x] DOH-002: No adjacent terminology found -- clean

## Notes

Adjacent terminology detection: extract key terms from the killed decision (not just the exact name -- also related concepts). Search document sections for clusters of these terms. This is similar to Deep Heresy's keyword expansion but applied to markdown documents instead of source code.
