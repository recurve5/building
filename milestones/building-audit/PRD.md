# PRD: building-audit

## 1. Overview

`building-audit` is a CLI tool that mechanically enforces the 19 failure modes documented in `~/building/docs/agent-failure-modes.md`. It runs against a project directory after a build completes (or after each task) and produces a structured report of violations.

The building system already knows what to watch for. The failure mode catalog is thorough. The problem is that the catalog is a teaching document -- agents read it, nod, and then produce the same bugs it predicts. Instructions in a prompt are suggestions. Code that returns `false` is a wall.

The tool has two layers. Layer 1 is pure static analysis: AST parsing, git diffing, task file parsing, artifact checking. No LLM. Deterministic. Fast. Layer 2 sends pre-gathered evidence to an LLM for judgment calls that require interpretation -- but the LLM gets focused questions with supporting data, not "read the whole codebase." The high-value layer is Layer 1. Layer 2 extends coverage to failure modes that resist mechanical rules.

Josh runs the tool. It produces findings, not fixes. He reviews the report and decides what to act on.

## 2. First-Use Walkthrough

This walkthrough describes what Josh does the first time he runs `building-audit` against a completed project.

**Step 1: Install.**

```
npm install -g building-audit
```

Josh sees a standard npm install. No post-install scripts that download binaries. No prompts. The tool is ready.

**Step 2: Run a mechanical-only audit.**

```
cd ~/projects/nacre
building-audit --mechanical
```

The tool scans the project directory. Terminal output streams progress as each check runs:

```
building-audit v1.0.0
Project: ~/projects/nacre
Mode: mechanical (Layer 1 only)

Parsing task files...        14 tasks found
Scanning git history...      182 commits
Running checks:
  test-cheat               3 findings (1 critical, 2 warning)
  scope-creep              1 finding (1 warning)
  dependency-grab          clean
  premature-abstraction    2 findings (2 info)
  surface-heresy           clean
  confidence-bluff         1 finding (1 critical)
  fragility-metrics        4 findings (1 warning, 3 info)
  resource-drain           clean
  unoptimized-defaults     2 findings (2 warning)

Summary: 2 critical, 5 warning, 5 info, 3 clean
Report written to building-audit-report.json
```

Critical findings print their details inline in the terminal, so Josh sees them without opening the JSON:

```
CRITICAL  test-cheat  src/services/__tests__/streak.test.ts:42
  Test 'calculates streak correctly' has 3 assertions, all toBeDefined().
  Suggestion: Assert specific streak values for known input sequences.

CRITICAL  confidence-bluff  tasks/007-weekly-streaks.md
  Task claims "Created Sources/Services/WeeklyStreakService.swift" in Completed section.
  File does not exist at declared path.
```

Warnings and info-level findings appear in the JSON report but not inline, to keep the terminal readable. Josh can view them with `--verbose` if he wants.

**Step 3: Review the JSON report.**

Josh opens `building-audit-report.json`. The structure matches the report format in Section 5 (Report Format). Every finding has a file path, a location, a human-readable description, and a suggestion. The summary includes severity counts, a refactoring assessment (green/yellow/red -- only populated in `--full` mode), and the top 3 highest-priority findings.

**Step 4: Run a full audit.**

```
building-audit --full
```

Layer 1 runs first (same as `--mechanical`). Then the tool gathers evidence for Layer 2 checks and sends focused prompts to the Anthropic API:

```
building-audit v1.0.0
Project: ~/projects/nacre
Mode: full (Layer 1 + Layer 2)

Parsing task files...        14 tasks found
Scanning git history...      182 commits

Layer 1 checks:
  test-cheat               3 findings (1 critical, 2 warning)
  scope-creep              1 finding (1 warning)
  ...
  [same as mechanical]

Layer 2 checks:
  ghost-refactor           Gathering evidence... 3 candidates found
                           LLM review... 1 finding (1 warning)
  clean-slate-bias         Gathering evidence... 2 candidates found
                           LLM review... clean
  deep-heresy              Gathering evidence... 0 candidates
                           Skipped (no candidates)
  document-heresy          Gathering evidence... 1 candidate found
                           LLM review... 1 finding (1 info)
  performance-critical     Gathering evidence... 4 chains traced
                           LLM review... 1 finding (1 warning)
  fluidity                 Gathering evidence... 2 candidates found
                           LLM review... clean
  refactoring-signals      Gathering evidence...
                           LLM review... Assessment: yellow

Summary: 2 critical, 7 warning, 6 info, 4 clean
Refactoring assessment: yellow
Report written to building-audit-report.json
```

