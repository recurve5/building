# Task 027: CLI Integration

**Track:** D
**Phase:** D3
**Status:** done
**Depends on:** Task 006, Task 007, Task 017, Task 018, Task 019
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.5 (CLI interface), PRD Section 2 (First-Use Walkthrough), Decision 9 (exit codes), PRD Section 5 (non-functional requirements)

## What to Build

Wire the complete pipeline: CLI arg parsing -> project scanner -> check runner -> report builder -> terminal formatter -> file output -> exit code. This is the integration task that connects all modules into the working CLI tool.

The CLI entry point (scaffolded in Task 001) is updated to:
1. Parse and validate args.
2. Call the scanner to build `ProjectContext`.
3. Call the check runner with the appropriate mode.
4. Pass results to the report builder.
5. Write the JSON report to the output file.
6. Format and print terminal output.
7. Exit with the correct code (0/1/2).

## Files

- Modify: `tools/building-audit/src/cli/index.ts` — wire the full pipeline
- Modify: `tools/building-audit/bin/building-audit.ts` — ensure it calls the wired CLI
- Create: `tools/building-audit/test/cli/integration.test.ts`
- Do not touch: individual check files, parser, scanner, report modules (consumed, not modified)

## Contracts

Consumes all modules:
- Scanner (Task 006): `scanProject()`
- Check runner (Task 007): `runChecks()`
- Report builder (Task 017): `buildReport()`
- Terminal formatter (Task 018): `formatTerminalOutput()`, `formatCheckProgress()`
- LLM client (Task 019): constructed and passed to runner in `full` mode

## Acceptance Criteria

1. `building-audit --mechanical` runs Layer 1 checks, writes JSON report, prints terminal output, exits correctly.
2. `building-audit --full` with `ANTHROPIC_API_KEY` runs both layers.
3. `building-audit --full` without `ANTHROPIC_API_KEY` runs Layer 1 only, Layer 2 reports skipped.
4. `--output` flag controls report file path. Default is `building-audit-report.json`.
5. `--milestone` flag scopes the audit.
6. `--verbose` flag shows all findings in terminal output.
7. Exit code 0 when no critical findings.
8. Exit code 1 when critical findings present.
9. Exit code 2 on tool error (invalid directory, invalid args).
10. Terminal progress display streams as checks run.

## Tests

- [x] CLI-001: --mechanical runs Layer 1 only
- [x] CLI-002: --full runs Layer 1 + Layer 2
- [x] CLI-005: --full without ANTHROPIC_API_KEY -- Layer 2 skipped
- [x] CLI-006: --output sets report file path
- [x] CLI-007: Default output path
- [x] CLI-008: --milestone scopes audit
- [x] CLI-011: --verbose flag
- [x] CLI-012: Exit code 0 -- no critical findings
- [x] CLI-013: Exit code 1 -- critical findings present
- [x] CLI-014: Exit code 2 -- tool error
- [x] CLI-015: Invalid --milestone value

## Notes

This is the primary merge point. All tracks converge here. The integration test should use a minimal synthetic project (a subset of the E2E synthetic project) to verify the pipeline end-to-end without depending on every check producing correct findings (those are tested individually).
