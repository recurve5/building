# Build Process

*The orchestrator's operational version of this pipeline is in `orchestrator.md`. If they diverge, `orchestrator.md` is authoritative.*

The full pipeline from idea to shipped code. This document also covers how work moves between roles (handoff protocol) and how context persists across sessions (context management).

## The Pipeline

### Stage 0: Milestone Decomposition

Before the pipeline runs, the brief is decomposed into milestones. The product-agent reads the idea brief and proposes milestones — each one a unit of work that produces software the user can touch.

Each milestone is independently valuable. "Support .docx files" is a milestone. "Support .docx, .xlsx, .pptx, resize images, and add ingestion transparency" is a brief containing five milestones. Each milestone gets its own pipeline pass: PRD, XRD, peer review, test plan, tasks, build, smoke test.

Milestones are sequenced so integration-revealing work goes first. The milestone most likely to stress system-level constraints (context budget, wiring, performance) ships before feature-additive milestones. This means integration bugs surface at the first milestone, when the blast radius is smallest and the fix is cheapest.

For simple briefs — a bug fix, a single feature, a configuration change — Stage 0 produces one milestone equal to the brief. Do not manufacture artificial decompositions for naturally atomic work.

Input: idea brief.
Output: milestone list with sequencing rationale.
Handoff: human confirms. Stages 1-8 run per milestone.

### Stage 1: Idea Brief

A one-page document — sometimes less — that describes what you want to build. It can include screenshots of reference apps, a description of the problem, a rough feature list, or just a paragraph about what the product should feel like to use.

The idea brief is informal. It exists to give the Product Maker enough to write a PRD. It does not need to be complete. It does need to be honest about what matters and what you actually care about.

Input: your thinking.
Output: a document or conversation that a Product Maker can work from.
Handoff: Product Maker reads the brief and writes the PRD.

### Stage 2: PRD

The Product Maker writes a PRD following `product-maker.md`. The PRD makes decisions that matter to both the user and the developer. It includes a Decisions Log.

Input: idea brief.
Output: PRD with Decisions Log. For UI products, the PRD must include a First-Use Walkthrough section — a step-by-step walk through the user's first session from launch through first meaningful action, including empty states, configuration discovery, and failure paths. See `prompts/product-agent.md` for the full spec.
Handoff: PRD is passed to the SWE for the XRD. The PRD document is the input — not a summary of it, not a conversation about it, the actual document.

### Stage 3: XRD

The SWE writes an Engineering Response Document following `swe.md`. The XRD responds to the PRD with architecture, open questions, pushback, and a build plan broken into concurrent tracks.

If the project has quality bar examples (smoke tests, reference outputs, sample deliverables), the XRD must include a **Quality Bar Trace**: one concrete example traced forward through the proposed architecture to verify the output stage receives sufficient data to reproduce it. See `swe.md` for the full protocol. If the trace reveals a cost-quality tradeoff (e.g., compressing raw data to reduce API costs at the expense of output depth), the tradeoff is stated explicitly and escalated to the Product Maker before task decomposition begins.

Input: PRD (the document).
Output: XRD with architecture, open questions, build plan.
Handoff: PRD + XRD are passed to the Peer Reviewer and the Tester simultaneously.

### Stage 4: Peer Review

The Peer Reviewer reads the PRD and XRD as a matched set, following `peer-reviewer.md`. The review surfaces contradictions, gaps, and judgment calls.

Input: PRD + XRD (both documents).
Output: Peer Review with issues table and recommendations.
Handoff: Product Maker resolves high-severity issues and updates the Decisions Log. SWE updates the XRD if architecture changes.

### Stage 5: Test Plan

The Tester writes a test plan following `tester.md`. The PRD is the source of truth for product intent. The XRD is consulted for implementation-revealed edge cases — integration boundaries, architecture constraints, timing issues — but does not override PRD-driven coverage. Test cases sourced from the XRD rather than the PRD are tagged [XRD].

Input: PRD (primary) + XRD (supplementary).
Output: Test plan with automatable test cases.
Handoff: Test plan becomes an input to task decomposition. Tests are the acceptance criteria.
Transition criteria: every PRD feature section has at least one corresponding test case.

### Stage 6: Task Decomposition

Before writing task files, the SWE produces a `DAY-ZERO.md` document in the project root. This document contains every shared interface, schema, and convention that cross-track tasks depend on — function signatures, JSON schemas, protocol definitions, enum shapes, naming conventions. Task files may not reference a contract that isn't in DAY-ZERO.md.

