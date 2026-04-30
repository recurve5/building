# Task 029: Commit Convention in task-agent.md

**Track:** A
**Phase:** A1
**Status:** done
**Depends on:** none
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.5 (git attribution convention), Decision 1 (commit convention), `~/building/prompts/task-agent.md` (file to modify), SDM Section 3 (change surface)

## What to Build

Add the `[TASK_ID]` commit message convention to `~/building/prompts/task-agent.md`. This is a 2-3 line addition that tells task agents to prefix all commit messages with the task number in brackets.

The convention enables the Scope Creep check to map commits to tasks. A commit without the prefix is itself a finding.

## Files

- Modify: `~/building/prompts/task-agent.md` — add commit convention to the "How You Work" section, step 3 (Build), or as a new item under "Scope Rules"
- Do not touch: all other prompt files

## Contracts

No code contracts. This is a documentation change to an agent prompt.

The convention: all commits during task execution use the format `[TASK_ID] message` (e.g., `[003] implement StreakService`). The task ID is the numeric task number from the task file.

## Acceptance Criteria

1. `task-agent.md` contains the `[TASK_ID]` commit message convention.
2. The convention is clearly stated: prefix every commit with `[TASK_ID]` where TASK_ID is the numeric task number.
3. An example is provided (e.g., `[003] implement StreakService`).
4. The addition is 2-5 lines and does not restructure existing content.
5. The rest of `task-agent.md` is unchanged.

## Tests

No automated tests. This is a documentation change verified by reading the file.

## Notes

Per SDM Section 3: the modification to `task-agent.md` is small and safe. Add the convention under "Scope Rules" or as part of step 3 (Build). The current file has no commit convention at all.

This task has no dependencies and can be done in Phase 1 alongside the project scaffold. The earlier it is done, the sooner any project built after this point generates parseable commit history.
