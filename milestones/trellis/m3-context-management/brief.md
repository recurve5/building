# Brief: Context Management for Overnight Builds

## The Problem

Trellis can enforce gates and (after M2) detect failure modes and checkpoint git. But a 12-stage pipeline with sub-agent invocations, audit runs, and dozens of tasks will exhaust Claude Code's context window long before an overnight build completes. When it does, the session dies and nobody is awake to restart it.

The current resume mechanism (`/build --resume`) only handles explicit halts. If the session crashes mid-build — context exhaustion, timeout, network drop — there is no recovery path. The state.json says where the pipeline was, but nothing captures what the orchestrator knew that a fresh session would need to continue.

M2 makes this worse: audit findings per task and Layer 2 checks at milestone close add substantial output to the conversation. Without context management, M2's value is limited to builds short enough to fit in one session.

## What This Milestone Delivers

Three capabilities that together make the pipeline survive builds of arbitrary length.

### 1. Handoff file

At every stage boundary, the orchestrator writes `handoff.md` to the run directory. Contents:

- Current stage number and name
- Milestone identity and progress
- Decisions made this session (with rationale — these don't survive compaction otherwise)
- Open Tier 3 items awaiting human input
- Task progress (if in Stage 9): completed tasks, current task, remaining tasks
- Audit findings summary: what was caught, what was remediated, what's outstanding
- Git checkpoint references: tags created this session
- File paths for all artifacts produced this session
- Explicit next step: what the orchestrator should do when it picks up

The handoff file is the single document a new session reads to resume with full continuity. It replaces reconstructing context from scattered state files.

`/build --resume` reads the handoff file as its primary context source. It works from both halted and in-progress states — covering session crashes, not just deliberate halts.

### 2. Stage-scoped sessions

Each pipeline stage runs in its own session. When a stage completes:

1. The orchestrator writes the handoff file.
2. The orchestrator writes state.json and events.
3. The orchestrator starts a new `/build --resume` invocation.

The new session gets a clean context window. It reads the handoff file, orients, and begins the next stage. No single session accumulates the full build's context.

Within Stage 9 (task execution), session boundaries are per-task or per-N-tasks, not per-stage — a stage with 30 tasks needs multiple sessions. The handoff file tracks which tasks are done and which remain.

The cost is latency at session transitions. For an 8-10 hour build, a few seconds between stages is invisible.

### 3. Compaction-friendly output structure

All substantial output goes to disk first, then is referenced by path in the conversation.

- Audit findings: written to `<run-dir>/detections/`, referenced as "Layer 1 findings for task-007: see detections/task-007-l1.json"
- Gate check results: written to `<run-dir>/events/`, referenced by path
- Sub-agent output: written to milestone directory, referenced by path
- Test output: written to task directory, referenced by path

The conversation holds decisions, references, and status — not data. When Claude Code compacts mid-stage, file references survive. The data they point to is on disk.

This applies within a stage, not just between stages. A single stage (especially Stage 9) can generate enough output to fill a context window. Disk-first output keeps the conversation proportional to the number of decisions, not the volume of output.

## How The Three Fit Together

The handoff file is the bridge between sessions. Stage-scoped sessions are why you need the bridge. Compaction-friendly output is what makes individual stages survivable even before a session boundary.

Without the handoff file, stage-scoped sessions have no continuity. Without stage-scoped sessions, the handoff file is insurance for crashes but not a core execution model. Without compaction-friendly output, long stages still exhaust the window before reaching a session boundary.

## What This Does Not Cover

- Multi-machine or multi-session parallelism. Stages run sequentially in separate sessions, not concurrently.
- Automatic session restart on crash. Trellis writes the handoff file continuously, but the human (or an external monitor) must invoke `/build --resume` after an unexpected session death. Automated restart is an infrastructure concern outside Trellis's scope.
- Context window size detection. Trellis does not query or adapt to the available context budget. It avoids the problem structurally (stage-scoped sessions + disk-first output) rather than managing it dynamically.

## Resolved Assumptions

1. **Session boundary mechanism.** The orchestrator invokes `/build --resume` as a new Claude Code session, not as a sub-agent within the current session. Sub-agents share the parent's context window. A new session gets a clean one.

2. **Handoff file is overwritten, not appended.** Each stage writes a fresh handoff.md reflecting current state. Historical handoff files are not preserved — the event log and state snapshots already provide history.

3. **Stage 9 session boundaries are task-count based, not context-size based.** The orchestrator creates a new session every N tasks (default: 5). This is simpler than measuring context consumption and predictable enough for the use case. N is configurable in state.json.

## Open Assumptions

1. **How the orchestrator starts a new session from within a session.** Claude Code does not have a "spawn a new top-level session" API. The mechanism may be: the orchestrator outputs a message telling the user (or an external script) to run `/build --resume`, then exits. Or it may use a Claude Code capability that doesn't exist yet. Flag for SWE-agent.

2. **Whether the handoff file should include a confidence assessment.** The morning-after report has confidence scoring. Should the handoff file carry a running confidence estimate so the human can check progress from their phone mid-build? Flag for product-agent.
