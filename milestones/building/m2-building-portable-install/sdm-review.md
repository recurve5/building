# SDM Review: M2 Portable Install

**PRD reviewed:** PRD.md
**XRD reviewed:** XRD.md
**Peer review reviewed:** peer-review.md
**Codebase assessed:** tools/trellis/src/, .building/hooks/, .claude/skills/, .claude/agents/
**Reviewer:** sdm-agent

---

## 1. Architecture Fit

### Where the Three-Path Model Fits Naturally

The trellis runtime modules -- `events.ts`, `override.ts`, `morning-after.ts`, `confidence.ts` -- already operate on an absolute `runDir` parameter passed by the caller. They never derive paths internally. This means the three-path model slots in without touching these four modules at all. The XRD correctly identifies them as "No change." This is the strongest structural alignment in the codebase: 4 of 10 source files are already path-agnostic.

The `state.ts` module (`readState`, `writeState`, `validateTransition`) also operates on `runDir` and needs only schema-level changes (version union, `project_dir` field). The path resolution is upstream. The module's `validateSchema()` function at line 107 hardcodes `state.version !== 1`, which needs to become a version-set check, but this is a localized change.

Gate scripts `gate-1-to-2.sh` through `gate-8-to-9.sh` (excluding `gate-0-to-1.sh` and `gate-9-to-10.sh`) contain no `git rev-parse` calls and no `PROJECT_ROOT` references. They receive `$RUN_DIR` and `$MILESTONE_DIR` as positional arguments from `gate-check.sh` and use `$MILESTONE_DIR` for all artifact lookups. These 8 gate scripts need zero path changes as long as `gate-check.sh` passes the correct `MILESTONE_DIR`.

### Where the Three-Path Model Fights the Current Design

**1. gate-check.sh stdin-first architecture (lines 8-9).** The current `gate-check.sh` reads `INPUT=$(cat)` as its first operation (line 8), then derives `FILE_PATH` from that input (line 9). The XRD's active-run guard needs to exit early for non-Building sessions, but exiting before reading stdin means the guard cannot use the hook input JSON to determine the project. The XRD resolves this by using `$PWD` for the guard (checking `~/building/projects/$PROJECT_NAME/runs`), then reading stdin only after confirming an active run. This is sound, but it means gate-check.sh has two path-resolution phases: pre-stdin (using `$PWD` and `$BUILDING_HOME`) and post-stdin (using the JSON `cwd` field). The implementer must understand this two-phase structure or they will accidentally read stdin in the guard.

**2. gate-check.sh relative SCRIPT_DIR (line 57).** Currently: `SCRIPT_DIR="$(dirname "$0")/gates"`. This works because `gate-check.sh` lives alongside the `gates/` directory. In the portable model, the hook command string is `BUILDING_HOME=/path bash /path/.building/hooks/gate-check.sh`. The `$(dirname "$0")` still resolves correctly because bash resolves `$0` to the absolute path in the command string. However, this creates a fragile coupling: the hook command must use an absolute path to `gate-check.sh` (not a relative one) for `dirname "$0"` to work. The XRD's proposed change to `$BUILDING_HOME/.building/hooks/gates` is more robust. This is a genuine improvement.

**3. common.sh `milestone_dir()` function (lines 111-125).** This function independently calls `git rev-parse --show-toplevel` at line 116 and searches `$project_root/milestones`. Gate-check.sh already resolves `MILESTONE_DIR` and passes it as `$2` to every gate script. But `gate-0-to-1.sh` does not use the passed `$MILESTONE_DIR` for its milestone-list check -- it calls `git rev-parse` independently at line 12 and searches `$PROJECT_ROOT/milestones` at line 13. This is a design inconsistency: some gate scripts trust the passed argument, others derive paths independently. The XRD needs to standardize: all gate scripts must use the passed `$MILESTONE_DIR` and/or environment variables, never derive paths independently.

**4. bootstrap.ts is a full rewrite.** The current `bootstrap()` at `tools/trellis/src/bootstrap.ts` creates `.building/` in the project directory (lines 30-59), writes to `.claude/settings.local.json` (lines 62-96), runs `npm install` and `npm run build` in tool directories (lines 99-114), and commits to git (lines 117-137). The XRD replaces all of this with: create `~/building/projects/<name>/` structure, write `project.lock`, no hooks, no npm, no git. Zero lines of the current implementation survive. This is not refactoring; it is a clean rewrite. The current `BootstrapResult` interface has five fields; the new one has two. Any caller that reads `hooksInstalled`, `dependenciesInstalled`, or `commitHash` will break.

