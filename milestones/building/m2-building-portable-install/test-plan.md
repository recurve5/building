# Test Plan: M2 Portable Install

## 1. Overview

### Scope

This test plan covers all functionality defined in the M2 PRD: path resolution, state schema v2, bootstrap rewrite, hook migration (active-run guard, gate-check, detection-check), gate scripts with new path model, detection scripts with PROJECT_DIR, git commit protocol, install script, uninstall script, clean project guarantee, and global skill file. Every PRD functional requirement and XRD component maps to at least one test case. Edge cases surfaced by the peer review and security review are included explicitly.

### Automation Strategy

All tests are automated. No manual test steps.

- **Unit tests:** Pure logic -- path resolution, project name derivation, state schema validation, bootstrap directory creation. Written in TypeScript using Vitest.
- **Integration tests:** Multi-component flows -- install then build start, hook fires in Building session vs. no-op in non-Building session, gate scripts receiving environment variables. Bash scripts tested via `child_process.execSync` from the TypeScript test harness.
- **Stress tests:** Latency benchmarks for active-run guard, idempotency under rapid re-runs, large state directory handling.

### Test Framework

- TypeScript tests: Vitest
- Bash script tests: invoked from Vitest via `child_process.execSync`, assertions on exit code + stderr/stdout
- Fixtures: temp directories simulating `~/building/`, project directories, and project state directories

### ID Convention

| Area Code | Feature Area |
|-----------|-------------|
| PATH | Path resolver (paths.ts) |
| STATE | State schema v2 |
| BOOT | Bootstrap rewrite |
| HOOK | Hook migration (active-run guard, routing) |
| GATE | Gate scripts with new path model |
| DETECT | Detection scripts with PROJECT_DIR |
| GIT | Git commit protocol |
| INST | Install script |
| UNINST | Uninstall script |
| CLEAN | Clean project guarantee |
| SKILL | Global skill file |

---

## 2. Test Cases by Feature Area

### 2.1 Path Resolution (PRD FR-5, XRD paths.ts)

**Insight driving priority:** The path resolver is the foundation of the entire portable model. Every other component imports from it. A bug in `deriveProjectName()` silently corrupts state directory lookups -- two projects could merge state or a project could become unreachable. The sanitization rules must be identical between TypeScript and bash layers (security review Concern 1).

#### PATH-001: resolvePaths produces correct BuildingPaths for standard inputs

- **ID:** PATH-001
- **Description:** Verify `resolvePaths()` returns correct values for all fields given standard directory paths with no special characters.
- **Input/Setup:** `buildingHome = "/Users/dev/building"`, `projectDir = "/Users/dev/Desktop/fitness-tracker"`.
- **Expected Result:** `projectName = "fitness-tracker"`, `projectState = "$HOME/building/projects/fitness-tracker"`, `orchestrator = "/Users/dev/building/orchestrator.md"`, `prompts = "/Users/dev/building/prompts/"`, `hooks = "/Users/dev/building/.building/hooks/"`, `gates = "/Users/dev/building/.building/hooks/gates/"`, `runs = "$HOME/building/projects/fitness-tracker/runs/"`, `milestones = "$HOME/building/projects/fitness-tracker/milestones/"`, `decisions = "$HOME/building/projects/fitness-tracker/DECISIONS.md"`.
- **Priority:** P0

#### PATH-002: deriveProjectName lowercases uppercase characters

- **ID:** PATH-002
- **Description:** Verify project name derivation lowercases directory names.
- **Input/Setup:** `projectDir = "/Users/dev/Desktop/MyApp"`.
- **Expected Result:** `deriveProjectName()` returns `"myapp"`.
- **Priority:** P0

#### PATH-003: deriveProjectName replaces spaces with hyphens

- **ID:** PATH-003
- **Description:** Verify spaces in directory basename are converted to hyphens.
- **Input/Setup:** `projectDir = "/Users/dev/Desktop/My Cool App"`.
- **Expected Result:** `deriveProjectName()` returns `"my-cool-app"`.
- **Priority:** P0

#### PATH-004: deriveProjectName strips shell metacharacters

- **ID:** PATH-004
- **Description:** Verify all characters not matching `[a-z0-9-]` are stripped after lowercasing and space replacement. Addresses security review Concern 1 and peer review Issue 6.
- **Input/Setup:** `projectDir = "/Users/dev/Desktop/my;rm -rf ~/"`.
- **Expected Result:** `deriveProjectName()` returns `"myrm--rf-"` after stripping `;`, ` `, `~`, `/`, then collapsing consecutive hyphens and trimming: `"myrm-rf"`.
- **Priority:** P0

#### PATH-005: deriveProjectName collapses consecutive hyphens

- **ID:** PATH-005
- **Description:** Verify consecutive hyphens from sanitization are collapsed to a single hyphen.
- **Input/Setup:** `projectDir = "/Users/dev/Desktop/my---app"`.
- **Expected Result:** `deriveProjectName()` returns `"my-app"`.
- **Priority:** P1

#### PATH-006: deriveProjectName trims leading and trailing hyphens

- **ID:** PATH-006
- **Description:** Verify leading and trailing hyphens are removed after sanitization.
- **Input/Setup:** `projectDir = "/Users/dev/Desktop/-my-app-"`.
- **Expected Result:** `deriveProjectName()` returns `"my-app"`.
- **Priority:** P1

#### PATH-007: deriveProjectName handles empty basename

- **ID:** PATH-007
- **Description:** Verify behavior when the basename resolves to empty after sanitization (e.g., directory name is all special characters).
- **Input/Setup:** `projectDir = "/Users/dev/Desktop/!!!"`.
- **Expected Result:** Function throws an error with a message indicating the project name cannot be derived. Does not return an empty string.
- **Priority:** P0

#### PATH-008: deriveProjectName handles trailing slash

- **ID:** PATH-008
- **Description:** Verify a trailing slash on the directory path does not produce an empty basename.
- **Input/Setup:** `projectDir = "/Users/dev/Desktop/my-app/"`.
- **Expected Result:** `deriveProjectName()` returns `"my-app"`.
- **Priority:** P1

#### PATH-009: resolvePaths is pure computation -- no filesystem calls

- **ID:** PATH-009
- **Description:** Verify that `resolvePaths()` makes no filesystem calls (no `fs.existsSync`, no `fs.statSync`, etc.). It is pure path string computation.
- **Input/Setup:** Call `resolvePaths()` with paths to directories that do not exist on disk.
- **Expected Result:** Function completes without error. All returned paths are strings. No `ENOENT` or filesystem errors.
- **Priority:** P1

