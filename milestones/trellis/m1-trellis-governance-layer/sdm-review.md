# SDM Review: Trellis M1 — Governance Layer

## 1. What Exists

### Repository Structure

The Building project is a markdown-driven multi-agent build pipeline. The codebase has three structural layers:

**Layer A: Pipeline Definition (markdown)**
- `orchestrator.md` defines 11 pipeline stages (0-11), agent coordination, context scoping rules, gate checks, SDM triggers, and decision consolidation. This is the system's control-flow specification, currently interpreted by an LLM at runtime.
- `prompts/` contains 12 agent prompt files. Each defines a role's job, working method, decision tiers, and output contract.
- `CLAUDE.md` is the master build file: principles, decision tiers, quality bar, file conventions, failure modes.
- `decisions.md` has 29 cross-project decisions across 3 tiers (Foundational Tenets, Operational, Build Process Mechanics).

**Layer B: Audit Tooling (TypeScript)**
- `tools/building-audit/` is a TypeScript CLI (Node 18+, ESM, vitest). It runs Layer 1 (mechanical) and Layer 2 (LLM judgment) checks against a project.
- Layer 1 checks (9 registered): test-cheat, scope-creep, dependency-grab, premature-abstraction, surface-heresy, confidence-bluff, fragility-metrics, resource-drain, unoptimized-defaults.
- Layer 2 checks (7 registered): ghost-refactor, clean-slate-bias, deep-heresy, document-heresy, performance-critical, react-fluidity, refactoring-signals.
- CLI interface: `--mechanical` (Layer 1 only), `--full` (both layers), `--dump-candidates [dir]` (emit Layer 2 candidate JSON for external drivers), `--milestone <name>`, `--output <path>`.
- Output format: JSON `AuditReport` with `checks[]` array, each containing `CheckResult` with `findings[]`. Exit code 1 on critical findings, 0 otherwise.
- Check registration is via a global registry (`registerCheck`). Each check implements the `Check` interface: `name`, `layer`, `run()`, and optionally `dumpCandidates()`.
- Dependencies: commander, simple-git, @typescript-eslint/typescript-estree, remark-parse, unified, @anthropic-ai/sdk.
- Build: `tsc` to `dist/`, binary at `dist/bin/building-audit.js`.

**Layer C: Configuration (.claude/)**
- `.claude/settings.local.json` currently has only permissions: `Bash(git show *)` and `Read(//private/tmp/**)`.
- No `.claude/agents/` directory exists.
- No hooks are currently configured.
- No skills or slash commands are currently configured.

### Data Model

The existing data model is document-centric:
- **Task files** follow `task-template.md` format with structured sections (What to Build, Files, Contracts, Acceptance Criteria, Tests, Completed).
- **Decisions** are logged in markdown tables in `DECISIONS.md` (project-level) and per-milestone `DECISIONS.md`.
- **Milestone directories** follow `m<N>-<project>-<goal>/` naming with PRD, XRD, peer-review, test-plan, security reviews, tasks/.
- **building-audit** models the project via `ProjectContext`: task files, git log, decisions, source files, package history, test results. This is a read-only scan; it does not persist state.

### Dependency Graph (Relevant to Trellis)

```
orchestrator.md (LLM reads at runtime)
  -> prompts/*.md (LLM loads per-stage)
  -> decisions.md (LLM consults)
  -> milestone dirs (LLM reads/writes)

building-audit CLI (standalone tool)
  -> ProjectContext (scans repo)
  -> AuditReport JSON (output)

.claude/settings.local.json (Claude Code config)
  -> Currently: permissions only
  -> Trellis adds: hooks
```

There is no runtime coupling between building-audit and the orchestrator. building-audit runs post-hoc. Trellis bridges them: building-audit's checks become real-time gate inputs.

---

## 2. What's Fragile

### No Tests for orchestrator.md Behavior

The orchestrator's control flow is specified in markdown. There are no automated tests that verify an agent follows the pipeline stages in order, enforces gates, or correctly scopes context. All enforcement is behavioral (LLM compliance). Trellis replaces this with structural enforcement — which is the point — but the absence of any prior enforcement testing means there's no baseline to compare against.

### building-audit's Output Format Is Not Contractually Pinned

