# PRD: Portable Install

## 1. Overview

Building is an agentic build harness that takes an idea brief and produces tested, shipped software through a multi-stage pipeline. Today it only works inside its own repository: projects live alongside Building's source code, pipeline state writes to `.building/` in the project directory, and the `/build` skill references paths relative to Building's repo root.

This milestone makes Building a standalone dev tool. A developer clones the repo, runs an install command, and from that point forward can open any directory on their machine, type `/build brief.md`, and get the full pipeline. The project directory receives only project output. Building's state, prompts, and tooling stay in Building's home directory.

The change is structural, not behavioral. The pipeline stages, gate checks, agent prompts, and decision system remain the same. What changes is where state lives, how the skill resolves paths, and how bootstrap works.

## 2. User Stories

**US-1: First-time install.** A developer clones Building from GitHub and runs a setup command. The command installs dependencies, builds tools, and writes a global skill file. After this, `/build` is available in every Claude Code session on the machine. The developer does not need to configure anything else.

**US-2: Start a new project.** A developer opens a project directory (new or existing) in Claude Code, writes an idea brief, and runs `/build brief.md`. Building reads the brief, runs the pipeline, and writes source code, tests, and configuration into the project directory. No Building artifacts appear in the project directory. The developer can `git init`, push to GitHub, and a collaborator who clones the repo sees a normal project with no trace of Building.

**US-3: Check build status.** A developer working on a project runs `/build --status`. Building finds the active run for this project (identified by the project directory name) and displays the current pipeline stage, task progress, and any halts.

**US-4: Resume a halted build.** A developer returns to a project after resolving a blocking issue and runs `/build --resume`. Building picks up from the halted stage.

**US-5: Update Building.** A developer pulls the latest Building code from GitHub and re-runs the install command. The global skill updates. Existing project state (runs, decisions, milestones) is preserved. No migration step is required for state files that haven't changed schema.

**US-6: Multiple projects.** A developer uses Building on three different projects over a week. Each project's state is isolated. Running `/build --status` in one project directory shows only that project's state, not state from the other two.

**US-7: Uninstall.** A developer decides to stop using Building. They run `npm run uninstall` (or manually delete `~/.claude/skills/build/`). No artifacts remain in any project directory. No hooks remain in `~/.claude/settings.json`. Nothing breaks.

## 3. Functional Requirements

### FR-1: Install Command

A single command (`npm run setup` or `npm run install:global`) executed from the Building repo root performs the following:

1. Runs `npm install` for Building's own dependencies.
2. Builds tool packages (`tools/trellis`, `tools/building-audit`) so they are ready to execute.
3. Creates `~/.claude/skills/build/SKILL.md` containing the global skill definition. If the file already exists, overwrites it (idempotent).
4. Creates `~/.building/` if it does not exist.
5. Creates `~/.building/projects/` if it does not exist.
6. Prints a summary: what was installed, what was updated, and a confirmation that `/build` is now available.

The install must be idempotent. Running it twice produces the same result. Running it after a `git pull` updates the skill file and rebuilt tools without affecting project state.

**Failure path:** If `npm install` fails (network, permissions), the command prints the error and stops. It does not write a partial skill file. The developer sees what failed and can fix it (check network, fix permissions) and re-run.

**Failure path:** If `~/.claude/skills/` does not exist, the install creates it. If the directory exists but is not writable, the install prints a permissions error and stops.

### FR-2: Global Skill File

The skill file at `~/.claude/skills/build/SKILL.md` replaces the current project-local skill at `.claude/skills/build.md`. The global skill:

1. Resolves Building's home directory (the cloned repo location). The install command writes the absolute path into the skill file at install time. This is the only configuration the skill needs.
2. Identifies the current project by the basename of the working directory where `/build` was invoked. Example: if the developer is in `~/Desktop/fitness-tracker/`, the project name is `fitness-tracker`.
3. Routes to the correct state directory: `~/.building/projects/fitness-tracker/`.
4. Sources all pipeline logic, agent prompts, and tool binaries from Building's home directory, not from the project directory.

The skill file must reference `orchestrator.md`, agent prompt files, and tool paths using the stored Building home path. When Building updates (git pull + re-run install), the skill file is regenerated with the same home path, picking up any changes to pipeline logic.

### FR-3: Project State Directory

When a build starts for a project that has no state directory yet, Building creates:

```
~/.building/projects/<project-name>/
  runs/
  milestones/
  DECISIONS.md
  OPEN-ITEMS.md
```

The `<project-name>` is the basename of the project's working directory, lowercased and with spaces replaced by hyphens.

