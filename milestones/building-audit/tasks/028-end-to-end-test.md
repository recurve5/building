# Task 028: End-to-End Test

**Track:** D
**Phase:** D4
**Status:** done
**Depends on:** Task 027
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 2 (First-Use Walkthrough), test plan Section 2.7 (E2E tests), test plan Section 3 (stress tests), Decision 2 (ground truth), PRD Section 5 (non-functional requirements)

## What to Build

The synthetic project fixture and end-to-end test suite. The synthetic project contains known violations for every check, plus clean cases, plus a malformed task file. The E2E tests run the complete `building-audit` CLI against this fixture and verify the report.

**Synthetic project contents:**
- 3 task files (2 full template, 1 fix template) plus 1 malformed task file.
- A `DECISIONS.md` with 1 `[HARD KILL]` entry.
- Source files with: weak test assertions (Test Cheat), files outside task scope in git (Scope Creep), unjustified dependency (Dependency Grab), single-implementation interface (Premature Abstraction), killed terminology in source (Surface Heresy), false file claim in Completed section (Confidence Bluff), 400-line file with high TODO density (Fragility Metrics), `setInterval` without cleanup and AWS key pattern (Resource Drain), unsanitized SQL query (Unoptimized Defaults).
- Git history with `[TASK_ID]` prefixed commits plus one unattributed commit.
- At least one check that produces no findings (justified dependency).

This task also includes the quality bar acceptance criterion: compare the tool's output against known violations to verify the tool finds them.

## Files

- Create: `tools/building-audit/test/fixtures/synthetic-project/` — complete synthetic project directory
- Create: `tools/building-audit/test/e2e/mechanical.test.ts`
- Create: `tools/building-audit/test/e2e/full-mode.test.ts`
- Create: `tools/building-audit/test/e2e/edge-cases.test.ts`
- Do not touch: `src/` (the tool being tested)

## Contracts

The synthetic project is a self-contained fixture. It includes:
- `tasks/` directory with task files
- `DECISIONS.md`
- `src/` with TypeScript source files containing known violations
- A git repository (initialized in test setup)
- `package.json` with added dependencies

The E2E tests call the CLI programmatically (or via the exported pipeline function) and assert on the produced `AuditReport`.

## Acceptance Criteria

1. Mechanical mode: all 9 Layer 1 checks execute. At least one finding per check that has a violation. At least one check reports clean. Parse errors contain the malformed file. Summary counts match. Exit code 1.
2. Full mode (mocked LLM): Layer 1 results identical to mechanical. Layer 2 checks execute with mock responses. `refactoringAssessment` populated. `tokenUsage` present.
3. Clean synthetic project: all checks report clean. Exit code 0.
4. Empty project: task-dependent checks report `skipped`. No crashes. Exit code 0.
5. Timing logged per check.
6. **Quality bar:** The report finds all known violations planted in the synthetic project. Compare the findings list against the expected violations list. Every planted violation has a corresponding finding. No planted clean case produces a false positive.

## Tests

- [x] E2E-001: Synthetic project with known violations -- mechanical mode
- [x] E2E-002: Synthetic project -- full mode with mocked LLM
- [x] E2E-003: Clean synthetic project -- all checks clean
- [x] E2E-004: Empty project -- graceful handling
- [x] E2E-005: Timing check logged per check

## Notes

Acceptance criterion 6 is the quality bar gate per the task template conventions: "Compare output against [reference]. Verify the output captures equivalent analytical depth." The known violations in the synthetic project serve as the ground truth for this comparison.

Decision 2: Josh captures a separate ground truth from a real project. This E2E test uses a synthetic ground truth. The real validation happens when Josh runs the tool against Nacre.

The synthetic project's git history must be created programmatically in test setup (init repo, make commits with task ID prefixes, etc.). This ensures the fixture is self-contained and reproducible.