Layer 2 checks that find no candidates in the evidence-gathering phase skip the LLM call entirely and report clean. This keeps cost and latency proportional to actual risk.

**Step 5: Handle errors and degradation.**

If the Anthropic API key is missing or the API is unreachable, `--full` mode completes Layer 1 and reports Layer 2 as skipped:

```
Layer 2 checks:
  ⚠ API unreachable. Layer 2 checks skipped.
  Set ANTHROPIC_API_KEY or run with --mechanical for Layer 1 only.
```

The exit code distinguishes outcomes: 0 = no critical findings, 1 = critical findings present, 2 = tool error (parse failure, API error in full mode). Josh always gets the Layer 1 results even when Layer 2 fails.

If a task file cannot be parsed (malformed markdown, missing required sections), the tool logs a warning per file and continues with the files it can parse. The report includes a `parse_errors` array so Josh knows which files were skipped and why.

**Step 6: Specify a report output path.**

```
building-audit --mechanical --output ./reports/audit-2026-04-13.json
```

Default output is `building-audit-report.json` in the current directory. The `--output` flag overrides.

**Step 7: Run against a specific milestone.**

```
building-audit --mechanical --milestone m1-nacre-docx-ingestion
```

This scopes the audit to task files and commits within the specified milestone directory. Without `--milestone`, the tool audits the entire project.

## Failure Mode Coverage Map

The building system documents 19 failure modes in `agent-failure-modes.md`. This tool covers the subset that leaves detectable evidence in code, task files, and git history. Failure modes that manifest only during live execution, design-time conversation, or cross-session boundaries are out of scope for static analysis.

| Failure Mode | Covered | Check(s) | Notes |
|---|---|---|---|
| Test Cheat | Yes | test-cheat (L1) | Assertion strength classification |
| Scope Creep | Yes | scope-creep (L1) | Commit-to-task attribution via `[TASK_ID]` prefix |
| Dependency Grab | Yes | dependency-grab (L1) | Package manifest diff vs. task contracts |
| Confidence Bluff | Partial | confidence-bluff (L1) | Verifies file existence and structural claims. Test result claims flagged as "unverifiable by static analysis" |
| Context Amnesia | No | — | Manifests during live sessions when agents ignore prior decisions. Detectable only by comparing agent behavior to DECISIONS.md in real time |
| Ghost Refactor | Yes | ghost-refactor (L2) | Large diffs on non-refactor tasks |
| Premature Abstraction | Yes | premature-abstraction (L1) | Single-implementation interfaces/generics |
| Loop of Despair | No | — | Manifests during live execution as repeated failed fix attempts. Requires session monitoring, not post-hoc analysis |
| Heresy (Surface) | Yes | surface-heresy (L1) | Hard Kill terminology in code/docs |
| Heresy (Deep) | Yes | deep-heresy (L2) | Killed behavior under different names |
| Heresy (Document) | Yes | document-heresy (L2) | Killed approaches described as active in docs |
| Precondition Ghost | No | — | Manifests at task decomposition time. Detectable by walking task dependency graph, but requires understanding intent, not just structure |
| Architecture Mirror | No | — | Design-time failure. Requires comparing architecture to creation process, not output structure. LLM judgment against quality bar examples |
| Lossy Middleman | No | — | Design-time failure. Requires tracing quality bar examples through the architecture |
| Closed-Loop Build | No | — | Process-level failure. Detectable by checking if any task references quality bar, but requires understanding what "referencing quality bar" means in context |
| Heroic Unblock | Partial | scope-creep (L1) | Same signal as Scope Creep — files modified outside task scope. The tool detects the symptom but cannot distinguish Heroic Unblock from Scope Creep |
| Clean Slate Bias | Yes | clean-slate-bias (L2) | Similar implementations detected by name/signature similarity |
| Unoptimized Default | Yes | unoptimized-defaults (L1) | Missing LIMIT, pagination, sanitization, debounce |
| Spec Without Shoes | No | — | Design-time failure in PRD creation. Requires experiential review, not code analysis |
| Big Bang Integration | No | — | Pipeline-level process failure. Requires monitoring milestone sequencing, not post-hoc code analysis |
| Accumulating Fragility | Yes | fragility-metrics (L1), refactoring-signals (L2) | Code health signals + trend analysis |

