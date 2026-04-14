import type {
  ParsedTaskFile,
  ProjectContext,
  CheckResult,
  Finding,
  GitCommit,
  DecisionEntry,
  AnalyzedFile,
  AuditReport,
  ParseError,
  AcceptanceCriterion,
  TestEntry,
} from '../../src/types/index.js';

export function createTaskFile(overrides: Partial<ParsedTaskFile> = {}): ParsedTaskFile {
  return {
    filePath: 'tasks/001-test.md',
    variant: 'full',
    taskNumber: 1,
    shortName: 'test',
    track: 'A',
    phase: 'A1',
    status: 'not started',
    dependsOn: [],
    context: { defaults: [], taskSpecific: [] },
    reworkOf: null,
    whatToBuild: 'Test task',
    whatToFix: null,
    files: { create: [], modify: [], doNotTouch: [] },
    contracts: null,
    acceptanceCriteria: [],
    tests: [],
    deployment: null,
    executionPlan: null,
    notes: null,
    completed: null,
    ...overrides,
  };
}

export function createProjectContext(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    projectPath: '/tmp/test-project',
    milestone: null,
    taskFiles: [],
    parseErrors: [],
    gitLog: [],
    decisions: [],
    sourceFiles: new Map(),
    rawFiles: new Map(),
    packageJsonHistory: { initial: null, current: null },
    fileToTaskMapping: new Map(),
    testResultFiles: [],
    ...overrides,
  };
}

export function createCheckResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    name: 'test-check',
    layer: 1,
    status: 'completed',
    severity: 'clean',
    findings: [],
    errorMessage: null,
    ...overrides,
  };
}

export function createFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    file: 'test.ts',
    location: 'line 1',
    description: 'Test finding',
    suggestion: 'Fix it',
    ...overrides,
  };
}

export function createGitCommit(overrides: Partial<GitCommit> = {}): GitCommit {
  return {
    hash: 'abc1234',
    message: '[001] test commit',
    taskId: 1,
    date: '2026-04-13',
    filesChanged: [],
    insertions: 0,
    deletions: 0,
    ...overrides,
  };
}

export function createDecisionEntry(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    number: 1,
    decision: 'Test decision',
    rationale: 'Test rationale',
    date: '2026-04-13',
    tags: [],
    ...overrides,
  };
}

export function createAnalyzedFile(overrides: Partial<AnalyzedFile> = {}): AnalyzedFile {
  return {
    filePath: 'src/test.ts',
    language: 'typescript',
    imports: [],
    exports: [],
    functions: [],
    classes: [],
    interfaces: [],
    testFunctions: [],
    identifiers: [],
    lineCount: 0,
    ...overrides,
  };
}
