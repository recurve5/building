# DAY-ZERO: M2 Portable Install

Every task in this milestone reads this file before starting. It defines the shared interfaces, schemas, conventions, and verified assumptions that cross-task dependencies rely on.

---

## D0-1: Path Resolver Interface

Central path resolution module at `tools/trellis/src/paths.ts`. Every other module imports from it. No module constructs paths to Building, state, or project resources independently.

```typescript
interface BuildingPaths {
  buildingHome: string;    // BUILDING_HOME — where Building's source lives
  projectDir: string;      // PROJECT_DIR — developer's working directory
  projectState: string;    // PROJECT_STATE — ~/.building/projects/<project-name>/
  projectName: string;     // derived from basename of projectDir

  // Building source paths
  orchestrator: string;    // $BUILDING_HOME/orchestrator.md
  prompts: string;         // $BUILDING_HOME/prompts/
  agents: string;          // $BUILDING_HOME/.claude/agents/
  hooks: string;           // $BUILDING_HOME/.building/hooks/
  gates: string;           // $BUILDING_HOME/.building/hooks/gates/
  detections: string;      // $BUILDING_HOME/.building/hooks/detections/
  hooksLib: string;        // $BUILDING_HOME/.building/hooks/lib/
  trellisbin: string;      // $BUILDING_HOME/tools/trellis/dist/
  auditbin: string;        // $BUILDING_HOME/tools/building-audit/dist/

  // Project state paths
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

### Rules

- `resolvePaths()` is pure computation. No filesystem calls, no side effects. Given two root paths, every derived path is deterministic.
- `deriveProjectName()` applies D0-12 sanitization rules to `basename(projectDir)`.
- All trailing slashes on `projectDir` are stripped before basename extraction.
- If sanitization produces an empty string, `deriveProjectName()` throws an error.

---

## D0-2: State Schema v2

The `TrellisState` interface gains a `project_dir` field and the version becomes a union.

```typescript
interface TrellisState {
  // ... all existing fields unchanged ...
  project_dir: string;     // absolute path to project directory at run creation
  version: 1 | 2;         // was: version: 1
}
```

### Backward Compatibility Rules

- `readState()` accepts version 1 state files. Version 1 files have no `project_dir` field. Validation does not reject them.
- `readState()` accepts version 2 state files. Version 2 files require `project_dir`.
- `writeState()` always writes version 2. If a version 1 state is read, modified, and written back, it becomes version 2.
- `validateSchema()` splits behavior: version 1 is read-only compatible (no `project_dir` required), version 2 requires `project_dir`.
- `createInitialState()` gains a `projectDir` parameter. New signature: `createInitialState(runId, project, milestone, briefHash, projectDir)`. Always produces version 2.

### State Snapshots

```typescript
function snapshotState(runDir: string, stageNumber: number): void;
```

Before each stage transition (before writing the new stage status to state.json), the skill calls `snapshotState()` to copy `state.json` to `state.json.stage-N` where N is the stage being exited. This provides a forensic debugging trail.

- Snapshots are simple file copies, not atomic writes (the source state.json is stable at snapshot time).
- At most ~12 snapshot files accumulate per run (one per stage transition).
- Snapshot files are never read by the pipeline — they exist for developer debugging only.

---

## D0-3: Bootstrap Contract

```typescript
function bootstrap(
  projectName: string,
  projectState: string,
  projectDir: string
): BootstrapResult;

interface BootstrapResult {
  created: string[];           // list of directories/files created
  alreadyBootstrapped: boolean;
}
```

### Bootstrap Actions

1. Check for `project.lock` at `$PROJECT_STATE/project.lock`. If it exists and `project_dir` does not match `projectDir`, throw collision error (see format below). If it matches, set `alreadyBootstrapped = true` and return without creating anything.
2. Create directories: `$PROJECT_STATE/`, `$PROJECT_STATE/runs/`, `$PROJECT_STATE/milestones/`.
3. Write stub files: `$PROJECT_STATE/DECISIONS.md` (header only), `$PROJECT_STATE/OPEN-ITEMS.md` (header only).
4. Write `$PROJECT_STATE/project.lock`.

### Bootstrap Does NOT

- Create `.building/` in the project directory.
- Write to `.claude/settings.local.json`.
- Run `npm install` or `npm run build`.
- Create git commits.

### project.lock Format

```json
{
  "project_dir": "/absolute/path/to/project",
  "project_name": "derived-name",
  "created": "2026-05-12T12:00:00.000Z"
}
```

### Collision Error Message

```
Project name '<name>' is already in use by <existing_project_dir>.
Rename one directory or use a symlink.
```

### Idempotency

Running bootstrap on an already-bootstrapped project (same `projectDir` matching lockfile) returns `{ created: [], alreadyBootstrapped: true }`. Does not overwrite DECISIONS.md or OPEN-ITEMS.md content.

---

## D0-4: Gate Script Invocation Format

No hooks are installed in `~/.claude/settings.json`. The `/build` skill invokes gate-check.sh and detection-check.sh directly via Bash tool calls with environment variables:

```bash
BUILDING_HOME=/absolute/path \
PROJECT_DIR=/absolute/path/to/project \
PROJECT_STATE=/home/user/.building/projects/project-name \
  bash /absolute/path/.building/hooks/gate-check.sh
