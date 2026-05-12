# Task 007: Hook Wiring

**Track:** A
**Phase:** A2 (hook wiring)
**Status:** complete
**Depends on:** 005, 006, 001 (spike findings)
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-3 (Hook Interface Contract), D0-8 (Bash Conventions), Task 001 spike report, `.claude/settings.local.json`

## What to Build

The router hook script (`gate-check.sh`) that sits between Claude Code's hook system and the individual gate scripts. When Claude Code fires a PreToolUse hook on Write, this script:

1. Reads the tool input from stdin (file path + proposed content).
2. **Fast path:** If the path is NOT `.building/runs/*/state.json`, exits 0 immediately.
3. Reads the proposed new state.json content.
4. Reads the current state.json from disk (the pre-write version).
5. Compares `current_stage`. If unchanged, exits 0 (no stage advancement).
6. If stage advanced: determines which gate to run (stage N to N+1).
7. Invokes the gate script for that transition.
8. Passes through the gate script's exit code (blocking or allowing the write).

Also build the integration test that verifies the full flow: hook fires -> router dispatches -> gate checks -> write allowed/blocked.

### State Transition Validation

The router also enforces D0-1 invalid transitions:
- Stage skip (jump > 1): block with error.
- Backward movement: block with error (unless rollback mechanism used).
- Advance from halted: block with error.

## Files

- Create: `.building/hooks/gate-check.sh`
- Create: `tools/trellis/test/hook-integration.test.ts`
- Modify: `.claude/settings.local.json` (add hook entry — permanent this time, not spike)
- Do not touch: `tools/building-audit/`, `.building/hooks/gates/*` (owned by Task 005)

## Contracts

### gate-check.sh

```bash
#!/usr/bin/env bash
set -euo pipefail

# Input: JSON on stdin from Claude Code hook system
# {
#   "tool_name": "Write",
#   "tool_input": {
#     "file_path": "/path/to/file",
#     "content": "proposed content"
#   }
# }
#
# NOTE: The exact stdin format was verified in Task 001 spike.
# Use the field names documented in the spike report.

# Output: exit 0 (allow) or non-zero (block)
# Stderr: human-readable failure message on block
# Stdout: GateResult JSON (from the gate script) on gate check
```

### settings.local.json Entry

```json
{
  "permissions": { ... },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "command": "bash .building/hooks/gate-check.sh"
      }
    ]
  }
}
```

The exact hook entry format was verified in Task 001 spike. Use the format documented there.

## Acceptance Criteria

1. The hook fires on every Write tool call (HOOK-001).
2. The hook exits 0 immediately for non-state.json writes (HOOK-002, fast path).
3. The hook exits 0 for state.json writes that don't change current_stage (HOOK-005).
4. The hook dispatches to the correct gate script for stage N to N+1 (HOOK-007).
5. The hook blocks the write when the gate script exits non-zero (HOOK-003).
6. The hook allows the write when the gate script exits zero (HOOK-004).
7. The hook receives proposed file content, not current on-disk content (HOOK-006).
8. The hook blocks stage-skip attempts (STATE-012).
9. The hook blocks backward transitions (STATE-013).
10. The hook blocks advancement from halted state (STATE-014).
11. A gate script syntax error results in a blocked write, not a silent pass (HOOK-008).
12. The fast path completes in under 100ms for non-state.json writes.

## Tests

- [ ] HOOK-001: Hook fires on write to state.json path
- [ ] HOOK-002: Hook does NOT fire (fast-exits) for non-state.json paths
- [ ] HOOK-003: Hook blocks write when gate fails
- [ ] HOOK-004: Hook allows write when gate passes
- [ ] HOOK-005: Non-stage-advancing writes pass through
- [ ] HOOK-006: Hook receives proposed content
- [ ] HOOK-007: Router dispatches to correct gate
- [ ] HOOK-008: Script error blocks (does not pass)
- [ ] STATE-012: Stage skip rejected
- [ ] STATE-013: Backward transition rejected
- [ ] STATE-014: Advance from halted rejected
- [ ] Fast-path timing under 100ms

## Notes

The integration test is tricky. It cannot use Claude Code's actual hook system in a test harness (that would require a Claude Code session). Instead, the test:
1. Creates a fixture run directory with state.json.
2. Simulates the hook input by piping JSON to `gate-check.sh` via stdin.
3. Asserts on exit code and stderr/stdout.

This tests the gate-check.sh script in isolation, which is the right unit of test. The actual Claude Code hook integration (hook fires when Write tool is called) was verified in Task 001's spike.

The fast-path timing is tested by STRESS-001 (Task 014), but this task should include a basic timing assertion: the fast path for a non-state.json write completes in under 100ms on a cold run.
