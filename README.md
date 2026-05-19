# building

**What do you call it?**

**building.**

**That is the name.**

This repo is for building software with AI without pretending the hard part is typing.

---

## What this is

building is a judgment layer for AI-assisted software development.

It does not try to replace engineering taste, product judgment, or technical decision-making. It gives those things a structure.

The framework uses scoped agents, shared documents, explicit gates, and review steps to help you move from idea to working software with less drift, less thrash, and fewer confident mistakes.

**The models can generate. You still have to build.**

---

## What this is not

building is not:
- a magic prompt
- an autonomous software factory
- a substitute for technical judgment
- a guarantee that generated code is correct
- an agent runtime pretending process does not matter

**If you want "one weird trick" for replacing software teams, this is the wrong repo.**

This framework assumes the opposite: good output depends on good structure, good constraints, and good review.

---

## Why this exists

AI made code generation dramatically cheaper. It did not make good decisions free.

Most failures in AI-assisted development do not come from the model being unable to write syntax. They come from vague goals, muddled ownership, skipped review, missing constraints, false confidence, and local progress that hides global incoherence.

**Execution got cheaper. Judgment did not.**

building exists to handle that gap.

---

## How it works

Nine agents. Each has one job and only the context it needs to do that job.

An orchestrator runs the pipeline: idea → milestones → PRD → architecture → security review → pushback → peer review → test plan → build → security code review → smoke test → stress test. Agents do not talk to each other. All communication routes through the orchestrator, which enforces gates and surfaces decisions that require a human.

The work moves through stages. Each stage produces an artifact. Each artifact gets reviewed before the next stage starts. **Nothing advances on vibes.**

The pipeline runs per milestone, not per project. Each milestone produces working software you can touch. Integration problems surface at the first milestone, when the fix is cheap, not the last, when it is not.

### The agents

| Agent | What it does |
|-------|-------------|
| **Orchestrator** | Runs the pipeline. Enforces gates. Routes decisions. Does not write code or make product calls. |
| **Product** | Owns the what and why. Writes PRDs. Responds to pushback with product-grounded decisions. Its job is to have a position, not to defer. |
| **SWE** | Owns the how. Writes engineering response documents. Pushes back where it matters. Decomposes work into agent-executable tasks. |
| **Peer Reviewer** | Reads the PRD and architecture doc as a matched set in a fresh context. Surfaces contradictions, gaps, and unstated assumptions. |
| **Tester** | Translates product intent into verifiable assertions, including stress test specs. Prioritizes by risk, not feature order. |
| **Security** | Reviews architecture for security gaps, reviews code for vulnerabilities. Critical findings block the build. |
| **SDM** | Owns codebase context and structural integrity. Can halt a milestone when continuing would create more problems than it solves. |
| **Task** | Executes a single task. Reads the task file, writes code, writes tests, reports done. Scope is exactly what the task file says. |
| **Cost** | Post-project only. Reviews shipped code and infrastructure for cost reduction opportunities. Surfaces recommendations, does not drive decisions. |

### Decision tiers

Every choice during a build falls into one of three tiers:

- **Tier 1 — Just do it.** Craft decisions. No logging needed.
- **Tier 2 — Do it and log it.** Implementation choices worth documenting. The agent decides and logs the rationale.
- **Tier 3 — Surface for review.** Changes to user experience or inherited constraints. Framed as a user story with tradeoffs before reaching the human.

Most items labeled Tier 3 become Tier 2 when forced through this lens. The system gets smarter over time: Tier 3 patterns where the human consistently makes the same call become Tier 2 rules.

---

## Agent failure modes

Most frameworks pretend agents do not fail. This one keeps a list.

A growing catalog of the specific ways AI agents fail during builds — named from real projects, not theory. Each entry describes the pattern, explains why it happens, and describes how to catch it. Nineteen entries across three loop levels:

**Inner loop** (during task execution): Test Cheat, Loop of Despair, Scope Creep, Ghost Refactor, Clean Slate Bias, Dependency Grab.

**Middle loop** (across tasks and sessions): Context Amnesia, Heresy, Precondition Ghost, Closed-Loop Build, Confidence Bluff, Heroic Unblock.

**Outer loop** (architectural): Architecture Mirror, Lossy Middleman, Premature Abstraction, Unoptimized Default, Spec Without Shoes, Big Bang Integration, Accumulating Fragility.

See `docs/agent-failure-modes.md` for the full catalog.

---

## Tools

The framework lists failure modes. The tools catch them.

### building-audit

A CLI that audits a finished milestone for the failure modes the framework names. It runs in two layers:

- **Mechanical (Layer 1)** — deterministic static analysis. AST parsing, git history, regex patterns. No model calls. Fast and free. Covers Test Cheat, Scope Creep, Dependency Grab, Premature Abstraction, Surface Heresy, Confidence Bluff, Accumulating Fragility, Resource Drain, Unoptimized Defaults.
- **Judgment (Layer 2)** — LLM-based, run only when the mechanical layer's not enough. Covers Ghost Refactor, Clean Slate Bias, Deep Heresy, Document Heresy, Performance Critical Path, React Fluidity, Refactoring Signals.

Mechanical mode runs after every task. Full mode runs at milestone close. Critical findings block the gate; the agent that produced the work does not evaluate the work.

```sh
cd ~/building/tools/building-audit && npm install && npm run build && npm link
cd ~/your-project
building-audit --mechanical              # cheap per-task gate
building-audit --full                    # milestone-close audit (needs ANTHROPIC_API_KEY)
```

