# XRD: building-audit

Engineering response to the PRD for `building-audit` -- a TypeScript CLI that enforces the 19 failure modes as mechanical checks.

## 1. Overall Assessment

The PRD is buildable as specified. The scope is well-bounded: a CLI that reads files and git history, runs deterministic checks, optionally calls an LLM for judgment, and produces a JSON report. No server, no database, no UI beyond terminal output. The data model is already defined in TypeScript interfaces. The check catalog is enumerated with severity rules. The report schema is locked.

What's clear: the two-layer architecture (mechanical vs. LLM judgment), the parser contract (two task file variants with typed output), the report format, the CLI interface, the exit codes, and the dependency policy. The PRD made nine decisions before handing off. That removes the ambiguity that normally slows an XRD.

What's tricky: the task file parser is parsing markdown that was designed for human reading, not machine consumption. The bold-prefix frontmatter, the implicit sub-structure in the Completed section, and code blocks inside Contracts that can contain markdown-like syntax will require defensive parsing with real edge case coverage. The PRD acknowledges this ("If the parser is brittle, half the checks break") and prioritizes it correctly.

What needs pushback: three items below (Section 5). The gitleaks integration adds complexity for marginal v1 value. The 8K token limit will not fit Performance Critical Path evidence. The Fluidity check is framework-specific in ways the PRD understates.

## 2. Open Questions

### Parser (blocks architecture)

**Q1: How should the parser detect which template variant a file uses?**
Recommended answer: Check for `**Track:**` in the frontmatter. Present = full template. Absent = fix template (fix tasks have `**Rework of:**` instead). This is a reliable discriminator -- the two fields are mutually exclusive in the template spec.

**Q2: How should the parser handle the Completed section's implicit sub-structure?**
Recommended answer: Parse by bold-label anchors (`**Date:**`, `**Deviations:**`, `**Insight/Implication:**`, `**Decisions made during this task:**`). Content between one anchor and the next (or section end) is that field's value. If no anchors are found but the section has content, treat the entire section as raw text with `date = null`, `deviations = null`, etc. Log a parse warning but do not fail.

**Q3: The Files section format -- is it sub-lists under bullet labels or inline after colons?**
The template example shows `- Create: \`Sources/Services/StreakService.swift\`` (inline), but the SDM context says they can be multi-line with explanatory text. Recommended answer: Support both patterns. Inline: `- Create: file1, file2`. Multi-line: `- Create:` followed by indented sub-items. Parse file paths from backtick-wrapped strings or bare paths.

### Layer 2 (does not block architecture, blocks task decomposition for Layer 2 checks)

**Q4: What model ID for "Sonnet tier"?**
Recommended answer: Use `claude-sonnet-4-20250514` (latest Sonnet as of build time). Make the model configurable via an environment variable (`ANTHROPIC_MODEL`) with this default. Costs shift; a pinned model prevents surprise cost changes.

## 3. Architecture

### Layer Diagram

```
CLI Entry Point (commander)
  |
  v
Project Scanner
  |-- Task File Parser (remark/unified)
  |-- Git Client (simple-git)
  |-- File System Reader
  |-- DECISIONS.md Parser
  |
  v
Check Runner
  |-- Check Registry
  |     |-- Layer 1 Checks (deterministic)
  |     |-- Layer 2 Checks (LLM judgment)
  |
  v
Report Builder
  |-- JSON Serializer
  |-- Terminal Formatter
```

### Modules

**`parser/`** -- Task file parser. Takes a markdown string, returns a `ParsedTaskFile` or a `ParseError`. Uses `unified`/`remark` to parse markdown into an AST, then walks the AST to extract structured data. This is the most-depended-on module. Every Layer 1 check that references task data flows through it.

**`scanner/`** -- Project scanner. Orchestrates data gathering: finds task files (in `tasks/` or `m<N>-*/tasks/`), parses them, reads git history, reads DECISIONS.md, reads source files. Produces a `ProjectContext` object that checks consume. The scanner is where milestone scoping (`--milestone`) is enforced -- it filters which directories and commits to include.

**`checks/`** -- Check implementations. Each check is a module exporting a function that conforms to the `Check` interface:

