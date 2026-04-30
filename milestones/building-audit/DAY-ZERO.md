# DAY-ZERO.md — building-audit

All shared interfaces, schemas, and conventions that cross-track tasks depend on. Task files reference contracts by name from this document. No task may introduce an interface consumed by another task unless it is defined here.

## 1. ParsedTaskFile

The contract between the task file parser (Task 002) and every check that consumes task data.

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

**Variant detection rule (XRD Q1):** Check for `**Track:**` in frontmatter. Present = full template. Absent + `**Rework of:**` present = fix template. Neither = parse error.

**Completed section parsing (XRD Q2):** Parse by bold-label anchors (`**Date:**`, `**Deviations:**`, `**Insight/Implication:**`, `**Decisions made during this task:**`). Content between one anchor and the next (or section end) is that field's value. If no anchors found but the section has content, treat entire section as raw text with all sub-fields null. Log a parse warning but do not fail.

**Files section parsing (XRD Q3):** Support both inline (`- Create: file1, file2`) and multi-line (`- Create:` followed by indented sub-items). Parse file paths from backtick-wrapped strings or bare paths.

**Source:** PRD Section 4.1, XRD Section 7.

## 2. ProjectContext

The shared data bag that the scanner (Task 006) populates and checks consume. Computed once, consumed by all checks. Read-only -- checks do not mutate it.

```typescript
interface ProjectContext {
  projectPath: string;
  milestone: string | null;
  taskFiles: ParsedTaskFile[];
  parseErrors: ParseError[];
  gitLog: GitCommit[];
  decisions: DecisionEntry[];
  sourceFiles: Map<string, AnalyzedFile>;
  rawFiles: Map<string, string>;  // file path -> content for non-analyzed files (md, json, etc.)
  packageJsonHistory: { initial: string | null; current: string | null };
  fileToTaskMapping: Map<string, number[]>;  // file path -> task IDs that touched it
  testResultFiles: TestResultFile[];  // parsed JUnit XML / vitest JSON if present
}
```

**AST parsing runs once in the scanner, not per-check (Decision 15).** The scanner populates `sourceFiles` with pre-analyzed `AnalyzedFile` objects. Checks consume pre-analyzed data. The scanner logs timing per phase (task parsing, git history, AST analysis, assembly).

**Milestone scoping (Decision 18):** Scanner identifies task IDs in the milestone's `tasks/` directory, filters `gitLog` to commits whose `taskId` matches one of those IDs plus unattributed commits touching milestone directory files.

**No task files (Decision 17):** When zero task files found, `taskFiles` is empty. Task-dependent checks report `skipped` with reason.

**Source:** XRD Section 7 (expanded per peer review Issues 2, 3, 4; Decisions 14, 15, 17, 18).

## 3. Check Interface

The contract every check implements. The check runner (Task 007) iterates registered checks.

```typescript
interface Check {
  name: string;
  layer: 1 | 2;
  run(context: ProjectContext, llmClient?: LLMClient): Promise<CheckResult>;
}
```

Layer 1 checks ignore `llmClient`. Layer 2 checks require it. The runner passes `undefined` for Layer 1, a live or mock client for Layer 2.

**Source:** XRD Section 3.

## 4. AnalyzedFile

The normalized output of language-specific analyzers. Checks consume this structure, not raw ASTs.

```typescript
interface AnalyzedFile {
  filePath: string;
  language: string;
  imports: ImportDeclaration[];
  exports: ExportDeclaration[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  interfaces: InterfaceInfo[];
  testFunctions: TestFunctionInfo[];  // empty array for non-test files
  identifiers: string[];
  lineCount: number;
}

interface ImportDeclaration {
  source: string;           // module specifier
  specifiers: string[];     // imported names
  line: number;
}

interface ExportDeclaration {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'variable' | 'type' | 'default';
  line: number;
}

interface FunctionInfo {
  name: string;
  params: ParameterInfo[];
  returnType: string | null;
  startLine: number;
  endLine: number;
  isAsync: boolean;
  isGenerator: boolean;
}

interface ParameterInfo {
  name: string;
  type: string | null;
}

interface ClassInfo {
  name: string;
  implements: string[];     // interface names
  extends: string | null;
  methods: FunctionInfo[];
  startLine: number;
  endLine: number;
}

interface InterfaceInfo {
  name: string;
  extends: string[];
  methods: { name: string; params: ParameterInfo[]; returnType: string | null }[];
  startLine: number;
  endLine: number;
}

interface TestFunctionInfo {
  name: string;             // test description string
  startLine: number;
  endLine: number;
  assertions: AssertionInfo[];
}

interface AssertionInfo {
  method: string;           // e.g., 'toBeDefined', 'toEqual', 'toBe'
  strength: 'strong' | 'weak' | 'absent';
  line: number;
}
```

