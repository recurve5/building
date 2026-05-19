# Task 007: Gate Script Updates

**Track:** B (Hook Migration)
**Phase:** 2 (Infrastructure)
**Status:** not started
**Depends on:** 005, 006
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-6 (Gate Script Environment Contract)

## What to Build

Update all 11 gate scripts to use environment variables from gate-check.sh instead of deriving paths independently. Task 005 already removed `git rev-parse` from gate-0-to-1.sh and gate-9-to-10.sh. This task completes the migration by switching those scripts from their interim bridge paths to the environment variable contract, and auditing all other gate scripts.

### Gate Scripts Requiring Changes

**gate-0-to-1.sh:** Task 005 changed milestone lookup to use `$(dirname "$MILESTONE_DIR")`. Update to use `$PROJECT_STATE/milestones` for the milestone-list check (the environment variable is now available from Task 006).

**gate-9-to-10.sh:** Task 005 changed `AUDIT_BIN` derivation to use `$(dirname "$0")/../../..`. Update to use `$BUILDING_HOME/tools/building-audit/dist/bin/building-audit.js` (environment variable now available).

**gate-1-to-2.sh through gate-8-to-9.sh, gate-10-to-done.sh:** Audit each script for any `PROJECT_ROOT`, `git rev-parse`, or independent path derivation. Based on SDM review, these scripts use `$MILESTONE_DIR` (positional arg `$2`) and should not need changes. Verify this assumption and fix any exceptions.

### Verification

After all changes, the full gate suite must satisfy: `grep -r "git rev-parse" .building/hooks/gates/` returns zero matches.

## Files

- Modify: `.building/hooks/gates/gate-0-to-1.sh` (update from Task 005 bridge to env var)
- Modify: `.building/hooks/gates/gate-9-to-10.sh` (update from Task 005 bridge to env var)
- Possibly modify: any gate script that audit reveals has independent path derivation
- Modify: `tools/trellis/test/gates.test.ts` (update test fixtures to set environment variables)
- Do not touch: gate-check.sh (done in Task 006), detection scripts (Task 008)

## Contracts

After this task, all gate scripts rely on:
- `$1` = `RUN_DIR` (positional argument from gate-check.sh)
- `$2` = `MILESTONE_DIR` (positional argument from gate-check.sh)
- `$BUILDING_HOME` (environment variable)
- `$PROJECT_STATE` (environment variable)
- `$PROJECT_DIR` (environment variable)
- `$PROJECT_NAME` (environment variable)

No gate script derives paths independently. No gate script calls `git rev-parse`.

### gate-0-to-1.sh Final Form

```bash
# Milestone-list check uses PROJECT_STATE
if [ -d "$PROJECT_STATE/milestones" ]; then
  MILESTONE_COUNT=$(find "$PROJECT_STATE/milestones" -mindepth 1 -maxdepth 1 -type d -name "m*" 2>/dev/null | wc -l)
  ...
fi
```

### gate-9-to-10.sh Final Form

```bash
# Audit binary from BUILDING_HOME
AUDIT_BIN="$BUILDING_HOME/tools/building-audit/dist/bin/building-audit.js"
if [ ! -f "$AUDIT_BIN" ]; then
  echo "building-audit not found at $AUDIT_BIN" >&2
  ...
fi
```

## Acceptance Criteria

1. gate-0-to-1.sh uses `$PROJECT_STATE` for milestone lookup (GATE-001).
2. gate-9-to-10.sh uses `$BUILDING_HOME` for audit binary (GATE-002).
3. Gate scripts using `$MILESTONE_DIR` positional arg continue to work (GATE-003).
4. Zero gate scripts contain `git rev-parse` (GATE-004).
5. All gate test fixtures updated to provide environment variables.
6. All existing gate tests pass.

## Tests

- GATE-001: gate-0-to-1.sh uses PROJECT_STATE for milestone lookup
- GATE-002: gate-9-to-10.sh uses BUILDING_HOME for audit binary
- GATE-003: Gate scripts using MILESTONE_DIR positional arg are unaffected
- GATE-004: No gate script uses git rev-parse

## Notes

This task depends on Task 006 completing first because the environment variables (`PROJECT_STATE`, `BUILDING_HOME`) are only available after gate-check.sh exports them.

The test fixtures from Task 006 (`tools/trellis/test/hook-entry-points.test.ts`) provide the foundation. The gate test file (`tools/trellis/test/gates.test.ts`) needs to set the same environment variables when invoking gate scripts directly.

For gate-0-to-1.sh, the milestone-list check was the original reason the script used `git rev-parse`. This is the semantic change the SDM review called out: the milestone listing now comes from `$PROJECT_STATE/milestones`, not `$PROJECT_ROOT/milestones`. The milestone content is the same; the location changes.