```typescript
interface Check {
  name: string;
  layer: 1 | 2;
  run(context: ProjectContext): Promise<CheckResult>;
}
```

Layer 1 checks receive `ProjectContext` and return synchronously (wrapped in a resolved promise for interface uniformity). Layer 2 checks receive `ProjectContext` plus an `LLMClient` and may make API calls.

Checks are organized into two subdirectories:
- `checks/layer1/` -- All mechanical checks.
- `checks/layer2/` -- All LLM judgment checks.

Each check file registers itself with the check registry by exporting a `Check` object. The runner iterates the registry.

**`analyzers/`** -- Language-specific analysis. TypeScript/JavaScript AST parsing lives here. Checks that need AST data call analyzers; checks that don't (git attribution, task file correlation, heresy detection) skip them. This is the seam where future language support plugs in.

```typescript
interface LanguageAnalyzer {
  language: string;
  extensions: string[];
  parseFile(filePath: string, content: string): AnalyzedFile;
}
```

The `AnalyzedFile` type includes: imports, exports, function declarations (with parameter counts and line ranges), class declarations, interface declarations, assertion calls (for test files), and identifiers. Checks consume this normalized structure, not raw ASTs.

**`llm/`** -- Anthropic API client abstraction. Handles: API key validation, request construction, token counting, batching when evidence exceeds 8K tokens, retry with exponential backoff (3 attempts), and token usage tracking. A single `LLMClient` class used by all Layer 2 checks.

**`report/`** -- Report generation. Takes an array of `CheckResult` objects and `ParseError` objects, computes the summary (severity counts, top 3, refactoring assessment), and produces both the JSON file and the terminal output.

**`cli/`** -- Entry point. Arg parsing with `commander`. Validates flags, constructs the pipeline (scanner -> runner -> report), handles exit codes.

### Key Architecture Decisions

**Why a `ProjectContext` object instead of passing raw data to each check:** Checks share expensive data -- parsed task files, git history, file contents. Computing these once in the scanner and passing a shared context avoids redundant work. The context is read-only; checks do not mutate it. **Critical for the 30-second budget:** AST parsing runs exactly once, during the scanner phase (Task A5/A6). The scanner populates `ProjectContext.sourceFiles` with pre-analyzed `AnalyzedFile` objects. Checks consume pre-analyzed data -- no check re-parses source files. The scanner logs timing per phase (task parsing, git history, AST analysis, assembly) so bottlenecks are visible. The check runner logs timing per check and warns when any check exceeds 10 seconds (per PRD non-functional requirements).

**Why analyzers are separate from checks:** The PRD specifies that language-specific analysis (AST parsing for TS/JS) must be separable from language-agnostic checks. Premature Abstraction, Test Cheat, and Fluidity need AST data. Scope Creep, Confidence Bluff, and Surface Heresy do not. Keeping analyzers in their own module means adding Python support later requires a new analyzer, not changes to every check.

**Why checks return promises even when synchronous:** Layer 2 checks are async (API calls). A uniform interface lets the runner iterate all checks the same way. The cost is negligible -- a resolved promise is essentially free.

**Blast radius for likely changes:**
- New check added: one new file in `checks/layer1/` or `checks/layer2/`. No changes elsewhere. The registry picks it up automatically.
- New language: one new file in `analyzers/`. Checks that use `AnalyzedFile` work without changes because the interface is language-agnostic.
- Report schema addition: one field added to the report builder. Non-breaking per the schema contract.
- Task template change: parser module changes. All checks that consume `ParsedTaskFile` may need updates if fields change. This is the highest-blast-radius change, which is why the parser is tested most thoroughly.

### Source Location

`~/building/tools/building-audit/` per the SDM recommendation. This keeps the documentation project root clean and establishes a `tools/` convention for future CLI tools. The directory contains its own `package.json`, `tsconfig.json`, and `src/` directory.

## 4. Quality Bar Trace

The success criterion is: "Run against a project Josh already sanity-tested. Find the same bugs or a superset." There are no quality bar example files, but the PRD's First-Use Walkthrough provides concrete example findings. I'll trace the Test Cheat finding through the architecture.

**The expected finding:**
```
CRITICAL  test-cheat  src/services/__tests__/streak.test.ts:42
  Test 'calculates streak correctly' has 3 assertions, all toBeDefined().
```

