# Automation

How the build harness moves from human-in-every-loop to human-where-judgment-matters.

## The Origin

Josh studied Ryan's best-of repo (a ranked list of open-source agent tooling projects, auto-generated from a yaml file by a GitHub Action). The comparison surfaced a structural asymmetry.

Ryan automated first. A generator scores projects by GitHub stars and package manager downloads, ranks them, and publishes a README on a schedule. No human reviews the output. The system is durable but has no encoded judgment: no record of why the categories exist, no inclusion criteria beyond yaml schema, no mechanism to catch a bad ranking before it ships. If the generator promotes a dead project or miscategorizes something, nothing stops it.

Josh encoded judgment first. Every stage of the build process has a quality gate, every decision has a rationale, every failure mode is cataloged. But nothing runs without Josh. The system gets smarter over time. It does not get faster.

> **Insight:** Automating before encoding judgment produces durable output with no quality floor. Encoding judgment without automating produces high-quality output with no durability. The sequence matters: judgment first, automation second. And the automation needs a circuit breaker — a point where the system stops and surfaces something for human review instead of propagating a bad output.
>
> **Implication:** The harness already has the judgment encoding (decision tiers, failure modes, quality bar, role definitions). The next evolution is an automation layer that lets encoded judgment run without Josh, and stops when it encounters something the encoding doesn't cover.
>
> **Decision:** Build automation into `~/building/` as described below. Do not automate any stage that lacks a defined quality gate and a testable definition of done.

## The Principle

Automate execution. Never automate judgment. The line between them is the decision tier system that already exists.

## What Already Exists

The harness has three structures that map directly to automation boundaries:

**Decision Tiers** define what an agent can do without asking.

| Tier | Current State | Automated State |
|------|--------------|-----------------|
| Tier 1 — Just do it | Agent executes, no logging required | Agent executes autonomously. No change. |
| Tier 2 — Do it and log it | Agent executes and writes to DECISIONS.md | Agent executes autonomously, writes to DECISIONS.md. Josh reviews the log asynchronously, not synchronously. |
| Tier 3 — Surface for review | Agent writes to OPEN-ITEMS.md and stops | Agent writes to OPEN-ITEMS.md and **stops**. No change. This is the circuit breaker. |

The tiers don't need to be redesigned. They need to be enforced by the system rather than by Josh watching.

**Agent Failure Modes** define what the circuit breaker watches for. Each failure mode is a pattern that, if detected, should halt autonomous execution and surface for review.

| Failure Mode | Detection Method | Circuit Breaker Behavior |
|-------------|-----------------|------------------------|
| Test Cheat | Assertion strength: flag any test that asserts existence without asserting correctness | Stop. Surface the weak assertion for review. |
| Scope Creep | Diff audit: compare changed files against the task's Files section | Stop. Reject the task completion. Require clean implementation. |
| Dependency Grab | Package manifest diff: any new entry not in the task's contracts | Stop. Surface for justification. |
| Confidence Bluff | Test execution gate: "done" status requires passing test suite output, not self-report | Block status change until test output is verified. |
| Context Amnesia | Decision conflict check: compare agent choices against DECISIONS.md entries | Stop. Point the agent to the conflicting decision. |
| Ghost Refactor | Scope audit: if task doesn't say "refactor," flag any rewrite of passing code | Stop. Reject. |
| Premature Abstraction | Complexity check: flag any new protocol, factory, registry, or base class not in the task spec | Surface for review against Decision #8 (abstractions must be earned). |
| Loop of Despair | Attempt counter: if the agent has tried the same fix more than 3 times, halt | Stop. Revert to last working state. Surface for reframing. |
| Heresy | Terminology search: after any Hard Kill, scan all files for ghost references | Block next task until scan is clean. |
| Precondition Ghost | Dependency trace: every file referenced in a task must trace to a prior task or DAY-ZERO.md | Block task execution until precondition is resolved. |

**The Quality Bar** defines what "done" looks like at the task level and the project level. This is the acceptance gate for autonomous execution. A task that meets the quality bar can be marked done without Josh reviewing it. A task that doesn't meet it stops.

## Implementation Substrate — Open

The components below describe *what* each automation piece does, not *what it is*. Whether these are Claude Code hooks, shell scripts, CLAUDE.md instructions that agents interpret, or a meta-agent that orchestrates is an open design question — a Tier 3 decision to be resolved when Phase 1 begins. Do not treat "build the Gate Runner" as a well-specified task until the substrate is chosen.

