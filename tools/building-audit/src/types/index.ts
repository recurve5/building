// Shared type definitions for building-audit
// All interfaces from DAY-ZERO.md Sections 1-12

// Section 1: ParsedTaskFile

export interface ParsedTaskFile {
  filePath: string;
  variant: 'full' | 'fix';
  taskNumber: number;
  shortName: string;
  track: string | null;
  phase: string | null;
  status: 'not started' | 'in progress' | 'done' | 'blocked';
  dependsOn: number[];
  context: {
    defaults: string[];
    taskSpecific: string[];
  };
  reworkOf: string | null;

  whatToBuild: string | null;
  whatToFix: string | null;

  files: {
    create: string[];
    modify: string[];
    doNotTouch: string[];
  };

  contracts: string | null;
  acceptanceCriteria: AcceptanceCriterion[];
  tests: TestEntry[];
  deployment: string | null;
  executionPlan: string | null;
  notes: string | null;

  completed: CompletedSection | null;
}

export interface AcceptanceCriterion {
  number: number;
  text: string;
}

export interface TestEntry {
  testId: string;
  description: string;
  checked: boolean;
}

export interface CompletedSection {
  date: string | null;
  deviations: string | null;
  insightImplication: string | null;
  decisions: string | null;
}

// Section 2: ProjectContext

export interface ProjectContext {
  projectPath: string;
  milestone: string | null;
  taskFiles: ParsedTaskFile[];
  parseErrors: ParseError[];
  gitLog: GitCommit[];
  decisions: DecisionEntry[];
  sourceFiles: Map<string, AnalyzedFile>;
  rawFiles: Map<string, string>;
  packageJsonHistory: { initial: string | null; current: string | null };
  fileToTaskMapping: Map<string, number[]>;
  testResultFiles: TestResultFile[];
}

// Section 3: Check Interface

export interface Check {
  name: string;
  layer: 1 | 2;
  run(context: ProjectContext, llmClient?: LLMClient): Promise<CheckResult>;
  /**
   * Layer 2 only. Emit the candidate set this check would have sent to the LLM,
   * without calling the LLM. Used by `--dump-candidates` so external drivers
   * (e.g. Claude Code skills) can apply judgment without API spend.
   */
  dumpCandidates?(context: ProjectContext): CandidateDump;
}

export interface CandidateDump {
  /** Check name, for sanity-checking the file. */
  check: string;
  /** Candidate count. Zero is valid (means "no judgment work to do"). */
  count: number;
  /** Per-check candidate shape. Each check defines its own structure. */
  candidates: unknown[];
  /** Optional context the judge needs (e.g. metrics for refactoring-signals). */
  context?: Record<string, unknown>;
}

// Section 4: AnalyzedFile

export interface AnalyzedFile {
  filePath: string;
  language: string;
  imports: ImportDeclaration[];
  exports: ExportDeclaration[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  interfaces: InterfaceInfo[];
  testFunctions: TestFunctionInfo[];
  identifiers: string[];
  lineCount: number;
}

export interface ImportDeclaration {
  source: string;
  specifiers: string[];
  line: number;
}

export interface ExportDeclaration {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'variable' | 'type' | 'default';
  line: number;
}

export interface FunctionInfo {
  name: string;
  params: ParameterInfo[];
  returnType: string | null;
  startLine: number;
  endLine: number;
  isAsync: boolean;
  isGenerator: boolean;
}

export interface ParameterInfo {
  name: string;
  type: string | null;
}

export interface ClassInfo {
  name: string;
  implements: string[];
  extends: string | null;
  methods: FunctionInfo[];
  startLine: number;
  endLine: number;
}

export interface InterfaceInfo {
  name: string;
  extends: string[];
  methods: { name: string; params: ParameterInfo[]; returnType: string | null }[];
  startLine: number;
  endLine: number;
}

export interface TestFunctionInfo {
  name: string;
  startLine: number;
  endLine: number;
  assertions: AssertionInfo[];
}

export interface AssertionInfo {
  method: string;
  strength: 'strong' | 'weak' | 'absent';
  line: number;
}

// Section 5: CheckResult and Finding

export interface CheckResult {
  name: string;
  layer: 1 | 2;
  status: 'completed' | 'skipped' | 'error';
  severity: 'critical' | 'warning' | 'info' | 'clean';
  findings: Finding[];
  errorMessage: string | null;
  tokenUsage?: { input: number; output: number };
}

export interface Finding {
  file: string;
  location: string;
  description: string;
  suggestion: string;
  evidence?: Record<string, unknown>;
}

// Section 6: AuditReport

export interface AuditReport {
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

export interface ParseError {
  file: string;
  reason: string;
}

export interface TopFinding {
  check: string;
  file: string;
  description: string;
  correlations?: string[];
}

// Section 7: LLMClient

export interface LLMClient {
  query(prompt: string, maxInputTokens?: number): Promise<LLMResponse>;
}

export interface LLMResponse {
  content: string;
  usage: { input: number; output: number };
}

// Section 8: GitCommit

export interface GitCommit {
  hash: string;
  message: string;
  taskId: number | null;
  date: string;
  filesChanged: string[];
  insertions: number;
  deletions: number;
}

// Section 9: DecisionEntry

export interface DecisionEntry {
  number: number;
  decision: string;
  rationale: string;
  date: string;
  tags: ('HARD KILL' | 'DEFERRED')[];
}

// Section 10: TestResultFile

export interface TestResultFile {
  filePath: string;
  format: 'junit-xml' | 'vitest-json';
  suites: TestSuiteResult[];
}

export interface TestSuiteResult {
  name: string;
  tests: TestCaseResult[];
}

export interface TestCaseResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number | null;
  errorMessage: string | null;
}

// Section 11: LanguageAnalyzer

export interface LanguageAnalyzer {
  language: string;
  extensions: string[];
  parseFile(filePath: string, content: string): AnalyzedFile;
}

// Section 12: SecretLocation

export interface SecretLocation {
  filePath: string;
  line: number;
  endLine: number;
  patternType: string;
  maskedValue: string;
}
