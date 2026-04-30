# Brief: building-audit

A static analysis CLI that enforces the failure modes documented in `~/building/docs/agent-failure-modes.md` as mechanical checks against project artifacts. The tool an agent cannot argue with.

## The Problem

The building system documents 19 failure modes. Agents are instructed to avoid them. They don't. Every bug found during sanity testing traces back to a failure mode the system already catalogs. The failure mode documentation is a teaching document, not an enforcement mechanism. Instructions in a prompt are suggestions. Code that returns `false` is a wall.

The pipeline completes. Tests pass. The smoke test passes. The human sits down, uses the product, and finds bugs that the system's own documentation predicted. The gap is not knowledge — the system knows what to watch for. The gap is enforcement — nothing mechanically checks whether the agents followed the rules.

## The Product

A CLI tool — `building-audit` — that runs against a project directory after a build completes (or after each task completes) and produces a structured report of failure mode violations.

The tool has two layers:

**Layer 1: Static analysis.** Code that parses ASTs, diffs git history, reads task files, and checks project artifacts against mechanical rules. No LLM. Deterministic. Fast. Cannot be persuaded, distracted, or tired. This layer catches every failure mode that can be reduced to a rule:

- **Test Cheat:** Parse test files. Classify every assertion by strength. Flag tests where all assertions are weak (existence checks without correctness checks) or absent.
- **Scope Creep:** Parse each task file's declared file scope. Diff the commits for that task. Flag files changed outside the declared scope.
- **Dependency Grab:** Diff the package manifest between project start and current HEAD. Flag additions not justified in any task's contracts.
- **Premature Abstraction:** Find interfaces, base classes, and generic types with only one concrete implementation. Find passthrough wrappers.
- **Surface Heresy:** Parse DECISIONS.md for Hard Kill entries. Grep the codebase for killed terminology. Flag ghost references.
- **Confidence Bluff:** Parse completed task claims. Verify each claim against actual file state and test execution.
- **Fragility Metrics:** File length, function length, modification coupling (files touched by many tasks), import cycles, test setup complexity, TODO/HACK/FIXME density.
- **Resource Drain:** Find timers, listeners, observers, and subscriptions without corresponding cleanup. Find queries without bounds. Find hardcoded secrets.
- **Unoptimized Defaults:** Missing LIMIT clauses, missing pagination, unsanitized user input reaching queries or shell commands, full-object fetches where subsets suffice.

**Layer 2: LLM judgment pass.** A structured prompt that receives the mechanical findings plus pre-gathered evidence for checks that require interpretation. The LLM gets focused questions with supporting data, not "read the whole codebase." This layer handles:

- **Ghost Refactor:** Code identifies candidates (large diffs on non-refactor tasks). LLM rules on whether each rewrite was necessary.
- **Clean Slate Bias:** Code finds functions and files with similar names/signatures. LLM determines if they're actual duplicates.
- **Deep Heresy:** Code extracts killed decision descriptions. LLM searches for code that implements the killed behavior under different names.
- **Document Heresy:** Code narrows candidate sections in PRD/XRD/task files. LLM reads each and determines if it describes a killed approach as active.
- **Performance Critical Path:** Code traces call chains from entry points. LLM maps them to user actions and assesses whether the chain creates perceptible latency.
- **Fluidity:** Code identifies re-render triggers, non-virtualized lists, missing debounce on scroll/resize handlers. LLM assesses which ones the user would actually feel.
- **Refactoring Signals:** Code produces modification coupling, complexity trends, test setup ratios. LLM reads task completion notes for repeated structural concerns and assesses Green/Yellow/Red.

## How It Runs

Two modes:

**`building-audit --mechanical`** — Layer 1 only. Fast, no LLM cost. Runs after every task completion as a gate check. Produces a structured JSON report. If any check returns Critical findings, the task is not done.

