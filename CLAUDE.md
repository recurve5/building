# CLAUDE.md — Master Build File

This file defines how I build software. Every project inherits from this. Project-specific CLAUDE.md files layer on top but never contradict what's here.

Read the files in `~/building/` before starting any work. They define the roles, the process, and the quality bar.

## Core Principles

**Decisions are final.** Once a decision is documented with rationale, it does not get revisited unless new material information surfaces. "I changed my mind" is not new information. "The API we chose doesn't support X and here's why that matters" is. Decisions live in a decisions log in every project. The log is append-only.

**Done means tested.** A task is not complete when the code compiles or the feature renders. It's complete when a test proves it works. If there's no test, it's not done. Unit tests for logic. Integration tests for data flow. UI tests for interaction. The test plan exists before the code.

**Show the resolved version.** Don't narrate the thinking process. Don't explain what you considered and rejected. State the decision, the implementation, and why. If there are meaningful tradeoffs, note them once. Then move on.

**Insight before action.** Every stage of the build process produces insights — patterns, surprises, structural observations — not just outputs. An insight says what we learned. An implication says what that means we should do. Weather reporting ("the streak logic is complex") is not useful. Insight/implication ("the streak logic is the only feature where a bug is invisible at the time it occurs — implication: tests must cover boundary conditions where off-by-one errors produce plausible-looking wrong numbers") changes how you build. Every review, every XRD pushback, every task completion should distinguish between what happened and what it means.

**Ask before guessing.** If a task is ambiguous, stop and ask. Do not make assumptions about product intent, architecture preferences, or scope. A five-second question saves an hour of rework. This applies especially to: adding dependencies not specified in the task, changing files outside the task scope, and rewriting code that works but doesn't match your style preference.

**One task, one change.** Each task produces a coherent, reviewable unit of work. Don't fix unrelated things you notice along the way. Note them and move on. Scope discipline is more important than opportunistic cleanup.

## Decision Tiers

Every choice during a build falls into one of three tiers. When in doubt, err up — a logged decision you didn't need costs one line, an unreviewed decision you needed to know about costs rework.

**Tier 1 — Just do it.** Craft decisions that don't need logging. Variable naming, loop structure, which Swift API to use, test helper organization, formatting choices. The code is the log. Don't clutter DECISIONS.md with implementation minutiae.

**Tier 2 — Do it and log it.** Implementation choices that someone picking up the project tomorrow would need to understand. Add these to `DECISIONS.md` with rationale. Examples: choosing NSLock over an actor for thread safety in a specific context, duplicating code across targets due to a platform constraint, selecting 5 tabs over 4 because the screen justified direct access. The decision is yours to make. The log is so future sessions have context.

**When in doubt between Tier 1 and Tier 2:** Log it. One extra line in DECISIONS.md costs nothing.

**Tier 3 — Surface for review.** Anything that changes product behavior, affects what a user sees or experiences, creates a constraint that other tasks inherit, or crosses task boundaries. Add these to `OPEN-ITEMS.md` in the project root. Do not act on them — continue with the current task and flag the item. Only the Product Maker (me) promotes items from OPEN-ITEMS.md to DECISIONS.md.

Examples of Tier 3: a discovered constraint that changes the data model, a UX question the task spec didn't anticipate, a dependency between tasks that wasn't in the original decomposition, any scope expansion or reduction.

**When in doubt between Tier 2 and Tier 3:** Surface it to OPEN-ITEMS.md. The bias is always up.

## Role Definitions

This project uses a role-based build process. Each role has a definition document in `~/building/`:

- **Product Maker** (`product-maker.md`) — Owns the what and why. Writes PRDs.
- **SWE** (`swe.md`) — Owns the how. Writes XRDs, builds code.
- **Tester** (`tester.md`) — Owns validation. Writes test plans.
- **Peer Reviewer** (`peer-reviewer.md`) — Owns quality gates. Surfaces judgment issues.

These roles may all be played by the same person (me) or by agents. The definitions exist so the thinking is consistent regardless of who executes.

**Roles talk to each other.** When a role encounters ambiguity or contradiction, it asks the role that owns the relevant claim before escalating to the human. The human is the boss, not the bus. See `build-process.md` for the full inter-role communication protocol.

