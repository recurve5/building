# Roadmap

Open design questions for the building system, extracted from the original north-star vision document. The operational parts of that document — the three-loop model as a diagnostic, context scoping rules, the insight/implication interface between loops, the system maturity model, and all role definitions — have been absorbed into `orchestrator.md`, the agent prompts, `CLAUDE.md`, and `decisions.md` (Decisions 17, 18). What remains here are questions that haven't been built yet. These are not specs. They are unresolved questions that will become specs when the system's usage reveals their shape.

## Open Items

### SDM and SrSDM Role Separation

**Question:** The SDM agent exists but currently covers both middle-loop (cross-task coherence) and outer-loop (architectural fitness) functions. Should these be separate agents with separate context scoping — an SDM that synthesizes across tasks within a milestone, and a SrSDM that evaluates architectural fitness across milestones?

**What exists today:** A single `prompts/sdm-agent.md` that runs at three trigger points (pre-XRD, post-milestone, mid-build). The orchestrator routes it to the right context at each point. The peer reviewer also performs some outer-loop evaluation during Stage 5.

**What would trigger building it:** The SDM's mid-build synthesis and its post-milestone reassessment start requiring conflicting context — one needs task-level detail, the other needs milestone-level signals. If the orchestrator finds itself scoping the SDM's context differently enough at these two points that they're effectively different agents sharing a prompt, the split is overdue.

### Multi-Agent Conversation Protocol

**Question:** When two agents need to resolve something together (e.g., SDM and product-agent during a mid-build escalation), what structure governs their exchange? Currently all inter-agent communication is mediated by the orchestrator passing documents. What happens when the resolution requires back-and-forth?

**What exists today:** The pushback loop (Stage 4) is the closest model — the orchestrator relays positions between product-agent and swe-agent. But each exchange is a single round: pushback item → response → resolution. There's no protocol for multi-round exchanges where the first response doesn't resolve the issue.

**What would trigger building it:** A pushback loop or mid-build escalation where the orchestrator has to relay more than two rounds between agents to reach resolution. One extra round is normal. Three rounds means the protocol is missing structure that would let agents converge faster.

### Stratified Decision Logs

**Question:** Should each loop level maintain its own decisions at its own granularity? Task-level decisions (Tier 1-2) are currently logged in task Completed sections and consolidated into a single `DECISIONS.md`. Cross-milestone architectural decisions live in the same file as variable-naming-level choices.

**What exists today:** A single `decisions.md` organized by scope tier (Foundational Tenets, Operational Decisions, Build Process Mechanics) rather than by loop level. Decision 24 established that task-agents log in Completed sections and the orchestrator consolidates at wave boundaries.

**What would trigger building it:** `DECISIONS.md` in a project exceeds ~100 entries and agents start receiving irrelevant decisions in their context because the file is too large to scope effectively. Or: the orchestrator finds itself filtering decisions by loop level when scoping agent context, meaning the stratification is happening informally and should be formalized.

### Deep Archiving — Decisions to Tenets

**Question:** When does a decision graduate to a tenet? What's the mechanism for recognizing that a decision has been tested across enough projects and never challenged? Who decides, and what's the format for the tenet layer?

**What exists today:** `decisions.md` has a Foundational Tenets tier and `CLAUDE.md` has core principles. Decisions 20, 21, 22 were elevated to the tenets tier manually after the Nacre 0.5 build cycle. The Tier 3 Pattern Review in `orchestrator.md` describes the Tier 3 → Tier 2 promotion but not the Tier 2 → tenet promotion.

**What would trigger building it:** Three or more projects produce the same Tier 2 decision independently. At that point the decision is a tenet — it's been tested across contexts and consistently held. The trigger is pattern recognition across the decisions logs of multiple projects.

### Implementation Substrate

**Question:** Is the orchestration layer Claude Code sub-agents, a custom orchestrator process, Claude Desktop with manual orchestration, or something else? The role definitions and context contracts are substrate-independent. The orchestration — actually spinning up agents with scoped context, enforcing gates, managing parallel execution — is not.

