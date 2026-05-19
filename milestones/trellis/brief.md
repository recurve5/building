# Brief: Governance Layer for Building

## Original Input

The user's first message in the originating conversation:

> I have a project called Building. It's a multi-agent pipeline for software development — agents write code, review specs, run tests, etc. The whole thing is driven by markdown prompts and CLAUDE.md files. It works with Claude Code, Codex CLI, and Cursor. The problem: it often fails to notice agent failure modes (scope creep, confidence bluffing, test cheating, ghost refactors, etc.). There's no checkpointing that lets me revert to a safe state when something goes wrong partway through. I want more deterministic structure without losing the tool-agnosticism.

A subsequent dictated message added the user-story-shaped intent for what the system should feel like in use. Paraphrased verbatim from that dictation, the user wants to:

> Sit down, having thought through an idea well enough to have shape of the problem space, describe user stories, and give it to Building. Open Claude Code from the CLI, turn on the remote control flag, hand Claude Code the prior work plus user stories plus brief/architecture/requirements work product, and have Building flesh through PRD and XRD, surface a handful of Tier 3 judgment calls and controversies, then build for 8-10 hours. Test what it's done after the fact via smoke/user test. While building, catch inner-loop and outer-loop failure modes. Building should know when heresy is creeping in. Once detected, Building deploys the right agent (often SDM) through the orchestrator with appropriate context to fix the mess before it cascades. SDM runs at every milestone to look for refactor opportunities so refactors happen as we go, not when everything is brittle. Performance and security agents look for issues as we go, not after. Most failure modes get fixed when they're small (Tier 2) before becoming Tier 3 risks. When the user wakes up and checks their phone, they want clear understanding of whether the product is worth their time to review — confidence that easy stuff was handled without pulling them in. If something is broken at the end, they want to be able to go back 2-3-4 steps to a clean state. Git plus task list is suspected to be 85-95% of what's needed for that.

## Pattern Match

**Layer 1 — Project Shape:**
- *Extension to existing markdown-driven multi-agent pipeline* (high confidence). The project already exists with stages, agents, gates, and a failure-mode catalog. This work adds enforcement and observability machinery to that pipeline, not new pipeline structure.
- *Tooling/infrastructure for the user's own workflow* (high confidence). The "user" is the user themselves. Building is dogfooded by its author.

**Layer 2 — Constraint Axes:**
- *Claude-Code-first with portability as preference* — Claude Code is the daily tool; Codex CLI and Cursor are valued for flexibility but not required to receive feature parity.
- *Solo developer, no other users* — no multi-tenancy, no shared state concerns, no team coordination requirements.
- *Long-running unattended execution* — overnight builds of 8-10 hours are the target workload. Implies async-friendly status, halt-and-resume semantics, and mobile-readable output.
- *Local file system + git* — no cloud infrastructure required; the project is a local repo.
- *AI-heavy pipeline* — every stage is LLM-driven; the governance layer is specifically about making LLM-driven work trustworthy at overnight scale.

## Resolved Assumptions

