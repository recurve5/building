# Task 007: Check Runner and Registry

**Track:** B
**Phase:** B1
**Status:** done
**Depends on:** Task 006
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: XRD Section 3 (Check interface, registry), DAY-ZERO.md Section 3 (Check interface), DAY-ZERO.md Section 5 (CheckResult), DAY-ZERO.md Section 16 (execution order), XRD Section 10 (Layer 1 before Layer 2)

## What to Build

The check runner and registry infrastructure. The runner iterates registered checks, collects results, handles per-check errors (a failing check does not kill the run), enforces Layer 1 -> Layer 2 ordering, and logs timing per check.

## Files

- Create: `tools/building-audit/src/checks/registry.ts`
- Create: `tools/building-audit/src/checks/types.ts`
- Create: `tools/building-audit/test/checks/registry.test.ts`
- Do not touch: `src/scanner/`, `src/parser/`

## Contracts

**Check interface** (DAY-ZERO.md Section 3):
```typescript
interface Check {
  name: string;
  layer: 1 | 2;
  run(context: ProjectContext, llmClient?: LLMClient): Promise<CheckResult>;
}
```

**Registry API:**
```typescript
function registerCheck(check: Check): void;
function getChecks(layer?: 1 | 2): Check[];
```

**Runner API:**
```typescript
async function runChecks(
  context: ProjectContext,
  mode: 'mechanical' | 'full',
  llmClient?: LLMClient
): Promise<{ results: CheckResult[]; secretLocations: SecretLocation[] }>
```

The runner:
1. Runs all Layer 1 checks first. Collects results.
2. After Layer 1 completes, extracts `SecretLocation[]` from the Resource Drain check result.
3. If mode is `full`, runs Layer 2 checks sequentially, passing the LLM client.
4. If a check throws, catches the error and produces a `CheckResult` with `status: 'error'`.
5. Logs timing per check. Warns if any check exceeds 10 seconds.
6. Returns all results plus secret locations for the LLM client's redaction utility.

## Acceptance Criteria

1. Registered checks are discoverable via `getChecks()`.
2. `runChecks` in `mechanical` mode runs only Layer 1 checks.
3. `runChecks` in `full` mode runs Layer 1 first, then Layer 2.
4. A check that throws produces a `CheckResult` with `status: 'error'` and `errorMessage` populated.
5. Other checks continue running after one check fails.
6. Timing is logged per check.
7. Checks exceeding 10 seconds produce a timing warning in logs.
8. Layer 2 checks are skipped (not errored) when no LLM client is provided in full mode.
9. Secret locations from Resource Drain are extracted and available after Layer 1 completes.

## Tests

- [x] L2-001: API unreachable -- check marked error, Layer 1 results preserved
- [x] E2E-005: Timing check logged per check

## Execution Plan

1. Create `src/checks/types.ts` — re-export convenience barrel for check-related types from central `types/index.ts`.
2. Create `src/checks/registry.ts` — module-level `checks` array, `registerCheck`, `getChecks(layer?)`, `clearRegistry` (test-only), `runChecks` runner function.
3. Runner implementation: iterate Layer 1 checks, collect results, extract SecretLocation[] from resource-drain evidence, then conditionally run Layer 2 (skip in mechanical mode, skip when no LLM client).
4. Per-check error handling via try/catch producing `status:'error'` result.
5. Per-check timing via `performance.now()` with console.warn for >10s.
6. Create `test/checks/registry.test.ts` — 12 tests covering all acceptance criteria.
7. Run tests, verify pass. Run typecheck.

## Notes

Per DAY-ZERO.md Section 16: Layer 1 checks must all complete before any Layer 2 check starts. This is a hard requirement for secret redaction.

The check runner is the merge point where all checks connect. Individual check tasks (008-016, 020-026) register themselves with this registry.

## Completed

**Date:** 2026-04-13

**Deviations:** None. All contracts implemented as specified.

**Insight/Implication:** The secret location extraction from Resource Drain relies on a convention: the check stores `SecretLocation[]` in `finding.evidence.secretLocations`. This is an implicit contract between the Resource Drain check (Task 015) and the runner. **Implication:** Task 015 must store secrets in exactly this evidence key, and this convention should be noted in that task's contracts section.

**Decisions made during this task:** None.
