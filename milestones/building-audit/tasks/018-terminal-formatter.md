# Task 018: Terminal Formatter

**Track:** D
**Phase:** D2
**Status:** done
**Depends on:** Task 017
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.4 (Terminal output), PRD Section 2 (First-Use Walkthrough -- terminal output examples)

## What to Build

The terminal formatter that produces human-readable output during and after the audit. Two responsibilities:

1. **Progress display:** As each check runs, display its name and result (e.g., `test-cheat    3 findings (1 critical, 2 warning)`).
2. **Summary display:** After all checks complete, display critical findings inline (file, location, description, suggestion). With `--verbose`, display all findings.

The formatter reads the `AuditReport` and check results -- it does not compute anything. All logic is in the report builder.

## Files

- Create: `tools/building-audit/src/report/terminal-formatter.ts`
- Create: `tools/building-audit/test/report/terminal-formatter.test.ts`
- Do not touch: `src/report/json-builder.ts`

## Contracts

**Progress API:**
```typescript
function formatCheckProgress(checkName: string, result: CheckResult): string
```

**Summary API:**
```typescript
function formatTerminalOutput(report: AuditReport, verbose: boolean): string
```

**Layer 2 progress API:**
```typescript
function formatLayer2Progress(checkName: string, phase: 'gathering' | 'reviewing' | 'complete', candidateCount?: number): string
```

## Acceptance Criteria

1. Critical findings are printed inline with file, location, description, and suggestion.
2. Warnings and info are not printed in non-verbose mode.
3. With `--verbose`, all findings (critical, warning, info) are printed.
4. Progress display shows each check name and result as it completes.
5. Layer 2 progress shows "Gathering evidence...", "LLM review...", and result.
6. Summary line shows severity counts (e.g., "Summary: 2 critical, 5 warning, 5 info, 3 clean").
7. Output matches the format shown in PRD Section 2 First-Use Walkthrough.

## Tests

- [x] RPT-011: Terminal shows critical findings inline
- [x] RPT-012: Terminal --verbose shows all findings
- [x] RPT-013: Terminal progress display during check execution

## Notes

Per peer review Issue 11: the terminal formatter must handle both Layer 1 and Layer 2 output formats. Layer 2 checks have multi-phase progress (gathering evidence, LLM review, result). Build both output modes from the start.

The formatter produces strings -- it does not write to stdout directly. The CLI integration (Task 027) handles actual output.

## Execution Plan

1. Create `src/report/terminal-formatter.ts` with three public functions: `formatCheckProgress`, `formatLayer2Progress`, `formatTerminalOutput`.
2. Implement ANSI color coding for severity levels (red=critical, yellow=warning, cyan=info, green=clean).
3. Implement progress display for Layer 1 (name + result) and Layer 2 (gathering/reviewing/complete phases).
4. Implement summary display: critical findings always inline; warnings and info only in verbose mode.
5. Create `test/report/terminal-formatter.test.ts` with RPT-011 through RPT-013 plus Layer 2 progress and summary line tests.
6. Use `stripAnsi` helper in tests for readable assertions against output content.

## Completed

**Date:** 2026-04-13
**Deviations:** None.
**Insight/Implication:** The formatter produces pure strings with ANSI codes and never writes to stdout. This makes testing straightforward -- strip ANSI and assert on content. **Implication:** the CLI integration (Task 027) just calls `process.stdout.write()` with the formatter's output.
**Decisions made during this task:** None.
