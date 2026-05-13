# Peer Review: M2 Portable Install

**PRD reviewed:** PRD.md (Portable Install)
**XRD reviewed:** XRD.md (Portable Install)
**Security review reviewed:** security-review.md
**Reviewer:** peer-reviewer agent

---

## 1. Issues Table

| # | Severity | Category | Description | Affected Section(s) | Recommended Resolution |
|---|----------|----------|-------------|---------------------|----------------------|
| 1 | **HIGH** | Missing specification | The `project.lock` collision-detection mechanism (PRD Decision 9) has no corresponding implementation detail in the XRD component inventory. No file creates it, no file reads it, no module is assigned to check it on invocation. | PRD Decision 9, XRD Component Inventory | Add `project.lock` write to `bootstrap.ts` rewrite spec. Add lockfile check to the skill file's invocation flow or to a new function in `paths.ts`. Specify the lockfile format and the exact error message. |
| 2 | **HIGH** | Incomplete hook migration | The XRD specifies that hooks receive `BUILDING_HOME` via environment variable in the command string, but the active-run guard (Section 1, "Active-Run Guard") reads `INPUT=$(cat)` to get `cwd` from stdin before checking for an active run. The security review (S-2) flags this: non-Building sessions feed their full file content to the hook script before the guard can exit. The PRD promises "under 5ms" for non-Building sessions (FR-9), but parsing JSON from stdin is not a directory-existence check. | PRD FR-9, XRD Section 1 (Active-Run Guard), Security Review S-2 | Restructure the guard to avoid reading stdin when possible. One approach: check `~/building/projects/` for any subdirectory matching the cwd basename before reading stdin. If no matching directory exists, exit 0 without touching stdin. This makes the common non-Building case a single directory check. |
| 3 | **HIGH** | Underspecified interface | The XRD says gate scripts like `gate-0-to-1.sh` will change from `$PROJECT_ROOT/milestones` to `$PROJECT_STATE/milestones`, but the current `gate-0-to-1.sh` uses `PROJECT_ROOT` to search for milestone directories with `find "$PROJECT_ROOT/milestones"`. The XRD Component Inventory entry for `gate-0-to-1.sh` says "Use `$PROJECT_STATE` for milestone directory lookup" but does not address how `PROJECT_STATE` reaches the gate script. Gate scripts receive `$RUN_DIR` and `$MILESTONE_DIR` as positional args from `gate-check.sh` -- they do not have `PROJECT_STATE` in scope. The XRD needs to specify whether `gate-check.sh` passes `PROJECT_STATE` as a third argument, or exports it as an environment variable, or whether each gate script derives it independently. | XRD Component Inventory (gate-0-to-1.sh, all gate scripts) | Specify the contract: `gate-check.sh` exports `PROJECT_STATE` and `PROJECT_DIR` as environment variables before calling gate scripts. Gate scripts that need them access them as `$PROJECT_STATE`. Document this in the `common.sh` changes. |
| 4 | Medium | PRD/XRD mismatch | PRD FR-1 lists the install command as `npm run setup` or `npm run install:global`. XRD Section 2 (Component Inventory) specifies only `npm run setup` in package.json. PRD Decision 10 references `npm run uninstall`. These should be consistent -- a task implementer would not know which command name to use. | PRD FR-1, XRD package.json entry, PRD Decision 10 | Pick one: `npm run setup` and `npm run uninstall`. Remove the `npm run install:global` alternative from the PRD. |
| 5 | Medium | Missing coverage | The XRD Component Inventory does not mention the `bootstrap()` function's current `BootstrapResult` interface. The current code returns `{ created, hooksInstalled, dependenciesInstalled, commitHash, alreadyBootstrapped }`. The XRD says the rewrite "Returns BootstrapResult with `created` list and `alreadyBootstrapped` flag" but does not address removing `hooksInstalled`, `dependenciesInstalled`, and `commitHash` -- fields that callers may depend on. | XRD bootstrap.ts entry | Specify the new `BootstrapResult` interface completely. List which fields are removed and confirm no caller reads them. If callers exist (e.g., the skill file or orchestrator), update those call sites in the component inventory. |
| 6 | Medium | Gap | The XRD specifies `deriveProjectName()` lowercases and replaces spaces with hyphens, matching PRD FR-3. The security review (Concern 1) identifies that shell metacharacters in directory names are not sanitized. Neither the PRD nor the XRD specifies the complete sanitization rule. The security review says "strip all characters except `[a-z0-9-]`" but this is in a security document, not in the PRD or XRD where the implementer will look. | PRD FR-3, XRD paths.ts, Security Review Concern 1 | Add the sanitization rule to PRD FR-3 and to the XRD `deriveProjectName()` specification. The rule: strip all characters not matching `[a-z0-9-]`, collapse consecutive hyphens, trim leading/trailing hyphens. Both TypeScript and bash layers must implement the same rule. |
| 7 | Medium | Gap | The PRD says the install command writes hook entries to `~/.claude/settings.json` (FR-9), but does not specify what happens when `settings.json` already has other content. The XRD setup.ts spec says "Read `~/.claude/settings.json` (or create if absent)" and "Write hook entries" but does not specify merge behavior. If the developer has existing hooks from another tool, does the install append to the existing `PreToolUse` array, replace it, or error? | PRD FR-9, XRD setup.ts | Specify merge behavior: read existing settings.json, preserve all existing entries, append Building's hook entries if not already present (idempotent). The install must not overwrite other hooks. |
| 8 | Medium | Underspecified interface | The XRD build plan lists "Task F1: Write global skill file content" but the skill file is the most critical artifact -- it is the entry point that makes the entire system work. The XRD Section 1 ("How the Global Skill File Works") shows a sketch of the skill file content but it is incomplete: it says "[Condensed command routing table]" and "[State protocol pointing to ~/building/projects/<project>/runs/]". A task implementer writing F1 would not know what this routing table contains or how it differs from the current skill file. | XRD Section 1 (Global Skill File), XRD Build Plan Task F1 | Either fully specify the skill template content in the XRD, or make Task F1 explicitly depend on reading the current `.claude/skills/build.md` and adapting it. The current skill file is 30+ lines of orchestrator logic -- the template needs to replicate this with the new path model. |
| 9 | Medium | Missing test coverage | The XRD smoke test (Section 6) does not test a full build cycle. It tests install and status check, but not: starting a build, gate enforcement firing, task completion with detection checks, or the clean-project guarantee after actual source code output. The smoke test verifies plumbing but not behavior. | XRD Section 6 (Smoke Test) | Add smoke test steps: start a build with a minimal brief, verify state.json is created under `~/building/projects/`, verify gate-check fires on stage advancement, verify no `.building/` directory appears in the project dir after build tasks execute. |
| 10 | Low | Inconsistency | The XRD paths interface lists `hooks: string` as `$BUILDING_HOME/.building/hooks/` and `gates: string` as `$BUILDING_HOME/.building/hooks/gates/`. This path structure means the hooks directory is `.building/hooks/` within the Building repo. But the Building repo itself has a `.building/` directory used for its own bootstrap state (config.json, etc). When Building builds itself (which is how it was developed), the `.building/` directory serves double duty: hook scripts AND bootstrap state. This is not a problem today but becomes confusing when the portable model separates these concerns. | XRD paths.ts interface | Acknowledge in XRD or DECISIONS.md that `.building/hooks/` in the Building repo is Building's hook source code, not project state. Consider whether a future rename (e.g., `hooks/` at repo root) would reduce confusion, but do not act on it in this milestone. |
| 11 | Low | Missing edge case | PRD US-5 (Update Building) says "re-runs the install command" and "existing project state is preserved." The XRD does not address what happens to hook entries in `~/.claude/settings.json` during an update. If the hook command format changes between versions, the install must update the existing entries, not just append new ones. | PRD US-5, XRD setup.ts | Specify that setup.ts removes existing Building hook entries (identified by script path containing `BUILDING_HOME`) before writing new ones. This makes updates safe. |
| 12 | Low | Documentation gap | PRD Decision 10 specifies an uninstall command. XRD Task E3 mentions "Add uninstall script + update package.json." But the uninstall script is not described in the XRD Component Inventory -- there is no `tools/install/uninstall.ts` entry specifying what it does. | XRD Component Inventory, XRD Build Plan Task E3 | Add `tools/install/uninstall.ts` to the component inventory. Specify actions: remove `~/.claude/skills/build/`, remove Building hook entries from `~/.claude/settings.json`, print summary. Optionally: prompt before removing `~/building/projects/`. |