**`building-audit --full`** — Both layers. Runs at milestone boundaries or on demand (when the human wants to do a sanity check before using the product). Layer 1 runs first, then its findings plus extracted code evidence get packaged into a focused prompt for the LLM pass.

Both modes produce the same report format:

```
{
  "checks": [
    {
      "name": "test-cheat",
      "severity": "critical" | "warning" | "info" | "clean",
      "findings": [
        {
          "file": "src/services/__tests__/streak.test.ts",
          "location": "line 42",
          "description": "test 'calculates streak correctly' has 3 assertions, all toBeDefined()",
          "suggestion": "assert specific streak values for known input sequences"
        }
      ]
    }
  ],
  "summary": {
    "critical": 2,
    "warning": 5,
    "info": 3,
    "clean": 6,
    "refactoring_assessment": "yellow",
    "top_3": [...]
  }
}
```

## What This Is Not

- Not a linter. Linters check code style and language rules. This checks whether an agent followed its task spec, wrote honest tests, and didn't introduce documented failure modes.
- Not a test framework. The project's existing tests (including Playwright smoke and pressure tests) continue to run as-is. This tool catches the failure modes that produce code which passes tests but isn't right.
- Not an LLM wrapper. Layer 1 — the high-value layer — is pure code. The LLM in Layer 2 is a focused reviewer of pre-gathered evidence, not a general-purpose code reader.

## Who Uses It

The human running the building pipeline. Today that's Josh. The tool replaces the manual sanity test with a mechanical one that runs faster, catches more, and doesn't get tired. Josh still reviews the report and decides what to fix. The tool produces findings, not fixes.

In Horizon 2: the tool runs automatically after every task as a gate. The orchestrator reads the report. Critical findings block the next task. The human reviews only the failures, not every task completion.

## The Foundation: Task File Parser

Scope Creep, Confidence Bluff, and Dependency Grab all depend on parsing task file markdown into structured data — extracting the Files section, the Contracts section, the Completed section, the Depends on field, and the Status field. If the parser is brittle, half the checks break.

The task file format is defined in `~/building/task-template.md`. It has two variants: the full template and the fix task variant. Both must parse reliably. The parser must handle:

- The `Files` section with its `Create`, `Modify`, and `Do not touch` sub-lists
- The `Contracts` section including code blocks with function signatures
- The `Completed` section including deviations, insight/implication notes, and decisions made during the task
- The `Acceptance Criteria` section as a numbered list
- The `Tests` section as a checkbox list with test IDs
- Frontmatter fields: Track, Phase, Status, Depends on, Context
- The fix task variant's `Rework of` field

This is the foundational piece. Build it first. Test it against every task file format in the template doc — both variants, edge cases (missing sections, extra whitespace, inline code in section headers). Every other analyzer that reads task files depends on this parser being correct.

## The Git Attribution Problem

Scope Creep needs to know which commits belong to which task. The building system does not currently enforce a commit message convention that ties commits to task IDs. Agents commit with messages like "fix tests," "update service," or "implement streak calculation." The audit tool cannot reliably map diffs to tasks without a convention.

Two options:

**Option A: Enforce a commit convention.** Require task agents to prefix commit messages with the task ID: `[003] implement StreakService`. Update `~/building/prompts/task-agent.md` to include this requirement. The audit tool parses the prefix. This is clean but requires a change to the building system, not just the audit tool.

**Option B: Scope checks to milestone boundaries.** Instead of per-task attribution, check the full diff between milestone start (the commit before the first task began) and milestone end (the commit after the last task completed). Scope Creep becomes "were files changed that no task in this milestone declared?" rather than "were files changed that this specific task didn't declare?" Less precise, but works without a commit convention.

**Decision for the PRD/XRD:** Evaluate both. Option A is better long-term. Option B works without changing the building system. The brief does not decide — it surfaces the tradeoff.

## Build vs. Adopt

Before writing custom code for any check, evaluate whether an existing tool handles the detection. The novel value of building-audit is the orchestration of checks against task-scoped contracts — correlating what the agent claimed it would do (in the task file) with what it actually did (in the code and git history). The detection of individual code patterns is often solved.

