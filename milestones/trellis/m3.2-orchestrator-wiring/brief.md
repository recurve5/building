# Brief: Orchestrator Wiring — Connecting the Governance Layer

## The Problem

The orchestrator is a markdown prompt that tells an LLM to enforce gates. The gate enforcement is self-assessment: the same agent that completed the work evaluates whether the work meets the bar. Three milestones of tooling exist to make enforcement mechanical — audit checks, policy classification, detection records, git checkpoints, structured handoff, event logging — and none of it runs during a build.

The orchestrator prompt (lines 300-306) tells the LLM to check scope compliance by reading git diffs, verify test execution by reading output, and confirm completed sections by reading task files. These are the exact failure modes the audit tool was built to catch deterministically. But the tool sits in `tools/building-audit/` with CLI entry points that nothing invokes. The LLM does the checks by reading and judging, which is the structural weakness the Trellis brief diagnosed: the agent's drive to complete overrides its judgment about whether completion is genuine.

This creates three concrete failures:

**1. Mechanical checks are non-deterministic.** Scope compliance is a diff comparison — did files change outside the task's scope? The audit tool answers this with a file list intersection. The LLM answers it by reading a diff and deciding whether out-of-scope changes "look intentional." The LLM's answer depends on context window pressure, prior decisions in the session, and how convincing the task-agent's completion narrative is. The audit tool's answer depends on the file list.

**2. Layer 2 checks never run.** Ghost refactors, deep heresy, clean-slate bias, performance critical paths — these checks exist in the audit tool and have never been invoked during a build. They run only if someone manually calls `building-audit --full` after the fact. The checks that catch the subtlest failure modes — the ones where code works but shouldn't exist — are purely post-hoc. By design, milestone-close is the enforcement point for Layer 2. In practice, milestone-close has no enforcement.

**3. Sessions die without structured state.** The orchestrator writes prose to CLAUDE.md at session boundaries. The next session parses natural language to reconstruct where the pipeline was, what tasks completed, what findings were outstanding, and what the audit state looked like. M3 built a structured handoff writer and reader specifically for this — machine-readable header, typed fields, round-trip fidelity. The orchestrator doesn't use them. Every session resumption is a lossy reconstruction from prose.

These aren't missing features. They're a completed governance layer that was built across M1-M3.1 and never connected to the system it governs.

## What This Milestone Delivers

Five changes to the orchestrator prompt and supporting configuration. No new bridge modules. No new CLI entry points. The code exists; this milestone wires it in.

### 1. Post-task audit integration

Replace the LLM's self-assessment gate with the audit tool's mechanical checks.

After each Stage 9 task completes, the orchestrator invokes the post-task audit CLI (`building-audit-post-task-audit`) with the project directory, milestone, task ID, and `reworkOf` value via stdin JSON. The CLI runs the mechanical checks (scope compliance, test cheat detection, dependency grab, confidence bluff, surface heresy, premature abstraction, resource drain) and classifies each finding by tier and action.

The orchestrator reads the classification and branches:

- **No findings or all Tier 1:** Advance to the next task.
- **Tier 2 / generate-task:** The response includes a `RemediationTaskSpec`. The orchestrator writes it as a task file in the state directory and routes it through Stage 9 with the original task ID as `reworkOf`.
- **Tier 3 / escalate:** Halt. Write the finding context to the state directory. Surface to the human with the finding details, affected files, and action options.

Detection persistence is handled internally by the post-task audit CLI, which writes audit report files to `<projectPath>/<milestone>/audit/`.

The existing mechanical checks list (orchestrator.md lines 300-306) becomes documentation of what the audit tool checks, not instructions for the LLM to check manually. The judgment checks (lines 308-316) are unchanged — those remain the LLM's job.

### 2. Milestone-close audit integration

After all Stage 9 tasks pass their gates and before the Stage 9.5 security review, run the Layer 2 audit.

The orchestrator invokes `building-audit-milestone-close-prepare` with the project directory and milestone. The CLI returns candidate counts on stdout and writes the full Layer 2 candidates (ghost refactor, deep heresy, clean-slate bias, performance critical path, refactoring signals) and formatted judgment prompts to `<projectPath>/<milestone>/audit/milestone-close-layer2.json`.

If candidates exist, the orchestrator evaluates each using the judgment prompts from the bridge's `judgment-prompts.ts`. This is the LLM's job — Layer 2 checks require judgment, not mechanical verification.

The orchestrator then invokes `building-audit-milestone-close-finalize` with the judgments, persisting the finalized report (with preserved candidate data per M3.1) and detection records. Critical findings block Stage 9.5. Each becomes a remediation task routed through the post-task audit flow (Change 1).

### 3. Session handoff alongside CLAUDE.md

At every session boundary (context window approaching capacity, planned pause, interruption), the orchestrator writes two artifacts:

1. **Handoff file** via `building-audit-handoff-write`. The stdin payload is the current `HandoffPayload`: stage, tasks completed/remaining, decisions this session, open items, audit summary with structured L1/L2 findings, git checkpoints. Written to `<state-dir>/runs/<run-id>/handoff.md`.
2. **CLAUDE.md** as today — human-readable summary with surgical fix instructions in the project directory.