## What Needs to Be Built

### 1. The Gate Runner

A process that runs after each task completion and before the next task starts. It checks:

- Did all tests pass? (not self-reported — actual test output)
- Were only files listed in the task's Files section modified?
- Were any new dependencies added?
- Does any new code contradict a DECISIONS.md entry?
- Is the insight/implication note present in the task completion?

If all checks pass: mark the task done, update CLAUDE.md, proceed to the next task.

If any check fails: stop. Write the failure to OPEN-ITEMS.md with the specific check that failed. Do not proceed.

The Gate Runner is the circuit breaker. It replaces Josh reviewing every task completion with Josh reviewing only the ones that failed a gate.

### 2. The Heresy Scanner

Already defined in `build-process.md` as a manual step. Automate it:

- Trigger: any DECISIONS.md entry tagged `[HARD KILL]`
- Action: search all project files for the killed idea's terminology
- If clean: proceed
- If ghost found: stop. List the ghost references. Block next task until purge is complete.

### 3. The Session Closer

Already described in `build-process.md` as a manual step ("update the project CLAUDE.md at the end of every session"). Automate the structured parts:

- Append completed tasks to the project CLAUDE.md status section
- Append new DECISIONS.md entries to the session summary
- List any OPEN-ITEMS.md additions
- State what the next session should start with (next task in sequence)

The Session Closer produces the context that prevents Context Amnesia in the next session. Right now Josh writes it manually. The structured parts can be generated from the task file status changes and the decisions log diff.

### 4. The Async Review Queue

Right now, Tier 3 items sit in OPEN-ITEMS.md and Josh reviews them in the next session. With automation, the queue matters more because tasks may complete faster than Josh reviews.

The queue needs:

- Priority ordering (Tier 3 items that block other tasks go first)
- Staleness detection (an item that's been in the queue longer than two sessions gets flagged)
- Resolution tracking (when Josh resolves an item, the resolution propagates to all documents that reference it)

This is not a tool. It's a section in the project CLAUDE.md that gets maintained by the automation layer. The agent reads it at session start and knows what's been resolved, what's still open, and what's blocking.

## The Sequence

Do not build all four at once. The harness principle applies to its own evolution: encode judgment first, then automate.

**Phase 1: Gate Runner.** This is the highest-value automation. It replaces synchronous review of every task with asynchronous review of failed gates only. Build it for one project. Run it for one full build cycle. Observe what it catches and what it misses. Add failure modes to `agent-failure-modes.md` based on what it misses.

**Phase 2: Heresy Scanner.** Low effort, high value. Already fully specified. Automate the search. The judgment (what constitutes a ghost reference) is already encoded in the Hard Kill protocol.

**Phase 3: Session Closer.** Medium effort, medium value. The structured parts are automatable. The unstructured parts (what Josh learned, what feels off, what the next session should prioritize) remain manual. The automation handles the bookkeeping; Josh handles the judgment.

**Phase 4: Async Review Queue.** Build this when the volume of OPEN-ITEMS.md entries justifies it. For a single project with sequential task execution, the current file-based approach works. For multiple concurrent projects or parallel task execution, the queue becomes necessary.

## What Does Not Get Automated

- Tier 3 decisions. The circuit breaker stops here. Always.
- PRD writing. Product judgment is the input to the system, not a product of it.
- Peer Review judgment. The Peer Reviewer surfaces issues. The resolution is human.
- Failure mode identification. When a new pattern appears, a human names it and adds it to the catalog. The automation can detect known patterns. It cannot identify new ones.
- The decision about when to override a gate. Sometimes a gate failure is correct (the agent did something wrong) and sometimes the gate is wrong (the check is too strict for this context). That judgment is Josh's.

## The Test

The automation is working when Josh's review time shifts from "did the agent do the task correctly" to "are the gates catching the right things." The first question is about the code. The second question is about the system. The second question is higher leverage.

## Relationship to the Book Thesis

This is the thesis built into a workflow. AI collapsed the cost of execution (agents write code fast). The cost of creating well did not collapse (judgment about what to build, how to evaluate it, when to stop). The automation layer sits between capability and output. It encodes the judgment that makes the capability usable. Without it, the agents produce volume. With it, they produce quality.

The harness is a proof-of-concept for the missing layer.