#### PATH-010: Bash sanitization matches TypeScript sanitization

- **ID:** PATH-010
- **Description:** Verify that the bash `resolve_project_paths()` function in `common.sh` produces the same project name as the TypeScript `deriveProjectName()` for a set of edge-case inputs. Addresses peer review Issue 6 (both layers must implement the same rule).
- **Input/Setup:** Test matrix of 10 directory names including: lowercase, uppercase, spaces, special characters, consecutive hyphens, leading/trailing hyphens, Unicode, empty-after-sanitization.
- **Expected Result:** For each input, bash and TypeScript produce identical project names.
- **Priority:** P0

### 2.2 State Schema v2 (PRD FR-6, XRD types.ts + state.ts)

#### STATE-001: Version 2 state includes project_dir field

- **ID:** STATE-001
- **Description:** Verify `createInitialState()` with the new signature produces a state object with `version: 2` and `project_dir` populated.
- **Input/Setup:** Call `createInitialState()` with `projectDir = "/Users/dev/Desktop/my-app"`.
- **Expected Result:** Returned state has `version: 2`, `project_dir: "/Users/dev/Desktop/my-app"`.
- **Priority:** P0

#### STATE-002: Version 1 state files are readable

- **ID:** STATE-002
- **Description:** Verify `readState()` accepts a state.json with `version: 1` and no `project_dir` field. Forward compatibility.
- **Input/Setup:** Fixture state.json with `"version": 1`, no `project_dir` field, all other fields valid.
- **Expected Result:** `readState()` succeeds. Returns valid state object. No validation error.
- **Priority:** P0

#### STATE-003: Version 2 state requires project_dir

- **ID:** STATE-003
- **Description:** Verify `validateSchema()` rejects a version 2 state that is missing the `project_dir` field.
- **Input/Setup:** state.json with `"version": 2`, `project_dir` field absent.
- **Expected Result:** Validation fails with error identifying missing `project_dir`.
- **Priority:** P0

#### STATE-004: Writing state always produces version 2

- **ID:** STATE-004
- **Description:** Verify `writeState()` outputs version 2 regardless of what version was read.
- **Input/Setup:** Read a version 1 state, modify a field, write it back.
- **Expected Result:** Written state.json has `"version": 2`.
- **Priority:** P1

#### STATE-005: Atomic write integrity preserved

- **ID:** STATE-005
- **Description:** Verify state writes continue to use atomic temp-file-then-rename pattern after the schema changes.
- **Input/Setup:** Write state to disk. Verify implementation writes to temp path first, then renames.
- **Expected Result:** At no point is state.json partially written. Implementation uses temp file + rename.
- **Priority:** P0

### 2.3 Bootstrap Rewrite (PRD FR-4, XRD bootstrap.ts)

#### BOOT-001: Bootstrap creates project state directory structure

- **ID:** BOOT-001
- **Description:** Verify `bootstrap()` creates the correct directory tree under `~/building/projects/<project-name>/`.
- **Input/Setup:** `projectName = "fitness-tracker"`, `projectState = "/tmp/test-building/projects/fitness-tracker"`, `projectDir = "/tmp/test-project"`. Target directories do not exist.
- **Expected Result:** Created directories: `runs/`, `milestones/`. Created files: `DECISIONS.md`, `OPEN-ITEMS.md`, `project.lock`. DECISIONS.md and OPEN-ITEMS.md are stubs (empty or minimal header content).
- **Priority:** P0

#### BOOT-002: Bootstrap writes project.lock with correct content

- **ID:** BOOT-002
- **Description:** Verify `project.lock` contains the full absolute path to the project directory, the derived project name, and a creation timestamp. Addresses PRD Decision 9 and peer review Issue 1.
- **Input/Setup:** Bootstrap with `projectDir = "/Users/dev/Desktop/my-app"`.
- **Expected Result:** `project.lock` contains JSON: `{ "project_dir": "/Users/dev/Desktop/my-app", "project_name": "my-app", "created": "<ISO timestamp>" }`.
- **Priority:** P0

#### BOOT-003: Bootstrap detects project name collision via lockfile

- **ID:** BOOT-003
- **Description:** Verify that bootstrapping a second project with the same derived name but different `projectDir` produces a collision error.
- **Input/Setup:** First bootstrap: `projectDir = "/Users/dev/work/api"`. Second bootstrap: `projectDir = "/Users/dev/personal/api"`. Both derive project name `"api"`.
- **Expected Result:** Second bootstrap call throws error with message: "Project name 'api' is already in use by /Users/dev/work/api/." No state corruption. Second project's state is not written.
- **Priority:** P0

#### BOOT-004: Bootstrap collision check passes when projectDir matches lockfile

- **ID:** BOOT-004
- **Description:** Verify that re-running bootstrap from the same project directory does not trigger a collision error.
- **Input/Setup:** Bootstrap from `/Users/dev/Desktop/my-app`. Bootstrap again from `/Users/dev/Desktop/my-app`.
- **Expected Result:** Second call succeeds. `alreadyBootstrapped: true` in result. No error.
- **Priority:** P0

#### BOOT-005: Bootstrap is idempotent

- **ID:** BOOT-005
- **Description:** Verify running bootstrap twice on the same project does not duplicate directories, overwrite existing DECISIONS.md content, or create duplicate files.
- **Input/Setup:** Bootstrap once. Write content to DECISIONS.md. Bootstrap again.
- **Expected Result:** DECISIONS.md content preserved (not overwritten with stub). Directory structure unchanged. `alreadyBootstrapped: true`.
- **Priority:** P0

#### BOOT-006: Bootstrap does NOT create .building/ in project directory

- **ID:** BOOT-006
- **Description:** Verify the new bootstrap creates no directories or files in the project directory itself.
- **Input/Setup:** Bootstrap with a project directory. List contents of project directory before and after.
- **Expected Result:** Project directory contents identical before and after bootstrap. No `.building/` directory. No `.claude/settings.local.json` changes.
- **Priority:** P0

#### BOOT-007: Bootstrap does NOT write to .claude/settings.local.json

- **ID:** BOOT-007
- **Description:** Verify bootstrap does not modify the project-level Claude settings file.
- **Input/Setup:** Create `.claude/settings.local.json` in project directory with known content. Run bootstrap.
- **Expected Result:** `.claude/settings.local.json` content unchanged after bootstrap.
- **Priority:** P0