At session start, the orchestrator checks for a handoff file in the run directory. If found, it reads structured state via `building-audit-handoff-read` and resumes from the recorded stage and task. CLAUDE.md provides human-readable context; the handoff file provides exact state. Both exist because they serve different consumers.

The handoff file's existence with a non-complete stage is the continue signal. No separate continue file is needed.

### 4. Event logging at pipeline transitions

The orchestrator invokes the event writer CLI (`building-audit-write-event`) at four transition points:

- **Run start:** `{ event: "run_started", brief: "<path>", projectDir: "<path>", milestones: [...] }`
- **Task completion:** `{ event: "task_completed", taskId: "<id>", milestone: "<name>", auditResult: "proceed|generate-task|escalate" }`
- **Session boundary:** `{ event: "session_boundary", reason: "context_window|planned_pause|interruption", stage: <n>, lastTask: "<id>" }`
- **Run end:** `{ event: "run_completed", result: "success|halted|failed", summary: "..." }`

Events are the raw material for the morning-after summary and forensic investigation. Escalations are not events — they're detection records (persisted via Change 1). Gate results are not events — they're recorded in state.json. Events capture the pipeline timeline; other mechanisms capture the specifics.

### 5. Run directory lifecycle

At run start, the orchestrator creates the run directory structure:

```
~/.building/projects/<project-id>/runs/<run-id>/
  events/
  gates/
  handoff.md
```

The run ID format is `YYYYMMDDTHHMMZ-<7-char-hex>`. The orchestrator writes the run ID to `<state-dir>/current-run` so it can be read at session resumption without passing it through every CLI invocation.

At run end, the orchestrator writes the morning-after summary to `<state-dir>/runs/<run-id>/morning-after.md` and deletes `current-run`.

Bridge CLIs already create directories on first write (`mkdirSync({ recursive: true })`), so the run directory creation is best practice, not a hard dependency.

## How the CLIs Are Invoked

All bridge CLIs read JSON from stdin and write results to stdout (Decision D3 from M3.1 — avoids ARG_MAX limits). Every invocation includes both paths in the stdin payload:

- `projectPath` — the product repo where source code and git history live. This is what the audit tool scans.
- `statePath` or `runDir` — the governance state directory where run logs, detections, events, and handoff files are written.

For Building building itself, both paths point into the same repo hierarchy. For Building building an external product, `projectPath` is the product repo and `statePath` is `~/.building/projects/<project-id>/`. The orchestrator reads both paths from the run configuration established at run start.

## What This Does Not Cover

- **New bridge modules or CLI entry points.** All code exists from M1-M3.1. This milestone modifies `orchestrator.md` and supporting prompt files.
- **Scope enforcement hooks.** A `PostToolUse` hook on `Edit`/`Write` could block out-of-scope file modifications mechanically. This was considered and rejected: the blast radius (fires in every Claude Code session), false positive cost (blocks valid work when task file lists are incomplete), and conflict with the detect-and-recover model make it unsuitable. The post-task audit catches scope violations mechanically after task completion, which provides the same coverage with full diff context and no false positive risk.
- **Automated session restart.** The orchestrator writes the handoff file for session continuity, but the human (or an external monitor) must invoke `/build --resume` after a session ends. Automated restart is infrastructure outside Trellis's scope.
- **Changes to bridge module code.** If the CLIs need interface changes, that's a sign the M3.1 contracts were wrong. The point of DAY-ZERO contracts is that the integration milestone doesn't discover interface mismatches.

## Resolved Assumptions

1. **No new pipeline stage for milestone-close audit.** The Layer 2 audit runs in the Stage 9 → 9.5 transition, not as a separate "Stage 9.75." It's a gate in the transition, not a stage with its own agent and gate.

2. **Handoff file existence is the continue signal.** No separate `continue` file. If `<run-dir>/handoff.md` exists with a non-complete stage, the run expects resumption.

3. **Four event types, not nine.** Run start, task completion, session boundary, and run end. Other candidates (escalations, gate results, SDM triggers) are already persisted by their own mechanisms (detection records, state.json, SDM assessment files).

4. **Two-path convention is a prompt convention, not a code change.** The CLIs already accept both paths via stdin JSON fields. The orchestrator prompt documents that it passes both paths on every invocation. No CLI interface changes.

5. **Detection persistence is internal to the audit CLIs.** The post-task audit CLI and milestone-close-finalize CLI handle detection persistence internally (writing audit report files and calling `appendDetection`). No separate detection-write step is needed in the orchestrator flow.

## Open Assumptions

1. **Whether the orchestrator should validate audit CLI exit codes beyond 0/1.** The current CLIs exit 0 on success and 1 on error. If a CLI exits 1 (e.g., invalid input, filesystem error), should the orchestrator halt the pipeline, retry, or treat it as a non-fatal warning? The audit result is governance — a failed audit invocation is not the same as a clean audit. Flag for SWE-agent.

2. **Whether the morning-after summary format should be specified in this milestone or deferred.** The run directory lifecycle (Change 5) writes `morning-after.md` at run end, but the content and structure of that summary depend on how events and detection records are aggregated. The format could be defined now or left for the first real overnight build to inform. Flag for product-agent.
