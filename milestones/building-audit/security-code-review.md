# Security Code Review — building-audit

**Date:** 2026-04-13
**Scope:** `~/building/tools/building-audit/src/`
**Stage:** 9.5

## Original Findings Status

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| FINDING-1 | High | Command injection via child_process | **Resolved** — no exec/spawn calls; all git ops via simple-git API |
| FINDING-2 | High | API secret leakage to LLM | **Resolved** — `redactSecrets` + `defenseInDepthRedact` on all outbound payloads |
| FINDING-3 | Medium | Path traversal in scanner | **Resolved** — `assertWithinProject` + `validateMilestoneName` |
| FINDING-4 | Medium | API key in error messages | **Resolved** — `sanitizeError` strips key from all error messages |
| FINDING-5 | Medium | Outdated simple-git | **Resolved** — pinned `>= 3.16.0` |
| FINDING-6 | Medium | Secrets in report JSON | **Resolved** — `maskFinding` applied to all findings in report |

## New Findings

| ID | Severity | File | Description | Action |
|----|----------|------|-------------|--------|
| SCR-1 | Medium | cli/index.ts:106 | `--output` path used without containment check | Accepted — standard CLI behavior, user controls invocation |
| SCR-2 | Low | cli/index.ts:80-84 | LLM client error catch swallows non-key errors | Accepted — fallback warning is adequate for v1 |
| SCR-3 | Low | report/json-builder.ts:47 | `sk-` regex used `{48}` instead of `{48,}` | **Fixed** — aligned to `{48,}` |
| SCR-7 | Info | checks/registry.ts | Secret locations not wired to LLM client before Layer 2 | **Fixed** — `setSecretLocations` called after Layer 1 completes |

## Verdict

No critical or high-severity new findings. All original architectural security decisions properly implemented. Two minor fixes applied (SCR-3, SCR-7).