```

The skill constructs this command with all paths known at invocation time. The scripts receive all context via environment variables — no stdin parsing, no `$PWD` derivation, no hook system involvement.

This is simpler than the previous hook-based approach because:
- No hook command string format to verify with a spike.
- No active-run guard needed (the skill only calls scripts during an active build).
- No stdin JSON parsing needed (all paths are env vars).
- Standard Bash env var passing, which is universally supported.

---

## D0-5: (Removed — Active-Run Guard Not Needed)

The active-run guard was required when hooks in `~/.claude/settings.json` fired on every Write in every Claude Code session. Since gate scripts are now invoked by the skill via direct Bash tool calls (only during an active build), no guard is needed. The skill only calls gate-check.sh and detection-check.sh when a build is running.

---

## D0-6: Gate Script Environment Contract

`gate-check.sh` and `detection-check.sh` receive the following environment variables from the skill's Bash tool call, and re-export them for child scripts (gate scripts, detection scripts):

```bash
export BUILDING_HOME   # set by the skill's Bash tool call
export PROJECT_DIR     # set by the skill's Bash tool call
export PROJECT_STATE   # set by the skill's Bash tool call
export PROJECT_NAME    # derived from PROJECT_DIR basename (D0-12 sanitization)
```

### Gate Script Interface

Gate scripts receive positional arguments (unchanged from M1):
- `$1` = `RUN_DIR` (absolute path to the run directory)
- `$2` = `MILESTONE_DIR` (absolute path to the current milestone directory)

Gate scripts that need `PROJECT_STATE`, `PROJECT_DIR`, or `BUILDING_HOME` access them as environment variables. They do NOT derive paths independently via `git rev-parse`.

### Detection Script Interface

Detection scripts receive positional arguments:
- `$1` = `RUN_DIR`
- `$2` = `COMPLETING_TASK` (task ID)
- `$3` = `MILESTONE_DIR`

Detection scripts that need `PROJECT_DIR` for git operations access it as the `$PROJECT_DIR` environment variable.

### Milestone Directory Resolution

`MILESTONE_DIR` is resolved by the router scripts (`gate-check.sh` / `detection-check.sh`) using:

```bash
MILESTONE_DIR=$(find "$PROJECT_STATE/milestones" -type d -name "$MILESTONE" 2>/dev/null | head -1)
```

Where `$MILESTONE` is extracted from `state.json`.

---

## D0-7: Git Commit Protocol

```typescript
function commitProjectCode(
  projectDir: string,
  files: string[],
  message: string
): CommitResult;

