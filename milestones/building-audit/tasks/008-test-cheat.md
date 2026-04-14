# Task 008: Test Cheat Check

**Track:** B
**Phase:** B2
**Status:** done
**Depends on:** Task 007
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.2.1 (Test Cheat spec), DAY-ZERO.md Section 4 (AnalyzedFile, assertion classification), XRD Quality Bar Trace (Section 4), Decision 21 (assertion patterns in JSON config)

## What to Build

The Test Cheat Layer 1 check. Iterates all analyzed test files in `ProjectContext.sourceFiles`. For each test function, examines assertion strength. A test where all assertions are weak or absent is a finding.

Assertion strength classifications are loaded from `assertion-patterns.json` (Decision 21). If the config file is not found, built-in defaults from DAY-ZERO.md Section 4 are used. This allows adding new matcher patterns without code changes.

Severity rules:
- Critical: test name implies correctness (matches `/calculates|returns|produces|computes|generates/i`) AND all assertions are weak or absent.
- Warning: all assertions are weak or absent but test name does not imply correctness.

## Files

- Create: `tools/building-audit/src/checks/layer1/test-cheat.ts`
- Create: `tools/building-audit/src/checks/layer1/assertion-patterns.json` (default patterns)
- Create: `tools/building-audit/test/checks/layer1/test-cheat.test.ts`
- Do not touch: `src/analyzers/`, `src/scanner/`

## Contracts

Implements `Check` interface (DAY-ZERO.md Section 3). Registered with the check registry (Task 007).

Consumes `ProjectContext.sourceFiles` — specifically `AnalyzedFile.testFunctions` and their `assertions` arrays.

Produces `CheckResult` with findings per `Finding` interface (DAY-ZERO.md Section 5).

## Acceptance Criteria

1. All-weak assertions with correctness-implying test name produces a critical finding.
2. All-weak assertions with non-correctness name produces a warning finding.
3. Mixed strong and weak assertions produces no finding (at least one strong assertion present).
4. No assertions in test body produces a finding.
5. All-strong assertions produces no finding (check reports clean for that test).
6. Multiple test functions in one file produce individual findings per function.
7. Check reports `clean` when all tests have strong assertions.
8. Finding includes file path, line number, description mentioning the weak assertions, and a suggestion to assert specific values.

## Tests

- [ ] TC-001: All-weak assertions with correctness-implying name -- critical
- [ ] TC-002: All-weak assertions with non-correctness name -- warning
- [ ] TC-003: Mixed strong and weak assertions -- no finding
- [ ] TC-004: No assertions in test body -- finding
- [ ] TC-005: Strong assertions only -- clean
- [ ] TC-006: Correctness-implying name patterns
- [ ] TC-007: Multiple test functions in one file -- findings per function

## Notes

This is the check traced through the quality bar in XRD Section 4. The expected finding from the PRD walkthrough is:
```
CRITICAL  test-cheat  src/services/__tests__/streak.test.ts:42
  Test 'calculates streak correctly' has 3 assertions, all toBeDefined().
```

The check consumes pre-analyzed data from `ProjectContext.sourceFiles`. It does not parse ASTs itself.

## Execution Plan

1. Read DAY-ZERO.md contracts (Check, AnalyzedFile, CheckResult, Finding), registry pattern, and types.
2. Create `assertion-patterns.json` with strong/weak classifications from Decision 21.
3. Create `test-cheat.ts` implementing Check interface: load patterns from JSON with built-in fallback, iterate sourceFiles testFunctions, classify assertion strength, apply severity rules (critical for correctness-implying names + all-weak, warning otherwise), register with registry.
4. Create `test-cheat.test.ts` covering TC-001 through TC-007 using test factories.
5. Run tests, typecheck, verify full suite passes.

## Completed

**Date:** 2026-04-13
**Deviations:** None.
**Insight/Implication:** The assertion strength classification uses the method name from `AssertionInfo.method` matched against the `strong` set from config. The `strength` field on `AssertionInfo` is set by the analyzer but the check re-derives strong/weak from config patterns -- this means the config can override the analyzer's classification at runtime. Implication: if a pattern is added to `assertion-patterns.json` as strong, the check will treat it as strong even if the analyzer tagged it weak.
**Decisions made during this task:** None.
