# Task 008: Detection Script Updates

**Track:** B (Hook Migration)
**Phase:** 2 (Infrastructure)
**Status:** not started
**Depends on:** 006
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-6 (Gate Script Environment Contract — detection section), SDM IP-2, Peer Review PB-3, XRD Section 2 (detection script entries)

## What to Build

Update the 5 detection scripts to use `$PROJECT_DIR` (environment variable from detection-check.sh) for git operations, replacing `git rev-parse --show-toplevel`. Two scripts need no changes; three need PROJECT_DIR substitution.

### Scripts Requiring Changes

**scope-audit.sh:** Line 11 uses `PROJECT_ROOT="$(git rev-parse --show-toplevel ..."`. Change to `PROJECT_DIR="$PROJECT_DIR"` (from environment). All `git diff` and `git -C` operations use `$PROJECT_DIR`.

**ghost-reference.sh:** Line 11 uses `PROJECT_ROOT` from `git rev-parse`. Change to `$PROJECT_DIR` for git operations. DECISIONS.md lookup uses `$MILESTONE_DIR` (positional arg `$3`) which already resolves correctly because detection-check.sh sets it from `$PROJECT_STATE/milestones/`.

**dependency-check.sh:** Line 11 uses `PROJECT_ROOT` from `git rev-parse`. Change to `$PROJECT_DIR` for package manifest inspection (`$PROJECT_DIR/package.json`).

### Scripts Requiring No Changes

**attempt-counter.sh:** Already operates on `$RUN_DIR` (positional arg `$1`). No path derivation.

**decision-conflict.sh:** Already operates on `$MILESTONE_DIR` (positional arg `$3`). No path derivation.

### Verification

After all changes: `grep -r "git rev-parse" .building/hooks/detections/` returns zero matches.

## Files

- Modify: `.building/hooks/detections/scope-audit.sh`
- Modify: `.building/hooks/detections/ghost-reference.sh`
- Modify: `.building/hooks/detections/dependency-check.sh`
- Verify unchanged: `.building/hooks/detections/attempt-counter.sh`
- Verify unchanged: `.building/hooks/detections/decision-conflict.sh`
- Modify: relevant test files for detection scripts (if they exist)
- Do not touch: detection-check.sh (done in Task 006), gate scripts

## Contracts

After this task, detection scripts access paths via:
- `$1` = `RUN_DIR` (positional argument)
- `$2` = `COMPLETING_TASK` (positional argument)
- `$3` = `MILESTONE_DIR` (positional argument)
- `$PROJECT_DIR` (environment variable — for git operations)
- `$PROJECT_STATE` (environment variable — if needed for state lookups)
- `$BUILDING_HOME` (environment variable — if needed for tool paths)

No detection script calls `git rev-parse`.

### scope-audit.sh Key Change

```bash
# BEFORE
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
git diff --name-only HEAD~1 HEAD -- "$PROJECT_ROOT"

# AFTER
# PROJECT_DIR is set by detection-check.sh via environment
git -C "$PROJECT_DIR" diff --name-only HEAD~1 HEAD
```

### ghost-reference.sh Key Change

```bash
# BEFORE
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
grep -r "$KILLED_CONCEPT" "$PROJECT_ROOT/src" ...

# AFTER
grep -r "$KILLED_CONCEPT" "$PROJECT_DIR/src" ...
# DECISIONS.md still read from $MILESTONE_DIR (arg $3) — unchanged
```

## Acceptance Criteria

1. scope-audit.sh uses `$PROJECT_DIR` for git operations (DETECT-001).
2. ghost-reference.sh uses `$PROJECT_DIR` for git and `$PROJECT_STATE` path for DECISIONS.md (DETECT-002).
3. dependency-check.sh uses `$PROJECT_DIR` for package manifest (DETECT-003).
4. Zero detection scripts contain `git rev-parse` (DETECT-004).
5. attempt-counter.sh and decision-conflict.sh are unchanged and still pass tests.

## Tests

- DETECT-001: scope-audit.sh uses PROJECT_DIR for git operations
- DETECT-002: ghost-reference.sh uses PROJECT_DIR for git and PROJECT_STATE for DECISIONS.md
- DETECT-003: dependency-check.sh uses PROJECT_DIR for git operations
- DETECT-004: No detection script uses git rev-parse

## Notes

This task is smaller than the gate script updates because most detection scripts are already argument-driven. The key change is replacing `git rev-parse --show-toplevel` with the `$PROJECT_DIR` environment variable.

For ghost-reference.sh, verify that `$MILESTONE_DIR` (as passed by detection-check.sh) correctly resolves to the milestone directory under `$PROJECT_STATE/milestones/`. The path is: detection-check.sh reads the milestone name from state.json, finds the milestone directory under `$PROJECT_STATE/milestones/<milestone-name>`, and passes it as `$3`. The detection script then reads `$3/DECISIONS.md` for the milestone-level decisions file.

If the detection script also needs the project-level `DECISIONS.md` (at `$PROJECT_STATE/DECISIONS.md`), it accesses this via `$PROJECT_STATE` from the environment.