---

## 2. Contradictions

### C-1: State path in active-run guard vs. hook regex

The XRD active-run guard checks `$HOME/building/projects/$PROJECT_NAME/runs` for directory existence. The state.json regex check uses `$STATE_DIR` (set to `$HOME/building/projects`). These are consistent with each other, but the guard's `ls -1d "$PROJECT_STATE/runs"/*/` will fail with an error under `set -euo pipefail` if the runs directory exists but is empty (the glob expands to a literal `*/` which `ls` cannot find). The XRD shows this code under `set -euo pipefail` context (inherited from the existing scripts). The `2>/dev/null` on `ls` catches stderr but the non-zero exit code will trigger `set -e`.

**Resolution:** The guard must handle the empty-runs-directory case. Use `find "$PROJECT_STATE/runs" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | tail -1` instead of `ls -1d`.

### C-2: PRD says "no hooks in .claude/settings.local.json" but existing skill references hooks

PRD FR-7 (Clean Project Guarantee) says "No hooks in `.claude/settings.local.json` that reference Building." PRD FR-4 says bootstrap will not write to `.claude/settings.local.json`. But the current bootstrap code (bootstrap.ts lines 62-96) writes hook entries to the project's `.claude/settings.local.json`. The XRD says "No `.claude/settings.local.json` changes" in the bootstrap rewrite. This is consistent between PRD and XRD, but there is a migration concern: existing projects that were bootstrapped with the old code have Building hooks in their `.claude/settings.local.json`. The PRD says migration is out of scope (Decision 8), but does not address whether the old hooks in those project directories will interfere with the new global hooks. If a developer runs portable Building on a project that was previously bootstrapped with old Building, they get double hooks -- project-level and user-level.

