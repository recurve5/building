# CLAUDE.md — Master Build File

This file defines how software is built. Every project inherits from this. Project-specific CLAUDE.md files layer on top but never contradict what's here.

## How to Start a Build

Read `orchestrator.md`. It defines the pipeline, the agents, and the gates. To kick off a new project, paste your idea brief after the starter prompt in `starter-prompt.md`.

## System Architecture

The build system uses a multi-agent orchestration model. Each role runs as a separate agent with scoped context. The orchestrator manages the pipeline and routes communication between agents.

| Agent | Prompt | Job |
|-------|--------|-----|
| Orchestrator | `orchestrator.md` | Pipeline management, gate enforcement, context scoping, decision routing |
| Product | `prompts/product-agent.md` | Writes PRDs, resolves product questions, handles pushback responses |
| SWE | `prompts/swe-agent.md` | Writes XRDs, decomposes tasks, proposes architecture |
| Peer Reviewer | `prompts/peer-review-agent.md` | Reviews PRD+XRD as a matched set, surfaces contradictions and gaps |
| Tester | `prompts/tester-agent.md` | Writes test plans from the PRD |
| SDM | `prompts/sdm-agent.md` | Assesses existing codebases, provides context to SWE |
| Task | `prompts/task-agent.md` | Executes individual build tasks |

Agents do not talk to each other directly. All communication goes through the orchestrator.

## Core Principles

**Decisions are final.** Once documented with rationale, a decision is not revisited unless new material information surfaces. "I changed my mind" is not new information. "The API we chose doesn't support X and here's why that matters" is. Decisions live in `DECISIONS.md` in every project. The log is append-only.

**Done means tested.** A task is not complete when the code compiles or the feature renders. It's complete when a test proves it works. Unit tests for logic. Integration tests for data flow. UI tests for interaction. The test plan exists before the code.

**Show the resolved version.** Don't narrate the thinking process. State the decision, the implementation, and why. If there are meaningful tradeoffs, note them once. Then move on.

**Insight before action.** Every stage produces insights — patterns, surprises, structural observations — not just outputs. An insight says what we learned. An implication says what that means we should do. Weather reporting ("the streak logic is complex") is not useful. Insight/implication ("the streak logic is the only feature where a bug is invisible at the time it occurs — implication: tests must cover boundary conditions where off-by-one errors produce plausible-looking wrong numbers") changes how you build.

**Ask before guessing — but assess the tier first.** If a task is ambiguous, stop. Run the tier check: does this change what the user experiences? Does it create a constraint other tasks inherit? If no to both, it's Tier 1 or 2 — make the call yourself and log it if Tier 2. Only escalate if the tier check lands on Tier 3.

**One task, one change.** Each task produces a coherent, reviewable unit of work. Don't fix unrelated things you notice along the way. Note them and move on.

## Decision Tiers

**Tier 1 — Just do it.** Craft decisions that don't need logging. Variable naming, loop structure, formatting. The code is the log.

**Tier 2 — Do it and log it.** Implementation choices someone picking up the project tomorrow would need to understand. Add to `DECISIONS.md` with rationale. When in doubt between Tier 1 and 2, log it.

**Tier 3 — Surface for review.** Anything that changes product behavior, affects user experience, creates inherited constraints, or crosses task boundaries. Add to `OPEN-ITEMS.md`. Do not act — continue with the current task and flag the item. Only the human promotes items from OPEN-ITEMS.md to DECISIONS.md.

**Before writing a Tier 3 item**, frame it as:
1. **User story** — grounded in the human using the product
2. **Insight and implication** — what you learned and what it means
3. **A question for the Product Maker** — requiring product judgment

If you cannot formulate a question that requires product judgment, the issue is Tier 2. Make the call yourself.

## Quality Bar

**Good enough to ship:**
- Tests pass
- Smoke test passes — the PRD's First-Use Walkthrough has been executed against the running product via Playwright MCP and every step completes successfully
- Another agent could pick up the project tomorrow and understand what's here
- No TODO comments without a linked task
- No dead code from abandoned approaches
- No ghost references to Hard Kill decisions
- The decisions log is current

**Needs another pass:**
- Tests missing or assertions are weak
- Architecture choice made without documenting why
- Files changed outside task scope
- Dependencies added without justification

## File Conventions

- Orchestrator definition: `orchestrator.md`
- Agent prompts: `prompts/` directory
- Decisions log: `DECISIONS.md` in project root
- Open items for review: `OPEN-ITEMS.md` in project root
- Day Zero contracts: `DAY-ZERO.md` in project root
- Task files: `tasks/` directory, numbered sequentially
- Tests: colocated or in `tests/` matching source structure
- Reference docs: `docs/` directory
- Cross-project decisions: `decisions.md`
- Task format: `task-template.md`
- Writing quality: `writing-failure-modes.md`
- Archive: `archive/` with date-stamped subdirectories

## Insight/Implication Format

**Standalone** (task completion, review patterns, risk callouts):
> **Insight:** [what we learned]
> **Implication:** [what that means for upcoming work]

**Inline** (mid-paragraph in pushback, rationale, issues):
"**Insight:** the complexity isn't in rendering six states — it's in the coupling between notification and widget systems. **Implication:** simplify to three states for v1."

Weather reporting is not an insight. An insight changes what you do next.

## Agent Failure Modes

See `docs/agent-failure-modes.md` for the full catalog. Modes are assigned to the agent level where they manifest:

**Inner loop (task-agent):** Test Cheat, Loop of Despair, Scope Creep, Ghost Refactor, Clean Slate Bias, Dependency Grab.

**Middle loop (orchestrator + sdm-agent):** Context Amnesia, Heresy, Precondition Ghost, Closed-Loop Build, Confidence Bluff, Heroic Unblock.

**Outer loop (sdm-agent):** Architecture Mirror, Lossy Middleman, Premature Abstraction, Unoptimized Default, Spec Without Shoes, Big Bang Integration.

## System Maturity

The system gets smarter by converting Tier 3 decisions into Tier 2 rules, and Tier 2 patterns into tenets.

- **Early:** Most cross-loop issues are Tier 3. The human decides.
- **Middle:** Product-agent recognizes patterns in past decisions. Issues matching documented patterns resolve as Tier 2.
- **Late:** The Tier 2 library is rich enough that product-agent handles most issues. Tier 3 is reserved for genuinely novel situations.

After each project, the orchestrator reviews the Tier 3 log for patterns. Consistent decisions become Tier 2 rules in DECISIONS.md.