#### BOOT-008: Bootstrap does NOT commit to git

- **ID:** BOOT-008
- **Description:** Verify bootstrap produces no git commits in either the project repo or the state directory.
- **Input/Setup:** Initialize git repo in project directory. Record git log. Run bootstrap. Check git log again.
- **Expected Result:** No new commits in project repo. (State directory is not a git repo, so no commits there either.)
- **Priority:** P1

#### BOOT-009: BootstrapResult interface has correct shape

- **ID:** BOOT-009
- **Description:** Verify the returned `BootstrapResult` has `created` (string array) and `alreadyBootstrapped` (boolean) fields, and does NOT have the removed fields (`hooksInstalled`, `dependenciesInstalled`, `commitHash`). Addresses peer review Issue 5.
- **Input/Setup:** Run bootstrap, inspect the return value.
- **Expected Result:** Result has `created` and `alreadyBootstrapped`. No `hooksInstalled`, `dependenciesInstalled`, or `commitHash` properties.
- **Priority:** P1

### 2.4 Hook Migration (PRD FR-9, XRD Active-Run Guard + gate-check.sh + detection-check.sh)

**Insight driving priority:** The active-run guard is the mechanism that makes global hooks safe for non-Building sessions. If it reads stdin before determining the session is non-Building, it violates the latency guarantee (PRD FR-9: under 5ms) and the security property (S-2: non-Building sessions should not feed file content to hooks). Peer review Issue 2 identified this as HIGH severity.

#### HOOK-001: Active-run guard exits before reading stdin when no project state exists

- **ID:** HOOK-001
- **Description:** Verify that when `$PWD` does not correspond to any project under `~/building/projects/`, the hook script exits 0 without reading stdin. Addresses peer review Issue 2 and security review S-2.
- **Input/Setup:** Set `PWD` to a directory with no matching project state. Pipe test data to stdin. Run `gate-check.sh` with `BUILDING_HOME` set.
- **Expected Result:** Exit code 0. Script exits before any `cat` or stdin read. Stdin data is unconsumed.
- **Priority:** P0

#### HOOK-002: Active-run guard exits before reading stdin when runs directory is empty

- **ID:** HOOK-002
- **Description:** Verify the guard handles an existing but empty `runs/` directory. Addresses peer review Contradiction C-1 (glob expansion under set -e).
- **Input/Setup:** Create `~/building/projects/test-project/runs/` as an empty directory. Set `PWD` to a matching project directory.
- **Expected Result:** Exit code 0. No error from empty glob. Uses `find` instead of `ls` glob expansion.
- **Priority:** P0

#### HOOK-003: Active-run guard exits when latest run is halted

- **ID:** HOOK-003
- **Description:** Verify the guard exits 0 (no-op) when the latest run's state.json has `halted: true`.
- **Input/Setup:** Create project state with one run. Set `halted: true` in state.json.
- **Expected Result:** Exit code 0. No gate check executes.
- **Priority:** P1

#### HOOK-004: Active-run guard exits when latest run is complete

- **ID:** HOOK-004
- **Description:** Verify the guard exits 0 when the final stage is marked complete.
- **Input/Setup:** Create project state with one run. Set stage 11 status to `"complete"` in state.json.
- **Expected Result:** Exit code 0.
- **Priority:** P1

#### HOOK-005: Active-run guard proceeds to gate logic when an active run exists

- **ID:** HOOK-005
- **Description:** Verify the guard reads stdin and executes gate logic when an active, non-halted, non-complete run exists.
- **Input/Setup:** Create project state with an active run (halted: false, final stage not complete). Pipe valid hook input JSON to stdin with a state.json file path.
- **Expected Result:** Script reads stdin, parses the hook input JSON, and proceeds to gate check logic (or exits based on the file path check).
- **Priority:** P0

#### HOOK-006: gate-check.sh receives BUILDING_HOME from environment

- **ID:** HOOK-006
- **Description:** Verify gate-check.sh uses `$BUILDING_HOME` environment variable to locate gate scripts, not `git rev-parse`.
- **Input/Setup:** Set `BUILDING_HOME` to a test directory containing gate scripts. Do NOT have a `.git` directory. Run gate-check.sh with valid input.
- **Expected Result:** Script finds and invokes gate scripts from `$BUILDING_HOME/.building/hooks/gates/`. No `git rev-parse` calls. No git-related errors.
- **Priority:** P0

#### HOOK-007: gate-check.sh exports PROJECT_STATE, PROJECT_DIR, PROJECT_NAME to gate scripts

- **ID:** HOOK-007
- **Description:** Verify gate-check.sh exports the three path variables as environment variables before invoking individual gate scripts. Addresses peer review Issue 3.
- **Input/Setup:** Create a test gate script that echoes `$PROJECT_STATE`, `$PROJECT_DIR`, and `$PROJECT_NAME` to stdout. Configure gate-check.sh to invoke it.
- **Expected Result:** The test gate script receives all three variables with correct values. `PROJECT_STATE` points to `~/building/projects/<name>/`. `PROJECT_DIR` matches the `cwd` from hook input. `PROJECT_NAME` matches the derived name.
- **Priority:** P0

#### HOOK-008: gate-check.sh state.json path regex matches new location

- **ID:** HOOK-008
- **Description:** Verify the file path regex in gate-check.sh matches paths under `~/building/projects/` and does NOT match the old `.building/runs/` pattern.
- **Input/Setup:** Test with file path `$HOME/building/projects/my-app/runs/20250512T120000Z-abc1234/state.json`. Test with old path `.building/runs/20250512T120000Z-abc1234/state.json`.
- **Expected Result:** New path matches. Old path does not match.
- **Priority:** P0

#### HOOK-009: detection-check.sh mirrors gate-check.sh path changes

- **ID:** HOOK-009
- **Description:** Verify detection-check.sh has the same active-run guard, BUILDING_HOME usage, and path resolution as gate-check.sh.
- **Input/Setup:** Same setup as HOOK-001 through HOOK-006 but targeting detection-check.sh.
- **Expected Result:** Identical guard behavior: exits before stdin for non-Building sessions, uses BUILDING_HOME, derives PROJECT_STATE correctly.
- **Priority:** P0

#### HOOK-010: common.sh resolve_project_paths() exports correct variables