**What exists today:** Manual orchestration via Claude Code. The human pastes the starter prompt, the orchestrator runs in a single Claude Code session, and agent "spin-ups" are instructions within that session's context window. True context isolation (fresh context windows per agent) happens only when the human starts a new session.

**What would trigger building it:** The orchestrator consistently needs to spin up agents that require context isolation the current substrate can't provide — specifically, when an inner-loop agent's work is measurably degraded by outer-loop context bleeding into its session. See `docs/automation.md` for the gate runner spec that addresses part of this.

### build-process.md and orchestrator.md Overlap

**Question:** Both files describe the 10-stage pipeline in detail with slightly different framing. Should one become the reference document (stage definitions, gate criteria, walkthrough protocols) while the other becomes the operational playbook (how to run the pipeline, context scoping, agent routing)?

**What exists today:** `orchestrator.md` is what agents consume — the orchestrator reads it at session start. `docs/build-process.md` is the human-readable reference with additional context on handoff protocols, existing codebase guidance, and the writing pipeline. No agent prompt references `docs/build-process.md`. Both files describe the same stages with the same gates, creating a maintenance burden where updates to one may not propagate to the other. `orchestrator.md` is authoritative when they diverge.

**What would trigger building it:** A divergence between the two files causes a missed gate or a misunderstanding — an agent follows orchestrator.md's version of a stage while a human follows build-process.md's version and they produce different results. Until that happens, add a note to the top of `docs/build-process.md`: "The orchestrator's operational version of this pipeline is in `orchestrator.md`. If they diverge, `orchestrator.md` is authoritative."

### Guardrails as a Standard Project File

**Question:** Should every project targeting an existing codebase produce a `guardrails.md` as a standard file, separate from the project CLAUDE.md?

**What exists today:** The `build-process.md` "Working Against an Existing Codebase" section says the project CLAUDE.md must include a guardrails section covering deployment process, off-limits files, rollback plan, testing baseline, and concurrent work. In practice, a user building against the Chessalyz codebase pulled these into a standalone `guardrails.md` that every task agent reads. The result was cleaner — the project CLAUDE.md stayed focused on pipeline state and decisions, while the guardrails lived in their own document with a single purpose: tell every agent what not to break.

The guardrails doc becomes important at a specific threshold: **when the codebase has areas where a mistake has consequences the build process can't undo.** Stripe integration, auth flows, production databases, payment webhooks, infrastructure configuration. A project that only touches its own new files doesn't need guardrails — the rollback is "delete what you built." A project that modifies files shared with payment logic, user authentication, or production data pipelines does. The guardrails doc is the difference between "the agent knows not to touch Stripe" and "the agent refactored a file that happens to import Stripe utilities."

A guardrails doc also matters when the person running the build is not the codebase owner. If Rhea is building against Varun's codebase, the guardrails encode Varun's constraints so every agent session respects them without Varun being present. The CLAUDE.md is the builder's file — it tracks what's been built and what's next. The guardrails are the owner's file — they say what's sacred.

**What would trigger building it:** A second project where the guardrails section of the CLAUDE.md gets long enough that it competes with pipeline state for attention, or where an agent modifies an off-limits file because the guardrail was buried in a larger document. The Chessalyz project is the first data point. One more confirms the pattern.

**If formalized, the guardrails doc would cover:**
- Deployment process (how code gets to production, who approves)
- Off-limits files and directories (with specific paths, not categories)
- Rollback plan (what happens when a change breaks production)
- Testing baseline (what tests exist, current pass rate, what a regression looks like)
- Concurrent work (other developers, other branches, other agents touching the same files)
- Scope constraint (what this project does and does not touch, stated as boundaries not aspirations)

**Relationship to existing framework files:** The guardrails doc would be referenced in every task's Context field alongside the project CLAUDE.md, DECISIONS.md, and DAY-ZERO.md. The task agent reads it before writing code. The orchestrator checks scope compliance against it during gate checks. The SDM references it during codebase assessment to identify which areas the project must avoid.
