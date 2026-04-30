# Task 025: React Fluidity Check

**Track:** C
**Phase:** C2
**Status:** done
**Depends on:** Task 019
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.3.6 (Fluidity spec), Decision 12 (renamed to react-fluidity), DAY-ZERO.md Section 15 (deduplication with Unoptimized Defaults)

## What to Build

The React Fluidity Layer 2 check (renamed from "Fluidity" per Decision 12). React-specific performance analysis. Two phases:

**Code phase:** Identifies:
- Re-render triggers: state changes in loops (`setState` inside `.forEach`/`.map`/`for`).
- Non-virtualized lists over a size threshold (large arrays mapped to JSX without windowing).
- Missing debounce on scroll/resize handlers in React components.

**LLM phase:** For each candidate, asks: "Would a user feel this performance issue during normal use?" Provides the code and the UI context (component name, what it renders).

When no React patterns are detected in the project, the check reports `skipped` with reason (Decision 12).

## Files

- Create: `tools/building-audit/src/checks/layer2/react-fluidity.ts`
- Create: `tools/building-audit/test/checks/layer2/react-fluidity.test.ts`
- Do not touch: `src/checks/layer1/unoptimized-defaults.ts`

## Contracts

Implements `Check` interface (DAY-ZERO.md Section 3). Uses `LLMClient` (DAY-ZERO.md Section 7).

Consumes `ProjectContext.sourceFiles` (for React pattern detection).

Per DAY-ZERO.md Section 15: findings that overlap with Unoptimized Defaults (Task 016) at the same file+location supersede the Layer 1 finding in the report.

## Acceptance Criteria

1. Non-React project (no JSX, no React imports) reports `skipped` with reason.
2. State change in loop detected as a candidate.
3. LLM assessing user-perceptible issue produces a warning finding.
4. LLM assessing non-perceptible produces no finding.
5. Check name in registry and report is `react-fluidity` (not `fluidity`).

## Tests

- [x] RF-001: Non-React project -- check skipped
- [x] RF-002: State change in loop -- candidate found
- [x] RF-003: LLM says user-perceptible -- warning

## Notes

Decision 12: this check is explicitly React-specific. The name `react-fluidity` prevents false confidence that UI fluidity is checked for non-React projects. When React patterns are absent, the report clearly shows `skipped` rather than a misleading `clean`.

React detection: check for files with `.tsx`/`.jsx` extensions or files importing from `react`.