Evaluate these before building custom:

| Check | Existing Tools to Evaluate | What's Custom |
|-------|---------------------------|---------------|
| Test Cheat (assertion strength) | `eslint-plugin-jest` rules like `no-restricted-matchers`; `eslint-plugin-vitest` equivalent. Can ban weak assertion patterns via ESLint config. | Correlation: which task produced the test? Does the test cover the task's acceptance criteria? |
| Dependency Grab (what changed) | `depcheck` for unused deps. `npm diff` or lockfile diffing for what was added. | Correlation: was the addition justified in the task's Contracts section? |
| Resource Drain (leak detection) | ESLint rules for `useEffect` cleanup (`react-hooks/exhaustive-deps`), `no-async-promise-executor`. Framework-specific lint rules. | Correlation: none needed. Detection is the value here. Adopt if the existing rules cover the patterns. |
| Fragility Metrics | `eslint-plugin-sonarjs` (cognitive complexity), `plato` or `complexity-report` (function length, file complexity, maintainability index). | Correlation: modification coupling (files touched by many tasks) requires git history + task file parsing. Not in existing tools. |
| Secret Detection | `gitleaks`, `trufflehog` — mature, actively maintained, comprehensive pattern libraries. | None. Adopt, don't build. |
| Git Scope Checking | `git diff --name-only` between commits is trivial. | Correlation: mapping commits to tasks and comparing against declared scope. This is the core custom logic. |

**The rule:** Use existing tools for detection. Build custom for the task-contract correlation layer. If an existing tool produces the same signal as a custom analyzer, wrap it rather than reimplement it. The output format and severity classification are ours; the pattern matching doesn't need to be.

## Technology

TypeScript CLI. Node.js runtime. Reasons:

- AST parsing: `@typescript-eslint/parser` for TS/JS projects (the primary target). Extensible to other languages later. But evaluate ESLint plugin ecosystem first — many AST checks may be expressible as ESLint configs rather than custom walkers.
- Git operations: `simple-git` or direct shell commands.
- Markdown parsing: `unified`/`remark` for task files, DECISIONS.md, PRD/XRD.
- Existing tool integration: wrap `gitleaks`, `depcheck`, and relevant ESLint plugins rather than reimplementing their detection logic.
- No runtime dependencies beyond Node — the tool should install and run with `npx` or a global install.
- Output: JSON (for programmatic consumption) and formatted terminal output (for human reading).

## Success Criteria

Run `building-audit --full` against a project that Josh has already sanity-tested. The tool should find the same bugs Josh found — or a superset. If the tool misses something Josh caught, that's a gap to close. If the tool catches things Josh missed, that's the value.

The tool is working when Josh's sanity test finds nothing the tool didn't already flag.

**Ground truth requirement:** Before building starts, Josh runs a manual sanity test on the current Nacre build. Every bug found gets written down with: what the bug is, which file(s) it's in, and which failure mode from `agent-failure-modes.md` it maps to. This list is saved as the ground truth file. When building-audit is complete, it runs against the same Nacre codebase at the same commit. The tool's report is compared against the ground truth. Gaps between the two are the tool's backlog.

Without capturing the ground truth before the build starts, there's no way to measure whether the tool works. The ground truth must be captured now, not reconstructed later.

## What's Out of Scope for 1.0

- Auto-fixing findings. The tool reports. The human (or agent) fixes.
- Language support beyond TypeScript/JavaScript. The architecture should accommodate it, but 1.0 only parses TS/JS.
- Integration with the orchestrator pipeline. 1.0 is a standalone CLI. Pipeline integration is a future milestone.
- CI/CD integration. 1.0 runs manually. Automated pipeline hooks come later.
- Custom rule configuration. 1.0 ships with the rules derived from `agent-failure-modes.md`. User-defined rules come later.