**Backward trace -- what data produces this finding:**
1. The test file `streak.test.ts` exists in the project's source tree.
2. The file contains a test function named "calculates streak correctly."
3. That function has 3 assertion calls, all of which are `toBeDefined()`.
4. The test name contains "calculates" -- a verb implying correctness checking.
5. The combination of correctness-implying name + all-weak assertions = critical severity.

**Forward trace through the architecture:**

1. **Project Scanner** finds `streak.test.ts` in the source tree. It reads the file content.
2. **TypeScript Analyzer** (`analyzers/typescript.ts`) parses the file AST. It extracts:
   - Test function declarations (identified by `describe`/`it`/`test` call expressions).
   - For each test function: the name string, and all assertion call expressions within its body.
   - Each assertion is classified: `toBeDefined` -> weak, `toEqual` -> strong, etc.
3. The analyzer produces an `AnalyzedFile` with test entries including assertion classifications.
4. **ProjectContext** stores the analyzed files, keyed by file path.
5. **Test Cheat check** (`checks/layer1/test-cheat.ts`) iterates all analyzed test files. For each test function:
   - Counts strong vs. weak vs. absent assertions.
   - If all assertions are weak or absent, it's a finding.
   - Checks the test name against correctness-implying patterns (`/calculates|returns|produces|computes|generates/i`).
   - If the name implies correctness and assertions are all weak: severity = critical.
6. The check produces a `Finding` with file path, line number, description, and suggestion.
7. **Report Builder** receives the `CheckResult`, includes it in the JSON, and because it's critical, prints it inline to the terminal.

**Data survival check:** At every stage, the data needed for the finding is preserved. The file path survives from scanner to report. The line number comes from the AST (the analyzer preserves source locations). The test name comes from the AST's string literal in the `it()`/`test()` call. The assertion classification comes from the analyzer's call expression matching. The severity logic is in the check, not the analyzer -- the analyzer provides facts, the check applies the rule.

The architecture can reproduce this finding. No lossy middleman.

## 5. Pushback

### 5.1 Gitleaks integration adds complexity for thin v1 value

**Insight:** The PRD specifies gitleaks as optional with graceful degradation -- the tool falls back to built-in patterns when gitleaks is absent. This means building two code paths: one that shells out to a Go binary and parses its output, and one that runs built-in regex patterns. The built-in patterns cover the high-value cases (AWS keys, GitHub tokens, high-entropy strings). The gitleaks path adds a process spawn, output parsing, error handling for missing binary, version compatibility concerns, and a test matrix that doubles for this check.

**Implication:** For v1, where the user is Josh running this on his own projects, the built-in pattern set is sufficient. The gitleaks integration path would consume development effort equivalent to 1-2 other checks. If the built-in patterns miss something gitleaks would catch, Josh sees the degradation note in the report and can run gitleaks manually.

**Recommendation for Product:** Ship v1 with built-in secret patterns only. Document the gitleaks integration as a planned enhancement. The architecture accommodates it -- the Resource Drain check can delegate to a `SecretDetector` interface that swaps implementations later -- but building the gitleaks wrapper now is effort better spent on checks that have no manual fallback.

### 5.2 The 8K token limit will not fit Performance Critical Path evidence

**Insight:** The Performance Critical Path check (Section 3.3.5) traces call chains from entry points through the codebase, including I/O operations. A single call chain 8-10 calls deep with annotated source code at each node will exceed 8K input tokens. The PRD says to batch and log a warning, but the value of this check depends on the LLM seeing the complete chain -- a batch boundary that splits a call chain in half defeats the purpose.

**Implication:** Either the token limit needs to be higher for this specific check, or the evidence format needs to be compressed (function signatures + I/O annotations only, not full source). The compressed format loses the context the LLM needs to assess latency. The higher limit costs more per run.

**Recommendation for Product:** Allow per-check token limits rather than a global 8K cap. Performance Critical Path and Refactoring Signals both need more context than simpler checks like Ghost Refactor. A per-check limit lets the tool stay cheap for cheap checks and spend more where the evidence demands it. Default: 8K. Override for checks that need it: 16K.

### 5.3 Fluidity check is narrower than it appears

