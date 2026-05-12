# Task 009: Failure-Mode Detection Hooks

**Track:** A
**Phase:** A3 (failure-mode detection)
**Status:** not started
**Depends on:** 007, 003, 004
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-3 (Hook Interface Contract), D0-4 (Detection Record Format), D0-9 (building-audit Integration Contract), PRD Section 2.5 (Failure-Mode Detection Hooks), XRD Section 5.2 (assertion-strength as Layer 2 at gates), XRD Section 5.3 (per-task attempt counter)

## What to Build

The detection router script and individual failure-mode detection checks. These fire on state.json writes where a task's status changes to "complete". They catch failure modes during the build phase (Stage 9).

### Detection Router

`.building/hooks/detection-check.sh` — A second PreToolUse hook on Write. Like gate-check.sh, it reads stdin, applies a fast path, and dispatches to specific checks.

**Trigger condition:** A state.json write where any task's status changes from non-"complete" to "complete". The router compares the proposed state against the current on-disk state to detect this transition.

### Detection Scripts

| Script | Failure Mode | What It Checks |
|--------|-------------|----------------|
| `scope-audit.sh` | Scope creep | Invokes building-audit `--dump-candidates` for scope-creep check. Compares git diff for the completing task against the task's Files section. |
| `dependency-check.sh` | Dependency grab | Invokes building-audit `--dump-candidates` for dependency-grab check. Checks package.json changes against task contracts. |
| `decision-conflict.sh` | Decision conflict | Parses DECISIONS.md for entries on the same topic with contradictory conclusions. Simple: same keyword/entity, opposite stance. |
| `ghost-reference.sh` | Ghost reference | Invokes building-audit surface-heresy check. Scans for references to Hard Kill decisions. |
| `attempt-counter.sh` | Loop of despair | Reads event log for repeated error patterns within the current task (per-task scope, not per-session — XRD 5.3). Threshold: 3+. |

### Detection Response

On detection:
1. Write a detection record to `.building/runs/<run-id>/detections/` (D0-4 format).
2. Write a `detection_fired` event to the event log.
3. Exit non-zero to block the task-completion write.

The orchestrator then sees the blocked write, reads the error message, and either:
- Fixes the issue and re-attempts (Tier 2)
- Halts the run (Tier 3)

## Files

- Create: `.building/hooks/detection-check.sh`
- Create: `.building/hooks/detections/scope-audit.sh`
- Create: `.building/hooks/detections/dependency-check.sh`
- Create: `.building/hooks/detections/decision-conflict.sh`
- Create: `.building/hooks/detections/ghost-reference.sh`
- Create: `.building/hooks/detections/attempt-counter.sh`
- Create: `tools/trellis/test/detections.test.ts`
- Create: `tools/trellis/test/fixtures/scope-creep-task/` (fixture)
- Create: `tools/trellis/test/fixtures/dependency-grab-task/` (fixture)
- Create: `tools/trellis/test/fixtures/loop-of-despair-task/` (fixture)
- Modify: `.claude/settings.local.json` (add detection hook entry)
- Do not touch: `tools/building-audit/`, `.building/hooks/gate-check.sh`

## Contracts

### Detection Router Input

Same stdin format as gate-check.sh (JSON with tool_input containing file_path and content).

### Detection Script Interface

Each detection script receives:
- `$1` = run directory path
- `$2` = task ID being completed (e.g., "003")
- `$3` = milestone directory path

Returns:
- Exit 0: no detection.
- Exit non-zero: detection fired. Stderr contains description. The router writes the detection record.

### Detection Record Writing

The detection router (not individual scripts) writes the detection record. Individual scripts report findings on stderr. The router formats the D0-4 record.

## Acceptance Criteria

1. Detection router fires only on task-completion state transitions.
2. Detection router does NOT fire on stage transitions or other state changes.
3. Scope-audit detects files changed outside the task's Files section (DETECT-001).
4. Scope-audit passes when all changes are within scope (DETECT-002).
5. Dependency-check detects unauthorized package additions (DETECT-003).
6. Dependency-check passes with no new dependencies (DETECT-004).
7. Attempt-counter fires at 3+ same errors within a task (DETECT-005).
8. Attempt-counter does not fire at 2 occurrences (DETECT-006).
9. Attempt-counter is scoped per-task, not per-session (DETECT-007).
10. Decision-conflict detects contradicting entries (DETECT-008).
11. Decision-conflict passes for non-contradicting entries (DETECT-009).
12. Ghost-reference detects references to Hard Kill decisions (DETECT-010).
13. Ghost-reference passes when no killed concepts are referenced (DETECT-011).
14. Detection record is written in D0-4 format (DETECT-012).
15. Detection event is written to event log.

## Tests

- [ ] DETECT-001: Scope-audit detects out-of-scope changes
- [ ] DETECT-002: Scope-audit passes within scope
- [ ] DETECT-003: Dependency-check detects unauthorized package
- [ ] DETECT-004: Dependency-check passes with no changes
- [ ] DETECT-005: Attempt-counter fires at 3+ same errors
- [ ] DETECT-006: Attempt-counter does not fire at 2
- [ ] DETECT-007: Attempt-counter scoped per-task
- [ ] DETECT-008: Decision-conflict detects contradictions
- [ ] DETECT-009: Decision-conflict passes for distinct topics
- [ ] DETECT-010: Ghost-reference detects killed concept reference
- [ ] DETECT-011: Ghost-reference passes when clean
- [ ] DETECT-012: Detection record written in correct format
- [ ] DETECT-013: Tier 3 detection would halt (tested via state.json flag)

## Notes

The detection-check.sh hook must coexist with gate-check.sh. Both are PreToolUse hooks on Write. Claude Code fires all matching hooks. Order matters: gate-check.sh should run first (it handles stage transitions), detection-check.sh second (it handles task completions). If settings.local.json orders them in the array, that order is the execution order.

The scope-audit and dependency-check scripts wrap building-audit's `--dump-candidates` mode. The candidates JSON provides per-file data that the detection scripts use to make targeted pass/fail decisions. The building-audit Layer 2 judgment is NOT invoked here — that's reserved for gate checks at stage boundaries (XRD 5.2).

The decision-conflict check is simple string matching in v1: extract topic keywords from each decision, flag when two decisions share the same topic keywords but reach opposite conclusions. False positives are acceptable — the orchestrator reviews and dismisses false positives.

The attempt-counter reads events from the event log filtered by the current task ID. It counts events with the same error message (exact match or >80% similarity via simple substring). This is intentionally simple — sophisticated error clustering is future work.
