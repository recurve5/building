# Building: Portability Layer

Building is an agentic harness that helps developers make new software projects. It runs a multi-stage pipeline — from idea brief through PRD, architecture, peer review, task decomposition, build, and smoke test — producing tested, shipped software.

Today, Building only works inside its own repository. Projects built with Building live alongside Building's source code, pipeline state, and system artifacts. This milestone makes Building a standalone dev tool that can be installed once and used from any project directory.

## What This Milestone Delivers

A developer clones Building from GitHub, runs an install command, and from that point forward can open any project directory in Claude Code and run `/build` to start the pipeline. The project directory receives only clean project output — source code, tests, configuration, README. No Building artifacts, no pipeline state, no gate scripts, no agent prompts. A user who clones the downstream project has no idea Building was involved.

## User Experience

### First-Time Setup

1. Clone Building from GitHub.
2. Run `npm install` (or equivalent setup command) from the Building directory.
3. The install step creates `~/.claude/skills/build/SKILL.md`, making `/build` available in every Claude Code session on the machine.

### Starting a New Project

1. Create a project directory (or open an existing one).
2. Open Claude Code in that directory.
3. Write an idea brief — a text file, anywhere from one sentence to a full page.
4. Run `/build brief.md`.
5. Building reads the brief, runs the pipeline, and writes source code into the project directory.

### During a Build

- `/build --status` — current pipeline position, task progress, any halts.
- `/build --resume` — continue a halted run after resolving the blocking issue.
- `/build --override <stage> --reason "..."` — force past a failed gate with justification.

### Where State Lives

Building keeps all pipeline state in its own home directory, organized by project:

```
~/building/
  projects/
    fitness-tracker/
      runs/
      milestones/
      DECISIONS.md
    my-saas-app/
      runs/
      milestones/
      DECISIONS.md
```

The project directory (e.g., `~/Desktop/fitness-tracker/`) contains only project output. Building's directory contains only Building.

### Updating Building

Pull the latest from GitHub. Re-run the install step. The global skill, hooks, and system files update in place. Existing project state (runs, decisions) is preserved.

## Constraints

- Downstream project directories must contain zero Building artifacts. No `.building/`, no gate scripts, no agent definitions, no run state.
- The install must be idempotent. Running it twice does not break anything or duplicate state.
- Building must work with the project name inferred from the project directory name. No mandatory configuration step.
- The global `/build` skill must work from any directory on the machine after a single install.
- Building's own repository on GitHub must be publishable as a clean, self-contained tool. No user project artifacts in the repo.
