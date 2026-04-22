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

On every new session — and after any context compaction — run:

```
bd prime
```

It outputs Beads workflow context and surfaces in-flight work. Read its output before touching task files, code, or documents. Do not assume continuity from a prior session without running this first.

The `bd init` setup installs `SessionStart` and `PreCompact` Claude Code hooks that run `bd prime` automatically. If a hook ever fails to fire, run it manually.

## Non-negotiable rules

These survive context resets. Never skip, regardless of milestone, stage, or apparent urgency.

1. **Read `./building/CLAUDE.md` and `./building/orchestrator.md` before acting.** They define the pipeline, the tier system, and the quality bar. Nothing in this PRIMER overrides them — this PRIMER adds project-local protocol on top.

2. **`bd` must be in PATH.** If `bd prime` fails with `command not found`, STOP. Do not explore the codebase, do not read task files, do not begin work. Surface the missing `bd` to the human as a blocker and wait. No other action is permitted until `bd` is available.

3. **Beads sync on task completion.** The moment a task file's Completed section is written, close the corresponding Beads issue:

   ```
   bd close <issue-id> "Completed per task file"
   ```

   This keeps Beads and the task files aligned without changing the task file structure. Do not leave a Completed task open in Beads.

## Beads files

These are created or managed by `bd init` and are not part of the `building/` framework:

- `./.beads/` — Beads workspace.
- `./.claude/settings.json` — Claude Code hook config (`SessionStart` and `PreCompact` hooks).
- `./AGENTS.md` — Beads agent instructions.

## Setup notes

- Run `bd init` **after** filling in the `## Project` section above. `bd init` will append a Beads integration section to `CLAUDE.md`, register the session hooks, and commit these files to a new git repo if one doesn't exist yet.
- If the project is already a git repo, `bd init` will commit to the current branch.

## When in doubt

Stop. Read `./building/orchestrator.md`. Run `bd prime`. Ask.