- **ID:** HOOK-010
- **Description:** Verify the new `resolve_project_paths()` function in common.sh sets PROJECT_DIR, PROJECT_NAME, and PROJECT_STATE correctly when sourced by gate/detection scripts.
- **Input/Setup:** Source common.sh in a test bash script. Call `resolve_project_paths` with a known cwd.
- **Expected Result:** `$PROJECT_DIR`, `$PROJECT_NAME`, `$PROJECT_STATE` are set with correct values matching the TypeScript path resolver output.
- **Priority:** P0

#### HOOK-011: milestone_dir() in common.sh uses PROJECT_STATE

- **ID:** HOOK-011
- **Description:** Verify `milestone_dir()` looks up milestones under `$PROJECT_STATE/milestones/`, not under the project root via `git rev-parse`.
- **Input/Setup:** Set `PROJECT_STATE` to a test directory containing `milestones/m1-test/`. Call `milestone_dir "m1-test"`.
- **Expected Result:** Returns the path under `$PROJECT_STATE/milestones/m1-test/`. No `git rev-parse` invocation.
- **Priority:** P0

### 2.5 Gate Scripts with New Path Model (XRD gate-*.sh)

#### GATE-001: gate-0-to-1.sh uses PROJECT_STATE for milestone lookup

- **ID:** GATE-001
- **Description:** Verify gate-0-to-1.sh searches for milestone directories under `$PROJECT_STATE/milestones/` instead of `$PROJECT_ROOT/milestones`.
- **Input/Setup:** Set `PROJECT_STATE` env var pointing to test fixture. Create `$PROJECT_STATE/milestones/m1-test/` with required artifacts. Run gate-0-to-1.sh.
- **Expected Result:** Gate finds milestone directory under PROJECT_STATE. Exit code 0 (or 1 based on artifact presence, but no path resolution errors).
- **Priority:** P0

#### GATE-002: gate-9-to-10.sh uses BUILDING_HOME for audit binary

- **ID:** GATE-002
- **Description:** Verify gate-9-to-10.sh resolves `AUDIT_BIN` from `$BUILDING_HOME/tools/building-audit/...` instead of `$PROJECT_ROOT/tools/...`.
- **Input/Setup:** Set `BUILDING_HOME` to test fixture with audit binary present. Run gate-9-to-10.sh.
- **Expected Result:** Gate invokes audit binary from BUILDING_HOME path. No reference to PROJECT_ROOT for tool binaries.
- **Priority:** P0

#### GATE-003: Gate scripts that use MILESTONE_DIR argument are unaffected

- **ID:** GATE-003
- **Description:** Verify gate scripts that already receive `$MILESTONE_DIR` as a positional argument (gate-2-to-3.sh, etc.) continue to work without changes. Addresses peer review Gap G-2.
- **Input/Setup:** Pass `MILESTONE_DIR` as positional arg pointing to a test fixture. Run gate-2-to-3.sh.
- **Expected Result:** Gate operates correctly using the passed MILESTONE_DIR. No independent path derivation via git.
- **Priority:** P1

#### GATE-004: No gate script uses git rev-parse

- **ID:** GATE-004
- **Description:** Verify that after migration, no gate script contains `git rev-parse --show-toplevel`.
- **Input/Setup:** Grep all files in `.building/hooks/gates/` for `git rev-parse`.
- **Expected Result:** Zero matches.
- **Priority:** P0

### 2.6 Detection Scripts with PROJECT_DIR (XRD detection scripts)

#### DETECT-001: scope-audit.sh uses PROJECT_DIR for git operations