**Insight:** The Fluidity check (Section 3.3.6) specifies detecting re-render triggers, non-virtualized lists, and missing debounce. These are React-specific patterns. The PRD says "TypeScript/JavaScript only in 1.0" but doesn't specify React as the only framework. A Vue, Svelte, or vanilla JS project would produce zero candidates for Fluidity regardless of actual performance issues. The check's code phase requires recognizing framework-specific patterns (React state hooks, JSX map calls, component re-render boundaries).

**Implication:** Fluidity is effectively a "React Fluidity" check in 1.0. If Josh audits a non-React TypeScript project, this check silently reports clean even if the project has real UI performance problems. That's a form of silent degradation (per Decision 20) -- the check's name implies it covers UI fluidity broadly, but it only covers React.

**Recommendation for Product:** Rename to `react-fluidity` in the check registry and report, or scope the check description to explicitly say "React projects only" with a note in the report when no React patterns are detected. Honest naming prevents false confidence in the report.

## 6. Affirm What's Right

**Two-layer architecture with cost-proportional Layer 2.** The decision to gather evidence in code and skip the LLM when there are zero candidates (Decision 7) is the right call. It makes the tool cheap to run frequently and expensive only when there's something to evaluate. The alternative -- always calling the LLM for every Layer 2 check -- would make `--full` mode cost $2-5 per run on a clean project, which discourages frequent use.

**Parser as the first and most-tested component.** The PRD explicitly calls out the parser as the foundation and demands thorough testing before any checks are built. This is correct. The parser's reliability determines the tool's reliability. Building checks on a shaky parser would produce false positives that erode trust in the tool.

**Report format as a contract with versioning rules.** Defining the JSON schema upfront with explicit stability guarantees (additive changes only) means the report can be consumed by future tooling without breaking. This forward-thinking constraint costs nothing now and prevents breaking changes later.

**Parse errors as non-fatal.** Decision 8 is correct. A single malformed task file should not prevent the tool from auditing the other 49. The report includes the parse errors so Josh knows what was skipped.

**Exit code semantics.** Clean separation of "findings present" from "tool error" (Decision 9) enables scripting without JSON parsing. Simple and sufficient.

**The git attribution convention.** Using `[TASK_ID]` prefixes in commit messages to map commits to tasks is straightforward and parseable. It creates a clean data path from git history to task scope validation.

## 7. Build Plan

### Day Zero Contracts

Before any track starts, these shared interfaces must be defined and agreed:

1. **`ParsedTaskFile` interface** -- Already defined in the PRD (Section 4.1). Adopt as-is. This is the contract between the parser and every check that consumes task data.

2. **`ProjectContext` interface** -- The shared data bag that the scanner populates and checks consume:
   ```typescript
   interface ProjectContext {
     projectPath: string;
     milestone: string | null;
     taskFiles: ParsedTaskFile[];
     parseErrors: ParseError[];
     gitLog: GitCommit[];
     decisions: DecisionEntry[];
     sourceFiles: Map<string, AnalyzedFile>;
     rawFiles: Map<string, string>;  // file path -> content for non-analyzed files
     packageJsonHistory: { initial: string | null; current: string | null };
     fileToTaskMapping: Map<string, number[]>;  // file path -> task IDs that touched it
     testResultFiles: TestResultFile[];  // parsed JUnit XML / vitest JSON if present
   }
   ```

3. **`Check` interface** -- The contract every check implements. Defined above in the Architecture section.

4. **`AnalyzedFile` interface** -- The normalized output of language-specific analyzers:
   ```typescript
   interface AnalyzedFile {
     filePath: string;
     language: string;
     imports: ImportDeclaration[];
     exports: ExportDeclaration[];
     functions: FunctionInfo[];
     classes: ClassInfo[];
     interfaces: InterfaceInfo[];
     testFunctions: TestFunctionInfo[];  // present only in test files
     identifiers: string[];
     lineCount: number;
   }
   ```

5. **`CheckResult` and `Finding` interfaces** -- Already defined in the PRD (Section 4.2). Adopt as-is.

6. **`AuditReport` interface** -- Already defined in the PRD (Section 4.3). Adopt as-is.