13 of 19 failure modes are covered today. The remaining 6 are process or design failures with no artifact evidence — those stay in the catalog as human-review items.

See `tools/building-audit/` for source, `milestones/building-audit/` for PRD, XRD, peer review, security review, and decisions log.

### Governance layer

Gate scripts, state management, event logging, override tracking, confidence assessment, and morning-after report generation — all in TypeScript with zero runtime dependencies beyond Node built-ins. This is what the `/build` skill runs on top of.

It enforces the same 12-stage pipeline defined in `orchestrator.md`, but mechanically: gate checks are bash scripts that read JSON state and pass or fail. The orchestrator cannot skip a stage because the script won't let it.

```sh
cd ~/building/tools/trellis && npm install && npm test
```

See `tools/trellis/` for source, `milestones/trellis/` for planning artifacts.

---

## How to use it

There are two ways to run building. Both use the same agents, the same pipeline stages, and the same decision tiers. They differ in how gates are enforced.

### Option A: Markdown pipeline

The pipeline lives in markdown files. The orchestrator is an LLM agent that reads `orchestrator.md` and follows the stages, gates, and routing defined there. Gates are enforced by the orchestrator's adherence to the protocol.

1. Clone this repo to `~/building/`.
2. Create your project directory with a `CLAUDE.md` that references the master files: `Read ~/building/orchestrator.md. You are the orchestrator.`
3. Open Claude Code in your project directory.
4. Give it your idea brief — one sentence to a full page.
5. The orchestrator runs the pipeline. You'll be asked for input at Tier 3 decision points. Everything else runs autonomously.

For an existing codebase, tell the orchestrator: "This is an existing codebase." The SDM agent assesses what exists before the architecture stage — preventing rewrites where modifications would suffice.

### Option B: `/build` skill

A TypeScript governance layer that enforces the same pipeline mechanically. Gate checks run as bash scripts. State is persisted to JSON on disk. The orchestrator cannot silently skip a stage because the gate script will fail.

**Install:**

```sh
cd ~/building
npm run setup
```

This builds the governance layer, creates `~/.building/` for state storage, and installs a `/build` skill into Claude Code (`~/.claude/skills/build/SKILL.md`).

**Use from any project directory:**

```sh
cd ~/your-project
/build brief.md                              # start a new run from a brief
/build --status                              # show current run state
/build --resume                              # pick up where you left off
/build --override <stage> --reason "..."     # override a failed gate
```

State lives at `~/.building/projects/<project-name>/` — outside your project repo. Each run gets its own directory with event logs, gate results, confidence assessments, and state snapshots at every stage transition.

**Uninstall:**

```sh
cd ~/building
npm run uninstall
```

This removes the skill file but preserves all project state under `~/.building/`.

### What to expect (both options)

The orchestrator will stop for your input at these points:
- **After the product agent's playback** — confirming it understood your brief correctly.
- **Tier 3 decisions** — items that genuinely require your judgment, framed as user stories with tradeoffs.
- **Context window limits** — the orchestrator writes state to files and tells you exactly how to continue.

Between those points, the pipeline runs autonomously.

---

## The files

```
~/building/
  CLAUDE.md                      # Core principles, decision tiers, quality bar.
  orchestrator.md                # Pipeline, gates, context scoping, decision routing.
  decisions.md                   # Cross-project principles. Append-only.
  task-template.md               # Format for agent-executable task files.
  prompts/
    product-agent.md             # PRD writing, pushback responses.
    swe-agent.md                 # Architecture, task decomposition.
    peer-review-agent.md         # Contradiction and gap detection.
    tester-agent.md              # Test plans, stress test specs.
    security-agent.md            # Security review (architecture + code).
    sdm-agent.md                 # Codebase assessment, refactoring assessment.
    task-agent.md                # Single-task execution.
    cost-agent.md                # Post-project cost assessment.
    smoke-test-protocol.md       # Smoke test protocol (Stage 10).
    stress-test-protocol.md      # Stress test protocol (Stage 11).
  docs/
    agent-failure-modes.md       # 19 failure mode entries.
    automation.md                # Gate Runner and automation layer.
    build-process.md             # Human-readable pipeline reference.
    roadmap.md                   # Open design questions.
  tools/
    building-audit/              # The audit CLI (M1, shipped).
    trellis/                     # Governance layer: gate scripts, state, events.
    install/                     # Setup and uninstall scripts, skill template.
  milestones/
    building-audit/              # M1 PRD, XRD, peer review, decisions.
    trellis/                     # Governance layer PRD, XRD, peer review, tasks.
    building-orchestrator/       # M2 brief.
```

Each project organizes its work into milestone directories:

```
~/your-project/
  CLAUDE.md                      # Project status, pipeline state.
  DECISIONS.md                   # Consolidated project decisions.
  m1-projectname-first-goal/     # Milestone 1
    PRD.md, XRD.md, peer-review.md, test-plan.md
    security-review.md, smoke-test-report.md
    DAY-ZERO.md, DECISIONS.md
    tasks/
  m2-projectname-second-goal/    # Milestone 2
    ...
  src/                           # Code lives where the codebase puts it.
```

---

## Status

This is an evolving framework, built from real projects and refined when it breaks. Some parts are stable. Some are still moving. When a new failure mode appears, it gets added. When a protocol fails in practice, it gets fixed.

**It is called building, and it is still building.**

I wrote about earlier versions of this system on [Substack](https://substack.com/@shermanjoshua). If you're building with AI agents and you've hit a failure mode you haven't seen written about, open an issue.

---

**building is a framework for building software with AI when you do not want to confuse generation with judgment.**
