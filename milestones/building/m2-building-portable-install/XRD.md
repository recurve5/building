# XRD: Portable Install

## 1. Architecture

### Three-Path Model

Every component in the portable system resolves paths through three roots. No component holds a hardcoded path to any directory — every path is derived from one of these three values.

```
BUILDING_HOME     ~/code/building/            (where building's source lives)
PROJECT_DIR       ~/Desktop/fitness-tracker/   (where the developer is working)
PROJECT_STATE     ~/.building/projects/fitness-tracker/  (where pipeline state lives)
```

**BUILDING_HOME** is the absolute path to the cloned Building repository. Baked into the skill file at install time. Source of truth for: orchestrator.md, agent prompts (`prompts/`), sub-agent definitions (`.claude/agents/`), tool binaries (`tools/trellis/dist/`, `tools/building-audit/dist/`), gate scripts (`gate-check.sh`, individual gate scripts), detection scripts (`detection-check.sh`, individual detection scripts).

**PROJECT_DIR** is `$PWD` at invocation time — the directory the developer is in when they run `/build`. Source of truth for: the project name (derived from `basename $PWD`), source code output, the project's own git repo.

**PROJECT_STATE** is `~/.building/projects/<project-name>/`. Derived from PROJECT_DIR's basename, lowercased, spaces-to-hyphens. Source of truth for: `runs/<run-id>/state.json`, events, overrides, detections, confidence assessments, milestone planning artifacts (PRD, XRD, tasks, etc.), DECISIONS.md, OPEN-ITEMS.md.

### Path Resolver

A single TypeScript module (`tools/trellis/src/paths.ts`) provides all path resolution. Every other module imports from it. No module constructs paths to Building, state, or project resources on its own.

```typescript
interface BuildingPaths {
  buildingHome: string;    // BUILDING_HOME
  projectDir: string;      // PROJECT_DIR
  projectState: string;    // PROJECT_STATE
  projectName: string;     // derived basename

  // Convenience accessors
  orchestrator: string;    // $BUILDING_HOME/orchestrator.md
  prompts: string;         // $BUILDING_HOME/prompts/
  agents: string;          // $BUILDING_HOME/.claude/agents/
  hooks: string;           // $BUILDING_HOME/.building/hooks/
  gates: string;           // $BUILDING_HOME/.building/hooks/gates/
  detections: string;      // $BUILDING_HOME/.building/hooks/detections/
  hooksLib: string;        // $BUILDING_HOME/.building/hooks/lib/
  trellisbin: string;      // $BUILDING_HOME/tools/trellis/dist/
  auditbin: string;        // $BUILDING_HOME/tools/building-audit/dist/

  runs: string;            // $PROJECT_STATE/runs/
  milestones: string;      // $PROJECT_STATE/milestones/
  decisions: string;       // $PROJECT_STATE/DECISIONS.md
  openItems: string;       // $PROJECT_STATE/OPEN-ITEMS.md
}

function resolvePaths(buildingHome: string, projectDir: string): BuildingPaths;
function deriveProjectName(projectDir: string): string;
function resolveRunDir(projectState: string, runId: string): string;
function resolveMilestoneDir(projectState: string, milestoneName: string): string;
```

The module is pure computation — no filesystem calls, no side effects. Given the two root paths, every derived path is deterministic.

### How Bash Gate Scripts Get the Three Paths

In the portable model, the `/build` skill invokes gate-check.sh and detection-check.sh directly via Bash tool calls. The skill knows all three paths at invocation time and passes them as environment variables:

```bash
# Skill invokes via Bash tool
BUILDING_HOME=/Users/dev/building \
PROJECT_DIR=/Users/dev/Desktop/fitness-tracker \
PROJECT_STATE=/Users/dev/.building/projects/fitness-tracker \
  bash /Users/dev/building/.building/hooks/gate-check.sh
```

No hooks are installed in `~/.claude/settings.json`. No hook entries fire globally. The skill calls the scripts only when a gate check or detection check is needed — during stage transitions and after task completions.