**Resolution:** Add a note to the XRD that if `.claude/settings.local.json` in the project directory contains Building hook entries, the new bootstrap should warn the developer or skip gracefully. Alternatively, accept this as out of scope per Decision 8 and document it.

---

## 3. Missing Coverage

### MC-1: PRD FR-3 specifies milestone artifacts move to PROJECT_STATE, but no migration mechanism exists for Building's own milestones

Building's own milestones currently live at `$REPO/milestones/building/m1-...`, `$REPO/milestones/building/m2-...`. In the portable model, a project's milestones live at `$PROJECT_STATE/milestones/m1-...`. When Building builds itself (its own most common use case), where do milestones go? The current XRD build plan will rewrite paths to look under `$PROJECT_STATE/milestones/`, but Building's existing milestones are in the repo at `$REPO/milestones/building/`. This milestone (M2) is being written into the repo, not into `~/building/projects/building/milestones/`.

**Insight:** Building is both the tool and its own first project. The portable model creates a split: the tool lives in the repo, the project state lives in `~/building/projects/`. But the M2 milestone artifacts being written right now are in the repo, not in the state directory. After M2 ships, M3 milestones would be the first to land in the new location.

**Implication:** The build plan should clarify that M2 itself is built under the old model. The new model applies to M3+ and to external projects. Gate scripts during M2's own build will still use the old paths.

### MC-2: No XRD coverage for the `/build --resume` path resolution

PRD US-4 describes resuming a halted build. The XRD does not address how `--resume` finds the active run in the new state directory. The current skill file reads `.building/runs/*/state.json` -- the new skill file needs to read `~/building/projects/<project>/runs/*/state.json`. This is implicit from the path resolver, but the skill file template (Task F1) needs to encode this path.

### MC-3: No XRD component for the `--dump-candidates` flag

The most recent commit on this branch (a857fe7) adds a `--dump-candidates` flag for external Layer 2 drivers. The XRD does not reference this feature. If it is part of M2 scope, it needs component coverage. If it is pre-M2 infrastructure, the XRD should note it exists and that M2 does not modify it.

