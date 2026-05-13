# Task 001: (Removed — Hook Env Var Spike No Longer Needed)

**Track:** Spike
**Phase:** 0
**Status:** removed
**Depends on:** none

## Why Removed

This task was a go/no-go spike to verify that Claude Code's hook system supports inline environment variable assignment in the command string (`BUILDING_HOME=/path bash /path/script.sh`). The entire hook migration depended on this verification.

With the architectural change to remove hooks from `~/.claude/settings.json` entirely (Resolution 2), this spike is unnecessary. Gate enforcement now happens via the skill's direct Bash tool calls, which use standard shell env var passing — no hook system involvement.

The verified assumption VA-4 ("BUILDING_HOME=/path bash /path/script.sh passes env var through Claude Code hook system") is no longer relevant.

## Replacement

Task 002 (Skill Template Content Spike) is the remaining Phase 0 spike. It was previously independent of Task 001 and remains unchanged.
