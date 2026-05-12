# Task 008: Orchestrator Skill

**Track:** B
**Phase:** B2 (orchestrator)
**Status:** not started
**Depends on:** 003, 004, 007
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-10 (Slash Command Conventions), D0-11 (Sub-Agent Definitions), `orchestrator.md` (pipeline stages), XRD Section 3 (Architecture — sub-agent coordination)

## What to Build

The orchestrator skill — a Claude Code skill file that reads state.json, determines the run's current position, and executes the next action. This is the runtime coordination layer between the user (via /build commands), the pipeline stages, and the enforcement hooks.

### Core Capabilities

1. **State reading:** On every invocation, read state.json to determine current position. Never rely on in-memory state from a prior invocation (sessions can lose context).

2. **Stage advancement:** When work for a stage is complete, write state.json with `current_stage` incremented. The gate hook fires automatically on this write. If the gate fails, the skill receives the failure message and must address it.

3. **Task dispatch:** During Stage 9 (Build), dispatch tasks to task-agent sub-agents with curated context per D0-11. Track task status in state.json.

4. **Halt recording:** On Tier 3 detection or unrecoverable failure, set `halted: true` in state.json, record halt event, commit state.

5. **Resume from halt:** On `/build --resume`, validate the halt is resolvable, set `halted: false`, continue from the halted stage.

6. **Override execution:** When the orchestrator judges an override is justified (Decision 29), write the override file and update state before re-attempting the stage advancement.

7. **Morning-after trigger:** At run completion or halt, invoke morning-after generation (Task 009).

8. **Git commits at boundaries:** Commit state files at stage completion and on halt per PRD Section 3.5.

### Sub-Agent Invocation

The skill invokes sub-agents sequentially. For gates requiring multiple validators:
1. Deterministic checks first (cheapest, fastest).
2. LLM validators in dependency order.
3. Early exit: if any validator produces a blocking finding, skip remaining validators.

## Files

- Create: `.claude/skills/build.md` (or `.claude/commands/build.md` — use whichever Claude Code skill format is current)
- Create: `.claude/agents/peer-reviewer.md`
- Create: `.claude/agents/task-auditor.md`
- Create: `.claude/agents/security-reviewer.md`
- Create: `.claude/agents/sdm-assessor.md`
- Do not touch: `tools/building-audit/`, `orchestrator.md`, `prompts/` (existing agent prompts remain — sub-agent definitions reference them)

## Contracts

### Skill Entry Point

The skill receives the user's command and arguments. It must handle:

```
/build <brief-path>          -> start a new run
/build --status              -> read and display current state
/build --override <stage>    -> write user override
/build --bootstrap           -> first-time setup (delegates to Task 011)
/build --resume [run-id]     -> resume halted run
```

### Sub-Agent Definition Format

Each `.claude/agents/*.md` file defines:
- Agent role and purpose
- What files the agent receives as context
- What the agent produces
- Constraints on the agent's actions

### State Write Protocol

When the orchestrator writes state.json:
1. Read current state.
2. Validate the proposed transition (using validateTransition from Task 003).
3. Write the new state (triggers gate hook).
4. If hook blocks: read the error, address it, retry or halt.
5. If hook passes: write the stage-complete event, commit state.

## Acceptance Criteria

1. The skill reads state.json on every invocation and correctly identifies the current position.
2. `/build <brief-path>` creates a run directory, initializes state, and begins Stage 0.
3. `/build --status` prints a human-readable summary of the current run state.
4. `/build --override <stage> --reason "..."` writes the override file and updates state.
5. `/build --resume` transitions a halted run back to active state.
6. Stage advancement writes trigger the gate hook (verified by the hook blocking invalid advances).
7. Sub-agents receive only the context specified in D0-11 (not the full project).
8. The orchestrator commits state at stage boundaries with correct commit message format.
9. The orchestrator commits state on halt with correct commit message format.
10. On gate failure, the orchestrator receives and can act on the failure message.

## Tests

No automated unit tests for the skill itself (it's a markdown prompt file interpreted by Claude Code). Verification is through integration: the hook tests from Task 007 verify that state writes trigger gates, and the smoke test (Stage 10) verifies end-to-end orchestration.

Sub-agent definition files are verified by inspection: each file references only the context specified in D0-11.

## Notes

The skill file is a prompt — it instructs the Claude Code agent on how to orchestrate. It is not executable code. The skill reads state.json using the same file paths the TypeScript utilities use, but through Claude Code's native file reading (Read tool), not by importing TypeScript functions.

The sub-agent definitions in `.claude/agents/` reference the existing prompts in `prompts/` for role definitions. They add Trellis-specific context curation: what files to include, what to exclude, what the agent's output should look like for Trellis's consumption.

This task is the integration point between Track A (enforcement) and Track B (state management). The orchestrator writes state -> hook fires -> gate checks -> write allowed/blocked. All three tracks converge here.