**State that moves here (from the current `.building/` in-project location):**
- `runs/<run-id>/state.json` and all run subdirectories (events, overrides, detections, confidence)
- Milestone planning artifacts (PRD, XRD, peer review, test plan, security reviews, task files, DAY-ZERO.md, smoke test reports)
- `DECISIONS.md` (project-level)
- `OPEN-ITEMS.md` (project-level)

**State that stays in the project directory:**
- Source code, tests, and configuration that the pipeline produces
- Any files the developer created (briefs, docs, etc.)
- `.git/` and all version control

**Nothing from Building writes to the project directory** except the source code output of Stage 9 (Build) tasks. No `.building/` directory. No hooks in `.claude/settings.local.json`. No gate scripts. No config files.

### FR-4: Bootstrap Replacement

The current `bootstrap()` function creates `.building/` in the project directory and writes hooks to `.claude/settings.local.json`. This function changes to:

1. Create the project state directory under `~/.building/projects/<project-name>/` if it does not exist.
2. Do not create `.building/` in the project directory.
3. Do not write hooks to the project's `.claude/settings.local.json` or to `~/.claude/settings.json`.
4. Gate checks and detection scripts run from Building's home directory, invoked by the skill via Bash tool calls. They reference state at the project state directory path.

The `/build --bootstrap` command becomes implicit. Running `/build <brief>` on a project that has no state directory creates one automatically. There is no separate bootstrap step for the developer.

### FR-5: Path Resolution

Every component that currently reads or writes paths relative to the project root must resolve paths through a central path resolver that distinguishes:

- **Building home** (`$BUILDING_HOME`): where Building's source, prompts, tools, and agents live. Set at install time, stored in the skill file.
- **Project directory** (`$PROJECT_DIR`): the developer's working directory. Where source code is written. Determined at invocation time from `$PWD`.
- **Project state** (`$BUILDING_HOME/projects/<project-name>/`): where runs, milestones, decisions, and pipeline artifacts live. Derived from the project directory name.

Components that read from Building home: orchestrator.md, agent prompts, tool binaries, gate check scripts, detection scripts.

Components that read/write project state: state.json, events, milestone artifacts (PRD, XRD, tasks), DECISIONS.md, OPEN-ITEMS.md.

Components that write to project directory: task-agent output (source code, tests, config files).

### FR-6: State Schema Update

The `TrellisState` interface gains a field:

- `project_dir`: string — the absolute path to the project directory at the time the run was created. This allows Building to detect if a project directory has moved since the run started and warn the developer.

The `version` field increments to `2`. Building reads version-1 state files without error (forward compatibility) but writes version-2 going forward.

### FR-7: Clean Project Guarantee

After a build completes, the project directory must pass this test: a developer who has never heard of Building can clone the project and see a normal software project. Specifically:

- No `.building/` directory
- No Building-specific entries in `.gitignore`
- No references to Building in any generated file (no "generated by Building" comments, no Building paths in configs)
- No hooks in `.claude/settings.local.json` or `~/.claude/settings.json` that reference Building

### FR-8: Git Commit Protocol Update

The current commit protocol stages `.building/runs/<run-id>/` files. With state moved out of the project directory, pipeline state commits happen in Building's own repo (or not at all, if Building's repo is not the project repo). Source code commits happen in the project repo.

The orchestrator must handle two git contexts:

