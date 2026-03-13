# building

A system for building software with AI agents. Role definitions, decision architecture, and failure mode catalogs for maintaining human judgment when execution is delegated.

## What This Is

A set of files that sit between you and the AI agent writing your code. They define how ideas become products through a pipeline that pressure-tests from multiple angles before a single line of code gets written.

This is how I build. It started from decades of product development at scale and a few weeks of getting bitten by the specific ways AI agents fail. A third of this process was defined by the LLM itself. It was all in there, just waiting for the right seed prompt to encourage its growth.

The system is still evolving. When I see a new failure mode, I add it. When a decision protocol breaks, I fix it. The files are working documents, not a finished framework.

## The Files

**[build-process.md](build-process.md)** — The full pipeline from idea to shipped code. Covers how work moves between roles, how context persists across sessions, and how decisions get logged and enforced.

**[CLAUDE.md](CLAUDE.md)** — Master build file. Core principles, decision tiers, quality bar, and the index that every project inherits from.

**[product-maker.md](product-maker.md)** — The product role. Owns the what and why. Writes PRDs. Instructs the LLM to never include a technology choice without a user-facing reason.

**[swe.md](swe.md)** — The engineering role. Owns the how. Writes XRDs (engineering response documents) that respond to the PRD with feasibility, architecture, pushback, and a build plan. Asks questions back to Product in product terms.

**[tester.md](tester.md)** — The testing role. Owns validation. Writes test plans that translate product intent into verifiable assertions an agent can implement without asking a question.

**[peer-reviewer.md](peer-reviewer.md)** — The quality gate. Reads the PRD and XRD as a matched set in a fresh context and surfaces contradictions, gaps, and seams.

**[task-template.md](task-template.md)** — The format for agent-executable task files. Scope, inputs, outputs, acceptance criteria, and tests that prove done.

**[agent-failure-modes.md](agent-failure-modes.md)** — A growing catalog of the specific ways AI agents fail during builds. Each entry names the pattern, explains why it happens, and describes how to catch it. Nine entries and counting.

**[writing-failure-modes.md](writing-failure-modes.md)** — The same catalog applied to prose. Patterns to watch for when AI assists with writing. Consult before publishing anything under your name.

**[decisions.md](decisions.md)** — Cross-project principles. Closed unless new material information surfaces.

## How to Use It

Copy these files into a `~/building/` directory. Point your AI agent to them at the start of every session. Each project gets its own CLAUDE.md that references these master files and adds project-specific context.

The pipeline runs in order: idea brief, PRD, XRD, peer review, test plan, task decomposition, build. Steps can be fast but they don't get skipped.

## Background

I wrote about this system in [CLAUDE.md isn't enough](https://joshuasherman2.substack.com). If you're building with AI agents and you've been bitten by a failure mode you haven't seen written about, open an issue.