Each assumption is tagged user-approved (the user confirmed during the conversation) or user-derived (the user's stated intent makes the assumption clearly correct without explicit confirmation).

1. **Detection happens during the run, not after.** [user-approved] The existing audit prompt is a post-hoc tool; the governance layer makes its checks fire at gates during the build.

2. **Some checks are deterministic, some are LLM judgment.** [user-approved] Mechanical checks (scope diff, dependency diff, test-claim verification, commit-format) run as scripts. Judgment-shaped checks (alignment, weak assertions, deep heresy) run as LLM validators.

3. **Enforcement is structural, not interpreted.** [user-approved] When a gate's check fails, the system cannot advance past it. This is enforced by Claude Code hooks, not by prompts telling the orchestrator-LLM to halt.

4. **State persistence is git + files in the repo, not a separate datastore.** [user-approved] Validator outputs, gate-passage records, task status, and orchestrator state all live as committed files. Git is the persistence layer. No MCP-server-backed state, no parallel database.

5. **Forensic review is manual, not automated.** [user-approved] When a bad outcome occurs, the user manually spawns a clean-context window to investigate. The system doesn't automate divergence localization.

6. **Rollback is human-decided, system-recommended.** [user-approved] Building surfaces "I recommend rolling back to checkpoint N because X." The user decides whether to roll back, advance with override, or kill the run.

7. **The user always reviews the output.** [user-approved] Building's job is not autonomous shipping. Building's job is to make the user's morning review efficient — catching small issues autonomously and presenting larger ones with full context.

8. **Performance and security validate post-milestone.** [user-approved] Currently these agents review pre-build (against the XRD). They are extended to also validate post-milestone, catching regressions in completed work.

9. **SDM runs a refactor-opportunity scan at every milestone boundary.** [user-approved] This is in addition to its existing trigger points (pre-XRD, escalation-driven, mid-build synthesis). Refactor recommendations become Tier 3 escalations per the existing SDM spec.

10. **Most inner-loop and middle-loop failure modes are Tier 2 (autonomous fix).** [user-approved] Outer-loop failure modes are Tier 3 (human judgment). A starting policy table is captured in the Decision Log below and will be refined as real cases surface edges.

11. **The system is Claude-Code-first, with the constraint that architectural decisions avoid one-way doors against later portability.** [user-approved] Tool-agnosticism is a preference, not a hard requirement. The discipline is around irreversible decisions: state lives in files (portable), not session-state or MCP-server-coupled storage (irreversible against portability).

12. **Worker-validator debate is not extended beyond where it already exists.** [user-approved] Peer review between PRD and XRD has debate-shaped dynamics and is working; the pattern is not generalized to other gates.

13. **Morning-after summary is delivered as both a summary message at the end of the run and a file saved to disk in a dedicated project folder.** [user-approved] The folder is per-run-id; the file is the durable artifact.

14. **Checkpoint level is medium: git plus committed validator-output and gate-passage files.** [user-approved] Lightweight (bare git) is insufficient for the manual-forensic-review workflow. Heavy (full run-state snapshots) is overkill given no automated forensics or rollback.

## Open Assumptions

These are flagged forward to product-agent. Each is either a product-level decision the user wants product-agent to resolve, or a deliberately-deferred detail.

1. **Exact contents and format of the morning-after artifact.** The structure has been named (refactors done and why, failure modes caught and how resolved, work-confidence categorization, rollback recommendations) but the specific format, section ordering, and mobile rendering have not been specified. Product-agent should design this with the phone-readability constraint in mind.

2. **Exact handoff format from the user's pre-work to Building's pipeline.** The user wants to hand Building "user stories plus prior architectural work plus this brief/architecture-notes set of work product." How that handoff is structured — a single file, multiple files, a slash command — is not specified.

3. **What "remote control flag" enables at the Claude Code level.** This is an existing or anticipated Claude Code capability the user wants to leverage for phone access to running sessions. Building does not build this; Building runs cleanly under it. The exact constraints this places on Building's output formatting and pacing are an open product-level concern.

4. **The override mechanism when the user disagrees with the system's recommendation.** When Building recommends a rollback and the user wants to advance instead, or when Building halts at a gate and the user wants to force advance, the override surface has not been specified.

5. **Confidence categorization in the morning-after artifact.** The user named "known-working vs. maybe-working" based on whether tasks have integration/walkthrough test coverage vs. unit-only coverage. The exact categorization rules are not specified — what counts as integration coverage, what threshold puts a task in "known-working," whether there are more than two categories.

6. **Granularity of state-file persistence.** Validator outputs and gate-passage records are committed files — but in what structure, with what naming convention, in what folder layout? `.building/runs/<run-id>/` was sketched; the full layout is not specified.

7. **What the system does on its first run against a project that doesn't yet have a `.building/` directory.** Bootstrap behavior is unspecified.

## What the User Can Do When This Ships

Run an overnight build of significant scope (8-10 hours, hundreds of tasks across multiple milestones) from a phone-attachable Claude Code session, with confidence that failure modes are being caught and handled at the cheapest tier during the run, and wake up to a morning-after summary that tells them efficiently whether the work is worth reviewing now or whether something needs their judgment before review can proceed.

## Termination

Default termination (Medium). The user judged the conversation had produced sufficient resolution to hand off to the pipeline. Several open assumptions remain, all of which were deliberately routed forward to product-agent rather than resolved in the brief.

## Notes for Downstream Agents

This brief is unusual in that it carries pre-resolved engineering thinking — the architectural option space was explored before the brief was written. The companion `architecture-notes.md` captures that thinking and is intended for swe-agent at the XRD-writing stage. Product-agent should not read `architecture-notes.md` while writing the PRD; the PRD should be written from user-facing intent, not from pre-baked architectural conclusions. Architecture-notes exists to prevent swe-agent from re-deriving (and possibly re-litigating) architectural decisions already settled.

This is a deliberate inversion of the pipeline's normal sequencing — the work was done architecture-first because the project is fundamentally about architecture (governance machinery for an existing pipeline). The user has named this as a new failure-mode-of-the-pipeline ("Sequence Inversion") worth adding to the catalog: when the work is fundamentally about architecture rather than feature behavior, running intent → requirements → architecture produces frame-locked requirements that fight the architecture. The fix is to run intent ↔ architecture first, then product-agent against the resulting brief.

## Starting Policy: Failure-Mode-to-Tier Table

This is a Decision Log entry, not a separate artifact. It will be refined as real cases surface edges.

**Inner loop (during task execution) — Tier 2 (autonomous fix):**

- Test Cheat — reject weak assertions, send back with assertion specifics
- Loop of Despair — auto-revert after 3 attempts, surface reframe prompt; if 3 more fail, escalate Tier 3
- Scope Creep — revert out-of-scope files, retry with constraint explicit
- Ghost Refactor — revert refactor, retry. Note: if there was a defensible reason, it should have been an escalation, not a side effect — so by definition Ghost Refactor as detected is unjustified.
- Clean Slate Bias — revert new duplicate code, point at existing implementation, retry
- Dependency Grab — revert added dependency unless justified in task contracts

**Middle loop (across tasks and sessions) — mostly Tier 2:**

- Context Amnesia — point agent at the documented decision, correct
- Heresy (surface) — remove ghost references mechanically
- Heresy (deep) — Tier 2 if kill is unambiguous; Tier 3 if the deep heresy reveals possible decision-reconsideration
- Precondition Ghost — create new task for the missing precondition, block dependent task
- Closed-Loop Build — Tier 3, requires adding a quality-bar task (planning decision)
- Confidence Bluff — harness verifies claim deterministically; if claim false, send back with specifics
- Heroic Unblock — revert out-of-scope work, mark original task blocked, route unblocking as separate task
- Process Drift — verify git state, agent corrects

**Outer loop (architectural) — mostly Tier 3 (human judgment):**

- Frame Lock-In — Tier 3, frame-shift protocol applies
- Architecture Mirror — Tier 3, architectural redesign required
- Lossy Middleman — Tier 3, architectural revision required
- Premature Abstraction — Tier 2 if removal is simple; Tier 3 if removal requires rework
- Unoptimized Default — Tier 2 caught by performance-agent post-milestone for well-defined fixes; Tier 3 if architectural
- Spec Without Shoes — Tier 3, PRD revision required
- Big Bang Integration — Tier 3, re-decomposition required
- Accumulating Fragility — Tier 3, SDM post-milestone surfaces refactor recommendations

The table starts here and earns its edges through real overnight runs.