- **ID:** DETECT-001
- **Description:** Verify scope-audit.sh uses `$PROJECT_DIR` (the developer's project directory) for `git diff`, not `git rev-parse --show-toplevel`.
- **Input/Setup:** Initialize a git repo at a test project directory. Set `PROJECT_DIR` to that directory. Stage a file change. Run scope-audit.sh with task fixture.
- **Expected Result:** scope-audit runs `git -C $PROJECT_DIR diff` (or equivalent). Correctly identifies in-scope and out-of-scope file changes.
- **Priority:** P0

#### DETECT-002: ghost-reference.sh uses PROJECT_DIR for git and PROJECT_STATE for DECISIONS.md

- **ID:** DETECT-002
- **Description:** Verify ghost-reference.sh uses `$PROJECT_DIR` for git operations and `$PROJECT_STATE` to locate DECISIONS.md.
- **Input/Setup:** Set up git repo at PROJECT_DIR. Place DECISIONS.md with a Hard Kill entry at `$PROJECT_STATE/DECISIONS.md`. Create a source file in PROJECT_DIR referencing the killed concept.
- **Expected Result:** ghost-reference detects the reference. Reads DECISIONS.md from PROJECT_STATE, not from PROJECT_DIR.
- **Priority:** P0

#### DETECT-003: dependency-check.sh uses PROJECT_DIR for git operations

- **ID:** DETECT-003
- **Description:** Verify dependency-check.sh uses `$PROJECT_DIR` for package manifest inspection.
- **Input/Setup:** Set `PROJECT_DIR` to test project with package.json. Run dependency-check.sh.
- **Expected Result:** Script inspects `$PROJECT_DIR/package.json`, not a path derived from `git rev-parse`.
- **Priority:** P1

#### DETECT-004: No detection script uses git rev-parse

- **ID:** DETECT-004
- **Description:** Verify that after migration, no detection script contains `git rev-parse --show-toplevel`.
- **Input/Setup:** Grep all files in `.building/hooks/detections/` for `git rev-parse`.
- **Expected Result:** Zero matches.
- **Priority:** P0

### 2.7 Git Protocol (PRD FR-8, XRD git.ts)

#### GIT-001: commitProjectCode commits in the project repo

- **ID:** GIT-001
- **Description:** Verify `commitProjectCode()` creates a commit in the project directory's git repo.
- **Input/Setup:** Initialize git repo at `/tmp/test-project/`. Create a file. Call `commitProjectCode("/tmp/test-project/", ["file.ts"], "Add file")`.
- **Expected Result:** `git log` in `/tmp/test-project/` shows a commit with message "Add file". The committed file is `file.ts`.
- **Priority:** P0

#### GIT-002: Commit messages use neutral developer conventions

- **ID:** GIT-002
- **Description:** Verify commit messages do not use Building-internal vocabulary (`[trellis]`, `[building]`, task IDs). Addresses PRD Decision 7.
- **Input/Setup:** Call `commitProjectCode()` with message "Add user authentication module".
- **Expected Result:** Commit message is exactly "Add user authentication module". No `[trellis]` prefix. No task ID. No Building vocabulary.
- **Priority:** P0

#### GIT-003: Old state-commit functions are removed

- **ID:** GIT-003
- **Description:** Verify `commitRunStart`, `commitStageComplete`, `commitHalt`, `commitOverride`, `commitMorningAfter` are no longer exported from git.ts.
- **Input/Setup:** Import git.ts module. Check for existence of removed function names.
- **Expected Result:** None of the five removed functions exist as exports.
- **Priority:** P0

#### GIT-004: State changes are NOT git-committed

- **ID:** GIT-004
- **Description:** Verify that writing state.json, events, or other pipeline artifacts does not produce git commits anywhere.
- **Input/Setup:** Create a run. Write state.json changes (stage advancement). Check git log in both project repo and state directory.
- **Expected Result:** No new commits related to state changes. State persists on filesystem only.
- **Priority:** P0

### 2.8 Install Script (PRD FR-1, XRD setup.ts)

#### INST-001: Install creates ~/building/ and ~/building/projects/

- **ID:** INST-001
- **Description:** Verify the install script creates the state root directories.
- **Input/Setup:** Run setup.ts with `HOME` set to a temp directory. Neither `~/building/` nor `~/building/projects/` exist.
- **Expected Result:** Both directories created. `~/building/` has permissions 700 (per security review S-3).
- **Priority:** P0

#### INST-002: Install creates ~/.claude/skills/build/SKILL.md

- **ID:** INST-002
- **Description:** Verify the skill file is written to the correct global location.
- **Input/Setup:** Run setup.ts with `HOME` set to a temp directory.
- **Expected Result:** File exists at `~/.claude/skills/build/SKILL.md`. File contains the correct BUILDING_HOME path.
- **Priority:** P0

#### INST-003: Install writes hook entries to ~/.claude/settings.json

- **ID:** INST-003
- **Description:** Verify hook entries are written with BUILDING_HOME baked into command strings.
- **Input/Setup:** Run setup.ts. Read `~/.claude/settings.json`.
- **Expected Result:** settings.json has `hooks.PreToolUse` array entries with `matcher: "Write"` and command strings containing `BUILDING_HOME=<path> bash <path>/.building/hooks/gate-check.sh` and the equivalent for detection-check.sh.
- **Priority:** P0

#### INST-004: Install merges with existing settings.json content

- **ID:** INST-004
- **Description:** Verify the install preserves existing entries in settings.json and does not overwrite other hooks. Addresses peer review Issue 7.
- **Input/Setup:** Create `~/.claude/settings.json` with an existing `PreToolUse` hook entry from another tool. Run setup.ts.
- **Expected Result:** Existing hook entry preserved. Building's hook entries appended. No data loss.
- **Priority:** P0

#### INST-005: Install is idempotent

- **ID:** INST-005
- **Description:** Verify running the install twice produces the same result -- no duplicate hook entries, no duplicate directories, skill file overwritten with same content.
- **Input/Setup:** Run setup.ts. Run setup.ts again.
- **Expected Result:** Only one set of Building hook entries in settings.json. Skill file exists (overwritten, not duplicated). Directories unchanged.
- **Priority:** P0

#### INST-006: Install updates existing hook entries on re-install

- **ID:** INST-006
- **Description:** Verify that if the hook command format changes between versions, re-running install replaces old Building hook entries rather than appending new ones alongside stale ones. Addresses peer review Issue 11.
- **Input/Setup:** Install with BUILDING_HOME=/old/path. Change BUILDING_HOME. Install again.
- **Expected Result:** Old hook entries (referencing /old/path) removed. New entries (referencing new path) present. No duplicates.
- **Priority:** P1

#### INST-007: Install fails cleanly when npm install fails

- **ID:** INST-007
- **Description:** Verify partial failure does not leave a stale skill file. Addresses XRD PB-5.
- **Input/Setup:** Simulate `npm install` failure (e.g., invalid package.json). Run setup.ts.
- **Expected Result:** Script exits non-zero. No skill file written. Error message printed.
- **Priority:** P0

#### INST-008: Skill file is the success indicator

- **ID:** INST-008
- **Description:** Verify that the skill file is the last thing written -- if it exists, install succeeded.
- **Input/Setup:** Simulate failure at step 4 (directory creation). Verify skill file is not written. Then run successful install and verify skill file exists.
- **Expected Result:** Skill file absent on partial failure. Present on full success.
- **Priority:** P1

#### INST-009: Install creates ~/.claude/skills/ if absent

- **ID:** INST-009
- **Description:** Verify the install handles the case where `~/.claude/skills/` does not exist.
- **Input/Setup:** `HOME` points to temp directory with no `.claude/` directory.
- **Expected Result:** `~/.claude/skills/build/` created. Skill file written.
- **Priority:** P1

#### INST-010: Install checks for Node.js availability

- **ID:** INST-010
- **Description:** Verify the install prints a clear error if Node.js is not available.
- **Input/Setup:** Run setup.ts in an environment where `node` is not on PATH (or mock the check).
- **Expected Result:** Clear error message about Node.js requirement. Exit non-zero.
- **Priority:** P2

### 2.9 Uninstall Script (PRD Decision 10, XRD Task E3)

#### UNINST-001: Uninstall removes skill file

- **ID:** UNINST-001
- **Description:** Verify `npm run uninstall` deletes `~/.claude/skills/build/` directory.
- **Input/Setup:** Install Building. Run uninstall.
- **Expected Result:** `~/.claude/skills/build/` no longer exists.
- **Priority:** P0

#### UNINST-002: Uninstall removes hook entries from settings.json

- **ID:** UNINST-002
- **Description:** Verify uninstall cleans Building's hook entries from `~/.claude/settings.json`. Addresses XRD PB-6.
- **Input/Setup:** Install Building (hooks written). Run uninstall. Read settings.json.
- **Expected Result:** No Building hook entries remain. Other entries (from other tools) preserved.
- **Priority:** P0

#### UNINST-003: Uninstall preserves project state

- **ID:** UNINST-003
- **Description:** Verify uninstall does NOT delete `~/building/projects/`. State is preserved for potential re-install.
- **Input/Setup:** Create project state under `~/building/projects/my-app/`. Run uninstall.
- **Expected Result:** `~/building/projects/my-app/` and all contents still exist.
- **Priority:** P0

#### UNINST-004: Uninstall is safe when already uninstalled

- **ID:** UNINST-004
- **Description:** Verify running uninstall when Building is not installed does not error.
- **Input/Setup:** No skill file exists. No Building hooks in settings.json. Run uninstall.
- **Expected Result:** Exit code 0. No errors. Prints message indicating nothing to remove.
- **Priority:** P1

### 2.10 Clean Project Guarantee (PRD FR-7)

#### CLEAN-001: No .building/ directory in project dir

- **ID:** CLEAN-001
- **Description:** Verify that after bootstrap and a simulated build cycle, no `.building/` directory exists in the project directory.
- **Input/Setup:** Bootstrap a project. Simulate state writes. List all files and directories in project dir.
- **Expected Result:** No `.building/` directory present.
- **Priority:** P0

#### CLEAN-002: No Building references in .gitignore

- **ID:** CLEAN-002
- **Description:** Verify no Building-specific entries are added to the project's `.gitignore`.
- **Input/Setup:** Create a project with a `.gitignore`. Bootstrap. Check `.gitignore` content.
- **Expected Result:** `.gitignore` is unchanged. No `.building/` entry or Building-related patterns added.
- **Priority:** P0

#### CLEAN-003: No hooks in .claude/settings.local.json

- **ID:** CLEAN-003
- **Description:** Verify no Building hooks appear in the project-level settings file.
- **Input/Setup:** Bootstrap a project. Check for `.claude/settings.local.json` in project directory.
- **Expected Result:** File either does not exist or contains no Building hook entries.
- **Priority:** P0

#### CLEAN-004: No Building vocabulary in commit messages

- **ID:** CLEAN-004
- **Description:** Verify that commits made by `commitProjectCode()` contain no Building-internal terms.
- **Input/Setup:** Run `commitProjectCode()` multiple times with various messages. Scan git log.
- **Expected Result:** No commit message contains `[trellis]`, `[building]`, `Building`, `trellis`, task IDs in `task-NNN` format, or stage numbers in Building's format.
- **Priority:** P0

#### CLEAN-005: No Building references in generated source files

- **ID:** CLEAN-005
- **Description:** Verify source code output does not contain "generated by Building" comments or Building paths.
- **Input/Setup:** After a build cycle, grep all files in project directory for "building", "trellis", BUILDING_HOME path.
- **Expected Result:** Zero matches for Building-specific references.
- **Priority:** P1

### 2.11 Global Skill File (PRD FR-2, XRD Skill File)

#### SKILL-001: Skill file contains correct BUILDING_HOME

- **ID:** SKILL-001
- **Description:** Verify the generated skill file has the correct absolute path for Building home.
- **Input/Setup:** Install with BUILDING_HOME=/Users/dev/building. Read skill file.
- **Expected Result:** Skill file contains `Building home: /Users/dev/building` (or equivalent unambiguous reference). Addresses peer review Gap G-4.
- **Priority:** P0

#### SKILL-002: Skill file references orchestrator.md by absolute path

- **ID:** SKILL-002
- **Description:** Verify the skill file points to orchestrator.md using the BUILDING_HOME path.
- **Input/Setup:** Read generated skill file.
- **Expected Result:** Contains reference to `<BUILDING_HOME>/orchestrator.md` with the actual path interpolated.
- **Priority:** P0

#### SKILL-003: Skill file is regenerated on re-install

- **ID:** SKILL-003
- **Description:** Verify that running install again overwrites the skill file with fresh content (picks up any template changes).
- **Input/Setup:** Install. Modify the skill file manually. Re-install.
- **Expected Result:** Skill file content matches the template output, not the manually modified version.
- **Priority:** P1

#### SKILL-004: Skill file derives project name from PWD

- **ID:** SKILL-004
- **Description:** Verify the skill file's routing logic uses basename of PWD to identify the project.
- **Input/Setup:** Read skill file content. Verify it contains instructions to derive project name from the working directory.
- **Expected Result:** Skill file contains project name derivation logic (lowercased basename, sanitized).
- **Priority:** P1

#### SKILL-005: Skill file routes state to ~/building/projects/<project>/

- **ID:** SKILL-005
- **Description:** Verify the skill file directs state operations to the correct project state path.
- **Input/Setup:** Read skill file content.
- **Expected Result:** Contains reference to `~/building/projects/<project>/runs/` for state lookups.
- **Priority:** P1

---

## 3. Integration Tests

### INT-001: Install -> Bootstrap -> Gate fires -> Status check -> Clean project dir

- **Description:** End-to-end flow: run install script, bootstrap a new project (implicit via `/build` invocation), verify gate enforcement fires on state.json write, check build status, verify project directory is clean.
- **Input/Setup:** Temp Building home with all scripts. Temp project directory with git repo. Temp HOME for install artifacts.
- **Steps:**
  1. Run install script.
  2. Verify skill file and hooks installed.
  3. Bootstrap a project (create state directory).
  4. Create a run with initial state.
  5. Simulate a state.json write that advances a stage.
  6. Pipe the write event through gate-check.sh and verify it fires.
  7. Verify project directory contains no `.building/`, no Building hooks.
- **Expected Result:** All steps complete. Gate fires on stage advancement. Project dir is clean.
- **Priority:** P0

### INT-002: Hook fires in Building session, no-ops in non-Building session

- **Description:** Verify the same hook script behaves differently based on whether a Building run is active.
- **Input/Setup:** Set up project state with an active run. Set up a second project directory with no state.
- **Steps:**
  1. Run gate-check.sh with PWD set to the Building-managed project. Pipe valid hook input.
  2. Run gate-check.sh with PWD set to the non-Building project. Pipe valid hook input.
- **Expected Result:** First invocation: gate logic executes (exit 0 or 1 based on gate). Second invocation: exits 0 immediately without reading stdin.
- **Priority:** P0

### INT-003: Bootstrap with collision produces error

- **Description:** Verify the collision detection flow end-to-end.
- **Input/Setup:** Bootstrap project from `/path/a/api`. Then attempt bootstrap from `/path/b/api`.
- **Steps:**
  1. Bootstrap first project.
  2. Attempt bootstrap for second project with same derived name.
- **Expected Result:** Second bootstrap fails with collision error message containing the first project's path.
- **Priority:** P0

### INT-004: Gate scripts receive environment variables from gate-check.sh

- **Description:** Verify the full chain: gate-check.sh sets env vars, calls a gate script, gate script accesses PROJECT_STATE and PROJECT_DIR.
- **Input/Setup:** Set up complete fixture with BUILDING_HOME, project state with milestone artifacts, and a mock gate script that validates its environment.
- **Steps:**
  1. Run gate-check.sh with valid hook input triggering a stage advancement.
  2. Gate script checks for PROJECT_STATE, PROJECT_DIR, PROJECT_NAME in its environment.
- **Expected Result:** All three variables present and correct in the gate script's environment.
- **Priority:** P0

### INT-005: Install then uninstall leaves clean system

- **Description:** Verify install followed by uninstall removes all Building artifacts except project state.
- **Input/Setup:** Run install. Create a project with state. Run uninstall.
- **Steps:**
  1. Verify skill file and hooks exist after install.
  2. Run uninstall.
  3. Verify skill file removed.
  4. Verify hooks removed from settings.json.
  5. Verify project state preserved.
- **Expected Result:** System clean except for `~/building/projects/` (intentionally preserved).
- **Priority:** P1

### INT-006: Detection scripts receive PROJECT_DIR for git operations

- **Description:** Verify detection scripts correctly use PROJECT_DIR for git commands in the full detection-check.sh pipeline.
- **Input/Setup:** Set up a project git repo with staged changes. Set up project state with milestone artifacts. Run detection-check.sh.
- **Steps:**
  1. Create a file change in PROJECT_DIR that is out of scope.
  2. Run detection-check.sh with appropriate hook input.
  3. Verify scope-audit uses PROJECT_DIR for git diff.
- **Expected Result:** scope-audit detects the out-of-scope change using PROJECT_DIR's git repo.
- **Priority:** P0

---

## 4. Stress Tests

### STRESS-001: Active-Run Guard Latency for Non-Building Sessions

- **Target:** PRD FR-9 promises under 5ms overhead for non-Building sessions.
- **Method:** Set PWD to a directory with no matching project state. Invoke gate-check.sh 1000 times. Measure per-invocation wall-clock time.
- **Load parameters:** 1000 invocations. No project state directory exists for the test PWD.
- **Pass threshold:** p95 latency under 5ms per invocation.
- **Fail threshold:** p95 exceeds 5ms, or any single invocation exceeds 20ms.
- **Priority:** P0

### STRESS-002: Install Idempotency Under Rapid Re-Runs

- **Target:** PRD FR-1 idempotency guarantee under repeated execution.
- **Method:** Run the install script 10 times in rapid succession. After each run, verify settings.json has exactly one set of Building hook entries and skill file is correct.
- **Load parameters:** 10 sequential installs.
- **Pass threshold:** After all 10 runs, settings.json has exactly 2 Building hook entries (gate-check and detection-check). Skill file content is correct. No corruption.
- **Fail threshold:** Duplicate hook entries, corrupted settings.json, or missing skill file after any run.
- **Priority:** P1

### STRESS-003: Large State Directory Handling (100 Projects)

- **Target:** System behavior with many projects under `~/building/projects/`.
- **Method:** Create 100 project state directories, each with a run containing state.json. Bootstrap a 101st project. Run status check. Run gate-check.sh.
- **Load parameters:** 100 existing project directories. Each has one run with valid state.json.
- **Pass threshold:** Bootstrap of 101st project completes in under 1 second. Status check returns correct result in under 2 seconds (PRD NFR-2). Gate-check.sh performance unaffected (guard checks only the current project's directory, not all 100).
- **Fail threshold:** Bootstrap, status, or gate-check latency scales with total project count.
- **Priority:** P2

### STRESS-004: Hook Fast-Path for Non-State.json Writes

- **Target:** Hook overhead for file writes that are not to state.json.
- **Method:** With an active Building run, simulate 500 Write hook invocations for source code files (not state.json). Measure per-invocation time.
- **Load parameters:** 500 writes to non-state-json paths. Active run exists.
- **Pass threshold:** p95 under 10ms (the fast-path regex check exits before any heavy logic).
- **Fail threshold:** p95 exceeds 10ms.
- **Priority:** P1

---

## 5. Implementation Notes

### Test Fixture Strategy

All tests use isolated temp directories. No test modifies the real `~/building/`, `~/.claude/`, or any system directory.

**Creating test fixtures:**

```typescript
// Helper: create a minimal Building home fixture
function createBuildingHomeFixture(tmpDir: string): string {
  const buildingHome = path.join(tmpDir, "building-home");
  // Create: .building/hooks/gates/, .building/hooks/detections/,
  //         .building/hooks/lib/common.sh, tools/, prompts/
  // Copy or stub gate/detection scripts
  return buildingHome;
}

// Helper: create a project state fixture
function createProjectStateFixture(tmpDir: string, projectName: string, opts?: {
  activeRun?: boolean;
  halted?: boolean;
  complete?: boolean;
}): string {
  const projectState = path.join(tmpDir, "building", "projects", projectName);
  // Create: runs/, milestones/, DECISIONS.md, OPEN-ITEMS.md, project.lock
  // If activeRun: create runs/<id>/state.json with appropriate flags
  return projectState;
}

// Helper: create a project directory fixture
function createProjectDirFixture(tmpDir: string, name: string): string {
  const projectDir = path.join(tmpDir, name);
  // Create directory, optionally git init
  return projectDir;
}

// Helper: create a HOME fixture with .claude/ structure
function createHomeDirFixture(tmpDir: string): string {
  const home = path.join(tmpDir, "home");
  // Create: .claude/skills/, .claude/settings.json (empty or stub)
  return home;
}
```

### Testing Hook Scripts Without Claude Code

Hook scripts are tested by simulating Claude Code's behavior:

1. **Stdin simulation:** Pipe JSON matching Claude Code's hook input format to the script's stdin:
   ```json
   {
     "tool_name": "Write",
     "tool_input": {
       "file_path": "/path/to/state.json",
       "content": "{...state content...}"
     },
     "cwd": "/Users/dev/Desktop/my-app"
   }
   ```

2. **Environment setup:** Set `BUILDING_HOME` in the environment before invoking the script, matching how the settings.json command string would set it.

3. **PWD control:** Set the `PWD` environment variable to simulate different working directories (Building-managed vs. non-Building).

4. **Invocation pattern:**
   ```typescript
   const result = execSync(
     `BUILDING_HOME=${buildingHome} bash ${buildingHome}/.building/hooks/gate-check.sh`,
     {
       input: JSON.stringify(hookInput),
       env: { ...process.env, PWD: projectDir, HOME: testHome },
       cwd: projectDir,
     }
   );
   ```

### Testing the Install Script Without Modifying Real ~/.claude/

The install script is tested by overriding `HOME`:

```typescript
const testHome = path.join(tmpDir, "home");
fs.mkdirSync(path.join(testHome, ".claude"), { recursive: true });

execSync("node tools/install/setup.js", {
  env: { ...process.env, HOME: testHome },
  cwd: buildingRepoDir,
});

// Assertions against testHome paths
expect(fs.existsSync(path.join(testHome, ".claude/skills/build/SKILL.md"))).toBe(true);
expect(fs.existsSync(path.join(testHome, "building/projects"))).toBe(true);
```

The install script must use `os.homedir()` or `process.env.HOME` for all home directory references, never a hardcoded path.

### Testing Bash/TypeScript Parity (PATH-010)

The sanitization parity test works by:

1. Defining a shared test matrix of directory names.
2. Running each through the TypeScript `deriveProjectName()`.
3. Running each through the bash sanitization in `common.sh` (`resolve_project_paths()`).
4. Asserting identical output for every input.

```typescript
const testCases = [
  "/path/to/MyApp",
  "/path/to/my cool app",
  "/path/to/my;rm -rf ~/",
  "/path/to/---app---",
  "/path/to/UPPER_case",
  "/path/to/app.v2",
  "/path/to/!!!",
  "/path/to/a",
  "/path/to/my--app",
  "/path/to/app/",
];

for (const tc of testCases) {
  const tsResult = deriveProjectName(tc);
  const bashResult = execSync(
    `source ${buildingHome}/.building/hooks/lib/common.sh && derive_project_name "${tc}"`,
    { shell: "/bin/bash" }
  ).toString().trim();
  expect(tsResult).toBe(bashResult);
}
```

### Verifying stdin Is Not Read (HOOK-001)

To verify the active-run guard exits without reading stdin, use a named pipe (FIFO) that blocks on read:

```typescript
// Create a FIFO that will block if read
const fifo = path.join(tmpDir, "stdin-fifo");
execSync(`mkfifo ${fifo}`);

// Run hook with stdin from the FIFO, with a timeout
// If the script tries to read stdin, it blocks and times out
// If the script exits without reading stdin, it completes quickly
const start = Date.now();
try {
  execSync(
    `BUILDING_HOME=${buildingHome} timeout 1 bash ${hookScript} < ${fifo}`,
    { env: { ...process.env, PWD: nonBuildingDir, HOME: testHome } }
  );
} catch (e) {
  // timeout returns exit code 124 if it killed the process
  if (e.status === 124) {
    throw new Error("Hook read stdin for non-Building session -- should exit before reading");
  }
}
const elapsed = Date.now() - start;
expect(elapsed).toBeLessThan(500); // Should exit near-instantly
```

---

## 6. PRD Feature Coverage Confirmation

| PRD Section | Feature | Test Cases |
|-------------|---------|------------|
| FR-1 | Install command | INST-001 through INST-010 |
| FR-2 | Global skill file | SKILL-001 through SKILL-005 |
| FR-3 | Project state directory | BOOT-001, BOOT-002, PATH-001 |
| FR-4 | Bootstrap replacement | BOOT-001 through BOOT-009 |
| FR-5 | Path resolution | PATH-001 through PATH-010 |
| FR-6 | State schema update | STATE-001 through STATE-005 |
| FR-7 | Clean project guarantee | CLEAN-001 through CLEAN-005 |
| FR-8 | Git commit protocol | GIT-001 through GIT-004 |
| FR-9 | Hook migration | HOOK-001 through HOOK-011 |
| Decision 2 | Project name from basename | PATH-002 through PATH-008 |
| Decision 7 | Neutral commit messages | GIT-002, CLEAN-004 |
| Decision 9 | Collision detection (lockfile) | BOOT-002, BOOT-003, BOOT-004 |
| Decision 10 | Uninstall command | UNINST-001 through UNINST-004 |
| NFR-2 | Invocation overhead <2s | STRESS-003 |
| NFR-5 | macOS + Linux compat | PATH-010, GATE-004, DETECT-004 |

### Peer Review Issue Coverage

| Peer Review Issue | Test Cases |
|-------------------|------------|
| Issue 1 (project.lock missing from XRD) | BOOT-002, BOOT-003, BOOT-004 |
| Issue 2 (active-run guard reads stdin) | HOOK-001, HOOK-002, STRESS-001 |
| Issue 3 (PROJECT_STATE in gate scripts) | HOOK-007, GATE-001, INT-004 |
| Issue 5 (BootstrapResult interface) | BOOT-009 |
| Issue 6 (sanitization rule) | PATH-004, PATH-005, PATH-006, PATH-010 |
| Issue 7 (settings.json merge) | INST-004 |
| Issue 11 (hook entries on update) | INST-006 |
| Issue 12 (uninstall script) | UNINST-001 through UNINST-004 |
| Contradiction C-1 (empty runs glob) | HOOK-002 |
| Gap G-2 (milestone_dir in common.sh) | HOOK-011 |

### Security Review Coverage

| Security Finding | Test Cases |
|------------------|------------|
| S-2 (hooks execute on all sessions) | HOOK-001, INT-002, STRESS-001 |
| S-3 (state dir permissions) | INST-001 |
| Concern 1 (command injection via dir name) | PATH-004, PATH-010 |

---

## 7. Priority Summary

### P0 (Blocks ship) -- 37 tests

PATH-001, PATH-002, PATH-003, PATH-004, PATH-007, PATH-010, STATE-001, STATE-002, STATE-003, STATE-005, BOOT-001, BOOT-002, BOOT-003, BOOT-004, BOOT-005, BOOT-006, BOOT-007, HOOK-001, HOOK-002, HOOK-005, HOOK-006, HOOK-007, HOOK-008, HOOK-009, HOOK-010, HOOK-011, GATE-001, GATE-002, GATE-004, DETECT-001, DETECT-002, DETECT-004, GIT-001, GIT-002, GIT-003, INST-001, INST-002, INST-003, INST-004, INST-005, INST-007, UNINST-001, UNINST-002, UNINST-003, CLEAN-001, CLEAN-002, CLEAN-003, CLEAN-004, SKILL-001, SKILL-002, INT-001, INT-002, INT-003, INT-004, INT-006, STRESS-001.

### P1 (Should fix) -- 20 tests

PATH-005, PATH-006, PATH-008, PATH-009, STATE-004, BOOT-008, BOOT-009, HOOK-003, HOOK-004, GATE-003, DETECT-003, GIT-004, INST-006, INST-008, INST-009, UNINST-004, CLEAN-005, SKILL-003, SKILL-004, SKILL-005, INT-005, STRESS-002, STRESS-004.

### P2 (Nice to have) -- 2 tests

INST-010, STRESS-003.