After DAY-ZERO.md is reviewed, the SWE decomposes each phase into agent-executable task files following `task-template.md`. Each task has a clear scope, input, output, acceptance criteria, and test that proves done. At least one task — typically an integration milestone or the final output task — must include acceptance criteria that reference the quality bar examples directly. Not "does the pipeline run?" but "does the output match the reference examples in pattern depth, cross-entity relationships, and analytical quality?" If no task's acceptance criteria mention the quality bar, the build loop is closed and the quality bar is outside it (see `agent-failure-modes.md`, "The Closed-Loop Build").

After task files are written, run a **user-story walkthrough**: start from an empty directory (or an empty machine, if the project has infrastructure prerequisites) and walk through every step a developer would take to reach the first task's acceptance criteria. Every precondition — installed tools, created directories, configuration files, scaffolding — must trace to either a prior task or explicit documentation. If a precondition is orphaned (no task creates it, no doc explains it), add a task.

> **Insight:** Task decomposition from the engineering perspective starts from the architecture and works down. It misses preconditions that are only visible when walking the user story from zero — project scaffolds, tool installation, configuration that "everyone knows" but no task creates.
> **Implication:** A single walkthrough from empty directory to first working test catches an entire class of gaps that no amount of architectural review surfaces.
> **Decision:** User-story walkthrough is a required verification step after task decomposition, before any build work begins.

For existing codebases, task decomposition must also consider **deployment boundaries**. Each task should be independently deployable — shippable as its own PR without requiring other tasks to land simultaneously — or explicitly grouped with other tasks into a deployment unit. A task that can only ship bundled with three other tasks is a risk signal: it means testing and rollback are coupled across a larger surface. When a task can't be independently deployed, the task file states which other tasks it must ship with and why.

**Scaling signal:** If task decomposition produces more than ~30 tasks, or if writing task files requires making architectural decisions the XRD didn't anticipate, the project may have outgrown a single XRD. The sign is that task decomposition feels like architecture work — you're deciding how subsystems interact, not just breaking known work into units. When this happens, stop decomposing. The XRD needs to be split into subsystem specs first, each with its own task set, its own DAY-ZERO contracts, and explicit contracts between subsystems. The current framework then operates per-subsystem. This is not a failure — it's the project telling you its actual shape.

Input: XRD build plan + test plan + peer review resolutions.
Output: `DAY-ZERO.md` + task files in `tasks/` directory.
Handoff: Tasks are ready for agents to execute.
Transition criteria: every task file references only contracts defined in DAY-ZERO.md, every acceptance criterion maps to a test in the test plan, and the user-story walkthrough passes with no orphaned preconditions.

### Stage 7: Build

Agents execute tasks. One at a time (sequential) or multiple in parallel (concurrent). Each task is self-contained. The agent reads the task file, the CLAUDE.md, and the project context. It builds, tests, and reports done.

When a task is complete, the agent reports not just "done" but what it learned. Every completed task includes an insight/implication note: what building this revealed that wasn't in the spec, and what that means for upcoming tasks or for the project as a whole. This is how the build process generates intelligence, not just code.

Input: task file + project codebase + CLAUDE.md.
Output: working, tested code + insight/implication note.
Handoff: Product Maker reviews the increment. Decisions Log updated if anything changed. Insight/implications feed forward into upcoming task files.

### Stage 8: Smoke Test

After each milestone's tasks are complete and tests pass, the product is verified against that milestone's PRD First-Use Walkthrough. The walkthrough was written before code existed (Stage 2). Now the product exists. Each step in the walkthrough is executed against the running product to verify the user experience matches the specification.

For UI products, the orchestrator runs the walkthrough using Playwright MCP — opening a real browser, navigating pages, clicking elements, typing inputs, reading responses, and taking screenshots as evidence. The human's role is to start the server and provide the URL. Everything else is automated.

For steps that require evaluating model responses (e.g., "does the product demonstrate knowledge of the user's documents"), the agent captures the full response text and judges whether it demonstrates real knowledge or just echoes filenames. The agent is a model — it can evaluate quality, not just presence.

The smoke test runs per milestone, not per brief. Each milestone produces working software. Each milestone's smoke test verifies that software works. The next milestone does not begin until the current milestone's smoke test passes.

After each milestone's smoke test, the SDM reassesses the codebase — reading the smoke test results, completed task files, and codebase diff to produce an updated context document for the next milestone's SWE. This catches integration problems and architectural drift between milestones.

This stage exists because of a structural gap discovered across four Nacre build cycles: every cycle passed all tests, every cycle failed when a user sat down with the product. Tests verify code against the spec. The smoke test verifies the product against the user. Both are required.

