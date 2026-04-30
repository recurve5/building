# Task 024: Performance Critical Path Check

**Track:** C
**Phase:** C2
**Status:** done
**Depends on:** Task 019
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.3.5 (Performance Critical Path spec), Decision 11 (per-check token limit 16K), XRD Risk 4 (call chain tracing limitations)

## What to Build

The Performance Critical Path Layer 2 check. Two phases:

**Code phase:** Traces call chains from entry points (API route handlers, event handlers, main execution paths) through the codebase. Measures chain depth and identifies chains that cross service boundaries or involve I/O operations (file reads, database queries, network calls).

**LLM phase:** For each flagged chain, asks: "This call chain handles [user action]. The chain is N calls deep and includes [I/O operations]. Would a user perceive latency from this chain?" Provides the chain with annotated I/O points.

This check has a 16K token limit (Decision 11) instead of the default 8K, because call chain evidence is inherently larger.

## Files

- Create: `tools/building-audit/src/checks/layer2/performance-critical.ts`
- Create: `tools/building-audit/test/checks/layer2/performance-critical.test.ts`
- Do not touch: `src/llm/`, `src/analyzers/`

## Contracts

Implements `Check` interface (DAY-ZERO.md Section 3). Uses `LLMClient` with `maxInputTokens = 16384` (DAY-ZERO.md Section 7, Decision 11).

Consumes `ProjectContext.sourceFiles` (for function call analysis and I/O detection).

## Acceptance Criteria

1. Deep call chain with I/O operations identified as a candidate.
2. LLM assessing perceptible latency produces a warning finding.
3. LLM assessing acceptable latency produces no finding.
4. Evidence exceeding 16K tokens triggers batching and logs a warning.
5. Call chain tracing handles direct calls and explicit async patterns (await chains).
6. I/O operations annotated in the evidence (file reads, db queries, network calls).

## Tests

- [x] PCP-001: Deep call chain with I/O -- evidence phase
- [x] PCP-002: LLM assesses perceptible latency -- warning
- [x] PCP-003: Evidence exceeds token limit -- batching occurs

## Notes

Per XRD Risk 4: static call chain tracing is incomplete for TypeScript's dynamic features (callbacks, dependency injection). Start with direct call chains and explicit async patterns. Skip dynamic dispatch. The check underreports rather than overreports. Annotate limitations in the check's output when tracing is incomplete.

Entry point detection: look for Express/Fastify route handlers, event listener callbacks, exported `main` functions, and CLI command handlers.
