# Task 001: Hook Behavior Spike

**Track:** A
**Phase:** Pre-A1 (load-bearing premise validation)
**Status:** complete
**Depends on:** none
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-3 (Hook Interface Contract), D0-8 (Bash Conventions), XRD Risk #1 (Hook Path Filtering)

## What to Build

A minimal verification that Claude Code's PreToolUse hooks work as the architecture requires. This is a go/no-go spike — if hooks don't behave as expected, Track A needs redesign before any gate scripts are written.

Produce:
1. A test hook script (`.building/hooks/spike-test.sh`) that logs invocations and conditionally blocks writes.
2. A temporary hook entry in `.claude/settings.local.json` for the spike.
3. A written report (`milestones/trellis/m1-trellis-governance-layer/spike-report.md`) documenting findings.

## Files

- Create: `.building/hooks/spike-test.sh`
- Create: `milestones/trellis/m1-trellis-governance-layer/spike-report.md`
- Modify: `.claude/settings.local.json` (add temporary hook entry, remove after spike)
- Do not touch: `tools/building-audit/`, `orchestrator.md`, `prompts/`

## Contracts

This task produces findings that inform all subsequent tasks. The spike report must answer:

1. Does PreToolUse on Write receive the file path and proposed content on stdin?
2. Does a non-zero exit code block the write (file unchanged on disk)?
3. What format does the stdin JSON have? (Document exact field names.)
4. Does the hook fire for ALL Write calls, or can it be filtered by matcher?
5. What is the hook's working directory?
6. What happens when the hook script has a syntax error? (Silent pass or block?)
7. Approximate latency overhead per hook invocation for a trivial fast-path exit.

If any of findings 1-3 differ from DAY-ZERO.md D0-3, update D0-3 to match reality.

## Acceptance Criteria

1. The spike hook script logs every invocation to a temp file, confirming it fires on Write.
2. When the hook exits non-zero, the target file is NOT modified on disk.
3. When the hook exits 0, the target file IS modified on disk.
4. The spike report documents the JSON format received on stdin with actual field names.
5. The spike report documents the hook's working directory.
6. The spike report documents behavior when the hook script has a syntax error.
7. DAY-ZERO.md D0-3 reflects verified reality, not assumptions.

## Tests

- [ ] HOOK-001: Hook fires on write to target path
- [ ] HOOK-003: Hook blocks write when exit non-zero
- [ ] HOOK-004: Hook allows write when exit zero
- [ ] HOOK-008: Hook handles script syntax error without silent pass

These are verified manually during the spike and documented in the spike report. They will be automated in Task 007.

## Notes

This is the single most critical task. The XRD, peer review, and SDM review all agree: if PreToolUse hooks don't block writes, the enforcement layer is advisory and the architecture needs redesign. Do this first, do it thoroughly, do not proceed to Task 002 until findings are documented.

The spike hook and settings.local.json entry are temporary. Clean up after documenting findings — the real hook infrastructure is built in Task 007.

If the hook does NOT block writes (finding #2 fails), stop and escalate. Do not attempt a workaround. This is a Tier 3 architectural dependency.