Input: running product + PRD First-Use Walkthrough + Playwright MCP tools.
Output: smoke test report with pass/fail per walkthrough step and screenshot evidence.
Handoff: if all steps pass, the milestone is complete. SDM reassesses the codebase for the next milestone. If any step fails, it becomes a bug report and feeds back into Stage 7 as a fix task.
Transition criteria: every walkthrough step can be completed in the running product. For non-UI products, bash commands replace Playwright — the protocol is the same, only the interaction mechanism differs.

## Working Against an Existing Codebase

The pipeline above assumes greenfield — an empty directory, no users, no production traffic. When the project targets an existing codebase, every stage still applies, but the context is different and the risk profile is higher. You are not building from nothing. You are changing something that already works, that other people may depend on, and that you can break.

### Guardrails in the Project CLAUDE.md

Before any build work begins on an existing codebase, the project CLAUDE.md must include a guardrails section. This section answers:

- **What is the deployment process?** How does code get from a branch to production? Who approves? What gates exist (CI, staging, manual review)?
- **What is off-limits?** Files, directories, services, or infrastructure that this project must not touch. Name them explicitly.
- **What is the rollback plan?** If a change breaks production, how do you undo it? Feature flags, revert commits, database rollback scripts?
- **What is the testing baseline?** What tests already exist? What is the current pass rate? A change that reduces the pass rate is a regression, not a feature.
- **Who else is working here?** Other developers, other agents, other active branches. Concurrent work on the same codebase requires coordination.

If you don't know the answers, find out before writing the PRD. The discovery is part of Stage 1.

### Discovery Before the PRD

For existing codebases, the idea brief stage expands to include a codebase survey. Before the Product Maker writes the PRD, the SWE (or the same person wearing the SWE hat) maps:

- **What exists** — the relevant parts of the current architecture, data model, and dependencies.
- **What's fragile** — areas with no tests, tightly coupled components, code that hasn't been touched in a long time.
- **What the change surface looks like** — which files and systems the proposed changes will touch. The smaller the surface, the safer the change.

This survey doesn't need to be exhaustive. It needs to be honest about what you understand and what you don't. The PRD and XRD are written against this understanding, not against an assumption that you're starting clean.

### Bias Toward Minimal Change

In an existing codebase, the default is to touch as few files as possible and prove the change works before expanding scope. A working system has earned the benefit of the doubt. Rewrites, refactors, and structural changes require justification beyond "this could be better" — they need a concrete problem statement tied to the current project's goals.

This is the existing-codebase counterpart to Decision #8 (abstractions must be earned): changes to working code must be earned too.

## Decision Kill Protocol

When a decision kills an idea — a Hard Kill, not a deferral — logging the decision in DECISIONS.md is not enough. The kill triggers an immediate purge of all references to the dead idea across every document and every source file.

**Hard Kill vs. Deferred**

- **Hard Kill**: The idea is permanently dead. Tag the DECISIONS.md entry with `[HARD KILL]`. Then immediately search all project documents (PRD, XRD, test plan, task files, CLAUDE.md) and all source code for the idea's specific terminology. Delete every reference. If the purge touches a file outside the current task scope, do it anyway — this is the one exception to the one-task-one-change rule, because leaving a ghost is worse than a scope violation.
- **Deferred**: The idea is valid but out of scope for now. Tag the DECISIONS.md entry with `[DEFERRED]`. Surviving references in other documents must be tagged with the deferral decision number (e.g., `[Deferred — Decision #22]`) so they're recognizable as intentional. An untagged reference to a deferred idea is a ghost.

**Heresy Inspection**

Before beginning any significant build phase, run a Heresy inspection:

1. Read DECISIONS.md. Extract every entry tagged `[HARD KILL]`.
2. For each Hard Kill, identify the key terminology: class names, field names, feature names, any phrasing unique to the rejected idea.
3. Search all documents and source code for that terminology.
4. Any hit that is not the DECISIONS.md kill entry itself is a ghost. Remove it.

This inspection takes minutes and prevents the failure mode described in `agent-failure-modes.md` as "The Heresy."

## Rework Pattern

When a completed task is found to be wrong — not incomplete, but producing incorrect behavior that passed its original tests — the rework follows a specific pattern. This is distinct from a bug fix on in-progress work. Rework applies when a task was marked `done`, its Completed section was written, and the error was discovered later.