7. **`LLMClient` interface** -- The contract for Layer 2 checks to call the LLM:
   ```typescript
   interface LLMClient {
     query(prompt: string, maxInputTokens?: number): Promise<LLMResponse>;
   }
   interface LLMResponse {
     content: string;
     usage: { input: number; output: number };
   }
   ```

8. **Git commit shape:**
   ```typescript
   interface GitCommit {
     hash: string;
     message: string;
     taskId: number | null;  // parsed from [TASK_ID] prefix, null if absent
     date: string;
     filesChanged: string[];
     insertions: number;
     deletions: number;
   }
   ```

9. **Decision entry shape:**
   ```typescript
   interface DecisionEntry {
     number: number;
     decision: string;
     rationale: string;
     date: string;
     tags: ('HARD KILL' | 'DEFERRED')[];
   }
   ```

### Tracks

**Track A: Foundation** (parser, scanner, core types, CLI scaffold)

- A1: Project scaffold -- `package.json`, `tsconfig.json`, directory structure, test runner (vitest), build configuration, CLI entry point with commander that parses flags and prints help/version. No checks yet -- just the skeleton.
- A2: Task file parser -- full and fix template variants, all edge cases from PRD Section 3.1 and SDM Section 5. Tested against the Task 003 example, a constructed fix task, and deliberately malformed files.
- A3: Git client -- wrapper around `simple-git` that extracts commits with `[TASK_ID]` parsing, file change lists, and diff stats. Milestone scoping (filter commits by directory).
- A4: DECISIONS.md parser -- extracts decision entries with `[HARD KILL]` and `[DEFERRED]` tags.
- A5: TypeScript analyzer -- AST parsing via `@typescript-eslint/parser`. Produces `AnalyzedFile` objects. Test file detection and assertion classification.
- A6: Project scanner -- assembles `ProjectContext` from parser, git client, decisions parser, and analyzer. Handles milestone scoping, file discovery, and graceful degradation on parse errors.

**Track B: Layer 1 Checks** (depends on Track A: A2 for task parser, A3 for git client, A5 for analyzer, A6 for scanner)