**5. git.ts is a full rewrite.** The current `git.ts` exports five functions: `commitRunStart`, `commitStageComplete`, `commitHalt`, `commitOverride`, `commitMorningAfter`. The XRD removes all five and adds one: `commitProjectCode`. The current `index.ts` re-exports all five at lines 39-45. Any consumer importing from `trellis` that calls these functions gets a build error. The skill file (`build.md`) references "commit via git" at multiple points (lines 77, 136, 150, 156, 196-200). While the skill file is prose (not executable code), the orchestrator LLM reads it and follows the instructions -- including "commit state" instructions that will reference removed functions.

**6. run.ts `createRunDirectory` parameter name.** Currently the function signature is `createRunDirectory(buildingDir: string, runId: string)` where `buildingDir` is the `.building/` directory inside the project. The XRD changes this to accept `projectState` (the `~/building/projects/<name>/` directory). The function body at line 27 does `join(buildingDir, "runs", runId)` -- this logic is identical under the new model, only the root changes. The change is mechanical but the parameter rename signals the semantic shift clearly.

### Summary

The architecture fits well at the module level. The trellis runtime is already parameter-driven. The friction is concentrated in three places: (1) `gate-check.sh` and `detection-check.sh` entry-point logic, (2) `gate-0-to-1.sh` and `gate-9-to-10.sh` which derive paths independently, (3) `bootstrap.ts` and `git.ts` which are total rewrites. The rest of the codebase absorbs the change through parameter propagation.

---

## 2. Integration Points

### IP-1: gate-check.sh -> gate scripts interface

**Current interface:** gate-check.sh passes `$RUN_DIR` and `$MILESTONE_DIR` as positional arguments `$1` and `$2`. Gate scripts source `common.sh` via `source "$(dirname "$0")/../lib/common.sh"`.

**What changes:** gate-check.sh must also export `PROJECT_STATE`, `PROJECT_DIR`, and `PROJECT_NAME` as environment variables before calling gate scripts. The XRD specifies this at the gate-check.sh entry but does not specify it as a contract that gate scripts can rely on. Two gate scripts need these variables:
- `gate-0-to-1.sh` line 12-13: needs `PROJECT_STATE` to replace `$PROJECT_ROOT/milestones` lookup.
- `gate-9-to-10.sh` line 10, 41: needs `BUILDING_HOME` (via environment from hook command) to find `tools/building-audit/dist/bin/building-audit.js`.

**What stays the same:** The `$1`/`$2` positional argument interface. All 11 gate scripts receive `$RUN_DIR` as `$1` and `$MILESTONE_DIR` as `$2`.

### IP-2: detection-check.sh -> detection scripts interface

**Current interface:** detection-check.sh passes `$RUN_DIR`, `$COMPLETING_TASK`, and `$MILESTONE_DIR` as positional arguments `$1`, `$2`, `$3`.