interface CommitResult {
  hash: string;
  filesCommitted: string[];
}
```

### Rules

- Commits only in the project repo (the developer's project directory).
- Commit messages use neutral developer conventions. No `[trellis]` prefix, no `[building]` prefix, no task IDs in `task-NNN` format.
- Examples of valid messages: "Add user authentication module", "Fix password validation edge case", "Update API response types".

### Removed Functions

The following functions are removed from `git.ts` and from `index.ts` re-exports:
- `commitRunStart`
- `commitStageComplete`
- `commitHalt`
- `commitOverride`
- `commitMorningAfter`

State changes persist via filesystem writes only. The `~/.building/` directory is not a git repo.

---

## D0-8: Install Script Contract

`tools/install/setup.ts` is invoked via `npm run setup` from the Building repo root.

### Actions (in order)

1. Verify Node.js availability.
2. Run `npm install` in repo root.
3. Run `npm run build` in `tools/trellis/`.
4. Run `npm run build` in `tools/building-audit/`.
5. Determine `BUILDING_HOME` as `process.cwd()` (the repo root).
6. Create `~/.building/` with permissions 700 if it does not exist.
7. Create `~/.building/projects/` if it does not exist.
8. Create `~/.claude/skills/build/` if it does not exist.
9. Read skill template from `tools/install/skill-template.md`.
10. Interpolate `{{BUILDING_HOME}}` placeholders with the determined path.
11. Write to `~/.claude/skills/build/SKILL.md`.
12. Print summary.

No hook entries are written to `~/.claude/settings.json`. Gate enforcement is handled by the skill via direct Bash tool calls.

### Failure Behavior

- If any step fails, print the error and exit non-zero.
- The skill file write (step 11) is the final critical action. If it was not written, the install is incomplete.
- The skill file's existence is the single indicator of a successful install.

### Idempotency

Running install twice produces the same result: one skill file, directories unchanged.

### Home Directory References

The install script uses `os.homedir()` or `process.env.HOME` for all home directory paths. Never hardcoded.

---

## D0-9: Uninstall Script Contract

`tools/install/uninstall.ts` is invoked via `npm run uninstall` from the Building repo root.

### Actions

1. Remove `~/.claude/skills/build/` directory (skill file and containing directory).
2. Print summary of what was removed.

No hook entries need to be cleaned from `~/.claude/settings.json` — none are written by the install script.

### Does NOT

- Delete `~/.building/projects/`. Project state is preserved for potential re-install.
- Delete `~/.building/`. The root state directory is preserved.
- Modify `~/.claude/settings.json`.

### Safe When Already Uninstalled

Running uninstall when Building is not installed exits 0 with a message indicating nothing to remove.

---

## D0-10: Clean Project Guarantee

After a build completes (or at any point during Building's operation), the project directory must pass this verification checklist:

1. No `.building/` directory in the project root.
2. No Building-specific entries in `.gitignore` (no `.building/` pattern added by Building).
3. No references to Building in any generated source file (no "generated by Building" comments, no Building paths in configs).
4. No hooks in `.claude/settings.local.json` or `~/.claude/settings.json` that reference Building.
5. No `[trellis]` or `[building]` prefixes in git commit messages authored by Building.

### Verification Test

The integration test creates a project, runs a build cycle, and checks all five conditions. This is test CLEAN-001 through CLEAN-005.

---

## D0-11: Skill Template Contract

The skill template lives at `tools/install/skill-template.md` and is interpolated at install time.

### Template Variables

- `{{BUILDING_HOME}}` — replaced with the absolute path to the Building repository.

### Content Requirements

The skill file must include inline (not just by reference):
- The three-path model: BUILDING_HOME, PROJECT_DIR, PROJECT_STATE resolution rules.
- Project name derivation from `basename $PWD` with D0-12 sanitization.
- State directory location: `~/.building/projects/<project-name>/`.
- Command routing table: `/build <brief>`, `/build --status`, `/build --resume`.
- **State write protocol:** how to read, validate, snapshot (copy state.json to state.json.stage-N before transitions), and write state.json.
- **Stage advancement sequence:** the ordered list of stages and their transitions.
- **Gate enforcement behavior:** before writing state.json to advance a stage, call `gate-check.sh` via Bash tool with BUILDING_HOME, PROJECT_DIR, and PROJECT_STATE as env vars. Call `detection-check.sh` via Bash tool after task completions.
- **Sub-agent dispatch with context curation:** paths to `$BUILDING_HOME/.claude/agents/` for peer-reviewer, task-auditor, security-reviewer, sdm-assessor, and rules for what context to pass to each.
- **Halt/resume protocol:** how to halt a run and how `/build --resume` picks up from the halted stage.
- **Override protocol:** how overrides are recorded and applied.
- Project.lock collision check: on every `/build` invocation, check `$PROJECT_STATE/project.lock` against `$PWD`.

The skill file references orchestrator.md only for:
- Full pipeline stage descriptions (what each stage does in detail).
- Agent role definitions (the agent prompts themselves, not the paths).

### Rationale

The skill file must not be so thin that losing the orchestrator.md reference breaks the pipeline (SDM Risk R-2). All critical protocol rules go inline — state write protocol, stage advancement, gate enforcement via Bash tool calls, sub-agent dispatch, halt/resume, and override protocol. Only stage descriptions and agent role content go by reference.

---

## D0-12: Project Name Sanitization Rules

Both TypeScript (`deriveProjectName()` in `paths.ts`) and bash (`resolve_project_paths()` in `common.sh`) must implement identical sanitization:

1. Extract basename from the directory path (strip trailing slashes first).
2. Lowercase all characters.
3. Replace spaces with hyphens.
4. Strip all characters not matching `[a-z0-9-]`.
5. Collapse consecutive hyphens to a single hyphen.
6. Trim leading and trailing hyphens.

### Examples

| Input basename | Output |
|----------------|--------|
| `fitness-tracker` | `fitness-tracker` |
| `MyApp` | `myapp` |
| `My Cool App` | `my-cool-app` |
| `my;rm -rf ~/` | `myrm-rf` |
| `---app---` | `app` |
| `UPPER_case` | `upper-case` |
| `app.v2` | `appv2` |
| `!!!` | ERROR (empty after sanitization) |
| `a` | `a` |
| `my--app` | `my-app` |

### Bash Implementation

```bash
derive_project_name() {
  local dir="$1"
  # Strip trailing slashes, extract basename
  dir="${dir%/}"
  local name
  name=$(basename "$dir")
  # Lowercase
  name=$(echo "$name" | tr '[:upper:]' '[:lower:]')
  # Spaces to hyphens
  name=$(echo "$name" | tr ' ' '-')
  # Strip non [a-z0-9-]
  name=$(echo "$name" | sed 's/[^a-z0-9-]//g')
  # Collapse consecutive hyphens
  name=$(echo "$name" | sed 's/--*/-/g')
  # Trim leading/trailing hyphens
  name=$(echo "$name" | sed 's/^-//;s/-$//')
  
  if [ -z "$name" ]; then
    echo "ERROR: Cannot derive project name from directory '$(basename "$dir")'" >&2
    return 1
  fi
  echo "$name"
}
```

### Cross-Layer Parity

Test PATH-010 verifies that the TypeScript and bash implementations produce identical output for a matrix of edge-case inputs. Both layers must be updated together if the rules change.

---

## Verified Assumptions

| # | Assumption | Source | Status |
|---|-----------|--------|--------|
| VA-1 | Claude Code hook input JSON includes a `cwd` field | M1 spike report | Verified |
| VA-2 | `$PWD` in hook subprocess matches `cwd` from hook input JSON | M1 spike report | Verified |
| VA-3 | Non-zero exit code from hook blocks the Write | M1 spike report | Verified |
| VA-4 | ~~`BUILDING_HOME=/path bash /path/script.sh` passes env var through Claude Code hook system~~ | ~~Unverified~~ | **No longer needed** — hooks removed; skill uses Bash tool calls with standard env vars |
| VA-5 | Claude Code skills at `~/.claude/skills/` are loaded into every session | Claude Code documentation | Assumed true |
| VA-6 | Gate scripts gate-1-to-2.sh through gate-8-to-9.sh have no `git rev-parse` calls | SDM review codebase assessment | Verified |
| VA-7 | `milestone_dir()` in common.sh has zero callers in current codebase | SDM review | Verified |

---

## Test Plan Cross-Reference

| Task | Test Plan IDs |
|------|--------------|
| 001 (Skill template spike) | SKILL-001 through SKILL-005 (partial) |
| 002 (Path resolver) | PATH-001 through PATH-009 |
| 003 (State schema v2 + snapshots) | STATE-001 through STATE-005, SNAP-001 |
| 004 (Gate script normalization) | GATE-004 (partial — pre-task cleanup) |
| 005 (Gate script entry points rewrite) | GATE-ENTRY-001 through GATE-ENTRY-006 |
| 006 (Gate script updates) | GATE-001 through GATE-004 |
| 007 (Detection script updates) | DETECT-001 through DETECT-004 |
| 008 (Bootstrap rewrite) | BOOT-001 through BOOT-009 |
| 009 (Run directory update) | (covered by bootstrap and integration tests) |
| 010 (Git module rewrite) | GIT-001 through GIT-004 |
| 011 (Skill template + content) | SKILL-001 through SKILL-005 |
| 012 (Install script) | INST-001 through INST-008 |
| 013 (Uninstall script) | UNINST-001 through UNINST-003 |
| 014 (Integration tests) | INT-001 through INT-006, CLEAN-001 through CLEAN-005 |
| 015 (Stress tests) | STRESS-001 through STRESS-004 |

---

## Milestone Directory Note

M2 itself is built under the old model (milestones in-repo at `milestones/building/m2-...`). The new model (milestones at `$PROJECT_STATE/milestones/`) applies to M3+ and external projects. Gate scripts during M2's own build use old paths. New gate scripts are tested via the test harness, not via live usage during M2's build (SDM Risk R-4 mitigation).

Building's own M1-M2 decision history lives in-repo at `milestones/`. The portable pipeline starts fresh. Post-install: `cp -r milestones/building/ ~/.building/projects/building/milestones/`.
