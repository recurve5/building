# PRIMER — {{PROJECT_NAME}}

Read this file in full before any other action in this project. It supersedes any assumption carried in from a prior session or compaction.

## Project

<!-- Replace this block with your own description. Keep it under 250 words — the
     PRIMER is loaded into every turn's context, and long prose rots fast. Include:
     what the product is, who it serves, the current state (greenfield / rebuild /
     migration / existing codebase), and scope boundaries that bind every milestone. -->

{{YOUR PROJECT DESCRIPTION HERE}}

## Framework

This project uses the `building/` framework. The authoritative process definitions are:

- `./building/CLAUDE.md` — core principles, decision tiers, quality bar.
- `./building/orchestrator.md` — pipeline, stages, gates, context scoping.

Treat `building/` as a **read-only local dependency**. Never create, modify, rename, or delete anything inside it. Upstream owns those files. Project-specific work lives outside `building/`.

## Session start

On every new session — and after any context compaction:

1. Read this PRIMER in full.
2. Check `DECISIONS.md` and `OPEN-ITEMS.md` at the project root for decisions made in prior sessions and items awaiting human judgment.
3. Scan the most recent milestone directory (`m<n>-*`) for in-flight task files — any task without a Completed section is live work.

Do not assume continuity from a prior session without performing these three steps.

## Non-negotiable rules

These survive context resets. Never skip, regardless of milestone, stage, or apparent urgency.

1. **Read `./building/CLAUDE.md` and `./building/orchestrator.md` before acting.** They define the pipeline, the tier system, and the quality bar. Nothing in this PRIMER overrides them — this PRIMER adds project-local protocol on top.

## When in doubt

Stop. Read `./building/orchestrator.md`. Check `DECISIONS.md`. Ask.
