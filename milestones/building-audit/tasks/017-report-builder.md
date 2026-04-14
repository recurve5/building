# Task 017: Report Builder

**Track:** D
**Phase:** D1
**Status:** done
**Depends on:** Task 007
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.4 (Report Format), PRD Section 4.3 (AuditReport), Decision 5 (report schema is a contract), DAY-ZERO.md Section 6 (AuditReport), DAY-ZERO.md Section 15 (deduplication), XRD Section 10 (FINDING-6 -- secret masking in report)

## What to Build

The report builder that takes check results and produces the JSON report file. Computes summary statistics, selects top 3 findings, handles deduplication, and masks secrets in evidence fields.

## Files

- Create: `tools/building-audit/src/report/json-builder.ts`
- Create: `tools/building-audit/test/report/json-builder.test.ts`
- Do not touch: `src/checks/`, `src/scanner/`

## Contracts

**Input:** `CheckResult[]`, `ParseError[]`, mode (`mechanical` | `full`), project path, milestone, secret locations (`SecretLocation[]`).

**Output:** `AuditReport` per DAY-ZERO.md Section 6.

**Public API:**
```typescript
function buildReport(
  results: CheckResult[],
  parseErrors: ParseError[],
  mode: 'mechanical' | 'full',
  projectPath: string,
  milestone: string | null,
  secretLocations: SecretLocation[]
): AuditReport
```

**Top 3 selection:** Sort all findings by severity (critical > warning > info). Take the first 3. If fewer than 3 findings total, include all. **Cross-check correlation (Decision 20):** For each top-3 entry, scan all other checks for findings at the same file or task. If found, populate the `correlations` field with those check names (e.g., a test-cheat finding at the same file as a confidence-bluff finding gets `correlations: ["confidence-bluff"]`).

**Deduplication:** Per DAY-ZERO.md Section 15, when findings from different checks share the same file+location, keep the higher-layer finding. Remove duplicates before computing summary counts.

**Secret masking:** Apply `redactSecrets` to all `evidence` fields and `description` fields in findings. Mask secret values to first 4 + `...` + last 4 chars.

## Acceptance Criteria

1. JSON output matches the `AuditReport` schema with all required fields populated.
2. Summary severity counts are correct.
3. Top 3 selection picks highest-severity findings.
4. Top 3 with fewer than 3 total findings returns all available.
4a. Top 3 entries include `correlations` array when other checks have findings at the same file or task.
5. `refactoringAssessment` is null in mechanical mode, populated in full mode.
6. `tokenUsage` is present in full mode, absent in mechanical mode.
7. Check severity is the highest among its findings.
8. Secret values in evidence fields are masked.
9. Deduplication removes same-file-location findings, keeping the higher-layer one.
10. Report `version` is `1.0.0`.

## Tests

- [x] RPT-001: JSON report matches schema
- [x] RPT-002: Summary severity counts correct
- [x] RPT-003: Top 3 selection -- highest severity first
- [x] RPT-004: Top 3 with fewer than 3 findings
- [x] RPT-005: Refactoring assessment null in mechanical mode
- [x] RPT-006: Refactoring assessment populated in full mode
- [x] RPT-007: Token usage present only in full mode
- [x] RPT-008: Token usage absent in mechanical mode
- [x] RPT-009: Check severity is highest among findings
- [x] RPT-010: Secret values masked in report evidence

## Notes

Decision 5: the JSON schema is a contract. Adding fields is non-breaking. Removing or renaming fields is breaking. The report builder should produce exactly the schema defined in DAY-ZERO.md Section 6.

## Execution Plan

1. Create `src/report/json-builder.ts` with `buildReport()` function and helpers: `redactSecrets`, `maskFinding`, `maskEvidence`, `deduplicateFindings`, `selectTop3`, `getRefactoringAssessment`.
2. Implement deduplication per DAY-ZERO Section 15 (file+location match, keep higher layer).
3. Implement top-3 selection with cross-check correlation (Decision 20).
4. Implement secret masking with defense-in-depth regex patterns.
5. Create `test/report/json-builder.test.ts` with RPT-001 through RPT-010 plus deduplication and redactSecrets unit tests.
6. Verify all tests pass and typecheck is clean.

## Completed

**Date:** 2026-04-13
**Deviations:** None. The `redactSecrets` utility was implemented inline in `json-builder.ts` since `src/llm/redact.ts` does not exist yet. It is exported so the LLM client (Task 019) can import and reuse it.
**Insight/Implication:** The `Finding` type does not carry per-finding severity -- severity lives only on `CheckResult`. This means top-3 selection sorts by check-level severity, not individual finding severity. If a check has mixed-severity findings in future, the sort will not distinguish them. **Implication:** acceptable for v1 where each check produces homogeneous-severity findings, but worth revisiting if checks start producing mixed findings.
**Decisions made during this task:** None.