## Build Process

See `build-process.md` for the full pipeline. The short version:

1. Idea (1-page brief, possibly with screenshots or references)
2. PRD (Product Maker)
3. XRD (SWE responds to PRD)
4. Peer Review (surfaces contradictions, gaps, judgment calls)
5. Test Plan (Tester writes automatable validation)
6. Task Decomposition (SWE breaks XRD into agent-executable tasks)
7. Build (agents execute tasks against the task template)

No step is skipped. Steps 2-5 can run fast — hours, not weeks — but the thinking at each stage catches errors the next stage would inherit.

## Quality Bar

**Good enough to ship** means:
- Tests pass
- Another agent could pick up the project tomorrow and understand what's here
- No TODO comments without a linked task
- No dead code from abandoned approaches
- No ghost references to Hard Kill decisions in any document or source file
- The decisions log is current, with Hard Kill and Deferred entries tagged

**Needs another pass** means:
- Tests are missing or test assertions are weak (testing that something "doesn't crash" instead of testing that it produces the right output)
- Architecture choice was made without documenting why
- Files were changed outside the task scope
- Dependencies were added without justification

## Agent Failure Modes

Watch for these. They're the code equivalent of writing problems.

**The test cheat.** Agent makes a test pass by weakening the assertion instead of fixing the code. "Assert not nil" instead of "assert equals expected value." Catch this in review.

**The scope creep.** Agent was asked to build the StreakService and also refactored the data model, added a utility file, and changed the theme colors. Each task, one change.

**The dependency grab.** Agent installs a package to solve a problem that's solvable in 10 lines of native code. No dependencies without explicit approval.

**The confidence bluff.** Agent says "Done" but hasn't run the tests, or ran the tests and is ignoring a failure. "Done" means tests pass. Always verify.

**The context amnesia.** Agent in a later session ignores or contradicts a decision from an earlier session because it's not in the current context window. This is why decisions live in files, not conversation.

**The ghost refactor.** Agent rewrites working code to match its preferred style. If the code works and tests pass, leave it alone unless the task explicitly says refactor.

**The heresy.** A rejected idea left as a fragment in one document gets picked up by a later agent and built into the project alongside the chosen approach. Two competing implementations emerge. The fix: every Hard Kill decision triggers an immediate purge of all references across all documents and code. See `agent-failure-modes.md` for the full protocol.

## File Conventions

- Decisions log: `DECISIONS.md` in project root
- Open items for review: `OPEN-ITEMS.md` in project root
- Day Zero contracts: `DAY-ZERO.md` in project root (required before task files are written)
- Task files: `tasks/` directory, one file per task, numbered sequentially
- Tests: colocated with the code they test, or in a `tests/` directory matching the source structure
- Documentation: `docs/` directory for anything that isn't a task or decision

## Writing Process

The build system covers code. A parallel set of failure modes applies to prose — Substack essays, one-pagers, cold outreach, anything published under your name.

The writing failure modes doc (`~/building/writing-failure-modes.md`) defines the patterns: fortune cookies, token compression jargon, em dash tics, triplet beats, hedge stacking, locked register, the drone. Consult it before publishing any essay or external document. The trigger is: if the output will be read by someone other than you, run it against the failure modes checklist.

## Insight/Implication Format

Every role in this system produces insights, not just outputs. Two forms, used in different contexts:

**Standalone** (task completion notes, peer review patterns section, risk callouts):

> **Insight:** [what we learned from building/reviewing this]
> **Implication:** [what that means for upcoming work or the project as a whole]

**Inline** (mid-paragraph in XRD pushback, tester priority rationale, review issues):

"**Insight:** the complexity isn't in rendering six states — it's in the coupling between notification and widget systems. **Implication:** simplify to three states for v1."

Weather reporting ("this was complex") is not an insight. An insight changes what you do next.

## Agent Failure Modes Growth

See `agent-failure-modes.md` for the full list. When a new failure mode is observed during a build session, add it to the file before the next session. Format: name, what it is, why it happens, how to catch it. The list compounds if maintained. If it's not maintained, the same mistakes recur.
