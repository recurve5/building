# Build Process

The full pipeline from idea to shipped code. This document also covers how work moves between roles (handoff protocol) and how context persists across sessions (context management).

## The Pipeline

### Stage 1: Idea Brief

A one-page document — sometimes less — that describes what you want to build. It can include screenshots of reference apps, a description of the problem, a rough feature list, or just a paragraph about what the product should feel like to use.

The idea brief is informal. It exists to give the Product Maker enough to write a PRD. It does not need to be complete. It does need to be honest about what matters and what you actually care about.

Input: your thinking.
Output: a document or conversation that a Product Maker can work from.
Handoff: Product Maker reads the brief and writes the PRD.

### Stage 2: PRD

The Product Maker writes a PRD following `product-maker.md`. The PRD makes decisions that matter to both the user and the developer. It includes a Decisions Log.

Input: idea brief.
Output: PRD with Decisions Log.
Handoff: PRD is passed to the SWE for the XRD. The PRD document is the input — not a summary of it, not a conversation about it, the actual document.

### Stage 3: XRD

The SWE writes an Engineering Response Document following `swe.md`. The XRD responds to the PRD with architecture, open questions, pushback, and a build plan broken into concurrent tracks.

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

After DAY-ZERO.md is reviewed, the SWE decomposes each phase into agent-executable task files following `task-template.md`. Each task has a clear scope, input, output, acceptance criteria, and test that proves done.

Input: XRD build plan + test plan + peer review resolutions.
Output: `DAY-ZERO.md` + task files in `tasks/` directory.
Handoff: Tasks are ready for agents to execute.
Transition criteria: every task file references only contracts defined in DAY-ZERO.md, and every acceptance criterion maps to a test in the test plan.

### Stage 7: Build

Agents execute tasks. One at a time (sequential) or multiple in parallel (concurrent). Each task is self-contained. The agent reads the task file, the CLAUDE.md, and the project context. It builds, tests, and reports done.

When a task is complete, the agent reports not just "done" but what it learned. Every completed task includes an insight/implication note: what building this revealed that wasn't in the spec, and what that means for upcoming tasks or for the project as a whole. This is how the build process generates intelligence, not just code.

Input: task file + project codebase + CLAUDE.md.
Output: working, tested code + insight/implication note.
Handoff: Product Maker reviews the increment. Decisions Log updated if anything changed. Insight/implications feed forward into upcoming task files.

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

## Handoff Protocol

Every handoff between stages follows two rules:

**Pass the document, not a summary.** When the SWE writes an XRD, they read the PRD document. Not a verbal summary. Not highlights from a conversation. The document. This is because the document contains decisions and specifics that conversations lose. It also means the receiving role can audit their own understanding against the source.

**The output of each stage lives in a file.** PRD is a file. XRD is a file. Peer Review is a file. Test Plan is a file. Tasks are files. Decisions Log is a file. Nothing critical exists only in a conversation. Conversations are how you think. Files are how you build.

**Stage transitions are explicit.** When a stage is complete, the person (or agent) who completed it states: "Stage N is done. The output is [filename]. The next stage is [N+1]. The input for that stage is [list of files]." This prevents drift.

## Inter-Role Communication

Roles talk to each other before escalating to the human. The human is the boss, not the bus.

### The Principle

When a role encounters ambiguity, contradiction, or a needed decision, the first move is to ask the role that owns the relevant claim. The human only gets involved when roles disagree, when the decision requires cross-project judgment, or when a tradeoff meets escalation criteria.

### Who Talks to Whom

**SWE finds PRD ambiguity → asks Product first.** Frame it with options and product-level tradeoffs: "The PRD says 'fast' but doesn't define a number. Option A gets sub-200ms with a cache layer. Option B gets sub-500ms and is simpler. Can you give me a product reason to choose?" Only escalate to the human if Product can't resolve it.

**Tester finds contradiction → routes to the claim owner first.** If the PRD says "works offline" and the XRD says "requires network," the Tester asks Product to clarify intent. If the XRD's migration strategy has a gap, the Tester asks SWE to resolve. The other role is cc'd but the owner responds first. See `tester.md` for the full routing protocol.

**Product names a technology → SWE can override if the rationale isn't user-facing.** See `product-maker.md` for the technology-in-PRD rule. If the SWE overrides, they state the tradeoff in product terms so Product can evaluate.

**SWE makes an implementation choice → includes a tradeoff statement.** Every non-trivial choice covers user-facing consequence, maintenance burden, and refactoring risk. Product reads the tradeoffs and flags what feels material. See `swe.md` for the full protocol.

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