**Assertion strength classification (Decision 21):** Loaded from `assertion-patterns.json` at runtime. Default patterns shipped with the tool:
- **Strong:** `toEqual`, `toBe`, `toStrictEqual`, `toMatchObject`, `toMatchSnapshot`, `toThrow`, `toHaveBeenCalledWith`, comparison with expected literal values.
- **Weak:** `toBeDefined`, `toBeTruthy`, `toBeFalsy`, `toBeInstanceOf`, `not.toBeNull`, `not.toBeUndefined`, `toHaveLength` (without specific value), `toBeGreaterThan` / `toBeLessThan` (existence-class checks).
- **Absent:** Test function body with no assertion calls.

The JSON config file allows adding new matchers without code changes. If the config file is not found, the tool uses the built-in defaults above.

**Source:** XRD Section 3 (AnalyzedFile), PRD Section 3.2.1 (assertion classification), Decision 21.

## 5. CheckResult and Finding

The output of every check. The report builder consumes these.

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

**Severity on CheckResult:** The highest severity among its findings, or `clean` if no findings.

**Source:** PRD Section 4.2.

## 6. AuditReport

The JSON report schema. Adding new fields is non-breaking. Removing or renaming existing fields is breaking (Decision 5).

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
  correlations?: string[];  // other check names with findings at the same file/task
}
```

**Source:** PRD Section 4.3.

## 7. LLMClient

The contract for Layer 2 checks to call the LLM.

```typescript
interface LLMClient {
  query(prompt: string, maxInputTokens?: number): Promise<LLMResponse>;
}

interface LLMResponse {
  content: string;
  usage: { input: number; output: number };
}
```

**Default token limit:** 8K input tokens. Per-check override up to 16K (Decision 11). If evidence exceeds the limit, the check batches and logs a warning.

**Retry:** 3 attempts with exponential backoff. After 3 failures, check marked as `error`.

**Secret redaction:** All evidence payloads pass through `redactSecrets` before being sent to the API (XRD Section 10, FINDING-2 resolution).

**API key protection:** The LLM client strips `ANTHROPIC_API_KEY` from error messages before logging or including in report `errorMessage` fields.

**Model:** `claude-sonnet-4-20250514` by default. Configurable via `ANTHROPIC_MODEL` environment variable (XRD Q4).

**Source:** XRD Section 7, Decision 3, Decision 11, XRD Section 10.

## 8. GitCommit

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

**Task ID parsing:** Extract from `[TASK_ID]` prefix pattern: `/^\[(\d+)\]/`. If the prefix is absent, `taskId` is null.

**Legacy project support (Decision 19):** The CLI accepts `--convention-start <commit-hash>`. Commits before that hash are excluded from task ID attribution checks. When specified, only commits after the hash are checked for `[TASK_ID]` prefixes. When not specified, all commits are checked.

**Source:** XRD Section 7, Decision 1, Decision 19.

## 9. DecisionEntry

```typescript
interface DecisionEntry {
  number: number;
  decision: string;
  rationale: string;
  date: string;
  tags: ('HARD KILL' | 'DEFERRED')[];
}
```

**Tag detection:** Parse `[HARD KILL]` and `[DEFERRED]` from the decision or rationale text. Tags appear as bracketed markers inline.

**Source:** XRD Section 7, SDM Section 4.

## 10. TestResultFile

```typescript
interface TestResultFile {
  filePath: string;
  format: 'junit-xml' | 'vitest-json';
  suites: TestSuiteResult[];
}

interface TestSuiteResult {
  name: string;
  tests: TestCaseResult[];
}

