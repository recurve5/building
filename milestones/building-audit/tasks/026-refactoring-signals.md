# Task 026: Refactoring Signals Check

**Track:** C
**Phase:** C2
**Status:** done
**Depends on:** Task 019
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.3.7 (Refactoring Signals spec), Decision 11 (per-check token limit -- this check may use up to 16K)

## What to Build

The Refactoring Signals Layer 2 check. Two phases:

**Code phase:** Computes:
- Modification coupling trends (are files being touched by more tasks over time?).
- Complexity growth across tasks (are functions getting longer?).
- Test setup ratio trends (is test setup growing relative to assertions?).
- Extracts structural concerns from task Completed sections (insight/implication entries that mention structural issues).

**LLM phase:** Asks: "Given these codebase health trends and the structural concerns raised by agents during the build, should the next milestone proceed as planned, proceed with targeted refactoring first, or halt for structural rework?" Provides metrics and extracted concerns.

**Output:** A green/yellow/red assessment that populates `summary.refactoringAssessment` in the report. This is not individual findings -- it is a single assessment.

## Files

- Create: `tools/building-audit/src/checks/layer2/refactoring-signals.ts`
- Create: `tools/building-audit/test/checks/layer2/refactoring-signals.test.ts`
- Do not touch: `src/llm/`, `src/checks/layer1/fragility-metrics.ts`

## Contracts

Implements `Check` interface (DAY-ZERO.md Section 3). Uses `LLMClient` (DAY-ZERO.md Section 7).

Consumes `ProjectContext.sourceFiles` (for metrics), `ProjectContext.fileToTaskMapping` (for coupling trends), `ProjectContext.taskFiles` (for Completed sections with structural concerns).

The `CheckResult` returned must include a special `evidence.refactoringAssessment` field of type `'green' | 'yellow' | 'red'` that the report builder uses to populate the summary.

## Acceptance Criteria

1. Evidence phase assembles metrics and agent structural concerns.
2. LLM assessing "proceed as planned" produces refactoring assessment = green.
3. LLM assessing "targeted refactoring" produces refactoring assessment = yellow.
4. LLM assessing "structural rework" produces refactoring assessment = red.
5. Assessment is included in CheckResult evidence for the report builder.

## Tests

- [x] RS-001: Metrics and concerns assembled -- evidence phase
- [x] RS-002: LLM assesses yellow -- assessment
- [x] RS-003: LLM assesses green -- assessment
- [x] RS-004: LLM assesses red -- assessment

## Notes

This check is unique: it does not produce traditional findings with file/location. It produces a single holistic assessment. The report builder special-cases this check to populate `summary.refactoringAssessment`.

The structural concerns extraction from Completed sections looks for insight/implication entries that mention words like "fragile", "coupling", "complexity", "technical debt", "refactor", "restructure".