1. **Project repo** (the developer's project directory): commit source code changes at task boundaries and milestone boundaries. Commit messages follow the project's conventions, not Building's `[trellis]` prefix.
2. **Building state** (the project state directory under `~/.building/`): state changes are written to disk but not git-committed, because `~/.building/` is not necessarily a git repo. State persistence relies on the filesystem, not git.

**Degradation from current behavior:** The current system commits state to git, providing rollback safety. The portable system loses this for pipeline state. The developer is not aware of this change because pipeline state was never something they interacted with directly.

**Mitigation:** State files are written atomically (write to temp file, rename). If a write fails mid-operation, the previous state file remains intact. The morning-after summary is still generated and written to the state directory for diagnostic purposes.

**State snapshots:** Before each stage transition, Building copies the current `state.json` to `state.json.stage-N` (where N is the stage being exited). This provides a forensic debugging trail — if a stage transition corrupts state or a gate check produces unexpected results, the pre-transition state is preserved. Snapshots are cheap (a file copy) and accumulate only as many files as there are stage transitions in a run (at most ~12).

### FR-9: Gate Enforcement via Skill

The current system installs PreToolUse hooks in the project's `.claude/settings.local.json` that run gate-check.sh and detection-check.sh from `.building/hooks/`. These hooks enforce pipeline discipline (gate checks on state.json writes, detection checks for failure modes).

In the portable model, no hooks are installed in `~/.claude/settings.json` or any project-level settings. Instead, the `/build` skill enforces gates directly. Before writing state.json to advance a stage, the skill calls `gate-check.sh` via a Bash tool call. After task completion, the skill calls `detection-check.sh` via a Bash tool call.

The gate and detection scripts still exist as standalone bash scripts in `$BUILDING_HOME/.building/hooks/`. They still validate transitions, check gates, and run detections. What changes is the invocation model: the skill calls them explicitly during a build, rather than a hook system firing them on every Write tool call globally.

**Invocation model:** The skill passes BUILDING_HOME, PROJECT_DIR, and PROJECT_STATE as environment variables or command-line arguments in the Bash tool call:

```bash
# Skill runs this via Bash tool before writing state.json
BUILDING_HOME=/path PROJECT_DIR=/path PROJECT_STATE=/path \
  bash /path/.building/hooks/gate-check.sh
```

Since the skill knows all three paths at invocation time, the scripts do not need to parse stdin JSON or derive paths from `$PWD`. The skill constructs the complete invocation with all needed context.

**No active-run guard needed.** The guard was required when hooks fired globally on every Write in every session. Since the skill only calls gate scripts during an active build, the guard is unnecessary.

**When the developer uninstalls Building:** Removing `~/.claude/skills/build/` removes the skill. No hook entries exist in `~/.claude/settings.json`, so no cleanup is needed there.

## 4. Non-Functional Requirements

### NFR-1: Install Speed
The install command completes in under 60 seconds on a typical machine with warm npm cache. The developer should not wonder whether it's stuck.

### NFR-2: Invocation Overhead
Running `/build --status` in a project directory should return in under 2 seconds. The path resolution, state lookup, and status formatting are fast operations. The developer should not wait noticeably longer than they would for any other Claude Code slash command.

### NFR-3: State Durability
A power failure or process crash during a build must not corrupt state to the point where the developer cannot resume. State writes use atomic file operations (write-then-rename). A crashed run can be resumed from the last completed stage.

### NFR-4: Disk Usage
Building's state for a typical project (10-milestone, 200-task project) should stay under 50MB. State is text (JSON, Markdown). There are no binary artifacts in state.

### NFR-5: Compatibility
Building must work on macOS and Linux. The install command, path resolution, and gate scripts must not use platform-specific features that break on either OS. Windows is out of scope for this milestone.

### NFR-6: Isolation
Two projects with the same directory name in different locations (e.g., `~/work/api/` and `~/personal/api/`) produce a name collision in `~/.building/projects/`. This is a known limitation. The developer sees it when `/build --status` shows unexpected state. The error message explains the collision and suggests renaming one directory.

## 5. Technical Constraints

- **Claude Code skill system:** Skills at `~/.claude/skills/` are loaded into every session. The skill file format is Markdown with YAML frontmatter. The skill file size has practical limits (it's injected into the context window). The skill file should be concise — it loads the orchestrator, not replaces it.
- **No daemon:** Building does not run a background process. All execution happens within the Claude Code session. State persists on disk between sessions.
- **No network at runtime:** Building does not phone home, check for updates, or report telemetry. The developer controls when to update (git pull + re-run install).
- **Home directory convention:** `~/.building/` is a fixed path. It is not configurable in v1. A developer who wants a different location can symlink.
- **Node.js required:** Building's tools are TypeScript/Node.js. The developer must have Node.js installed. The install command checks for Node.js and prints a clear error if missing.

## 6. Dependencies

- **Claude Code CLI** with skill support at `~/.claude/skills/`. This is confirmed as first-class support.
- **Node.js** (v18+) for building tools and running the install script.
- **npm** for dependency installation.
- **git** in the project directory for source code commits (standard for any dev project; not a Building-specific requirement).

## 7. Out of Scope

- **Windows support.** macOS and Linux only for this milestone.
- **Configurable state directory.** `~/.building/` is the fixed location. Symlinks are the escape hatch.
- **Project name configuration.** The project name is always inferred from the directory basename. No config file, no CLI flag to override it.
- **Migration of existing in-repo projects.** Projects built with the pre-portable Building (state in `.building/` within the project) are not automatically migrated. The developer can start fresh. A migration tool is a future milestone if demand exists.
- **Multi-machine sync.** State lives on the local filesystem. Syncing state across machines (via Dropbox, git, etc.) is the developer's responsibility and not something Building supports or tests.
- **Versioned state migrations.** The version field in state.json increments to 2, but there is no automated migration from v1 to v2 state files. v1 state files are from pre-portable builds and stay in their `.building/` directories.
- **Remote Building.** Running Building on a remote server or in CI. Building runs locally in a Claude Code session.
- **Custom hook configuration.** The developer cannot add their own hooks to Building's pipeline in this milestone.

## 8. Decisions Log

**Decision 1 (Tier 2): No hooks in settings.json — skill enforces gates directly.**
Gate enforcement moves from hooks in `~/.claude/settings.json` to direct Bash tool calls made by the `/build` skill. The skill calls `gate-check.sh` and `detection-check.sh` before/after state transitions. Rationale: hooks in settings.json fire globally on every Claude Code session, creating unnecessary execution scope (every Write in every session runs Building's scripts). The skill already knows when a gate check is needed — it can call the scripts directly, eliminating the global hook surface entirely. No active-run guard needed. No hook entries to manage, merge, or clean up.

**Decision 2 (Tier 2): Project name derived from directory basename only.**
No config file, no flag. The name is `basename $PWD`, lowercased, spaces-to-hyphens. This creates a collision risk for identically-named directories in different locations. Rationale: mandatory config is friction that contradicts the "no configuration" principle. The collision case is rare and detectable. When it happens, the developer sees unexpected state and gets a clear error message suggesting a rename. A future milestone can add disambiguation (e.g., hashing the full path) if collisions prove common.

**Decision 3 (Tier 2): Pipeline state is not git-committed in the portable model.**
State files live under `~/.building/projects/` which is not a git repo. Atomic file writes replace git-based rollback for state durability. Rationale: committing state requires either making `~/.building/` a git repo (complexity the developer doesn't want to manage) or committing Building state into the project repo (violates the clean-project guarantee). Atomic writes provide crash safety. The morning-after summary provides diagnostics. The developer never interacted with state files directly, so the loss of git history for state is invisible.

**Decision 4 (Tier 2): Building home path is baked into the skill file at install time.**
The install command writes the absolute path of the Building repo into the skill file. If the developer moves the Building repo, they re-run the install command. Rationale: runtime discovery of the Building home (via `which building`, environment variables, or search) adds fragile indirection. A baked-in path is simple and debuggable. Moving a repo is rare, and the fix (re-run install) is obvious.

**Decision 5 (Tier 2): ~/.building/ is a fixed path, not configurable.**
The state directory is always `~/.building/` (hidden dotfile). No environment variable, no config option. Developers who want a different location use a symlink. Rationale: configurability here creates a matrix of paths that every component must resolve. For v1, a fixed convention eliminates an entire class of bugs. The symlink escape hatch handles the rare developer who needs a different location. The hidden dotfile convention (`.building/` not `building/`) follows standard tool-state patterns (`.npm`, `.cargo`, `.claude`) and avoids collision with the Building repo itself if cloned to `~/building/`.

**Decision 6 (Tier 2): Implicit bootstrap — no separate setup step per project.**
Running `/build <brief>` on a project with no state directory creates one automatically. The `/build --bootstrap` command is removed as a user-facing command. Rationale: a separate bootstrap step is friction with no value. The developer wants to build, not configure. Creating a directory and writing empty DECISIONS.md and OPEN-ITEMS.md files is fast and invisible.

**Decision 7 (Tier 2): Commit messages in project repo use neutral conventions.**
Source code commits made by Building in the project directory do not use the `[trellis]` prefix. They use descriptive messages that look like a developer wrote them (e.g., "Add user authentication module" not "[trellis] Task 003 complete"). Rationale: the clean-project guarantee extends to git history. A collaborator reading `git log` should not see Building's internal vocabulary.

**Decision 8 (Tier 2): No migration path from pre-portable builds.**
Existing projects with `.building/` state in the project directory are not migrated. The developer starts a new run. Rationale: the pre-portable user base is one person (the Building developer). Migration tooling for one user is not worth the complexity. If Building gains users before this ships, revisit.

Building's own M1-M2 decision history lives in-repo at `milestones/`. The portable pipeline starts fresh. Post-install, Building's own history can be copied: `cp -r milestones/building/ ~/.building/projects/building/milestones/`.

**Decision 9 (Tier 2): Project name collision detection via lockfile.**
On first bootstrap, Building writes `project.lock` to the project state directory containing the full absolute path of the project directory. On every `/build` invocation, the skill checks the lockfile against `$PWD`. Mismatch produces a clear error: "Project name 'api' is already in use by /path/to/other/api/." No automatic disambiguation — detection and error only. Rationale: silent state corruption from name collisions is worse than a blocking error. The lockfile is one file read per invocation (negligible). Resolves XRD PB-1.

**Decision 10 (Tier 2): Uninstall command.**
`npm run uninstall` removes `~/.claude/skills/build/`. Documented in README alongside install. Rationale: a clean uninstall is the developer's expectation. Since no hooks exist in `~/.claude/settings.json`, uninstall is simply removing the skill file directory. Resolves XRD PB-6.

## 9. Open Items

No open Tier 3 items. All decisions above were resolvable with product rationale.
