# Brief: building-orchestrator

A code-based build harness that replaces the markdown-driven orchestrator with software that enforces the pipeline mechanically. The orchestrator is no longer a document an agent reads — it's a program that controls the agent.

## The Problem

The building system's orchestrator is a markdown file. Agents read it, confirm understanding, and then deviate from it. The M5.2 build is the proof: the starter prompt specified a four-phase layered branch strategy. The agent confirmed understanding. It then built all four phases as uncommitted working tree modifications — zero branches, zero commits, zero rollback points. Tests passed. Smoke test passed. The process wasn't followed.

This isn't a documentation problem. The orchestrator.md is thorough. The problem is that instructions in a prompt are suggestions. An agent that runs out of context window silently drops process requirements while retaining task requirements. Git operations, phase gates, context scoping, verification steps — these are the first things lost because they're process, not product.

The fix is mechanical. The things the agent forgets are the things code can enforce: create a branch, commit before proceeding, clear the context window, run the checks, verify the gate.

## What This Builds

A CLI tool — `building-run` — that takes a starter prompt and drives the entire build pipeline. The human types one command. The tool handles everything between "here's my brief" and "here's your verified product."

### 1. Git Enforcement

The tool creates branches per the starter prompt's branch specification. Not the agent — the tool.

- Reads the branch strategy from the starter prompt (e.g., `main → m5.2/phase-a → m5.2/phase-b → ...`)
- Creates each branch at the right time
- Commits completed work at phase/task boundaries with the `[TASK_ID]` convention
- Refuses to proceed to the next phase without a committed branch
- Produces the rollback chain the brief promised: if phase-d fails, check out phase-c

The agent never runs `git checkout -b` or `git commit`. The tool does. The agent writes code. The tool manages state.

### 2. Context Window Management

The tool spins up fresh agent sessions per task (or per phase, configurable). Each session receives only the context that task's Context field declares.

- Reads the task file's Context field (defaults + task-specific)
- Assembles a scoped prompt containing only the declared inputs: DAY-ZERO.md, the task file, and the files listed in Context
- Launches a new Claude Code session (or equivalent) with that prompt
- Captures the agent's output (code changes, completed section, decisions)
- Closes the session

The agent never inherits context from a prior task. The tool enforces isolation by construction — the agent can't see what it wasn't given.

### 3. Failure Mode Pre-Check and Post-Check

Before a task starts, the tool checks the task plan:
- Does the task's Files section include files that are in another task's Do Not Touch list?
- Does the task depend on a task that isn't complete?
- Does the task's scope overlap with another incomplete task? (prevents Heroic Unblock)

After a task completes, the tool runs `building-audit --mechanical` against the project:
- Exit code 0: proceed to next task
- Exit code 1 (critical findings): block. Surface the findings. Do not proceed.
- The agent that produced the work does not evaluate the work. The audit tool does.

### 4. Refactoring Checkpoints

At milestone boundaries (between milestones, not between tasks), the tool runs the refactoring signals check:
- Fragility metrics: file length trends, modification coupling, complexity growth
- If the assessment is Yellow or Red, the tool surfaces it before the next milestone starts
- The human decides whether to insert a refactoring milestone or proceed

This replaces the ad hoc SDM check that Josh currently runs manually.

### 5. Performance and Security Audit

Before the build is declared complete, the tool runs:
- `building-audit --full` (includes Layer 2 LLM judgment checks)
- Performance critical path analysis
- Secret detection scan
- Resource drain check

Findings are surfaced. Critical findings block completion. The tool does not auto-fix — it reports and blocks.

### 6. Automated Smoke Test and Stress Test

The tool drives the smoke test and stress test mechanically:
- Reads the PRD's First-Use Walkthrough
- Starts the server (or the product under test)
- Drives Playwright through each walkthrough step
- Captures screenshots, response content, timing
- Runs the stress test protocol (rapid sequential actions, conversation switching, endurance loop)
- Produces a structured pass/fail report with evidence

The critical difference from today: the agent that built the code does not run the smoke test. The tool runs it in a separate process. The builder and the tester are mechanically separated.

## How It Runs

```
building-run --brief ~/project/milestones/m6/brief.md
```

The tool:
1. Reads the brief
2. Reads orchestrator.md for the pipeline definition
3. Runs Stage 0 (milestone decomposition) — spins up product-agent with scoped context
4. For each milestone:
   a. Creates the milestone branch
   b. Runs Stages 2-8 (PRD → task decomposition) — spinning up agents with scoped context per stage
   c. For each task in the milestone:
      - Pre-checks the task against failure modes
      - Creates a scoped prompt with only the task's declared context
      - Launches an agent session
      - Captures output
      - Commits with `[TASK_ID]` prefix
      - Runs `building-audit --mechanical`
      - Blocks on critical findings
   d. Runs smoke test against the running product
   e. Runs stress test
   f. Runs `building-audit --full`
   g. Runs refactoring checkpoint
   h. Commits the milestone
5. Reports final state

## What the Human Does

- Writes the brief
- Answers blocking Tier 3 decisions when surfaced
- Reviews the final audit report, smoke test report, and stress test report
- Merges the branch

Everything else is automated. The human's role shifts from "orchestrate the build and catch mistakes" to "make product decisions and review results."

## What Does NOT Get Automated

Same list from automation.md, still enforced:
- Tier 3 decisions (tool stops, human decides)
- PRD writing (the product-agent drafts, but the human confirms the playback)
- New failure mode identification (the tool detects known patterns; humans name new ones)
- Gate override decisions (sometimes a finding is a false positive; the human overrides)
- The decision about whether to proceed after a Yellow refactoring assessment

## Dependency on building-audit

This tool depends on building-audit being complete and working. The orchestrator calls `building-audit --mechanical` after every task and `building-audit --full` at milestone boundaries. Without the audit layer, the orchestrator has no quality gate — it's just automation without judgment.

Build building-audit first. Then build this.

## Technology Decision (Open)

This is a Tier 3 decision for the PRD/XRD phase. The question: what controls the agent sessions?

**Option A: Shell-based.** The tool launches Claude Code sessions via subprocess, passes prompts via stdin or file, captures output via file system changes. Simple. Fragile. Depends on Claude Code's CLI interface remaining stable.

**Option B: API-based.** The tool calls the Anthropic API directly, managing the conversation loop programmatically. More control. More complex. Doesn't get the tool-use capabilities that Claude Code provides (file editing, bash execution).

**Option C: Claude Code hooks.** If Claude Code exposes hooks or extension points (pre/post task, custom commands), the tool integrates as a plugin rather than wrapping the process. Most elegant. Depends on capabilities that may not exist yet.

The brief does not decide. The SWE evaluates what's feasible.

## Success Criteria

Run the tool against a real brief. The output is:
- A committed branch chain with rollback points at every phase
- An audit report showing what the tool caught
- A smoke test report showing what passed and failed
- A stress test report showing performance under load
- The human's sanity test finds nothing the tool didn't already surface

The tool is working when Josh's review shifts from "did the agent do the task correctly" to "are the gates catching the right things." That test — from automation.md — is the measure.

## What's Out of Scope for 1.0

- Parallel task execution (tasks run sequentially in 1.0)
- Multi-project orchestration (one brief, one project at a time)
- Auto-fix of audit findings (report and block, don't fix)
- Custom pipeline stages (the pipeline is hardcoded from orchestrator.md)
- Web dashboard or UI (CLI only)