**13 of 19 failure modes covered** (11 fully, 2 partially). The 6 uncovered modes are process or design failures that leave no evidence in completed artifacts. The report includes this coverage map so the user knows what is and is not checked.

## 3. Feature Sections

### 3.1 Task File Parser

The parser converts task file markdown into structured data. It is the foundation -- Scope Creep, Confidence Bluff, Dependency Grab, and Git Attribution all depend on it. If the parser is brittle, half the checks break.

**What it parses:**

The parser handles both task template variants defined in `~/building/task-template.md`:

- **Full template:** Task number, short name, Track, Phase, Status, Depends on, Context (defaults + task-specific), What to Build, Files (Create / Modify / Do not touch), Contracts (including code blocks), Acceptance Criteria (numbered list), Tests (checkbox list with test IDs), Deployment, Execution Plan, Notes, Completed section (date, deviations, insight/implication, decisions made).
- **Fix task variant:** Task number, short name, Rework of, Status, Context, What to Fix, Files (Modify / Do not touch), Acceptance Criteria, Execution Plan, Completed.

**What it produces:**

A structured object per task file with typed fields for every section. The Files section is parsed into three arrays (create, modify, do_not_touch). The Contracts section preserves code blocks with their language tags. The Acceptance Criteria section is a numbered array. The Tests section is an array of objects with test ID, description, and checked status.

**Edge cases the parser must handle:**

- Missing optional sections (Deployment, Notes) -- the field is null, not an error.
- Extra whitespace, inconsistent heading levels, inline code in section headers.
- Frontmatter fields with no value (e.g., `**Depends on:**` with nothing after it).
- Code blocks inside the Contracts section that contain markdown-like syntax.
- The Completed section's sub-structure: date line, deviations paragraph, insight/implication block, decisions block.
- Task files that don't match either template variant -- logged as a parse error, not a crash.

**Testing requirement:** The parser is tested against both template variants from `task-template.md`, including the example task (Task 003: StreakService) and a constructed fix task. Edge case tests cover every bullet above. This is the first thing built and the most thoroughly tested.

### 3.2 Layer 1 Checks (Mechanical)

Each check is a self-contained analyzer that receives parsed project data and produces findings. All checks are deterministic -- same input, same output. No LLM.

**3.2.1 Test Cheat**

Parses test files. Classifies every assertion by strength:
- **Strong:** Asserts a specific value (`toEqual`, `toBe`, `toStrictEqual`, comparison with expected output).
- **Weak:** Asserts existence or type only (`toBeDefined`, `toBeTruthy`, `toBeInstanceOf`, `not.toBeNull`).
- **Absent:** Test function body with no assertion calls.

A test function where all assertions are weak or absent is a finding. Severity: critical if the test name implies correctness checking ("calculates," "returns," "produces") but only has weak assertions. Warning otherwise.

**Build vs. adopt:** Evaluate `eslint-plugin-jest` and `eslint-plugin-vitest` for weak assertion detection. If their rules cover the pattern classification above, wrap them. Build custom for the correlation layer: which task produced the test, and does the test cover the task's acceptance criteria.

**3.2.2 Scope Creep**

For each task: parse the Files section (create, modify, do_not_touch). Map commits to the task using the `[TASK_ID]` prefix in commit messages. Diff the committed files against the declared scope.

Findings:
- File modified that is not in create or modify lists -- severity: warning.
- File in the do_not_touch list was modified -- severity: critical.
- Commit attributed to a task that has no `[TASK_ID]` prefix -- severity: warning (see Git Attribution, Section 3.5).

**Build vs. adopt:** `git diff --name-only` is trivial. The custom value is mapping commits to tasks via the prefix convention and comparing against declared scope.

**3.2.3 Dependency Grab**

Diffs `package.json` (and `package-lock.json` if present) between the project's initial commit and HEAD. Every added dependency is checked against task Contracts sections. A dependency not justified in any task's contracts is a finding.

Severity: warning for runtime dependencies, info for devDependencies.

**Build vs. adopt:** Evaluate `depcheck` for unused dependency detection. Use `npm diff` or lockfile parsing for what changed. Build custom for the task-contract correlation.

**3.2.4 Premature Abstraction**