The `AuditReport` and `CheckResult` interfaces in `tools/building-audit/src/types/index.ts` are TypeScript types, not a versioned schema. Trellis gate scripts will parse building-audit's JSON output. If building-audit's output shape changes (field renamed, array restructured), Trellis breaks silently — gate scripts may parse empty results and pass when they should fail.

**Risk level:** Medium. building-audit is under active development in the same repo. There is no version-pinning mechanism beyond "it's the same codebase."

### .claude/settings.local.json Is Minimal

The current settings file has two permission entries. Trellis will add hook entries. There is no existing pattern for hook configuration in this project — Trellis is the first consumer. If the hook format is wrong or the path filtering doesn't work as assumed, there's no existing working example to reference.

### Agent Prompts Have No Machine-Readable Contracts

Agent prompts define output contracts in prose ("Return: 1. What Exists, 2. What's Fragile..."). Trellis gate checks need to verify that agents produced required artifacts. The gates will check for file existence and section presence — but the mapping from "what the prompt says the agent produces" to "what the gate checks for" is implicit. If a prompt changes its output contract (e.g., renames a required section), the gate definition drifts.

### building-audit's Layer 1 Checks Don't Cover All Trellis Gate Needs

Trellis gates check for things building-audit doesn't: file existence (PRD exists, security review exists), section presence in markdown files, OPEN-ITEMS.md status, DECISIONS.md cross-reference completeness. These are new check logic that building-audit doesn't provide. The XRD correctly identifies this — gate scripts will handle these checks directly — but it means the "wrapping building-audit" story is partial. Roughly half the gate logic is new code.

---

## 3. Change Surface

### Files and Systems Trellis Touches

| Area | What Changes | Risk |
|------|-------------|------|
| `.claude/settings.local.json` | Adds PreToolUse hook entries | Low — additive, no existing hooks to conflict with |
| `.claude/agents/` (new) | Sub-agent definitions referencing existing prompts | Low — new directory, no conflicts |
| `.building/` (new) | Entire directory structure: runs/, hooks/, config.json | Low — new directory, no conflicts |
| `tools/building-audit/` | Not modified, but wrapped. CLI invoked by gate scripts. | Medium — coupling via CLI interface and JSON output format |
| `orchestrator.md` | Not modified. Trellis is scaffolding around it. | None |
| `prompts/*.md` | Not modified. Sub-agents reference them. | None |
| `decisions.md` | Trellis adds decisions during builds via existing protocol. | Low — additive, follows existing convention |
| Milestone directories | Trellis commits state alongside milestone artifacts. | Low — new files in existing directories |
| Git history | New commit types: [trellis], [gate-passed], [halted] | Low — additive, greppable |

### Integration Points

1. **building-audit CLI** -- Trellis invokes `building-audit --mechanical --milestone <name>` and parses JSON output. Integration surface: CLI flags, exit codes, JSON report structure.

2. **Claude Code hooks** -- PreToolUse on Write, filtered by path. Integration surface: hook configuration format in settings.local.json, hook script execution semantics (working directory, stdin/stdout/stderr, exit code meaning).

3. **Claude Code sub-agents** -- `.claude/agents/` definitions. Integration surface: agent definition format, context isolation behavior, filesystem access from sub-agents.

4. **Claude Code skills/slash commands** -- `/build` command family. Integration surface: skill definition format, how skills invoke sub-agents, how skills persist state across invocations.

5. **Git** -- Trellis commits state files. Integration surface: working branch, commit message format, potential conflicts with concurrent task-agent commits.

---

## 4. Patterns and Conventions

### TypeScript Conventions (from building-audit)

- ESM modules (`"type": "module"` in package.json, `.js` extensions in imports).
- Target: ES2022, module resolution: Node16.
- Strict mode enabled.
- Tests: vitest, colocated in `test/` mirroring `src/` structure.
- No monorepo tooling (no workspaces, no nx/turbo). building-audit is a standalone package in `tools/`.
- Type definitions centralized in `src/types/index.ts`.
- Check registration via side-effect imports (import the check file, it calls `registerCheck`).