**What changes:** Detection scripts that use `git` operations need `PROJECT_DIR` (the developer's project directory, where the git repo is). Three of five detection scripts are affected:
- `scope-audit.sh` line 11: `PROJECT_ROOT` via `git rev-parse` -> needs `$PROJECT_DIR`
- `ghost-reference.sh` line 11: same
- `dependency-check.sh` line 11: same

The peer review (Issue 3, Gap G-2) correctly flags that the XRD needs to specify how `PROJECT_DIR` reaches these scripts. Two options: (a) `detection-check.sh` exports `PROJECT_DIR` as an environment variable, (b) `detection-check.sh` passes it as `$4`. Option (a) is simpler and matches the gate-check.sh pattern.

**What stays the same:** `$1`/`$2`/`$3` positional interface. `attempt-counter.sh` and `decision-conflict.sh` are unaffected (they use only `$RUN_DIR` and `$MILESTONE_DIR`).

### IP-3: common.sh library functions

**Current state:** `common.sh` provides `check()`, `check_override()`, `output_result()`, `check_file_exists()`, `count_words()`, and `milestone_dir()`. All 11 gate scripts `source` it.

**What changes:** The `milestone_dir()` function at lines 111-125 calls `git rev-parse --show-toplevel` (line 116) and searches `$project_root/milestones` (line 119). This must change to use `$PROJECT_STATE/milestones`. However, `milestone_dir()` is not called by any gate script in the current codebase -- gate-check.sh resolves `MILESTONE_DIR` itself and passes it as `$2`. The function exists in common.sh but has zero callers. The XRD proposes adding `resolve_project_paths()` to common.sh, which is correct, but should also note that `milestone_dir()` should be removed or updated to prevent future callers from using the broken version.

**What stays the same:** `check()`, `check_override()`, `output_result()`, `check_file_exists()`, `count_words()` -- all path-agnostic.

### IP-4: state.ts validateSchema()

**Current state:** `validateSchema()` at `state.ts` line 125 throws if `state.version !== 1`.

**What changes:** Must accept version 1 (read-only compat) and version 2 (read/write). The XRD says version 1 is "read-only forward compat" but `validateSchema()` is called by both `readState()` (line 27) and `writeState()` (line 31). If version 1 is truly read-only, `writeState()` should reject version 1 states. This means `validateSchema()` needs to split into read-validation and write-validation, or `writeState()` needs an additional check after `validateSchema()`.

**What stays the same:** The `readState()` and `writeState()` function signatures do not change. All callers continue to call `readState(runDir)` and `writeState(runDir, state)`.

### IP-5: index.ts re-exports

**Current state:** `index.ts` re-exports all public functions including `commitRunStart`, `commitStageComplete`, `commitHalt`, `commitOverride`, `commitMorningAfter` at lines 39-45.

**What changes:** These five exports are removed. One new export is added: `commitProjectCode`. A new export for the `paths.ts` module is added (`resolvePaths`, `BuildingPaths`, etc.).

**What stays the same:** All other exports (state, events, override, morning-after, confidence, run).

### IP-6: Skill file -> orchestrator -> sub-agents

**Current state:** The skill file at `.claude/skills/build.md` references `.building/runs/*/state.json` (line 25 of the skill), `.claude/agents/` (line 99), and `prompts/` (line 115) using relative paths. The orchestrator follows these paths to find state and agent definitions.

**What changes:** The new global skill file at `~/.claude/skills/build/SKILL.md` must contain the absolute `BUILDING_HOME` path and rewrite every relative reference. State location changes from `.building/runs/` to `~/building/projects/<project>/runs/`. Agent definitions change from `.claude/agents/` to `$BUILDING_HOME/.claude/agents/`. Prompts change from `prompts/` to `$BUILDING_HOME/prompts/`.

**Risk:** The skill file is Markdown read by an LLM. The LLM must correctly extract BUILDING_HOME and compose paths. If the skill file text is ambiguous, the LLM may construct wrong paths. The peer review (Gap G-4) flags this correctly.

### IP-7: Hook command string format in settings.json

**Current state:** `bootstrap.ts` writes hook commands as `bash .building/hooks/gate-check.sh` (relative path, line 79-80).

**What changes:** The install script writes `BUILDING_HOME=/absolute/path bash /absolute/path/.building/hooks/gate-check.sh` to `~/.claude/settings.json`. This is the mechanism by which `BUILDING_HOME` reaches the bash scripts.

**Integration risk:** The format of the `command` field in Claude Code's hook configuration is an external dependency. The current code uses `bash <path>`, and the XRD proposes `BUILDING_HOME=<path> bash <path>`. Whether Claude Code's hook runner supports inline environment variables in the command string is an assumption -- if the hook runner uses `exec()` directly rather than spawning a shell, the `BUILDING_HOME=<path>` prefix would fail. The existing pattern (`bash .building/hooks/gate-check.sh`) works because it is a simple command; the new pattern adds an environment variable assignment, which requires shell interpretation.

---

## 3. Refactoring Needs

### Pre-task: Standardize gate script path resolution

**Before any M2 work begins**, gate-0-to-1.sh should be refactored to use the `$MILESTONE_DIR` argument it already receives rather than calling `git rev-parse` independently.

Currently at line 12-13:
```bash
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
if [ -d "$PROJECT_ROOT/milestones" ] ...
```

This should become:
```bash
# $MILESTONE_DIR is passed as $2 from gate-check.sh
# For milestone-list check, go up one level from MILESTONE_DIR
MILESTONES_ROOT=$(dirname "$MILESTONE_DIR")
if [ -d "$MILESTONES_ROOT" ] ...
```

**Why pre-task:** If this refactoring happens inside the M2 migration, the implementer is simultaneously changing path resolution AND changing the path source. Two variables changing at once makes debugging harder. Standardize the interface first (all gate scripts use passed arguments, none derive independently), then change the source of those arguments.

gate-9-to-10.sh line 10-11 also needs this pre-task treatment:
```bash
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
```
The `PROJECT_ROOT` here is used at line 41 to find `tools/building-audit/dist/bin/building-audit.js`. In the portable model, this tool lives in `$BUILDING_HOME`, not `$PROJECT_ROOT`. This is a semantic change (the path root changes meaning), not just a mechanical substitution.

### Pre-task: Remove dead `milestone_dir()` from common.sh

The `milestone_dir()` function at `common.sh` lines 111-125 has no callers in the current codebase. It contains a `git rev-parse --show-toplevel` call. Removing it before M2 eliminates a false positive when searching for `git rev-parse` references during migration and prevents any future caller from accidentally using the old path logic.

### No other pre-task refactoring needed

The XRD's task ordering (Phase 1: paths module, Phase 2: hook migration + bootstrap + git rewrite) is sufficient for the remaining changes. The trellis TypeScript modules are clean enough that the new `paths.ts` module can be added without restructuring existing code.

---

## 4. Inherited Constraints

### IC-1: Atomic write pattern

Every trellis module that writes files uses the write-to-temp-then-rename pattern: `writeFileSync(tmpPath, ...)` followed by `renameSync(tmpPath, filePath)`. This pattern is in `state.ts` (lines 33-35), `events.ts` (lines 21-22), `override.ts` (lines 40-41), and `confidence.ts` (lines 65-66). The new `paths.ts` module does not write files (it is pure computation), but any new modules (e.g., the install script, bootstrap rewrite) must follow this same pattern for state file writes. The XRD mentions atomic writes but should explicitly require the temp-file-rename pattern for all writes under `~/building/projects/`.

### IC-2: Event number padding

`events.ts` at line 12 pads event numbers with leading zeros: `String(num).padStart(num > 999 ? 4 : 3, "0")`. Event files are sorted lexicographically by `readEvents()`. The new state directory at `~/building/projects/<name>/runs/<id>/events/` must preserve this numbering convention. This is not at risk (events.ts is unchanged), but any new code that reads event directories must sort the same way.

### IC-3: set -euo pipefail in all bash scripts

Every hook and gate script starts with `set -euo pipefail`. The XRD's active-run guard uses `find ... | sort | tail -1` which is safe under pipefail (find returning empty still exits 0). But the peer review (Contradiction C-1) correctly notes that `ls -1d "$PROJECT_STATE/runs"/*/` would fail under `set -e` when the glob expands to nothing. The XRD's updated guard code uses `find` with `2>/dev/null`, which is correct. The implementer must avoid switching to glob-based patterns that break under `set -euo pipefail`.

### IC-4: Test infrastructure uses temp directories

`state.test.ts` at line 14 creates test run directories with `mkdtempSync(join(tmpdir(), "trellis-state-"))`. Tests do not depend on any specific path structure -- they create their own temp directories. This means M2 test changes only need to update assertions (version field, project_dir field), not test infrastructure. However, new tests for `paths.ts` and the bootstrap rewrite will need to create `~/building/projects/` mock structures, which requires either mocking the home directory or parameterizing the base path for testing.

### IC-5: vitest as test runner

`tools/trellis/package.json` specifies `vitest` as the test runner (line 9: `"test": "vitest run"`). All existing tests use vitest's `describe`/`it`/`expect` API. New tests must use the same runner and patterns. The test files are colocated in `tools/trellis/test/` and `tsconfig.json` includes `test/**/*.ts` at line 16.

### IC-6: ESM module format

`package.json` specifies `"type": "module"` (line 5). All imports use `.js` extensions in TypeScript (e.g., `from "./types.js"` in state.ts line 4). The new `paths.ts` module must follow this convention. The `tsconfig.json` uses `"module": "Node16"` and `"moduleResolution": "Node16"`.

### IC-7: No root package.json exists

There is no `package.json` at the repo root. The XRD specifies adding `"setup"` and `"uninstall"` scripts to `package.json (root)`. This file needs to be created from scratch. It should not be confused with `tools/trellis/package.json`. The root package.json needs at minimum: `name`, `private: true`, `scripts` block, and the `type: "module"` field if the install script uses ESM.

### IC-8: The `gate-check.sh` uses `/tmp/trellis-gate-stderr.txt` for stderr capture

At lines 81 and 84, gate-check.sh writes gate script stderr to `/tmp/trellis-gate-stderr.txt`. This is a fixed path, creating a race condition if two Claude Code sessions fire hooks simultaneously. The XRD does not address this. While not a blocker for M2, the implementer should switch to `mktemp` during the rewrite.

### IC-9: Skill file is the orchestrator's entry point

The current skill file at `.claude/skills/build.md` is 200 lines of orchestrator logic. It is not a thin pointer -- it contains the full command routing table, state protocol, pipeline stage definitions, sub-agent invocation instructions, and git commit protocol. The XRD says the new global skill file is "a thin entry point" that "loads [the orchestrator] by reference." This is a significant reduction in size. The implementer must verify that the LLM can follow a reference chain (skill file -> orchestrator.md) without losing context or misinterpreting paths. The current system works because everything is in one file.

---

## 5. Risk Assessment

### R-1: Highest risk -- Hook command environment variable passing

**Risk:** The entire hook migration assumes that `BUILDING_HOME=/path bash /path/script.sh` in the hook command string works under Claude Code's hook execution model. If Claude Code's hook runner does not spawn a shell (e.g., it uses `child_process.execFile` instead of `child_process.exec`), the inline environment variable assignment is ignored and `$BUILDING_HOME` is undefined in the script.

**Likelihood:** Medium. Claude Code documentation does not specify the hook execution model. The current codebase uses `bash .building/hooks/gate-check.sh` which would work under both `exec` and `execFile`.

**Impact:** Critical. Every hook fails. Gates and detections are inert.

**Mitigation:** Task B2 must begin with a spike that verifies the hook command format. Write a minimal hook that echoes `$BUILDING_HOME` and confirm it receives the value. If inline env vars do not work, the fallback is: write a wrapper script that sets the variable, or use a config file that `gate-check.sh` reads.

### R-2: High risk -- Skill file reference chain breaks LLM context

**Risk:** The current 200-line skill file gives the LLM everything it needs in one file. The new thin skill file says "Read the full orchestrator definition at: /Users/dev/building/orchestrator.md." If the LLM does not read orchestrator.md before starting work (or reads it but the context window is too full), the pipeline runs without gate enforcement, stage definitions, or commit protocols.

**Likelihood:** Medium. LLMs follow "read this file" instructions inconsistently, especially under context pressure.

**Impact:** High. The pipeline runs without its own rules. Stage transitions happen without validation. Sub-agents are not invoked correctly.

**Mitigation:** The skill template should include critical protocol rules inline (state location, stage advancement rules, sub-agent paths) and reference orchestrator.md only for the full pipeline stage detail. The thin skill file should not be so thin that losing the reference breaks everything.

### R-3: Medium risk -- createInitialState() signature change breaks callers

**Risk:** `createInitialState()` at `state.ts` line 70 currently takes `(runId, project, milestone, briefHash)`. The XRD adds `projectDir` as a fifth parameter. Any call site that creates initial state must be updated.

**Likelihood:** Low-medium. The function has one direct caller (the skill file/orchestrator, via instructions). But the LLM orchestrator constructs the call from skill-file instructions, so a mismatch between the updated function signature and the skill file instructions causes a runtime error.

**Impact:** Medium. The run fails to start.

**Mitigation:** The skill template (Task E1/F1) must match the new `createInitialState` signature exactly. Test the full "start a run" flow end-to-end.

### R-4: Medium risk -- gate-0-to-1.sh milestone lookup semantics change

**Risk:** `gate-0-to-1.sh` currently searches `$PROJECT_ROOT/milestones` for any `m*` directory (line 13). In the portable model, milestones live at `$PROJECT_STATE/milestones/`. But during M2's own build, milestones are still at `$REPO/milestones/building/m2-...`. The peer review (MC-1) flags this: M2 is built under the old model. If M2's hook changes are applied while M2 itself is being built, the hooks look in the wrong location for M2's own artifacts.

**Likelihood:** Medium. Depends on when in the build process the hook changes take effect.

**Impact:** Medium. Gate checks fail for M2's own stages.

**Mitigation:** Build M2 in phases. Complete all hook changes as code (Tasks B1-B5), but do not activate them (do not run the install script that writes to `~/.claude/settings.json`) until the end of M2. The old hooks continue to work during M2's build. The new hooks are tested via the hook test script (Task B2 mitigation), not via live usage during M2's own build.

### R-5: Medium risk -- `project.lock` collision detection has no implementation spec

**Risk:** The peer review (Issue 1, HIGH) flags that PRD Decision 9 specifies a `project.lock` collision mechanism but the XRD component inventory does not assign it to any module. The XRD's bootstrap.ts entry mentions writing `project.lock` but the check-on-invocation path is not specified.

**Likelihood:** High that the implementer misses it. It is specified as a PRD decision and mentioned in XRD PB-1, but not tracked as a component or a task.

**Impact:** Medium. Name collisions cause silent state corruption.

**Mitigation:** Add `project.lock` write to Task C1 (bootstrap rewrite) and `project.lock` check to Task F1 (skill file content). The check must run before bootstrap creates the state directory -- it reads the lockfile from any existing `~/building/projects/<name>/project.lock` and compares against `$PWD`.

### R-6: Low risk -- detection scripts DECISIONS.md lookup path

**Risk:** `ghost-reference.sh` at line 14 reads `DECISIONS.md` from `$MILESTONE_DIR`. In the current model, DECISIONS.md is at `$MILESTONE_DIR/DECISIONS.md`. In the portable model, the project-level DECISIONS.md moves to `$PROJECT_STATE/DECISIONS.md` and milestone-level DECISIONS.md stays at `$PROJECT_STATE/milestones/<milestone>/DECISIONS.md`. If the detection script needs the project-level file (for Hard Kill decisions that span milestones), it needs `$PROJECT_STATE`, not `$MILESTONE_DIR`.

**Likelihood:** Low. The current code at ghost-reference.sh line 14 reads `$MILESTONE_DIR/DECISIONS.md`, which is the milestone-level file. In the portable model, this path changes to `$PROJECT_STATE/milestones/<milestone>/DECISIONS.md`, but since `$MILESTONE_DIR` is already resolved by detection-check.sh and passed as `$3`, this still works -- `$MILESTONE_DIR` already points to the right place.

**Impact:** Low. Ghost references to killed decisions are caught or not; this is a detection, not a gate.

**Mitigation:** Verify during Task B5 that `$MILESTONE_DIR` as passed to detection scripts correctly resolves to the milestone directory under `$PROJECT_STATE/milestones/`.

---

## 6. Verdict

The XRD's architecture fits the existing codebase. The trellis runtime is already path-parameter-driven, and the hook scripts have a clean router->gate/detection dispatch pattern that absorbs the three-path model through interface changes at the router level.

Two pre-tasks should be added before Phase 2:

1. **Pre-task P1:** Refactor `gate-0-to-1.sh` and `gate-9-to-10.sh` to eliminate independent `git rev-parse` calls. Use the passed `$MILESTONE_DIR` argument and (for gate-9-to-10) accept `$BUILDING_HOME` or a tool path argument.
2. **Pre-task P2:** Remove the dead `milestone_dir()` function from `common.sh` (lines 111-125).

The three HIGH issues from the peer review must be resolved in the XRD before implementation:

1. **Issue 1 (project.lock):** Assign to Task C1 (bootstrap) for the write and Task F1 (skill file) for the read/check.
2. **Issue 2 (stdin in active-run guard):** The XRD's updated guard using `$PWD` before reading stdin is correct but the two-phase resolution must be documented as a contract. Task B2 must explicitly test the non-Building fast path does not read stdin.
3. **Issue 3 (PROJECT_STATE in gate scripts):** Specify that `gate-check.sh` and `detection-check.sh` export `PROJECT_STATE`, `PROJECT_DIR`, `PROJECT_NAME`, and `BUILDING_HOME` as environment variables before calling child scripts. Document this as the interface contract in the `common.sh` changes.

Risk R-1 (hook command env var passing) should be verified with a spike before Phase 2 begins. Risk R-2 (thin skill file) should be mitigated by including critical protocol rules inline in the skill template rather than depending entirely on the reference chain.

The XRD's task ordering (paths module -> hooks + bootstrap + git -> install + skill -> integration) is correct and reveals integration issues in the right order.
