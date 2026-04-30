# Smoke Test Report — building-audit

**Date:** 2026-04-13
**Target:** `~/building/` (the building repo itself)
**Mode:** mechanical

## Walkthrough Steps

### Step 1: Version and Help
- `building-audit --version` → `building-audit v1.0.0` ✓
- `building-audit --help` → prints usage with all flags ✓
- `building-audit` (no flags) → prints usage to stderr, exit 2 ✓

### Step 2: Mechanical Audit
```
building-audit --mechanical --output /tmp/smoke-test-report.json
```

**Result:**
- Scanner: 0 task files (building repo root has no `tasks/` dir), git history scanned, AST analysis of `.ts` files completed in 250ms
- All 9 Layer 1 checks executed
- 7 Layer 2 checks correctly skipped in mechanical mode
- Exit code: 1 (critical findings present)

### Step 3: JSON Report Verification
- `version`: `1.0.0` ✓
- `mode`: `mechanical` ✓
- `checks`: 16 total (9 Layer 1 + 7 Layer 2 skipped) ✓
- `summary.refactoringAssessment`: `null` (mechanical mode) ✓
- `tokenUsage`: absent (mechanical mode) ✓
- `top3`: populated with cross-check correlations ✓

### Findings Summary
| Check | Severity | Findings |
|-------|----------|----------|
| test-cheat | critical | 57 — flagged weak assertions in our own test files (legitimate) |
| scope-creep | skipped | no task files in building root |
| dependency-grab | clean | ✓ |
| premature-abstraction | info | 11 |
| surface-heresy | warning | 20 — HARD KILL terms found in doc references |
| confidence-bluff | clean | ✓ |
| fragility-metrics | warning | 43 — file length and TODO density |
| resource-drain | critical | 11 — pattern matches in markdown code examples |
| unoptimized-defaults | warning | 1 |

### Key Observations

1. **Dog-fooding works:** The tool correctly identifies weak assertions in its own test suite. These are real findings — some tests use `toContain`, `toBeDefined`, `toBeNull` etc. which the test-cheat classifier rates as weak.

2. **False positives in documentation:** Resource drain and unoptimized-defaults flag code examples in `.md` files as violations. This is expected behavior for v1 — the checks scan `rawFiles` which includes markdown. A future enhancement could exclude code blocks in documentation files.

3. **Cross-check correlation works:** Top 3 findings show correlations between test-cheat and fragility-metrics at the same test files.

## Verdict

**PASS.** The CLI runs end-to-end, produces a valid report matching the schema, finds real findings, and exits with correct codes. All PRD First-Use Walkthrough steps can be completed.
