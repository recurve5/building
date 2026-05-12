# Spike Report: Hook Behavior Validation

**Task:** 001-hook-behavior-spike
**Date:** 2026-05-11
**Verdict:** GO — PreToolUse hooks work as required. One critical correction to DAY-ZERO.

## Findings

### 1. Does PreToolUse on Write receive the file path and proposed content on stdin?

**Yes.** The hook receives a JSON object on stdin with `tool_input.file_path` (absolute path) and `tool_input.content` (full file content string).

### 2. Does exit code 2 block the write?

**Yes.** When the hook exits with code 2, the Write tool returns an error and the target file is not created or modified on disk. Verified by checking filesystem after blocked write.

### 3. Stdin JSON format — exact field names

Top-level keys (alphabetical): `cwd`, `hook_event_name`, `permission_mode`, `session_id`, `tool_input`, `tool_name`, `tool_use_id`, `transcript_path`.

`tool_input` keys for Write: `content`, `file_path`.

Example:
```json
{
  "cwd": "/path/to/project",
  "hook_event_name": "PreToolUse",
  "permission_mode": "default",
  "session_id": "abc123",
  "tool_input": {
    "content": "file contents here",
    "file_path": "/absolute/path/to/file.txt"
  },
  "tool_name": "Write",
  "tool_use_id": "toolu_xyz",
  "transcript_path": "/path/to/transcript.jsonl"
}
```

### 4. Does the hook fire for all Write calls, or can it be filtered?

The `matcher` field filters which tool triggers the hook. `"matcher": "Write"` fires only on Write tool calls. Pipe-separated alternation (`"Write|Edit"`) is supported.

### 5. Hook working directory

The hook's working directory (`pwd`) matches the `cwd` field from stdin — both equal the project root directory.

### 6. Syntax error behavior

A bash syntax error produces exit code 2, which **blocks the write**. This is safe — a broken hook fails closed, not open. The stderr output (bash's syntax error message) is shown to the agent.

### 7. Latency

Fast-path (read stdin, check path, exit 0): **~10ms**. Negligible overhead.

## Critical Correction: Exit Code Semantics

**DAY-ZERO D0-3 assumed any non-zero exit blocks the write. This is wrong.**

Actual behavior:
| Exit Code | Effect |
|-----------|--------|
| 0 | Allow — write proceeds |
| 2 | **Block** — write prevented, stderr shown as error |
| 1, 3+ | Non-blocking error — stderr logged, **write proceeds** |

**D0-3 must be updated:** All gate check scripts must exit with code 2 (not code 1) to block writes. The `set -euo pipefail` pattern is safe because bash pipes failing commands through exit code 2 in many cases, but explicit gate-block logic must use `exit 2`.

## Test Results

| Test | Result |
|------|--------|
| HOOK-001: Hook fires on write to target path | PASS |
| HOOK-003: Hook blocks write when exit 2 | PASS |
| HOOK-004: Hook allows write when exit 0 | PASS |
| HOOK-008: Hook handles script syntax error without silent pass | PASS (fails closed) |
| Additional: Exit 1 does NOT block | VERIFIED |

## Implications for Build

1. Gate check scripts must use `exit 2` to block, never `exit 1`.
2. The fast-path pattern from D0-3 works — exit 0 early for non-state.json writes.
3. `set -euo pipefail` combined with explicit `exit 2` for gate failures is the right pattern.
4. Broken hooks fail closed — a safe default.
5. The hook config format uses nested `hooks` array with `type` and `command` fields, not a flat `command` field.

## Hook Config Format (Verified)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash .building/hooks/gate-check.sh"
          }
        ]
      }
    ]
  }
}
```