The gate scripts receive all three paths as environment variables. They do not parse stdin JSON or derive paths from `$PWD`. The `common.sh` library gains a `resolve_paths()` function that validates the environment variables are set, replacing the scattered `git rev-parse` calls.

**No active-run guard needed.** The guard was required when hooks fired globally on every Write in every session. Since the skill only calls gate scripts during an active build, the guard is unnecessary and is removed entirely.

### State.json Path Validation

Since gate scripts are invoked by the skill (not by hooks on every Write), the scripts no longer need a fast-path regex to filter non-state.json writes. The skill calls gate-check.sh only when it is about to write state.json. The gate script receives the state.json path via `$PROJECT_STATE/runs/<run-id>/state.json` and validates the transition directly.

### How Sub-Agents Resolve Paths

Sub-agents (peer-reviewer, task-auditor, security-reviewer, sdm-assessor) are spawned by the orchestrator with specific context files. The sub-agent definitions in `.claude/agents/` do not contain paths — the orchestrator passes file paths as arguments when spawning them.

In the portable model, the orchestrator (running from the skill file) knows BUILDING_HOME and PROJECT_STATE. It reads agent definitions from `$BUILDING_HOME/.claude/agents/` and passes milestone artifacts from `$PROJECT_STATE/milestones/<milestone>/` as context.

The sub-agent definitions themselves do not change. The paths change at the orchestrator's dispatch point, not in the agent definitions.

### How the Global Skill File Works

The skill file at `~/.claude/skills/build/SKILL.md` is a fat entry point that includes all critical protocol rules inline. It stores BUILDING_HOME as a constant and contains enough protocol to run the pipeline without depending on successfully loading orchestrator.md for core operations.

The skill file includes inline:
- **State write protocol:** how to read, validate, snapshot, and write state.json.
- **Stage advancement sequence:** the ordered list of stages and their transitions.
- **Gate enforcement behavior:** before writing state.json to advance a stage, call `gate-check.sh` via Bash tool with BUILDING_HOME, PROJECT_DIR, and PROJECT_STATE as env vars.
- **Sub-agent dispatch:** how to spawn sub-agents with context curation, including paths to `$BUILDING_HOME/.claude/agents/`.
- **Halt/resume protocol:** how to halt a run and how `/build --resume` picks up.
- **Override protocol:** how overrides are recorded and applied.

The skill file references orchestrator.md only for:
- Full pipeline stage descriptions (what each stage does in detail).
- Agent role definitions (the agent prompts themselves).

```markdown
---
name: build
description: Run the Building pipeline
user-invocable: true
---

# /build — Pipeline Orchestrator

Building home: /Users/dev/building

[Inline: state write protocol, stage advancement, gate enforcement via Bash tool calls]
[Inline: sub-agent dispatch with context curation]
[Inline: halt/resume and override protocols]

Read /Users/dev/building/orchestrator.md for full stage descriptions and agent roles.
```

The skill file is regenerated on every install. Its content is templated from a source file in the Building repo (`tools/install/skill-template.md`) with BUILDING_HOME interpolated.

### Milestone Directory Relocation

Milestone directories currently live at `$PROJECT_ROOT/milestones/<project>/<milestone>/`. In the portable model, they move to `$PROJECT_STATE/milestones/<milestone>/`. The nesting changes because PROJECT_STATE already scopes to a single project — there is no need for a `<project>/` subdirectory.

### Git Commit Protocol

Two git contexts exist:

1. **Project repo** (`$PROJECT_DIR`): commits source code from Stage 9 task output. Messages use neutral developer conventions (no `[trellis]` prefix). The task-agent writes code to PROJECT_DIR; the orchestrator commits it in the project repo.

2. **Building state** (`$PROJECT_STATE`): not git-committed. State persistence relies on atomic file writes (write-to-temp, rename). The `~/.building/` directory is not a git repo.