---

## 4. Gaps

### G-1: Hook input JSON `cwd` field assumption is unverified

The entire hook migration depends on Claude Code passing a `cwd` field in the hook input JSON. The XRD states: "They derive PROJECT_DIR from the `cwd` field in the hook input JSON." The current hook scripts do not use `cwd` -- they use `git rev-parse --show-toplevel`. If Claude Code does not include `cwd` in the PreToolUse hook input, every hook in the portable model fails silently (jq returns null, PROJECT_NAME becomes empty, state directory lookup fails).

**Insight:** This is the single-point-of-failure assumption in the entire migration. Every bash script change depends on it.

**Implication:** Task B1 (or a pre-task spike) must verify the hook input JSON schema by inspecting an actual Claude Code hook invocation. If `cwd` is not present, the fallback is `$PWD` from the shell environment (which Claude Code may or may not set for hook subprocesses). Document whichever field is confirmed to work.

### G-2: The `common.sh` `milestone_dir()` function is called by gate scripts that source it

The XRD says `common.sh` gains a `resolve_project_paths()` function. But the existing `milestone_dir()` function in `common.sh` uses `git rev-parse --show-toplevel` internally (line 116 of current code). Gate scripts like `gate-0-to-1.sh` call `milestone_dir()` via `common.sh`. The XRD Component Inventory for `common.sh` says to "Accept `PROJECT_STATE` as argument or environment variable" for `milestone_dir()`, but does not specify whether `gate-check.sh` (the caller) stops calling `milestone_dir()` (since it already resolves `MILESTONE_DIR` itself and passes it to gate scripts) or whether gate scripts still call it independently.

**Resolution:** Audit which gate scripts call `milestone_dir()` from common.sh versus receiving `$MILESTONE_DIR` as a positional argument. The current `gate-0-to-1.sh` does its own milestone search rather than using the `MILESTONE_DIR` argument it receives. The XRD needs to decide: do all gate scripts use the `$MILESTONE_DIR` argument from `gate-check.sh`, or do some derive it independently? Standardize on one pattern.

### G-3: The `settings.json` hook entries use `matcher: "Write"` only

The current hooks match only the `Write` tool. If Claude Code's tool naming changes or if other tools can write files (e.g., `Edit`, `MultiEdit`), gates and detections would not fire. This is not a new gap -- it exists in the current system -- but the migration to user-level hooks is a good time to address it.

### G-4: No specification for how the orchestrator receives BUILDING_HOME at runtime

The skill file contains `Building home: /Users/dev/building`. But the skill file is Markdown loaded into the context window -- it is not executable code. The orchestrator (which is also Markdown loaded into context) needs to use this path when spawning sub-agents and resolving tool paths. The XRD does not specify the mechanism by which the orchestrator extracts the path from the skill file. Does the agent parse the Markdown? Is it an environment variable? Is it a structured field in the YAML frontmatter?

**Insight:** The path is baked into the skill file as plain text. The LLM reads it and uses it in tool calls. There is no programmatic extraction -- the agent simply reads "Building home: /Users/dev/building" and uses that path in subsequent commands.

**Implication:** This works but is fragile. If the agent misreads the path, hallucinates a different path, or the skill file format changes, every downstream operation breaks. The skill template should make the path maximally unambiguous (e.g., on its own line, clearly labeled, no surrounding text that could confuse extraction).

---

## 5. Summary

Three HIGH issues require resolution before the build plan can execute safely:

1. **Issue 1 (project.lock):** A PRD feature with no XRD implementation. A task implementer would discover this gap mid-build.
2. **Issue 2 (active-run guard stdin):** The hook performance guarantee cannot be met with the current guard design. Non-Building sessions pay stdin-parsing cost.
3. **Issue 3 (PROJECT_STATE in gate scripts):** Gate scripts need a path they have no way to receive under the current spec. The interface contract between `gate-check.sh` and individual gate scripts is underspecified.

Gap G-1 (hook input `cwd` field) is the riskiest assumption in the entire migration. It should be verified before any implementation begins.