Scans the AST for:
- Interfaces, abstract classes, and generic type parameters with only one concrete implementation.
- Wrapper functions/classes that pass through to a single inner call without adding behavior.

Severity: info. These are signals, not bugs. The report notes the abstraction and its single consumer so Josh can decide whether it is earned (per Decision 8).

**Build vs. adopt:** AST traversal via `@typescript-eslint/parser`. Evaluate whether ESLint rules can express single-implementation detection. Build custom if not.

**3.2.5 Surface Heresy**

Parses `DECISIONS.md` for entries tagged `[HARD KILL]`. Extracts the killed terminology -- class names, field names, feature names, specific phrasing. Searches the entire codebase and all project documents for matches.

Any match outside the DECISIONS.md kill entry itself is a finding. Severity: critical if found in source code, warning if found in documentation.

**Build vs. adopt:** Pure text search. No existing tool needed. Custom.

**3.2.6 Confidence Bluff**

Parses each task's Completed section for claims. Cross-references against what static analysis can verify:
- "Created [file]" -- checks file existence. If missing, critical finding.
- "Modified [file]" -- checks file appears in git diff for that task's commits. If not, critical finding.
- Function/class existence claims -- checks AST for named declarations. If missing, critical finding.
- "All tests pass" or test result claims -- flagged as "unverifiable by static analysis" (severity: warning). The tool checks that the declared test files exist and contain test functions, but does not execute tests or parse test runner output. If test result files exist in a standard format (JUnit XML, vitest JSON), the tool parses them as supplementary evidence. Otherwise, test claims are flagged for human verification.