1. **The rework gets its own task file.** The original task's Completed section reflects what was built at the time and is not rewritten. The append-only principle applies — history is not revised.
2. **The rework task references the original:** `Rework of: Task [N]` in the header, with a clear statement of what the original task got wrong.
3. **The original task gets an annotation** in its Completed section: `[Rework — see Task [M]]`. This is the only modification to the original task file.
4. **The rework task's acceptance criteria include both the corrected behavior AND a regression check** that the original task's other acceptance criteria still pass. The fix must not break what was already working.
5. **The Completed section on the rework task captures the insight** about what the original task got wrong and why the original tests didn't catch it. This insight is high-value — it reveals a gap in either the test plan, the acceptance criteria, or the task decomposition that can be applied forward to prevent the same class of error.

This pattern preserves traceability while keeping the task sequence honest about what happened when. A project's task history should read as a truthful record, not a revised narrative.

## Handoff Protocol

Every handoff between stages follows two rules:

**Pass the document, not a summary.** When the SWE writes an XRD, they read the PRD document. Not a verbal summary. Not highlights from a conversation. The document. This is because the document contains decisions and specifics that conversations lose. It also means the receiving role can audit their own understanding against the source.

**The output of each stage lives in a file.** PRD is a file. XRD is a file. Peer Review is a file. Test Plan is a file. Tasks are files. Decisions Log is a file. Nothing critical exists only in a conversation. Conversations are how you think. Files are how you build.

**Stage transitions are explicit.** When a stage is complete, the person (or agent) who completed it states: "Stage N is done. The output is [filename]. The next stage is [N+1]. The input for that stage is [list of files]." This prevents drift.

## Role Independence When Agents Fill All Roles

When one person or one agent plays multiple roles, each role must still produce independent judgment. The Peer Review is the most vulnerable stage — if the same agent that wrote the XRD also reviews it, the review degenerates into self-validation.

**The rule:** The Peer Review must be a separate session with a separate context load. The reviewing agent reads the PRD and XRD as documents. It does not have access to the conversation or reasoning that produced them. If the same human plays Product Maker, SWE, and Peer Reviewer, each hat-change starts from the documents, not from memory of writing them.

This applies to any role transition where the second role is meant to catch errors the first role introduced. SWE→Peer Reviewer, Product Maker→Tester, SWE→Tester. The independence is the value. Without it, the role is theater.

## Inter-Role Communication

Roles talk to each other before escalating to the human. The human is the boss, not the bus.

### The Principle

When a role encounters ambiguity, contradiction, or a needed decision, the first move is to ask the role that owns the relevant claim. The human only gets involved when roles disagree, when the decision requires cross-project judgment, or when a tradeoff meets escalation criteria.

### Who Talks to Whom

**SWE finds PRD ambiguity → asks Product first.** Frame it with options and product-level tradeoffs: "The PRD says 'fast' but doesn't define a number. Option A gets sub-200ms with a cache layer. Option B gets sub-500ms and is simpler. Can you give me a product reason to choose?" Only escalate to the human if Product can't resolve it.

**Tester finds contradiction → routes to the claim owner first.** If the PRD says "works offline" and the XRD says "requires network," the Tester asks Product to clarify intent. If the XRD's migration strategy has a gap, the Tester asks SWE to resolve. The other role is cc'd but the owner responds first. See `tester.md` for the full routing protocol.

**Product names a technology → SWE can override if the rationale isn't user-facing.** See `product-maker.md` for the technology-in-PRD rule. If the SWE overrides, they state the tradeoff in product terms so Product can evaluate.

**SWE makes an implementation choice → includes a tradeoff statement.** Every non-trivial choice covers user-facing consequence, maintenance burden, and refactoring risk. Product reads the tradeoffs and flags what feels material. See `swe.md` for the full protocol.

**Tester finds contradiction → routes to the claim owner first.** The Tester reads the PRD and XRD against behavioral expectations and is often the first to discover contradictions neither document sees on its own. If the PRD says "works offline" and the XRD says "requires network," the Tester asks Product to clarify intent. If the XRD's migration strategy has a gap, the Tester asks SWE to resolve. The other role is cc'd but the owner responds first. Contradictions that neither role can resolve escalate to the human with both positions stated. See `tester.md` for the full routing protocol.

### Escalation Criteria

A decision surfaces to the human when:

- **Roles disagree on materiality.** Product thinks a tradeoff matters. SWE doesn't. Or vice versa.
- **Refactoring risk is non-trivial.** The choice creates a foundation that's expensive to undo if the product direction changes.
- **The tradeoff crosses project boundaries.** Only the human sees the full roadmap across projects.
- **Neither role can resolve the contradiction.** It requires a judgment call about product direction, resource allocation, or strategic priority.

These are judgment calls, not formulas. The bias is always to surface rather than suppress.

## Context Management

### The Problem