- B1: Check runner and registry infrastructure. The runner iterates registered checks, collects results, handles errors per-check (a failing check doesn't kill the run).
- B2: Test Cheat -- assertion classification + task-name correlation.
- B3: Scope Creep -- commit-to-task mapping, file scope comparison.
- B4: Dependency Grab -- package.json diff + task contract correlation.
- B5: Premature Abstraction -- single-implementation detection from AST.
- B6: Surface Heresy -- DECISIONS.md hard kill terminology search.
- B7: Confidence Bluff -- task Completed section claim verification.
- B8: Fragility Metrics -- file length, function length, modification coupling, import cycles, test setup ratio, TODO density.
- B9: Resource Drain -- cleanup pattern detection, unbounded queries, built-in secret patterns.
- B10: Unoptimized Defaults -- missing LIMIT, unsanitized input, missing debounce.

**Track C: Layer 2 Checks + LLM Client** (depends on Track A for scanner, Track B checks provide evidence patterns to learn from)

- C1: LLM client -- Anthropic API wrapper with token counting, batching, retry logic, usage tracking.
- C2: Ghost Refactor -- large-diff detection + LLM ruling.
- C3: Clean Slate Bias -- identifier similarity detection + LLM ruling.
- C4: Deep Heresy -- behavioral intent extraction from kills + LLM ruling.
- C5: Document Heresy -- adjacent terminology detection + LLM ruling.
- C6: Performance Critical Path -- call chain tracing + LLM assessment.
- C7: Fluidity -- re-render trigger detection + LLM assessment.
- C8: Refactoring Signals -- trend computation + LLM assessment.

**Track D: Report and Integration** (merge point -- depends on B1 and C1)

- D1: Report builder -- JSON serialization, summary computation, top-3 selection.
- D2: Terminal formatter -- progress display, inline critical findings, verbose mode.
- D3: CLI integration -- wire scanner -> runner -> report -> terminal. Exit codes.
- D4: End-to-end test -- run the complete tool against a synthetic project directory with known violations.

### Phases

Phase 1: A1-A2 (scaffold + parser). Parser is the gate -- nothing proceeds until it's tested.
Phase 2: A3-A6 in parallel (git, decisions parser, analyzer, scanner). These are independent of each other.
Phase 3: B1 (check runner), then B2-B10 can proceed in parallel. D1-D2 can start here too since the interfaces are defined.
Phase 4: C1 (LLM client), then C2-C8.
Phase 5: D3-D4 (integration + end-to-end test).

### Merge Points

**Merge 1: Scanner -> Check Runner (between Phase 2 and Phase 3).** The scanner must produce a complete `ProjectContext` before checks can run against real data. Risk: if the scanner's `ProjectContext` shape drifts from the Day Zero contract, checks built against the contract will break. Mitigation: the Day Zero contract is tested in A6 with a fixture that all checks import.

**Merge 2: All Checks -> Report Builder (between Phase 4 and Phase 5).** Every check must produce valid `CheckResult` objects. Risk: a check that returns unexpected severity values or missing fields breaks the report. Mitigation: the `CheckResult` type is enforced at compile time, and the report builder validates at runtime with a schema check before serialization.

**Merge 3: End-to-End (Phase 5).** The full pipeline runs against a synthetic project. Risk: the synthetic project doesn't exercise all code paths. Mitigation: the synthetic project is designed with at least one violation per check, plus one clean check, plus one parse error.

### Solo Developer Fallback

Sequential order: A1 -> A2 -> A3 -> A4 -> A5 -> A6 -> B1 -> B2 -> B3 -> B4 -> B5 -> B6 -> B7 -> B8 -> B9 -> B10 -> D1 -> D2 -> C1 -> C2 through C8 -> D3 -> D4.

This order front-loads Layer 1 (the high-value layer per the PRD) and defers Layer 2 so the tool is useful in `--mechanical` mode before any LLM work begins. If time pressure forces a cut, Layer 2 is the thing to cut -- the tool ships with `--mechanical` only and `--full` is a future milestone.

### Deliverable Outside the Tool

One task modifies `~/building/prompts/task-agent.md` to add the `[TASK_ID]` commit message convention. This is a 2-3 line addition and should be done early (Phase 1) so any project built after that point generates parseable commit history.

## 8. Technical Risks

### Risk 1: Task file parser brittleness

**What:** The parser is built against a template spec and one example. Real task files from actual builds will deviate -- inconsistent whitespace, missing sections, ad-hoc formatting. The parser passes all tests against synthetic data and fails on the first real project.

**Why:** No real task files exist yet. The template is a prescription, not a description of actual usage.

**Likelihood:** Medium-high. Markdown parsed by humans always drifts from the spec.

**Impact:** High. Half the Layer 1 checks depend on the parser. A brittle parser means false positives (spurious findings from misparsed data) or false negatives (checks skipped because parsing failed).

**Mitigation:** (1) The parser's error handling is defensive -- missing sections produce null fields, not crashes. (2) The parse_errors array in the report makes failures visible. (3) After the tool ships and runs against a real project, the first round of parser fixes will be data-driven (fix what actually broke, not what might break). (4) The parser test suite includes deliberate format variations beyond the template spec.

### Risk 2: TypeScript AST analysis scope

**What:** The TypeScript analyzer must extract enough information for Test Cheat, Premature Abstraction, Fluidity, and Unoptimized Defaults. Each check needs different facets of the AST. The analyzer's `AnalyzedFile` interface may be too thin for some checks and require expansion mid-build.

**Why:** The precise AST nodes needed for each check are not fully enumerable until the check is implemented.

**Likelihood:** Medium. Some checks (Test Cheat) have well-defined AST patterns. Others (Premature Abstraction's single-implementation detection) require traversing relationships between declarations that may need richer AST data than the initial `AnalyzedFile` provides.

**Impact:** Medium. Expanding `AnalyzedFile` is additive (non-breaking), but it means revisiting the analyzer after checks reveal gaps.

**Mitigation:** Build the analyzer incrementally. Start with what Test Cheat needs (the first check built). Expand as each subsequent check reveals requirements. The interface is designed for additive growth.

### Risk 3: Layer 2 prompt quality determines check value

**What:** Layer 2 checks are only as good as the prompts sent to the LLM. A poorly framed prompt produces false positives or misses real issues. The prompt quality is not testable in a deterministic way -- the same prompt can produce different results across runs.

**Why:** LLM judgment is inherently non-deterministic. The evidence-gathering phase is deterministic, but the ruling phase is not.

**Likelihood:** Medium. Focused prompts with specific evidence tend to produce consistent results, but edge cases will vary.

**Impact:** Medium for individual checks, low for the tool overall (Layer 1 is the high-value layer).

**Mitigation:** (1) Each Layer 2 prompt includes explicit ruling criteria ("Is this a stylistic rewrite or a necessary change? Answer: necessary / unnecessary / ambiguous"). Constrained output formats reduce variability. (2) Layer 2 checks that the LLM is uncertain about report as info, not critical -- the human always decides. (3) Token usage tracking lets Josh see what he's paying for and whether the LLM checks are earning their cost.

### Risk 4: Call chain tracing for Performance Critical Path

**What:** Tracing call chains from entry points through a TypeScript codebase requires resolving imports, following function calls across files, and identifying I/O operations. This is a significant static analysis task.

**Why:** TypeScript's dynamic features (callbacks, promises, dependency injection) make static call chain tracing incomplete. A fully accurate call graph requires type-level analysis that `@typescript-eslint/parser` alone doesn't provide.

**Likelihood:** High that the tracing is incomplete for non-trivial projects.

**Impact:** Medium. Incomplete tracing means some performance-critical chains are missed, not that false positives are produced. The check underreports rather than overreports.

**Mitigation:** (1) Start with direct call chains (function A calls function B calls function C) and explicit async patterns (await chains). Skip dynamic dispatch. (2) Annotate the check's limitations in the report when tracing is incomplete. (3) This is a Layer 2 check -- the LLM can compensate for incomplete tracing by reasoning about the code it receives.

## 9. Implementation Choices

### Choice 1: Vitest for testing

**Tradeoff:** Vitest is fast, TypeScript-native, and has a familiar Jest-compatible API. Jest would also work but requires more configuration for TypeScript. The user-facing consequence is none (test framework is internal). The maintenance burden is low (vitest is actively maintained, widely adopted). The refactoring risk is negligible (switching test frameworks later is mechanical).

### Choice 2: Commander for CLI arg parsing

**Tradeoff:** Commander is the most established Node.js CLI framework. Alternatives (yargs, meow, hand-rolled) all work. Commander's advantage is declarative flag definitions with built-in help generation and validation. The user-facing consequence is a standard `--help` output. The maintenance burden is minimal (commander is stable, low-churn). The refactoring risk is near-zero (CLI arg parsing is a thin layer).

### Choice 3: Store source in `~/building/tools/building-audit/`

**Tradeoff:** Keeps the documentation repo root clean. Establishes a `tools/` convention. The user-facing consequence: `npm install -g` works from this subdirectory. The maintenance burden: one extra directory level in paths. The refactoring risk: moving the tool later requires updating any hardcoded references (there should be none -- the tool operates on its working directory, not its install directory). Alternative considered: `~/building/building-audit/` at root level. Rejected because it mixes application code with system-level directories.

### Choice 4: Unified/remark for markdown parsing, not regex

**Tradeoff:** Remark produces an AST from markdown, which handles edge cases (code blocks containing markdown syntax, nested lists, inconsistent heading levels) that regex-based parsing would miss. The user-facing consequence: fewer parse errors on well-formed task files. The maintenance burden: remark is a dependency, but it's in the PRD's required list and is actively maintained. The refactoring risk: the parser module is self-contained -- the markdown library is an implementation detail hidden behind the `ParsedTaskFile` interface.

### Choice 5: No wrapping of ESLint plugins in v1

**Tradeoff:** The PRD says to evaluate `eslint-plugin-jest`, `eslint-plugin-vitest`, `eslint-plugin-sonarjs`, and `depcheck`. After evaluation: these tools are designed to run as part of an ESLint pipeline on a project's own code. Wrapping them to run programmatically from an external tool (building-audit scanning a project it didn't create) requires configuring ESLint programmatically, resolving the target project's ESLint config, and handling version conflicts between the audit tool's ESLint and the project's ESLint. This is fragile. The assertion classification for Test Cheat is straightforward to build from the AST directly. Cognitive complexity metrics are well-documented algorithms. The user-facing consequence: the tool uses its own implementations instead of delegating to ESLint plugins. The maintenance burden: the tool owns its check logic (more code to maintain, but no external ESLint version coupling). The refactoring risk: if a plugin's detection proves superior later, the check can delegate to it -- the `Check` interface doesn't expose implementation details.

### Choice 6: Sequential Layer 2 execution (not parallel)

**Tradeoff:** The PRD specifies sequential execution to avoid rate limiting. This is the right default. A typical full audit with 7 Layer 2 checks will make 5-15 API calls (some checks have zero candidates and skip the LLM). Sequential execution with 1-3 second response times means 10-45 seconds for Layer 2, well within the 2-minute budget. The user-facing consequence: predictable progress output (one check at a time). The maintenance burden: none (sequential is simpler than parallel). The refactoring risk: switching to parallel later is straightforward if rate limits permit.

## 10. Security Resolutions

Resolutions for the two High findings from the post-XRD security review. These are incorporated into the architecture and build plan.

### Resolution for FINDING-1: Command injection via subprocess invocation

**Requirement:** All subprocess invocations use `child_process.execFile` or `child_process.spawn` with an arguments array. Never `child_process.exec` with string interpolation.

**simple-git version:** Pin to `>= 3.16.0` in `package.json`. This version patches CVE-2022-25860 and CVE-2022-24433 (command injection via crafted remote URLs and branch names).

**Gitleaks invocation (if implemented later):** Use `execFile('gitleaks', ['detect', '--source', projectPath, '--report-format', 'json'])` — never string interpolation. Validate `projectPath` is an absolute path within the expected directory before passing to any subprocess.

**Path validation:** All file paths resolved from CLI arguments (`--milestone`, `--output`) and from parsed task files (`Files` section) are resolved to absolute paths and verified to be within the project root before use. The scanner module enforces this at the boundary.

**Build plan impact:** Task A1 (project scaffold) includes `simple-git >= 3.16.0` pinning. Task A6 (project scanner) includes path validation. No gitleaks subprocess in v1 (per pushback item 5.1).

### Resolution for FINDING-2: Sensitive code sent to API without redaction

**Requirement:** Layer 1's Resource Drain secret detection runs before any Layer 2 evidence gathering. The check runner enforces this ordering: all Layer 1 checks complete first, then Layer 2 checks run.

**Redaction mechanism:** The Resource Drain check produces a set of `SecretLocation` objects (file path + line range + pattern type). Before any Layer 2 check sends evidence to the API, the evidence payload passes through a `redactSecrets` function that:
1. Checks whether the evidence text overlaps with any `SecretLocation`.
2. Replaces matching secret values with `[REDACTED:secret-type]` (e.g., `[REDACTED:aws-key]`).
3. As defense-in-depth, applies a regex-based scan for common secret patterns to all outbound payloads regardless of Layer 1 results.

**Report redaction:** The same `redactSecrets` function is applied to the `evidence` field in the JSON report and to terminal output for secret-related findings. Secret findings include file path and line number but mask the actual value (first 4 chars + `...` + last 4 chars).

**API key protection:** The LLM client wraps all API calls in error handling that strips the `ANTHROPIC_API_KEY` value from any error message before logging or including in report `error_message` fields. A sanitization function replaces any occurrence of the key with `[REDACTED]`.

**Build plan impact:** Task B9 (Resource Drain) must complete before any C-track task runs. Task C1 (LLM client) includes the redaction utility and API key sanitization. The check runner (B1) enforces Layer 1 → Layer 2 ordering. Added to the Phase 3/4 boundary as a hard dependency.

### Resolution for Medium Findings

**FINDING-3 (path traversal):** Addressed by path validation in the scanner (Task A6). `--milestone` validated as a simple directory name (no path separators). `--output` resolved to absolute path with optional warning if outside project root.

**FINDING-4 (API key leakage):** Addressed by API key sanitization in the LLM client (Task C1).

**FINDING-5 (simple-git version):** Addressed by version pinning (Task A1).

**FINDING-6 (report evidence secrets):** Addressed by report redaction (integrated into report builder, Task D1).
