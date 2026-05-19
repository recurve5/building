# Task 005: Normalize Gate Script Path Derivation

**Track:** Pre-task (SDM recommended)
**Phase:** 1.5 (pre-task cleanup before Phase 2)
**Status:** not started
**Depends on:** none
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: SDM Review Section 3 (Refactoring Needs), SDM IP-1 (gate-check -> gate scripts interface)

## What to Build

Standardize path resolution in gate scripts so that none of them derive paths independently via `git rev-parse`. This is a pre-task: change one variable (how gate scripts get paths) before M2 changes the second variable (where those paths point).

### Change 1: gate-0-to-1.sh

Currently at lines 12-13:
```bash
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
if [ -d "$PROJECT_ROOT/milestones" ] ...
```

Change to use the `$MILESTONE_DIR` argument it already receives as `$2`:
```bash
# $2 = MILESTONE_DIR (passed from gate-check.sh)
MILESTONES_ROOT=$(dirname "$MILESTONE_DIR")
if [ -d "$MILESTONES_ROOT" ] ...
```

All milestone searches in this script change from `$PROJECT_ROOT/milestones` to `$MILESTONES_ROOT`.

### Change 2: gate-9-to-10.sh

Currently at lines 10-11:
```bash
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
```

`PROJECT_ROOT` is used at line 41 to find `tools/building-audit/dist/bin/building-audit.js`. For now, derive from `$(dirname "$0")` which resolves to the gates directory:
```bash
# Derive Building root from script location
# gates/ is at $BUILDING_ROOT/.building/hooks/gates/
BUILDING_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
AUDIT_BIN="$BUILDING_ROOT/tools/building-audit/dist/bin/building-audit.js"
```

This is a temporary bridge. Task 007 will change this to use `$BUILDING_HOME` from the environment.

### Change 3: Remove dead milestone_dir() from common.sh

The `milestone_dir()` function at lines 111-125 of `.building/hooks/lib/common.sh` has zero callers and contains a `git rev-parse --show-toplevel` call. Remove it to prevent false positives during M2 migration and prevent future callers from using broken path logic.

## Files

- Modify: `.building/hooks/gates/gate-0-to-1.sh`
- Modify: `.building/hooks/gates/gate-9-to-10.sh`
- Modify: `.building/hooks/lib/common.sh`
- Do not touch: gate-check.sh, detection-check.sh, other gate scripts, trellis source

## Contracts

After this task:
- Zero gate scripts contain `git rev-parse --show-toplevel`.
- All gate scripts use either the `$MILESTONE_DIR` positional argument or `$(dirname "$0")` for path resolution.
- `common.sh` no longer exports `milestone_dir()`.

## Acceptance Criteria

1. `gate-0-to-1.sh` uses `$MILESTONE_DIR` (positional arg `$2`) for milestone directory lookup. No `git rev-parse`.
2. `gate-9-to-10.sh` derives the Building root from script location. No `git rev-parse`.
3. `milestone_dir()` is removed from `common.sh`.
4. `grep -r "git rev-parse" .building/hooks/gates/` returns zero matches (GATE-004 partial).
5. Existing gate tests continue to pass (run `vitest run` in `tools/trellis/`).

## Tests

- GATE-004 (partial): No gate script uses git rev-parse
- Existing gate test suite passes without modification

## Notes

This is a small, focused refactoring task. Do not change gate-check.sh or detection-check.sh -- those are rewritten in Task 006. Do not change any other gate scripts -- they already use `$MILESTONE_DIR` from positional arguments.

The `gate-9-to-10.sh` change to use `$(dirname "$0")` is a stepping stone. In Task 007, it will switch to `$BUILDING_HOME` from the environment. The stepping stone is necessary because `$BUILDING_HOME` is not available until gate-check.sh is rewritten (Task 006) to receive env vars from the skill's Bash tool call.

Run the existing test suite after changes to verify nothing breaks. The gate scripts are tested via `tools/trellis/test/gates.test.ts`.