Every AI session starts with a blank context. The agent doesn't remember yesterday's decisions, last week's architecture discussion, or the open questions from the peer review. Without explicit context management, every session starts cold and you re-explain things.

### The Solution: Files, Not Memory

Everything that matters lives in a file. The CLAUDE.md is the index. Project-specific context layers on top.

**Master context** (`~/building/CLAUDE.md`): Building philosophy, role definitions, process, quality bar. Symlinked or referenced from every project.

**Project context** (project-root `CLAUDE.md`): Project-specific decisions, architecture summary, current status, what's been built, what's next. This file is updated after every work session.

**Decisions Log** (`DECISIONS.md`): Every resolved question with rationale and date. Agents read this before making architectural choices.

**Task files** (`tasks/`): The current state of the build. Which tasks are done, which are in progress, which are next.

### Updating Context After Each Session

At the end of every work session, update the project CLAUDE.md with:

- What was built
- Decisions made during the session (also added to DECISIONS.md)
- Open questions that surfaced
- What the next session should start with

This takes five minutes and saves thirty minutes of re-orientation in the next session.

## Loop Discipline

The build process operates at three timescales — inner loop (task execution, minutes), middle loop (cross-task coherence, hours to days), and outer loop (architectural fitness, weeks to months). See `docs/roadmap.md` for open design questions about how these loops may become distinct operating modes with separate context, process, and gates.

The current operating principle, applicable now regardless of whether the full loop model is implemented:

**When an agent encounters a problem that requires context outside its task's declared scope, it does not pull in additional files to resolve it.** Instead:

1. State what was encountered
2. State what context would be needed to resolve it
3. Write an escalation note (to OPEN-ITEMS.md or as a structured output)
4. Continue with what can be completed within scope
5. Stop when further progress requires the missing context

The escalation is routed by the Peer Reviewer (see `peer-reviewer.md`, Orchestration). The Peer Reviewer decides whether to provide the missing context, route the issue to Product, or escalate to the human.

This is the "hand off instead of pull in" behavior. It fights the RL-trained instinct to pull more context and resolve. An agent that stops and writes an escalation is not giving up — it is respecting the boundary between loops and trusting that the right context will arrive through the right channel.

### Multi-Project Context

When building multiple projects simultaneously, each project has its own CLAUDE.md and its own tasks directory. The master `~/building/` files are shared. Do not cross-pollinate project-specific decisions. If a pattern emerges that applies across projects, add it to the master files.

### The Symlink Pattern

```bash
# Each project references the master building philosophy
# Option A: Symlink (Claude Code reads CLAUDE.md from project root)
ln -s ~/building/CLAUDE.md ~/nacre/CLAUDE.md

# Option B: Project CLAUDE.md references the master
# First line of ~/habitai/CLAUDE.md:
# "Read ~/building/ files first. They define the build process."
# Then project-specific context below.
```

Option B is better for most cases because the project CLAUDE.md will also contain project-specific context that differs between projects.

## Writing Pipeline

The code pipeline (PRD → XRD → Peer Review → Test Plan → Tasks → Build) has a parallel for prose output. Every document this system produces — PRDs, XRDs, briefs, essays, external communications — is read by humans. The writing quality bar applies.

### Stages

**Stage 1: Draft.** Write the document following the relevant role definition. PRDs follow `product-maker.md`. XRDs follow `swe.md`. Essays and external documents follow the writer's own structure. The draft is the thinking — get the substance right before worrying about the surface.

**Stage 2: Failure modes check.** Run the draft against `writing-failure-modes.md`. The trigger: if it will be read by someone other than you, run the checklist. Fortune cookie test, friend test, em dash count, triplet audit, hedge check, register scan. Fix what the checklist catches.

**Stage 3: Voice pass.** Read it aloud (or read it as if aloud). Does the voice shift where it should? Does it drone? Is the register locked? This is the pass that catches what the checklist misses — the feel of the piece, not just the patterns.

**Stage 4: Publish or hand off.** The document enters the build pipeline (PRDs go to SWE, XRDs go to Peer Review) or ships externally.

### Which Documents Go Through the Pipeline

- **Always:** Essays, blog posts, cold outreach, anything published externally. Full pipeline, no shortcuts.
- **Always, abbreviated:** PRDs, XRDs, Peer Reviews, test plans. Stage 2 (failure modes check) is required — these are read by developers and agents who will build from them. Unclear writing in a PRD becomes ambiguous code. Stage 3 (voice pass) is optional for internal documents but recommended when the document will be referenced across multiple sessions.
- **Skip:** Task files, DECISIONS.md entries, OPEN-ITEMS.md notes. These are working documents. Clarity matters; polish does not.