The `git.ts` module splits into two functions:
- `commitProjectCode(projectDir, files, message)` — commits in the project repo
- State writes use `writeState()` which already does atomic writes

The existing `commitRunStart`, `commitStageComplete`, `commitHalt`, `commitOverride`, `commitMorningAfter` functions are removed. State changes are persisted by filesystem writes only.

---

## 2. Component Inventory

### Files That Change

#### `tools/trellis/src/paths.ts` (NEW)

New module. Central path resolver. Exports `BuildingPaths` interface and `resolvePaths()` function. All other trellis modules import from this.

#### `tools/trellis/src/types.ts`

- Add `project_dir: string` field to `TrellisState` interface
- Change `version: 1` to `version: 1 | 2` in `TrellisState`
- (The interface literal changes from `version: 1` to a union type)

#### `tools/trellis/src/state.ts`

- `validateSchema()`: accept `version: 1` and `version: 2`. Version 1 is read-only forward compat. Version 2 requires `project_dir` field.
- `createInitialState()`: add `projectDir` parameter, set `version: 2`, populate `project_dir` field.
- `readState()`: no signature change, but validation loosens for version.
- `writeState()`: no change (already does atomic writes).

#### `tools/trellis/src/bootstrap.ts`

Complete rewrite. Current behavior: creates `.building/` in project dir, writes hooks to `.claude/settings.local.json`, commits to project git. All of these behaviors are removed.

New behavior:
- `bootstrap(projectName: string, projectState: string, projectDir: string)` — creates `$PROJECT_STATE/runs/`, `$PROJECT_STATE/milestones/`, writes `DECISIONS.md` and `OPEN-ITEMS.md` stubs.
- Writes `$PROJECT_STATE/project.lock` containing `{ "project_dir": "<absolute path>", "project_name": "<derived name>", "created": "<ISO timestamp>" }`. On subsequent invocations, checks lockfile: if `project_dir` does not match `projectDir`, halts with collision error.
- No `.building/` in project dir.
- No `.claude/settings.local.json` changes.
- No git commit for bootstrap.
- Returns `BootstrapResult` with `{ created: string[], alreadyBootstrapped: boolean }`. Removes `hooksInstalled`, `dependenciesInstalled`, and `commitHash` fields (no callers depend on them — the current skill file does not read these fields).

#### `tools/trellis/src/run.ts`

- `createRunDirectory()`: parameter changes from `buildingDir` to `projectState`. Creates under `$PROJECT_STATE/runs/<run-id>/`.
- `generateRunId()`: no change.

#### `tools/trellis/src/git.ts`

Complete rewrite.

Remove: `commitRunStart`, `commitStageComplete`, `commitHalt`, `commitOverride`, `commitMorningAfter`.

Add: `commitProjectCode(projectDir: string, files: string[], message: string): CommitResult` — commits source code in the project repo with neutral messages.

#### `tools/trellis/src/events.ts`

No change. Already operates on `runDir` parameter, which is an absolute path. The caller passes the path — the module does not derive it.

#### `tools/trellis/src/morning-after.ts`

No change. Already operates on `runDir` parameter.

#### `tools/trellis/src/override.ts`

No change. Already operates on `runDir` parameter.

#### `tools/trellis/src/confidence.ts`

No change. Already operates on `runDir` parameter.

#### `tools/trellis/src/index.ts`

Add export for `paths.ts` module.

#### `.building/hooks/gate-check.sh`

Changes:
- Remove `git rev-parse --show-toplevel` path resolution.
- Receive `BUILDING_HOME`, `PROJECT_DIR`, and `PROJECT_STATE` as environment variables from the skill's Bash tool call (not from a hook command string).
- Remove active-run guard entirely (not needed — the skill only calls this during an active build).
- Remove stdin parsing — the script does not need to read hook input JSON. All paths are provided as env vars.
- Remove `state.json` path regex fast-path (not needed — the skill only calls this for state.json writes).
- Change `SCRIPT_DIR` from `$(dirname "$0")/gates` to `$BUILDING_HOME/.building/hooks/gates`.
- Change milestone dir lookup from `$PROJECT_ROOT/milestones` to `$PROJECT_STATE/milestones`.
- **Export `PROJECT_STATE`, `PROJECT_DIR`, and `PROJECT_NAME` as environment variables** before calling gate scripts. Gate scripts access these as `$PROJECT_STATE`, `$PROJECT_DIR`, etc.

