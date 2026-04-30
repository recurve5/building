# Task 015: Resource Drain Check

**Track:** B
**Phase:** B2
**Status:** done
**Depends on:** Task 007
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.2.8 (Resource Drain spec), Decision 6 (gitleaks optional), Decision 10 (defer gitleaks to v2), XRD Section 10 (FINDING-2 -- secret locations for redaction), DAY-ZERO.md Section 12 (SecretLocation)

## What to Build

The Resource Drain Layer 1 check. Scans for resource leaks and hardcoded secrets.

Patterns detected:
- `setInterval`/`setTimeout` without corresponding `clearInterval`/`clearTimeout`.
- `addEventListener` without corresponding `removeEventListener`.
- Database queries without `LIMIT`.
- Hardcoded secret patterns (built-in, no gitleaks in v1).

Secret patterns (built-in):
- AWS key: `/AKIA[0-9A-Z]{16}/`
- GitHub token: `/ghp_[a-zA-Z0-9]{36}/`
- Generic high-entropy: strings matching base64/hex patterns of 32+ characters in assignment context.

This check also produces `SecretLocation[]` that the check runner extracts for Layer 2 evidence redaction.

## Files

- Create: `tools/building-audit/src/checks/layer1/resource-drain.ts`
- Create: `tools/building-audit/test/checks/layer1/resource-drain.test.ts`
- Do not touch: `src/scanner/`, `src/analyzers/`

## Contracts

Implements `Check` interface (DAY-ZERO.md Section 3).

Consumes `ProjectContext.sourceFiles` and `ProjectContext.rawFiles`.

Produces `CheckResult` with an additional `evidence.secretLocations: SecretLocation[]` field (DAY-ZERO.md Section 12) that the check runner extracts.

## Acceptance Criteria

1. `setInterval` without `clearInterval` produces a warning finding.
2. `addEventListener` without `removeEventListener` produces a warning finding.
3. Database query without LIMIT produces a warning finding.
4. Hardcoded AWS key pattern produces a critical finding. Secret value is masked (first 4 + `...` + last 4 chars).
5. Proper cleanup present (e.g., `clearInterval` in `useEffect` return) produces no finding.
6. Built-in patterns detect AWS keys, GitHub tokens, and generic high-entropy strings.
7. Report notes that full pattern library was not available (no gitleaks).
8. `evidence.secretLocations` is populated with `SecretLocation[]` for detected secrets.

## Tests

- [x] RD-001: setInterval without clearInterval -- warning
- [x] RD-002: addEventListener without removeEventListener -- warning
- [x] RD-003: Database query without LIMIT -- warning
- [x] RD-004: Hardcoded secret pattern -- critical
- [x] RD-005: Proper cleanup present -- clean
- [x] RD-006: Built-in secret patterns cover high-value cases

## Notes

Per Decision 10: no gitleaks integration in v1. The built-in patterns are sufficient. The `SecretDetector` can be an internal interface that swaps to gitleaks in the future.

The `SecretLocation[]` output is critical for Layer 2 security (XRD Section 10). The check runner uses these locations to redact evidence before sending to the Anthropic API.

## Execution Plan

1. Iterate `rawFiles` content line-by-line.
2. Match secret patterns (AWS key, GitHub token, generic API key, high-entropy).
3. For each match, create `SecretLocation` with masked value.
4. Check cleanup patterns: setInterval/clearInterval, addEventListener/removeEventListener.
5. Check for unbounded queries (SELECT/DELETE/UPDATE without LIMIT).
6. Produce summary finding with all `SecretLocation[]` in `evidence.secretLocations`.

## Completed

**Date:** 2026-04-13
**Deviations:** Also detects setTimeout without clearTimeout and generic API key assignments. Added summary finding that aggregates all SecretLocations for runner extraction.
**Insight/Implication:** None.
**Decisions made during this task:** None.