interface TestCaseResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number | null;
  errorMessage: string | null;
}
```

**Usage:** Parsed by the scanner if standard test result files are found. Used by Confidence Bluff (Task 013) as supplementary evidence for test result claims (Decision 14).

**Source:** PRD Section 3.2.6, Decision 14.

## 11. LanguageAnalyzer

The seam for future language support.

```typescript
interface LanguageAnalyzer {
  language: string;
  extensions: string[];
  parseFile(filePath: string, content: string): AnalyzedFile;
}
```

v1 ships only the TypeScript/JavaScript analyzer. The interface exists so future languages plug in without changing checks.

**Source:** XRD Section 3, PRD Section 6.

## 12. SecretLocation

Used by Resource Drain (Task 015) to mark secrets, and by the LLM client (Task 019) to redact evidence payloads.

```typescript
interface SecretLocation {
  filePath: string;
  line: number;
  endLine: number;
  patternType: string;  // e.g., 'aws-key', 'github-token', 'high-entropy'
  maskedValue: string;  // first 4 chars + '...' + last 4 chars
}
```

**Flow:** Resource Drain produces `SecretLocation[]`. The check runner stores them. The `redactSecrets(text: string, secrets: SecretLocation[]): string` utility replaces matching values with `[REDACTED:pattern-type]`. Defense-in-depth: a regex scan also runs on all outbound LLM payloads regardless of Layer 1 results.

**Source:** XRD Section 10.

## 13. Directory Structure

```
~/building/tools/building-audit/
  package.json
  tsconfig.json
  vitest.config.ts
  bin/
    building-audit.ts            # CLI entry point
  src/
    cli/
      index.ts                   # Arg parsing, pipeline orchestration
    parser/
      task-file-parser.ts        # Markdown -> ParsedTaskFile | ParseError
      decisions-parser.ts        # DECISIONS.md -> DecisionEntry[]
    scanner/
      project-scanner.ts         # Assembles ProjectContext
    analyzers/
      typescript-analyzer.ts     # TS/JS AST -> AnalyzedFile
      types.ts                   # LanguageAnalyzer interface
    checks/
      registry.ts                # Check registration and runner
      types.ts                   # Check, CheckResult, Finding interfaces
      layer1/
        test-cheat.ts
        scope-creep.ts
        dependency-grab.ts
        premature-abstraction.ts
        surface-heresy.ts
        confidence-bluff.ts
        fragility-metrics.ts
        resource-drain.ts
        unoptimized-defaults.ts
      layer2/
        ghost-refactor.ts
        clean-slate-bias.ts
        deep-heresy.ts
        document-heresy.ts
        performance-critical.ts
        react-fluidity.ts
        refactoring-signals.ts
    llm/
      client.ts                  # Anthropic API wrapper
      redact.ts                  # redactSecrets utility
    report/
      json-builder.ts            # AuditReport assembly
      terminal-formatter.ts      # Terminal output
    types/
      index.ts                   # All shared type exports
  test/
    fixtures/
      task-003-streak.md
      task-fix-example.md
      task-malformed.md
      task-edge-cases/
      decisions-with-kills.md
      synthetic-project/
    factories/
      index.ts                   # createTaskFile, createProjectContext, etc.
```

**Source:** XRD Section 3, SDM Section 6.

## 14. Git Commit Convention

All commits during the build use the prefix `[TASK_ID] message` (e.g., `[003] implement task file parser`). A commit without the prefix is itself a finding under Scope Creep.

This convention is added to `~/building/prompts/task-agent.md` (Task 029).

**Source:** PRD Section 3.5, Decision 1.

## 15. Check Deduplication Convention

When Unoptimized Defaults (Layer 1) and React Fluidity or Performance Critical Path (Layer 2) detect the same pattern at the same file+location, the Layer 2 finding supersedes the Layer 1 finding. The report builder deduplicates by file+location across checks, keeping the higher-layer finding. This prevents duplicate noise in the report.

**Source:** Peer review Issue 5.

## 16. Check Execution Order

Layer 1 checks run first. All Layer 1 checks complete before any Layer 2 check starts. This is a hard requirement because:
1. Resource Drain (Layer 1) identifies secret locations needed for Layer 2 evidence redaction.
2. Layer 1 results inform Layer 2 evidence gathering.

Within Layer 1, execution order is not significant. Layer 2 checks run sequentially (Decision 6 in XRD -- avoid rate limiting).

**Source:** XRD Section 10 (FINDING-2 resolution), XRD Choice 6.