**Implication for Trellis:** New TypeScript (state management utilities, morning-after generator) should follow these same conventions. The XRD says "builds alongside building-audit's TypeScript" — this means same target, same module system, same test framework. The natural home is either a new package under `tools/` (e.g., `tools/trellis/`) or an extension of building-audit. The XRD implies the former — separate state management utilities.

### Bash Conventions

There are no existing bash scripts in the project. Gate check scripts will be the first. There is no established shell style guide.

**Implication for Trellis:** Gate scripts should establish conventions and follow them consistently: set -euo pipefail, structured error output on stderr, JSON output where consumed programmatically, exit code semantics documented.

### Configuration Conventions

- `.claude/settings.local.json` for local-only settings (not committed upstream).
- Milestone-scoped configuration: each milestone has its own DECISIONS.md, OPEN-ITEMS.md.
- No `.building/` directory convention exists — Trellis creates this.

### Commit Message Conventions

- Task commits: `[TASK_ID] description`
- Existing building-audit commits: `[NNN] description` format
- Trellis adds: `[trellis]`, `[gate-passed]`, `[halted]` prefixes

These are additive and don't conflict with existing conventions.

---

## 5. Constraints the PRD Doesn't See

### Constraint 1: building-audit Process Isolation

building-audit calls `process.exit()` at the end of its CLI run. Trellis gate scripts invoke building-audit as a child process, which is fine. But if anyone later tries to import building-audit's check logic as a library (to avoid the CLI overhead), the `process.exit()` in the CLI entry point will kill the parent process. The `Check` interface and registry are importable, but the `run()` and `runDumpCandidates()` functions are not — they exit the process.

**Impact on Trellis:** Gate scripts must invoke building-audit as a subprocess (`npx building-audit --mechanical ...`), not as a library import. This is what the XRD already specifies, but it's worth surfacing as a constraint: extracting building-audit's check logic into a shared library would require refactoring building-audit's CLI to not call `process.exit()`.

### Constraint 2: building-audit Requires npm Install

building-audit has dependencies (`commander`, `simple-git`, `@anthropic-ai/sdk`, etc.) that require `npm install` before the CLI works. Trellis's bootstrap must ensure building-audit's dependencies are installed, or gate scripts will fail on first run.

**Impact on Trellis:** The `/build --bootstrap` step should verify `tools/building-audit/node_modules` exists and run `npm install` if not. The XRD doesn't mention this.

### Constraint 3: building-audit's --milestone Flag Scoping

building-audit's `--milestone` flag scopes the scan to a specific milestone directory. Trellis gate scripts need to pass the current milestone name. The milestone name in Trellis state.json must match the directory name building-audit expects (the `m<N>-<project>-<goal>` format). If the names drift, the audit runs on the wrong scope.

**Impact on Trellis:** state.json's `milestone` field must store the exact directory name, not a display name or abbreviation.

### Constraint 4: No Existing Hook Precedent

This project has never used Claude Code hooks. The PRD and XRD assume specific hook behaviors (PreToolUse fires before the tool, non-zero exit blocks the tool, the hook receives the tool input as arguments). The XRD correctly identifies this as Risk #1 (path filtering) and notes Risk #2 as resolved (PreToolUse blocks). The peer review elevates this to a pre-Day-Zero verification requirement. I concur — this is the load-bearing premise.

### Constraint 5: TypeScript Compilation Required for New Utilities

Trellis adds TypeScript for state management, morning-after generation, and confidence assessment. These need compilation before use. The existing `tools/building-audit/` has its own `tsconfig.json` and builds to `dist/`. New Trellis TypeScript needs its own build configuration and a way to be invoked from gate scripts or the orchestrator skill.

**Impact on Trellis:** Either (a) put Trellis TypeScript in its own package under `tools/trellis/` with its own tsconfig, package.json, build step, or (b) co-locate with building-audit. Option (a) is cleaner but adds a second `npm install` + `tsc` to bootstrap. Option (b) couples the build systems. The XRD should specify which.

### Constraint 6: settings.local.json vs. settings.json

The XRD says bootstrap adds hooks to `.claude/settings.local.json`. The PRD says `.claude/settings.json` (or `.claude/settings.local.json`). The existing file is `settings.local.json`. Since this is a public OSS repo (per memory context), hooks in `settings.json` would be committed and affect all users. Hooks in `settings.local.json` are per-machine.

