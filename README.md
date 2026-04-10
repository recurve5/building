# Building

A multi-agent orchestration system for building software with AI. It defines how ideas become products through a pipeline that pressure-tests from multiple angles before a single line of code gets written — and then builds the code too.

This started from decades of product development at scale and a few months of getting bitten by the specific ways AI agents fail. A third of this process was defined by the LLM itself. The system is still evolving. When a new failure mode appears, it gets added. When a protocol breaks in practice, it gets fixed. These are working documents, not a finished framework.

Star or watch this repo to get notified when files are updated.

## How It Works

Seven agents, each with a scoped role and isolated context, connected through an orchestrator that manages the pipeline. Agents do not talk to each other directly — all communication routes through the orchestrator, which enforces gates, scopes context, and routes decisions.

The pipeline: **milestone decomposition** → **idea brief** → **PRD** → **XRD** → **pushback resolution** → **peer review** → **test plan** → **SDM review** (existing codebases) → **task decomposition** → **build** → **smoke test**. Stages 1-10 run per milestone, not per brief. Each milestone produces working software the user can touch and is smoke tested before the next milestone begins. Steps can be fast but they don't get skipped. The orchestrator runs end to end — planning through verified product — stopping only for gate failures or decisions that require human judgment.

### The Agents

| Agent | File | What It Does |
|-------|------|-------------|
| **Orchestrator** | `orchestrator.md` | Manages the pipeline. Spins up agents with scoped context, enforces gates between stages, routes questions between agents, surfaces Tier 3 decisions to the human. Does not write code or make product decisions. |
| **Product** | `prompts/product-agent.md` | Owns the what and why. Writes PRDs. Responds to engineering pushback with product-grounded decisions. Attempts to resolve issues before escalating — its job is to have a position, not to defer. |
| **SWE** | `prompts/swe-agent.md` | Owns the how. Writes XRDs that respond to the PRD with architecture, pushback, and a build plan. Decomposes work into agent-executable tasks. Pushes back where it matters, framed as insight/implication with product-level tradeoffs. |
| **Peer Reviewer** | `prompts/peer-review-agent.md` | Owns quality gates. Reads the PRD and XRD as a matched set in a fresh context. Surfaces contradictions, gaps, unstated assumptions, and architecture-product mismatches. |
| **Tester** | `prompts/tester-agent.md` | Owns validation. Writes test plans that translate product intent into verifiable assertions. Prioritizes by risk, not feature order. Routes contradictions to the agent that owns the claim. |
| **SDM** | `prompts/sdm-agent.md` | Owns codebase context. For existing codebases, assesses what exists and produces a context document so the SWE doesn't propose a rewrite when a modification would do. Watches for Architecture Mirror and Clean Slate Bias. |
| **Task** | `prompts/task-agent.md` | Executes a single task. Reads the task file, writes code, writes tests, reports done with an insight/implication note. Scope is exactly what the task file says — nothing more. |

### Decision Tiers

Every choice during a build falls into one of three tiers:

- **Tier 1 — Just do it.** Craft decisions. No logging needed.
- **Tier 2 — Do it and log it.** Implementation choices worth documenting. The agent decides and logs the rationale.
- **Tier 3 — Surface for review.** Changes to user experience or inherited constraints. Must be framed as a user story with insight/implication before reaching the human. Most items labeled Tier 3 become Tier 2 when forced through this lens.

The system gets smarter over time: after each project, Tier 3 patterns where the human consistently makes the same call become Tier 2 rules.

## The Files

```
~/building/
  CLAUDE.md                      # Master build file. Core principles, decision tiers, quality bar.
  orchestrator.md                # Pipeline state machine, gates, context scoping, decision routing.
  starter-prompt.md              # One-line kickoff for new sessions.
  decisions.md                   # Cross-project principles. Append-only.
  task-template.md               # Format for agent-executable task files.
  writing-failure-modes.md       # Failure modes for prose. Consult before publishing.
  prompts/
    product-agent.md             # PRD writing, pushback responses, product questions.
    swe-agent.md                 # XRD writing, task decomposition, architecture.
    peer-review-agent.md         # Document review, contradiction and gap detection.
    tester-agent.md              # Test plan writing.
    sdm-agent.md                 # Codebase assessment, mid-build synthesis.
    task-agent.md                # Single-task code execution.
    smoke-test-protocol.md       # Playwright MCP smoke test protocol for Stage 10.
  docs/
    roadmap.md                   # Open design questions. What hasn't been built yet.
    agent-failure-modes.md       # Catalog of AI agent failure modes (18 entries).
    automation.md                # Gate Runner and automation layer spec.
    build-process.md             # Original pipeline reference.
```

## How to Use It

### New Project (Greenfield)

1. Copy or clone these files into `~/building/`.
2. Create your project directory with a `CLAUDE.md` that references the master files: `Read ~/building/orchestrator.md. You are the orchestrator.`
3. Open Claude Code in your project directory.
4. Give it your idea brief — one sentence to a full page.
5. The orchestrator runs the pipeline: spins up the product agent (which will ask you to confirm its understanding of the brief), produces the PRD, hands it to the SWE agent for the XRD, runs peer review, produces the test plan, decomposes into tasks, and builds. You'll be asked for input at Tier 3 decision points. Everything else runs autonomously.

### Existing Codebase

Same as above, but tell the orchestrator: "This is an existing codebase." It will spin up the SDM agent before the XRD stage to assess what exists — architecture, fragile areas, change surface, patterns and conventions. The SDM produces a codebase context document that the SWE agent receives alongside the PRD, preventing rewrites where modifications would suffice.

If the project was previously built with an older version of this framework (existing PRDs, XRDs, task files), no migration is needed. The SDM reads old docs as codebase context. Add a one-paragraph status section to your project's `CLAUDE.md` describing what's been built and what's next.

### What to Expect

The orchestrator will stop for your input at these points:
- **After the product agent's playback** — confirming it understood your idea brief correctly.
- **Tier 3 decisions** — items that genuinely require your judgment about product direction, framed as user stories with tradeoffs.
- **Context window limits** — if the session runs long, the orchestrator writes state to files and tells you exactly how to continue.

Between those points, the pipeline runs autonomously.

## Agent Failure Modes

A growing catalog of the specific ways AI agents fail during builds. Each entry names the pattern, explains why it happens, and describes how to catch it. Eighteen entries across three loop levels:

**Inner loop** (during task execution): Test Cheat, Loop of Despair, Scope Creep, Ghost Refactor, Clean Slate Bias, Dependency Grab.

**Middle loop** (across tasks and sessions): Context Amnesia, Heresy, Precondition Ghost, Closed-Loop Build, Confidence Bluff, Heroic Unblock.

**Outer loop** (architectural): Architecture Mirror, Lossy Middleman, Premature Abstraction, Unoptimized Default, Spec Without Shoes, Big Bang Integration.

See `docs/agent-failure-modes.md` for the full catalog.

## Background

I wrote about earlier versions of this system in [CLAUDE.md isn't enough](https://open.substack.com/pub/joshbuilds/p/claudemd-isnt-enough). If you're building with AI agents and you've hit a failure mode you haven't seen written about, open an issue.