Severity: critical for verifiable false claims (file doesn't exist, function not found). Warning for claims that cannot be mechanically verified (test results, behavioral correctness).

**Build vs. adopt:** Custom. No existing tool correlates task completion claims against file state.

**3.2.7 Fragility Metrics**

Produces a set of code health signals:
- File length (lines).
- Function/method length (lines).
- Modification coupling: files touched by more than N tasks (computed from git history + task file mapping).
- Import cycles (circular dependencies).
- Test setup complexity: lines of setup code vs. lines of assertion code in test files.
- TODO/HACK/FIXME comment density.

No individual metric is a finding. The check aggregates them into a per-file health score. Files scoring above a threshold are findings. Severity: warning for files above threshold, info for files approaching it.

**Build vs. adopt:** Evaluate `eslint-plugin-sonarjs` (cognitive complexity) and `plato`/`complexity-report` for function length and maintainability. Build custom for modification coupling (requires git history + task file parsing) and test setup complexity.

**3.2.8 Resource Drain**

Scans for:
- `setInterval`, `setTimeout`, event listeners, observers, and subscriptions without corresponding cleanup (`clearInterval`, `removeEventListener`, `unsubscribe`, cleanup in `useEffect` return).
- Database queries without `LIMIT` clauses.
- Hardcoded strings matching secret patterns (API keys, tokens, passwords).

Severity: warning for missing cleanup and unbounded queries. Critical for hardcoded secrets.

**Build vs. adopt for secrets:** Use `gitleaks` for secret detection. It has mature, actively maintained pattern libraries. Wrap it; do not reimplement. **Build vs. adopt for cleanup:** Evaluate ESLint rules (`react-hooks/exhaustive-deps`, framework-specific rules). Build custom for patterns not covered by existing rules.

**3.2.9 Unoptimized Defaults**

Scans for:
- Database queries without `LIMIT` or pagination.
- API responses returning full objects where the consumer uses a subset of fields.
- Lists rendering without virtualization (React-specific: large arrays mapped to JSX without windowing).
- Missing input sanitization on values reaching queries or shell commands.
- Missing debounce on scroll/resize handlers.

Severity: warning for performance issues, critical for unsanitized input reaching queries or shell commands (injection risk).

**Build vs. adopt:** Some of these overlap with ESLint security rules and React performance rules. Evaluate and wrap where available. Build custom for query/API response analysis.

### 3.3 Layer 2 Checks (LLM Judgment)

Layer 2 checks follow a two-phase pattern: (1) code gathers candidates and evidence, (2) a focused prompt asks the LLM to rule on each candidate. If the code phase finds zero candidates, the LLM is never called. This keeps cost proportional to risk.

All Layer 2 checks use the Anthropic API at the Sonnet tier. Each check's prompt must stay under 8K input tokens. If evidence for a single check exceeds 8K tokens, the check splits into batches and the results are merged. The tool logs a warning when batching occurs so Josh knows cost increased.

**3.3.1 Ghost Refactor**

- **Code phase:** Identifies commits with large diffs (above a configurable line threshold) attributed to tasks that are not labeled as refactoring tasks. Extracts the before/after code for each candidate.
- **LLM phase:** For each candidate, asks: "This diff was produced by a task that is not a refactoring task. Was this rewrite necessary to accomplish the task's stated goal, or is it a stylistic rewrite of working code?" Provides the task's What to Build section and the diff.
- **Severity:** Warning if the LLM rules unnecessary. Info if ambiguous.

**3.3.2 Clean Slate Bias**

- **Code phase:** Finds functions, classes, and files with similar names or signatures across the codebase. Uses string similarity on identifiers and function signatures.
- **LLM phase:** For each pair, asks: "Do these two implementations serve the same purpose? Could one be eliminated by extending the other?" Provides both implementations.
- **Severity:** Warning if duplicates confirmed. Info if related but distinct.

**3.3.3 Deep Heresy**

- **Code phase:** Extracts killed decision descriptions from `DECISIONS.md` `[HARD KILL]` entries. Parses the rationale to identify the behavioral intent of the killed approach (not just terminology, which Surface Heresy covers).
- **LLM phase:** Asks: "This decision killed [approach]. Does any code in the project implement this behavior under a different name?" Provides the decision text and relevant code sections identified by the code phase via keyword expansion from the kill rationale.
- **Severity:** Critical if the LLM identifies an active implementation of a killed approach. Warning if uncertain.

**3.3.4 Document Heresy**

- **Code phase:** Narrows candidate sections in PRD, XRD, and task files that reference terminology adjacent to killed decisions. Extracts those sections.
- **LLM phase:** For each section, asks: "This decision was killed: [decision]. Does the following document section describe the killed approach as if it were active?" Provides the decision and the document section.
- **Severity:** Warning if confirmed. Info if ambiguous.

**3.3.5 Performance Critical Path**

- **Code phase:** Traces call chains from entry points (API route handlers, event handlers, main execution paths) through the codebase. Measures chain depth and identifies chains that cross service boundaries or involve I/O operations.
- **LLM phase:** For each flagged chain, asks: "This call chain handles [user action]. The chain is N calls deep and includes [I/O operations]. Would a user perceive latency from this chain?" Provides the chain with annotated I/O points.
- **Severity:** Warning if the LLM assesses perceptible latency. Info otherwise.

**3.3.6 Fluidity**

- **Code phase:** Identifies re-render triggers (state changes in loops, unthrottled event handlers), non-virtualized lists over a size threshold, and missing debounce on scroll/resize handlers.
- **LLM phase:** For each candidate, asks: "Would a user feel this performance issue during normal use?" Provides the code and the UI context (component name, what it renders).
- **Severity:** Warning if user-perceptible. Info otherwise.

**3.3.7 Refactoring Signals**

- **Code phase:** Computes modification coupling trends, complexity growth across tasks, test setup ratio trends, and extracts structural concerns mentioned in task Completed sections.
- **LLM phase:** Asks: "Given these codebase health trends and the structural concerns raised by agents during the build, should the next milestone proceed as planned, proceed with targeted refactoring first, or halt for structural rework?" Provides the metrics and the extracted agent concerns.
- **Output:** A green/yellow/red assessment in the report summary. Green = proceed. Yellow = targeted refactoring recommended before next milestone. Red = structural rework needed.
- **Severity:** The assessment itself (not individual findings).

### 3.4 Report Format

The report is a JSON file. The schema is the contract between `building-audit` and anything that reads its output (the human, a future orchestrator integration, dashboards).

```json
{
  "version": "1.0.0",
  "timestamp": "2026-04-13T14:30:00Z",
  "project": "/path/to/project",
  "mode": "mechanical" | "full",
  "milestone": "m1-nacre-docx-ingestion" | null,
  "checks": [
    {
      "name": "test-cheat",
      "layer": 1 | 2,
      "status": "completed" | "skipped" | "error",
      "severity": "critical" | "warning" | "info" | "clean",
      "findings": [
        {
          "file": "src/services/__tests__/streak.test.ts",
          "location": "line 42",
          "description": "Test 'calculates streak correctly' has 3 assertions, all toBeDefined().",
          "suggestion": "Assert specific streak values for known input sequences.",
          "evidence": {}
        }
      ],
      "error_message": null
    }
  ],
  "parse_errors": [
    {
      "file": "tasks/014-cleanup.md",
      "reason": "Missing required section: What to Build"
    }
  ],
  "summary": {
    "critical": 2,
    "warning": 5,
    "info": 3,
    "clean": 6,
    "skipped": 0,
    "refactoring_assessment": "yellow" | null,
    "top_3": [
      {
        "check": "test-cheat",
        "file": "src/services/__tests__/streak.test.ts",
        "description": "..."
      }
    ]
  },
  "token_usage": {
    "total_input_tokens": 12400,
    "total_output_tokens": 3200,
    "checks": {
      "ghost-refactor": { "input": 4100, "output": 800 },
      "clean-slate-bias": { "input": 3200, "output": 600 }
    }
  }
}
```

**Schema rules:**
- Adding new fields to the report is non-breaking. Removing or renaming existing fields is breaking.
- `severity` on the check object is the highest severity among its findings, or `clean` if no findings.
- `token_usage` is present only in `--full` mode. It lets Josh see what the LLM pass cost.
- `refactoring_assessment` is null in `--mechanical` mode (only Layer 2 produces it).
- The `evidence` field in findings is an optional object for checks that want to attach supporting data (diffs, code snippets, metric values). Its internal structure varies by check.

**Terminal output:**

The terminal displays a formatted summary (as shown in the First-Use Walkthrough). Critical findings are printed inline with file, location, description, and suggestion. Warnings and info appear only with `--verbose`. The JSON report always contains everything regardless of verbosity.

### 3.5 CLI Interface

**Commands and flags:**

| Flag | Description |
|------|-------------|
| `--mechanical` | Run Layer 1 checks only. No LLM. Fast. |
| `--full` | Run Layer 1 + Layer 2 checks. Requires `ANTHROPIC_API_KEY`. |
| `--milestone <name>` | Scope the audit to a specific milestone directory. |
| `--output <path>` | Output file path for the JSON report. Default: `building-audit-report.json`. |
| `--verbose` | Print all findings to terminal, not just critical. |
| `--version` | Print version and exit. |
| `--help` | Print usage and exit. |

One of `--mechanical` or `--full` is required. If neither is specified, the tool prints usage and exits with code 2. Running both is not valid.

**Exit codes:**

| Code | Meaning |
|------|---------|
| 0 | Audit completed. No critical findings. |
| 1 | Audit completed. Critical findings present. |
| 2 | Tool error. Parse failures, missing API key in full mode, invalid arguments. |

**Environment variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | For `--full` only | API key for Layer 2 LLM checks. |

**Git attribution convention:**

Task agents prefix commit messages with the task ID: `[TASK_ID] message` (e.g., `[003] implement StreakService`). A commit without a task ID prefix is itself a finding under Scope Creep (severity: warning), because the tool cannot attribute that commit's changes to any task.

The audit tool parses this prefix to map commits to tasks. The convention is enforced by adding the requirement to `~/building/prompts/task-agent.md`.

## 4. Data Model

### 4.1 Parsed Task File

```typescript
interface ParsedTaskFile {
  filePath: string;
  variant: 'full' | 'fix';
  taskNumber: number;
  shortName: string;
  track: string | null;            // null for fix tasks
  phase: string | null;            // null for fix tasks
  status: 'not started' | 'in progress' | 'done' | 'blocked';
  dependsOn: number[];             // task numbers
  context: {
    defaults: string[];
    taskSpecific: string[];
  };
  reworkOf: string | null;         // fix tasks only

  // Content sections
  whatToBuild: string | null;      // full template: "What to Build"
  whatToFix: string | null;        // fix template: "What to Fix"

  files: {
    create: string[];
    modify: string[];
    doNotTouch: string[];
  };

  contracts: string | null;        // raw markdown including code blocks
  acceptanceCriteria: AcceptanceCriterion[];
  tests: TestEntry[];
  deployment: string | null;
  executionPlan: string | null;
  notes: string | null;

  completed: CompletedSection | null;
}

interface AcceptanceCriterion {
  number: number;
  text: string;
}

interface TestEntry {
  testId: string;
  description: string;
  checked: boolean;
}

interface CompletedSection {
  date: string | null;
  deviations: string | null;
  insightImplication: string | null;
  decisions: string | null;
}
```

### 4.2 Check Result

```typescript
interface CheckResult {
  name: string;
  layer: 1 | 2;
  status: 'completed' | 'skipped' | 'error';
  severity: 'critical' | 'warning' | 'info' | 'clean';
  findings: Finding[];
  errorMessage: string | null;
  tokenUsage?: { input: number; output: number };  // Layer 2 only
}

interface Finding {
  file: string;
  location: string;
  description: string;
  suggestion: string;
  evidence?: Record<string, unknown>;
}
```

### 4.3 Audit Report

```typescript
interface AuditReport {
  version: string;
  timestamp: string;
  project: string;
  mode: 'mechanical' | 'full';
  milestone: string | null;
  checks: CheckResult[];
  parseErrors: ParseError[];
  summary: {
    critical: number;
    warning: number;
    info: number;
    clean: number;
    skipped: number;
    refactoringAssessment: 'green' | 'yellow' | 'red' | null;
    top3: TopFinding[];
  };
  tokenUsage?: {
    totalInputTokens: number;
    totalOutputTokens: number;
    checks: Record<string, { input: number; output: number }>;
  };
}

interface ParseError {
  file: string;
  reason: string;
}

interface TopFinding {
  check: string;
  file: string;
  description: string;
}
```

## 5. Non-Functional Requirements

**Speed.** `--mechanical` completes in under 30 seconds on a project with 500 source files and 50 task files. The parser alone completes in under 2 seconds for 50 task files. If a check takes longer than 10 seconds, it logs a timing warning so Josh knows where the time went.

**Layer 2 cost.** Each LLM check stays under 8K input tokens. If a check would exceed 8K, it batches and logs a warning. A full audit of a typical project (500 source files, 50 tasks, 200 commits) should cost under $0.50 in API usage. The `token_usage` field in the report makes the cost visible after every run.

**Layer 2 latency.** Layer 2 checks run sequentially (not parallel) to avoid rate limiting. A full audit's Layer 2 phase should complete in under 2 minutes for a typical project. If the API is slow, the tool does not retry indefinitely -- it retries each check up to 3 times with exponential backoff, then marks the check as `error` and continues with the remaining checks.

**Reliability.** The tool never crashes on malformed input. Unparseable task files produce parse errors in the report. Unreachable APIs produce skipped checks. Invalid project directories produce a clear error message and exit code 2. Every degradation path produces output Josh can act on.

**Determinism.** Layer 1 checks produce identical output for identical input. Layer 2 checks may vary between runs (LLM non-determinism), but the evidence-gathering phase is deterministic, so the same candidates are always sent to the LLM.

**Portability.** Runs on macOS and Linux. Node.js 18+ required. No native binaries. No platform-specific code paths.

## 6. Technical Constraints

**Runtime:** Node.js 18+, TypeScript.

**Dependency policy:** Minimal runtime dependencies. npm packages are acceptable. No external binaries requiring separate installation (with one exception: if `gitleaks` is adopted for secret detection, it must be an optional integration -- the check degrades gracefully to a built-in pattern set if `gitleaks` is not installed, and the report notes that the full pattern library was not available).

**Adopted tools (evaluate before building custom):**

| Tool | Purpose | Integration |
|------|---------|-------------|
| `@typescript-eslint/parser` | AST parsing for TS/JS | Core dependency. Required. |
| `unified` / `remark` | Markdown parsing for task files, DECISIONS.md | Core dependency. Required. |
| `simple-git` | Git operations | Core dependency. Required. |
| `eslint-plugin-jest` / `eslint-plugin-vitest` | Weak assertion detection | Evaluate. Wrap if sufficient. |
| `depcheck` | Unused dependency detection | Evaluate. Wrap if sufficient. |
| `eslint-plugin-sonarjs` | Cognitive complexity | Evaluate. Wrap if sufficient. |
| `gitleaks` | Secret detection | Optional. Degrade to built-in patterns if absent. |

**Custom code:** The task-contract correlation layer -- mapping what agents claimed they would do to what they actually did -- is the core custom value. Detection of individual code patterns should use existing tools where they exist.

**Output:** JSON file (programmatic consumption) + formatted terminal output (human reading). Both are always produced. The terminal output is not a substitute for the JSON; it is a convenience layer.

**Language support:** TypeScript/JavaScript only in 1.0. The architecture should separate language-specific analyzers from language-agnostic checks (git attribution, task file parsing, heresy detection) so that future languages can be added by implementing new analyzers without changing the core.

## 7. Out of Scope

- **Auto-fixing findings.** The tool reports. Josh decides what to fix and how.
- **Language support beyond TypeScript/JavaScript.** The architecture accommodates it, but 1.0 ships only TS/JS analyzers.
- **Orchestrator pipeline integration.** 1.0 is a standalone CLI. Automated pipeline gating (orchestrator reads report, blocks on critical findings) is a future milestone.
- **CI/CD integration.** 1.0 runs manually from the terminal.
- **Custom rule configuration.** 1.0 ships with the fixed rule set derived from `agent-failure-modes.md`. User-defined rules, severity overrides, and check disabling come later.
- **Watch mode / incremental analysis.** 1.0 runs as a one-shot command. File watching and incremental re-checking are future work.
- **Multi-project analysis.** 1.0 runs against a single project directory. Cross-project pattern detection is out of scope.

## 8. Decisions Log

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Git attribution uses commit convention: `[TASK_ID] message` | Option A from the brief. Task agents prefix commits with the task ID. This is cleaner than milestone-boundary scoping (Option B) and enables per-task Scope Creep detection. The requirement is added to `task-agent.md`. A missing task ID prefix is itself a finding. | 2026-04-13 |
| 2 | Ground truth is an open item | Josh captures the ground truth (manual sanity test bugs mapped to failure modes) in parallel with the build. The tool is validated against this ground truth when complete. Logged as open item; Josh handles it. | 2026-04-13 |
| 3 | Layer 2 LLM: Anthropic API, Sonnet tier | Cost-effective for focused judgment calls. Each check stays under 8K input tokens. If a check exceeds 8K, it batches and logs a warning. | 2026-04-13 |
| 4 | Minimal runtime dependencies | npm packages are fine. No external binaries requiring separate installation. Exception: `gitleaks` integration is optional and degrades gracefully if absent. | 2026-04-13 |
| 5 | Report format is a contract | The JSON schema in Section 3.4 is the contract. Adding fields is non-breaking. Removing or renaming fields is breaking. | 2026-04-13 |
| 6 | `gitleaks` is optional, not required | **Insight:** The brief says "adopt, don't build" for secret detection and lists `gitleaks` as mature and comprehensive. But `gitleaks` is a Go binary -- requiring it would violate Decision 4 (no external binaries). **Implication:** Making `gitleaks` required forces every user to install a Go binary. Making it absent means building a weaker secret pattern library from scratch. Neither is good. **Decision:** `gitleaks` is an optional enhancement. When installed, the tool uses it and gets the full pattern library. When absent, the tool falls back to a built-in set of common patterns (AWS keys, GitHub tokens, generic high-entropy strings) and the report notes that the full pattern library was not available. Josh sees the degradation and can install `gitleaks` if he wants the full coverage. | 2026-04-13 |
| 7 | Layer 2 checks skip the LLM when code phase finds zero candidates | If the evidence-gathering phase produces no candidates, the LLM is never called and the check reports clean. This keeps cost and latency proportional to actual risk rather than fixed per run. | 2026-04-13 |
| 8 | Parse errors are reported, not fatal | A malformed task file does not crash the tool. The file is skipped, the error is logged in the report's `parse_errors` array, and checks continue with successfully parsed files. Josh sees which files failed and why, and can fix them or re-run. | 2026-04-13 |
| 9 | Exit codes distinguish findings from errors | Exit 0 = clean or non-critical findings only. Exit 1 = critical findings present. Exit 2 = tool error. This lets scripts and future pipeline integration act on the exit code without parsing the report. | 2026-04-13 |

## Tier 3 Items

None. All open questions from the brief have been resolved by Josh's pre-made decisions or by Tier 2 product decisions above.

## Assumptions

1. The `building` system's task file format is stable. If the template in `task-template.md` changes, the parser needs updating. The parser is built against the current template as of this PRD.
2. Projects audited by this tool use the `building` system's conventions: task files in `tasks/` or `m<N>-<project>-<goal>/tasks/`, a `DECISIONS.md` at the project root or milestone directory, and git as the version control system.
3. The Anthropic API's Sonnet tier is available and priced at current rates. If pricing changes materially, the cost estimates in the non-functional requirements section may need revision.