**Impact on Trellis:** Hooks must go in `settings.local.json` for portability. The bootstrap command should always write there, not to `settings.json`. The XRD's Q7 answer correctly says `settings.local.json`.

---

## 6. Recommendations

### Fit Assessment: Trellis Fits the Existing Codebase Well

The design is structurally conservative in the right ways:

1. **No modifications to existing files.** building-audit, orchestrator.md, agent prompts — all untouched. Trellis adds new directories and configuration. This is the lowest-risk integration pattern.

2. **Wrapping over reimplementing.** Gate scripts invoke building-audit's CLI rather than extracting its logic. This preserves building-audit's standalone utility and avoids coupling at the code level.

3. **Additive configuration.** Hooks, sub-agents, skills, slash commands — all new entries in new or near-empty config files. No existing configuration is modified.

4. **Git convention alignment.** New commit prefixes ([trellis], [gate-passed], [halted]) follow the existing [TASK_ID] pattern. Greppable, distinctive, non-conflicting.

### Specific Recommendations

**R1: Pin the building-audit integration contract.**
Add an integration test (in Trellis's test suite, not building-audit's) that invokes building-audit with a known fixture and asserts the JSON output structure. Specifically: `report.checks` is an array, each element has `name`, `layer`, `status`, `severity`, `findings`. This catches building-audit output format changes before they break gate scripts.

**R2: Put Trellis TypeScript in `tools/trellis/`.**
Separate package, own tsconfig, own package.json. Mirrors the building-audit convention. State management utilities, morning-after generator, and confidence assessment all live here. Gate scripts (bash) invoke these utilities the same way they invoke building-audit: as subprocess commands.

**R3: Bootstrap must handle dependency installation.**
`/build --bootstrap` should: create `.building/`, add hooks to `settings.local.json`, verify `tools/building-audit/node_modules` exists (install if not), verify `tools/trellis/node_modules` exists (install if not), compile both TypeScript packages if not already built. This is not in the XRD's bootstrap spec.

**R4: Establish bash conventions in Day Zero.**
Gate scripts are the project's first bash. Day Zero should include a shell style contract: `set -euo pipefail`, project root as working directory, structured stderr for gate failure messages, JSON on stdout when consumed programmatically, timeout of 30s per gate script, and a template script that other gates copy.

**R5: state.json milestone field must be the directory name.**
The `milestone` field in state.json (e.g., `"m1-trellis-governance-layer"`) must exactly match the filesystem directory name so building-audit's `--milestone` flag works correctly. Document this in the Day Zero state.json schema (D0-1).

**R6: Validate hook behavior as the first task.**
This is already identified by the XRD (Risk #1) and the peer review (recommended step #1). I'm reinforcing it as a structural dependency: no gate script work should begin until a spike confirms PreToolUse hook behavior — specifically, that the hook receives the write target path, that non-zero exit blocks the write, and what filtering granularity is available.

### Tier 3 Items

**None.** The proposed design does not create structural conflicts with the existing codebase. The integration points are clean (CLI invocation, config file additions, new directories). The change surface is additive. The risk is concentrated in Claude Code primitive behavior (hooks, sub-agents), which is correctly identified in both the XRD and the peer review as requiring early validation.

### Platform Asset Disposition

| Asset | Disposition | Notes |
|-------|-------------|-------|
| `orchestrator.md` | **Keep** | Not modified. Trellis wraps it. |
| `prompts/*.md` | **Keep** | Not modified. Sub-agents reference them. |
| `decisions.md` | **Keep** | Not modified. Gate scripts read it for heresy checks. |
| `tools/building-audit/` | **Keep** | Not modified. Invoked by gate scripts via CLI. |
| `.claude/settings.local.json` | **Modify** | Add hook entries. Existing permissions preserved. |
| `.claude/agents/` | **Create** | New directory for sub-agent definitions. |
| `.building/` | **Create** | New directory for run state, hooks, config. |
| `tools/trellis/` | **Create** | New TypeScript package for state management and reporting. |
| Milestone directories | **Keep** | Trellis writes additional state files alongside existing artifacts. |
