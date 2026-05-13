# Task 006: Gate Script Entry Points Rewrite

**Track:** B (Gate Script Migration)
**Phase:** 2 (Infrastructure)
**Status:** not started
**Depends on:** 003, 005
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-4 (Gate Script Invocation Format), D0-6 (Gate Script Environment Contract), D0-12 (Project Name Sanitization), SDM IP-1, IP-2, Peer Review Issue 2, Issue 3

## What to Build

Rewrite `gate-check.sh` and `detection-check.sh` to receive all paths as environment variables from the skill's Bash tool call. Update `common.sh` with `resolve_project_paths()`. Remove the active-run guard and stdin parsing — neither is needed since the skill only calls these scripts during an active build.

This is simpler than the previous hook-based design. The scripts no longer need to:
- Handle non-Building sessions (no active-run guard).
- Parse stdin JSON (no hook input to read).
- Regex-match file paths (no fast-path filter for non-state.json writes).
- Derive PROJECT_DIR from `$PWD` (the skill passes it explicitly).

### gate-check.sh Changes

1. **Remove active-run guard** entirely. The skill only calls this during an active build.

2. **Remove stdin parsing** (`INPUT=$(cat)`, `jq -r '.cwd'`, etc.). All paths come from environment variables.

3. **Path resolution**: Remove `git rev-parse --show-toplevel`. Receive `BUILDING_HOME`, `PROJECT_DIR`, and `PROJECT_STATE` as environment variables set by the skill's Bash tool call.

4. **Derive PROJECT_NAME** from `$PROJECT_DIR` basename using D0-12 sanitization. Export for child scripts.

5. **Remove state.json regex fast-path**. The skill only calls gate-check.sh for state.json writes, so no filtering is needed.

6. **SCRIPT_DIR**: Change from `$(dirname "$0")/gates` to `$BUILDING_HOME/.building/hooks/gates`.

7. **Milestone lookup**: Change from `$PROJECT_ROOT/milestones` to `$PROJECT_STATE/milestones`.

8. **Environment exports** (D0-6): Before calling gate scripts, export `PROJECT_STATE`, `PROJECT_DIR`, `PROJECT_NAME`. `BUILDING_HOME` is already in the environment.

9. **Stderr capture**: Change from fixed `/tmp/trellis-gate-stderr.txt` to `$(mktemp)` (SDM IC-8).

### detection-check.sh Changes

Same set of changes as gate-check.sh:
1. Remove active-run guard.
2. Remove stdin parsing.
3. `BUILDING_HOME`, `PROJECT_DIR`, `PROJECT_STATE` from environment.
4. Derive `PROJECT_NAME`, export for child scripts.
5. Remove state.json regex fast-path.
6. `DETECTIONS_DIR` from `$BUILDING_HOME/.building/hooks/detections`.
7. Milestone lookup from `$PROJECT_STATE/milestones`.

### common.sh Changes

1. Add `resolve_project_paths()` function that validates env vars are set and derives PROJECT_NAME:
   ```bash
   resolve_project_paths() {
     # Validate required env vars
     if [ -z "$BUILDING_HOME" ] || [ -z "$PROJECT_DIR" ] || [ -z "$PROJECT_STATE" ]; then
       echo "ERROR: BUILDING_HOME, PROJECT_DIR, and PROJECT_STATE must be set" >&2
       exit 1
     fi
     PROJECT_NAME=$(derive_project_name "$PROJECT_DIR")
     export PROJECT_DIR PROJECT_NAME PROJECT_STATE
   }
   ```

2. Add `derive_project_name()` function (D0-12 bash implementation).

3. `milestone_dir()` was removed in Task 005. Verify it is absent.

## Files

- Modify: `.building/hooks/gate-check.sh`
- Modify: `.building/hooks/detection-check.sh`
- Modify: `.building/hooks/lib/common.sh`
- Create: `tools/trellis/test/gate-entry-points.test.ts` (test harness for gate scripts)
- Do not touch: individual gate scripts (Task 007), individual detection scripts (Task 008)

## Contracts

### gate-check.sh Post-Rewrite Structure

```
1. #!/usr/bin/env bash + set -euo pipefail
2. Source common.sh, call resolve_project_paths() — validates env vars
3. Read current state.json from $PROJECT_STATE/runs/<latest>/state.json
4. Detect stage advancement from proposed state (passed as argument or read from env)
5. Route to gate script with $RUN_DIR and $MILESTONE_DIR as positional args
```

### Environment Variables Available to Child Scripts

| Variable | Source | Available to |
|----------|--------|-------------|
| `BUILDING_HOME` | Skill's Bash tool call | gate scripts, detection scripts |
| `PROJECT_STATE` | Skill's Bash tool call | gate scripts, detection scripts |
| `PROJECT_DIR` | Skill's Bash tool call | gate scripts, detection scripts |
| `PROJECT_NAME` | Derived by resolve_project_paths() | gate scripts, detection scripts |

## Acceptance Criteria

1. gate-check.sh uses `$BUILDING_HOME`, `$PROJECT_DIR`, `$PROJECT_STATE` from environment (GATE-ENTRY-001).
2. gate-check.sh does NOT read stdin (GATE-ENTRY-002).
3. gate-check.sh does NOT contain active-run guard (GATE-ENTRY-003).
4. gate-check.sh exports `PROJECT_STATE`, `PROJECT_DIR`, `PROJECT_NAME` for child scripts (GATE-ENTRY-004).
5. detection-check.sh mirrors all gate-check.sh changes (GATE-ENTRY-005).
6. `resolve_project_paths()` in common.sh validates env vars and derives PROJECT_NAME (GATE-ENTRY-006).
7. Bash `derive_project_name()` produces identical output to TypeScript `deriveProjectName()` for the D0-12 test matrix (PATH-010).

## Tests

- GATE-ENTRY-001 through GATE-ENTRY-006
- PATH-010: Bash/TypeScript sanitization parity

### Test Harness Design

Tests invoke gate scripts via `child_process.execSync` with:
- `BUILDING_HOME`, `PROJECT_DIR`, `PROJECT_STATE` set in environment
- Temp directories simulating `~/.building/projects/<name>/runs/<id>/state.json`
- No stdin piped (scripts do not read stdin)

## Notes

The rewrite is significantly simpler than the previous hook-based design. Without the active-run guard, stdin parsing, and regex fast-path, the scripts are shorter and more focused on their core job: validating gate conditions.

`set -euo pipefail` is active. The `find ... | sort | tail -1` pattern for run directory lookup is safe (find returns 0 even with no results). Never use `ls` glob patterns that fail on empty directories.
