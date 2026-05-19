# Brief: Audit Integration and Milestone Git Checkpoints

## The Problem

Trellis enforces that pipeline stages run in order. It does not check whether the output of those stages is any good. The building-audit CLI — which detects 13 of 19 cataloged failure modes — sits in the same repo and is never called. The two tools that were built to work together don't talk to each other.

Separately, Trellis has no meaningful git integration. `commitProjectCode` is a generic utility that nothing calls automatically. There are no checkpoints at milestone boundaries. If a milestone goes wrong, there is no clean state to roll back to. The JSON state snapshots track Trellis's internal bookkeeping, not the project's source code.

## What This Milestone Delivers

Two capabilities wired into the existing Trellis pipeline:

### 1. Audit integration

building-audit runs at two points in the pipeline:

**After each task completion (Stage 9):** Layer 1 (mechanical) checks run automatically. These are deterministic, free (no API calls), and fast. The 9 Layer 1 checks are: Test Cheat, Scope Creep, Dependency Grab, Confidence Bluff, Surface Heresy, Premature Abstraction, Unoptimized Defaults, Resource Drain, and Accumulating Fragility.

Findings are classified by tier:
- **Tier 3 findings block the gate.** The task cannot advance. The orchestrator must address the finding or escalate to the human.
- **Tier 1 and Tier 2 findings generate a new task.** The finding, its context, and the relevant code are written into a task file. That task enters the normal build queue and is completed through the standard task execution process. The original task advances.

**At milestone close:** Layer 2 (LLM judgment) checks run. These require model calls, which are available through the existing Claude Code session — no separate API key configuration. The 7 Layer 2 checks are: Ghost Refactor, Clean Slate Bias, Deep Heresy, Document Heresy, Performance Critical Path, React Fluidity, and Refactoring Signals.

Layer 2 findings at milestone close follow the same tier classification. Tier 3 blocks milestone completion. Tier 1 and 2 generate tasks for the next milestone or a remediation pass within the current one.

### 2. Milestone-level git checkpoints

Git operations are mechanical — Trellis executes them, not the LLM orchestrator.

**At milestone start:** Tag the current HEAD. Format: `building/milestone-<name>/start`.

**At milestone complete (all gates passed):** Tag the current HEAD. Format: `building/milestone-<name>/complete`.

**On milestone failure or halt:** Create a branch from the last `complete` tag. Format: `building/rollback/<milestone-name>`. This gives the user a recoverable state they can check out, inspect, or build from. If no prior milestone has completed, the branch is created from the `start` tag of the current milestone.

Tags and branches are local. Nothing is pushed.

## What This Does Not Cover

- Per-task git commits. Tasks commit through the normal Claude Code flow. This milestone adds checkpoints at milestone boundaries only.
- Per-stage git tags. Stage boundaries before Stage 9 don't change source code. Stage 9 sub-boundaries are per-task. Neither is a useful checkpoint level.
- Automated rollback execution. Trellis creates the rollback branch. The human decides whether to use it.
- New failure mode detectors. This wires the existing 13 detectors into the pipeline. New detectors are a separate concern.
- Morning-after integration. The morning-after report should reference audit findings and git tags, but that's a presentation change, not a structural one. It can be done as a Tier 2 task within this milestone or deferred.
- Context management. M2 works for builds that fit in one session. Overnight builds (8-10 hours, multiple milestones) need stage-scoped sessions, handoff files, and compaction-friendly output. That is M3.

## Resolved Assumptions

1. **Layer 1 runs in-process via the building-audit TypeScript API, not by shelling out to the CLI.** Both tools are TypeScript in the same repo. Import the check registry and run checks directly. Faster, no subprocess overhead, shared types.

2. **Layer 2 runs through the Claude Code session's model access.** Building runs inside Claude Code. The LLM calls Layer 2 needs are made through the same session, not through a separate API client. No ANTHROPIC_API_KEY environment variable required.

3. **Tier classification of audit findings uses the existing policy table from the Trellis brief.** The Starting Policy table in the M1 brief maps each failure mode to a tier. That table is the authority. This milestone does not reclassify.

4. **Generated remediation tasks use the existing task-template.md format.** A Tier 1/2 audit finding produces a task file with: the finding name, severity, the specific code location, what the detector found, and what "fixed" looks like. The task agent executes it like any other task.

5. **Git tags use a `building/` namespace prefix.** This avoids collision with the project's own tags. The prefix is fixed, not configurable.

6. **Rollback branches are created but never checked out automatically.** Trellis creates the branch and reports it. The user or orchestrator decides what to do with it.

## Resolved from Open Assumptions

1. **Remediation task recursion.** If a remediation task itself fails audit, escalate to Tier 3. The system asks the human for context or clarity. No recursive task generation — one remediation attempt, then human judgment.

2. **Layer 2 findings at milestone close are Tier 3.** All Layer 2 findings surface to the human. The human decides whether to accept the finding and remediate, or accept the milestone as-is. Layer 2 does not auto-generate tasks or reopen Stage 9.

3. **Tag behavior when a milestone is overridden.** Removed — not a meaningful design question. An overridden milestone completed. Tag it `complete`.