#### `.building/hooks/detection-check.sh`

Same set of changes as gate-check.sh:
- Remove `git rev-parse --show-toplevel`.
- Receive `BUILDING_HOME`, `PROJECT_DIR`, `PROJECT_STATE` from environment.
- Remove active-run guard.
- Remove stdin parsing.
- Change `DETECTIONS_DIR` to use `$BUILDING_HOME/.building/hooks/detections`.
- Change milestone dir lookup to `$PROJECT_STATE/milestones`.

#### `.building/hooks/lib/common.sh`

- `milestone_dir()`: remove `git rev-parse --show-toplevel`. Accept `PROJECT_STATE` as argument or environment variable. Look up milestone under `$PROJECT_STATE/milestones/`.
- Add `resolve_project_paths()` function: validates that `BUILDING_HOME`, `PROJECT_DIR`, and `PROJECT_STATE` environment variables are set. Derives `PROJECT_NAME` from `PROJECT_DIR` basename. Exports them as shell variables for downstream scripts. (No stdin parsing or `$PWD`-based derivation — all paths come from the skill's Bash tool call.)

#### `.building/hooks/gates/gate-0-to-1.sh`

- Remove `PROJECT_ROOT` via git. Use `$PROJECT_STATE` for milestone directory lookup.
- Change milestone search from `$PROJECT_ROOT/milestones` to `$PROJECT_STATE/milestones`.

#### `.building/hooks/gates/gate-2-to-3.sh`

- No path changes needed (already uses `$MILESTONE_DIR` passed from gate-check.sh).

#### `.building/hooks/gates/gate-9-to-10.sh`

- Change `PROJECT_ROOT` from git to `$BUILDING_HOME` for tool binary lookup.
- `AUDIT_BIN` changes from `$PROJECT_ROOT/tools/building-audit/...` to `$BUILDING_HOME/tools/building-audit/...`.

#### `.building/hooks/gates/gate-1-to-2.sh`, `gate-3-to-4.sh`, `gate-4-to-5.sh`, `gate-5-to-6.sh`, `gate-6-to-7.sh`, `gate-7-to-8.sh`, `gate-8-to-9.sh`, `gate-10-to-done.sh`

Each needs audit for `PROJECT_ROOT` / `git rev-parse` usage. Based on the pattern in gate-0-to-1 and gate-8-to-9, most use `$MILESTONE_DIR` which is already passed from gate-check.sh. Those that don't directly reference PROJECT_ROOT are likely clean, but each must be verified.

#### `.building/hooks/detections/scope-audit.sh`

- `PROJECT_ROOT` changes from `git rev-parse` to using the `$PROJECT_DIR` environment variable. Used for `git diff` — this still needs the project's git root. `$PROJECT_DIR` is the developer's project directory where git is.

#### `.building/hooks/detections/ghost-reference.sh`

- Same change: `PROJECT_ROOT` to `$PROJECT_DIR` for git operations. DECISIONS.md lookup changes to `$PROJECT_STATE` path.

#### `.building/hooks/detections/dependency-check.sh`

- `PROJECT_ROOT` to `$PROJECT_DIR` for git operations.

#### `.building/hooks/detections/attempt-counter.sh`

- No change. Already operates on `$RUN_DIR` passed as argument.

#### `.building/hooks/detections/decision-conflict.sh`

- No change. Already operates on `$MILESTONE_DIR` passed as argument.

#### `.claude/skills/build.md` (REMOVED)

Deleted. Replaced by `~/.claude/skills/build/SKILL.md` installed globally.

#### `.claude/agents/peer-reviewer.md`, `task-auditor.md`, `security-reviewer.md`, `sdm-assessor.md`

No content changes. These files stay in Building's repo at their current paths. The orchestrator references them via `$BUILDING_HOME/.claude/agents/`.

#### `tools/install/setup.ts` (NEW)

Install script. Node.js. Invoked via `npm run setup` from Building repo root.

Actions:
1. Run `npm install` in repo root.
2. Run `npm run build` in `tools/trellis/` and `tools/building-audit/`.
3. Determine `BUILDING_HOME` as the repo root (`process.cwd()`).
4. Create `~/.building/` and `~/.building/projects/` if they don't exist.
5. Create `~/.claude/skills/build/` if it doesn't exist.
6. Read skill template from `tools/install/skill-template.md`.
7. Interpolate `BUILDING_HOME` into the template.
8. Write to `~/.claude/skills/build/SKILL.md`.
9. Print summary.

No hook entries are written to `~/.claude/settings.json`. Gate enforcement is handled by the skill via direct Bash tool calls to gate-check.sh and detection-check.sh.

#### `tools/install/skill-template.md` (NEW)

Template for the global skill file. Contains `{{BUILDING_HOME}}` placeholders that the install script replaces.

#### `package.json` (root)

Add `"setup"` script: `"node tools/install/setup.js"`.

---

## 3. Pushback

### PB-1: Project Name Collision Is Not Rare Enough to Ignore

**Issue:** The PRD derives project names from `basename $PWD` only (Decision 2). Two directories named `api` in different locations collide silently. The PRD calls this "rare" but it is common — developers routinely have `~/work/api/` and `~/personal/api/`, or `~/projects/app/` across multiple clients.

**Why it matters:** A collision corrupts state. The developer sees another project's pipeline artifacts, possibly overwriting in-progress state. The PRD says "the developer sees unexpected state and gets a clear error message" — but there is no mechanism described that detects the collision. Building would silently merge state from two projects.

**Proposed resolution:** The state directory includes a lockfile (`project.lock`) written at bootstrap with the full `project_dir` path. On every `/build` invocation, the skill checks the lockfile. If the recorded path does not match `$PWD`, Building halts with a collision error: "Project name 'api' is already in use by /Users/dev/work/api/. Rename one directory or use a symlink." This adds one file read per invocation (negligible cost) and converts a silent corruption into a clear error. No disambiguation hash needed for v1 — detection is sufficient.

### PB-2: ~~Hooks in User-Level Settings Break Multi-User Machines~~

**Eliminated.** No hooks are installed in `~/.claude/settings.json`. The skill invokes gate scripts directly via Bash tool calls. Each user's skill file points to their own BUILDING_HOME. No cross-user interference is possible.

### PB-3: Detection Scripts Need Both PROJECT_DIR and PROJECT_STATE

**Issue:** Detection scripts like `scope-audit.sh` and `ghost-reference.sh` use `git diff` against the project repository. They also need milestone artifacts from PROJECT_STATE.

**Resolution simplified by skill-invoked model.** The skill passes `BUILDING_HOME`, `PROJECT_DIR`, and `PROJECT_STATE` as environment variables when calling `detection-check.sh`. All three are available to detection scripts as env vars. Detection scripts that need git use `$PROJECT_DIR` for `git -C`. Detection scripts that need state artifacts use `$MILESTONE_DIR` (passed as positional arg) or `$PROJECT_STATE` (env var). No stdin parsing needed.

### PB-4: Milestone Directory Discovery Changes Semantics

**Issue:** Gate-check.sh currently discovers milestone directories by searching `$PROJECT_ROOT/milestones/` with `find`. In the portable model, milestones move to `$PROJECT_STATE/milestones/`. But the milestone name in state.json was set when the run started — if the developer renames their project directory between runs, the state directory changes and milestone lookup fails.

**Why it matters:** A developer who renames `~/Desktop/my-app/` to `~/Desktop/my-app-v2/` mid-project loses access to all pipeline state. The state is still on disk at `~/.building/projects/my-app/` but Building now looks at `~/.building/projects/my-app-v2/`.

**Proposed resolution:** The `project_dir` field added to state.json (FR-6) enables detection. On `/build` invocation, if `$PWD` does not match the `project_dir` stored in the most recent run's state.json, Building warns: "This project was originally started in /Users/dev/Desktop/my-app/. State lives at ~/.building/projects/my-app/. Continue?" This is a resume-time check, not a per-hook check — it only fires on explicit `/build` invocations.

### PB-5: Install Script Failure Modes Are Underspecified

**Issue:** The PRD says "if npm install fails, the command prints the error and stops. It does not write a partial skill file." But the install has 6 sequential steps. If step 4 (create `~/.building/`) succeeds but step 5 (write skill file) fails, the system is in a partial state.

**Why it matters:** A developer re-running the install might think it succeeded because `~/.building/` exists, but the skill file is missing or stale.

**Proposed resolution:** The install script uses a checklist pattern: execute all steps, track what succeeded, and at the end report what completed vs. what failed. The skill file write is the final action — if it fails, the install is incomplete regardless of what else succeeded. The skill file's existence is the single indicator of a successful install. The install script exits non-zero if the skill file was not written.

### PB-6: ~~Hook Uninstall Leaves Orphaned Entries~~

**Eliminated.** No hooks are installed in `~/.claude/settings.json`. Uninstall only needs to remove `~/.claude/skills/build/`. No orphaned entries are possible. The `npm run uninstall` command still exists for clean removal of the skill file directory.

---

## 4. Security Assessment

See `security-review.md` for full findings. Summary of classifications:

| ID | Severity | Finding |
|----|----------|---------|
| S-1 | Low | Baked-in absolute path in skill file (reduced — no hook entries in settings.json) |
| S-2 | ~~Medium~~ | ~~User-level hooks execute on all Claude Code sessions~~ — **ELIMINATED** by removing hooks |
| S-3 | Low | State directory readable by any process on the machine |
| S-4 | Low | Atomic write race window |
| S-5 | Info | No integrity verification on hook scripts |

No Critical or High findings. S-2 was eliminated by moving gate enforcement from global hooks to skill-invoked Bash tool calls. S-1 severity reduced from Medium to Low — only the skill file contains a baked-in path (no hook entries in settings.json).

---

## 5. Build Plan

### Track Overview

| Track | Description | Tasks |
|-------|-------------|-------|
| A: Path Resolution | Core paths module + state schema update (with snapshots) | 3 |
| B: Gate Script Migration | gate-check, detection-check, common.sh, all gates, all detections | 5 |
| C: Bootstrap Rewrite | New bootstrap, run directory creation | 2 |
| D: Git Protocol | Split git module, remove state commits | 2 |
| E: Install Script | setup.ts, skill template, package.json | 3 |
| F: Skill Rewrite | Global skill file content, old skill removal | 2 |
| G: Integration + Smoke | End-to-end test, cleanup verification | 2 |

### Phase Sequencing

```
Phase 1: Foundation (Track A)
  Task A1: Skill template spike (verify skill file content approach)
  Task A2: Create paths.ts module
  Task A3: Update types.ts + state.ts (version 2, project_dir, state snapshots)

Phase 2: Infrastructure (Track B + C + D, parallelizable)
  Task B1: Normalize gate script paths (pre-cleanup)
  Task B2: Rewrite gate-check.sh and detection-check.sh (env vars from skill, no guard, no stdin)
  Task B3: Rewrite common.sh with resolve_project_paths()
  Task B4: Update all gate scripts (remove git rev-parse, use env vars)
  Task B5: Update all detection scripts (use PROJECT_DIR env var)
  Task C1: Rewrite bootstrap.ts
  Task C2: Update run.ts (projectState parameter)
  Task D1: Rewrite git.ts (commitProjectCode only)
  Task D2: Update index.ts exports

Phase 3: User-Facing (Track E + F)
  Task E1: Create skill-template.md (fat skill with inline protocol rules)
  Task E2: Create setup.ts install script (no hook entries)
  Task E3: Add uninstall script + update package.json
  Task F1: Write global skill file content
  Task F2: Remove old .claude/skills/build.md

Phase 4: Integration (Track G)
  Task G1: End-to-end integration test (install, build start, skill-invoked gate, status check)
  Task G2: Clean project guarantee verification (no Building artifacts in project dir)
```

### Riskiest Task

**Task B2: Rewrite gate-check.sh and detection-check.sh.** This is the central router for all gate enforcement. Every stage transition passes through it. A bug here either blocks all stage advances (developer cannot progress) or silently allows all advances (gates become no-ops). The rewrite removes stdin parsing, removes the active-run guard, and changes path resolution to use environment variables passed by the skill.

Mitigation: The rewrite is actually simpler than the previous hook-based design. The scripts no longer need to handle non-Building sessions, parse stdin JSON, or regex-match file paths. They receive all context via environment variables and focus purely on gate logic. Task B2 includes a test script that verifies the gate fires correctly when invoked with the correct env vars.

### Integration-Revealing Work First

Phase 1 (paths module) goes first because it establishes the contract every other module depends on. If the three-path model has a design flaw, it surfaces here before 15 files are rewritten to use it.

Phase 2 reveals the integration point: bash gate scripts consuming paths via environment variables passed by the skill's Bash tool calls. This is simpler than the previous hook-based approach — no hook system behavior to verify, just standard env var passing.

Phase 3 (install script) no longer depends on Phase 2 for hook command format — there are no hook entries to write. The install script only writes the skill file.

Phase 4 is pure verification. It runs last because it tests the entire assembled system.

---

## 6. Quality Bar Trace

### Tests Pass

- `tools/trellis/` unit tests updated for new paths module, state.ts version changes, bootstrap rewrite, git module changes.
- New test: `paths.test.ts` verifies `resolvePaths()` produces correct paths for various inputs (spaces in names, uppercase, etc.).
- New test: `state.test.ts` cases for version 1 read compat, version 2 write, project_dir validation.
- New test: `bootstrap.test.ts` verifies project state directory creation under `~/.building/projects/`.
- Hook test script: simulates Claude Code hook input JSON, verifies gate-check.sh and detection-check.sh behavior for Building and non-Building sessions.
- Install script test: runs setup.ts in a temp directory, verifies skill file written, hooks installed, directories created.

### Smoke Test

The PRD does not define a First-Use Walkthrough (this is a non-UI infrastructure milestone). The smoke test is:

1. Clone Building to a temp location.
2. Run `npm run setup`.
3. Verify `~/.claude/skills/build/SKILL.md` exists and contains the correct BUILDING_HOME.
4. Verify `~/.claude/settings.json` does NOT contain Building hook entries.
5. Create a new project directory. Run `/build --status` from it. Verify "no active run" response.
6. Verify the project directory contains no `.building/` directory, no `.claude/settings.local.json`.

### Another Agent Could Pick Up Tomorrow

- `paths.ts` is self-documenting: the `BuildingPaths` interface is the complete map.
- Every changed file's header comment explains the three-path model.
- DECISIONS.md is updated with all Tier 2 decisions made during the build.

### No Dead Code

- Old bootstrap logic (`.building/` in project dir) is removed, not commented out.
- Old git commit functions (state commits) are removed, not left with `// deprecated` comments.
- Old `.claude/skills/build.md` is deleted after the global skill is verified working.

### No Ghost References

- After removing state-commit functions from git.ts, no other module imports them.
- After removing `.claude/skills/build.md`, no settings file references it.
- After removing `.building/` creation from bootstrap, no script references `.building/hooks/` relative to the project directory.
- No hook entries exist in `~/.claude/settings.json` — the install script does not write them.

### Decisions Log Is Current

Every design choice in this XRD that is not directly stated in the PRD is logged as Tier 2 in the milestone DECISIONS.md.
