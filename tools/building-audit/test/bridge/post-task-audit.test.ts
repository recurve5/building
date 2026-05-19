import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ProjectContext, CheckResult, SecretLocation, AuditReport } from '../../src/types/index.js';
import { buildMockContext } from './fixtures/fixture-factory.js';

// ---------------------------------------------------------------------------
// Mocks — we mock scanProject and runChecks so unit tests don't need real
// filesystem projects or check implementations.
// ---------------------------------------------------------------------------

const mockScanProject = vi.fn<
  (projectPath: string, milestone?: string) => Promise<ProjectContext>
>();
const mockRunChecks = vi.fn<
  (context: ProjectContext, mode: 'mechanical' | 'full') => Promise<{ results: CheckResult[]; secretLocations: SecretLocation[] }>
>();
const mockBuildReport = vi.fn<
  (...args: any[]) => AuditReport
>();

vi.mock('../../src/scanner/project-scanner.js', () => ({
  scanProject: (...args: any[]) => mockScanProject(...args),
}));

vi.mock('../../src/checks/registry.js', () => ({
  runChecks: (...args: any[]) => mockRunChecks(...args),
  registerCheck: vi.fn(),
  getChecks: vi.fn(() => []),
  clearRegistry: vi.fn(),
}));

vi.mock('../../src/report/json-builder.js', () => ({
  buildReport: (...args: any[]) => mockBuildReport(...args),
}));

// Mock register-checks to avoid importing actual check modules
vi.mock('../../src/bridge/register-checks.js', () => ({}));

// Import after mocks
const { runPostTaskAudit } = await import('../../src/bridge/post-task-audit.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCheckResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    name: overrides.name ?? 'test-cheat',
    layer: overrides.layer ?? 1,
    status: overrides.status ?? 'completed',
    severity: overrides.severity ?? 'warning',
    findings: overrides.findings ?? [],
    errorMessage: overrides.errorMessage ?? null,
    ...overrides,
  };
}

function makeReport(checks: CheckResult[]): AuditReport {
  return {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    project: '/tmp/test',
    mode: 'mechanical',
    milestone: 'm1-test',
    checks,
    parseErrors: [],
    summary: {
      critical: 0,
      warning: 0,
      info: 0,
      clean: 0,
      skipped: 0,
      refactoringAssessment: null,
      top3: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'post-task-audit-test-'));
  // Create milestone dir so the audit directory can be created inside it
  mkdirSync(join(tempDir, 'm1-test'), { recursive: true });

  vi.clearAllMocks();

  // Default mock implementations
  mockScanProject.mockResolvedValue(buildMockContext({ projectPath: tempDir }));
  mockRunChecks.mockResolvedValue({ results: [], secretLocations: [] });
  mockBuildReport.mockImplementation((..._args: any[]) => makeReport([]));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runPostTaskAudit', () => {
  // L1-001: runPostTaskAudit returns classified findings for a project with issues
  it('L1-001: returns classified findings for a project with issues', async () => {
    const finding = {
      file: 'src/foo.ts',
      location: 'line 10',
      description: 'Weak assertion',
      suggestion: 'Use toEqual instead of toBeTruthy',
    };
    const result = makeCheckResult({
      name: 'test-cheat',
      layer: 1,
      severity: 'warning',
      findings: [finding],
    });

    mockRunChecks.mockResolvedValue({ results: [result], secretLocations: [] });
    mockBuildReport.mockReturnValue(makeReport([result]));

    const output = await runPostTaskAudit(tempDir, 'm1-test', 1, null);

    expect(output.classified).toHaveLength(1);
    expect(output.classified[0].checkName).toBe('test-cheat');
    expect(output.classified[0].finding).toEqual(finding);
    expect(output.classified[0].tier).toBe(2);
    expect(output.classified[0].action).toBe('generate-task');
  });

  // L1-002: runPostTaskAudit destructures RunChecksResult correctly
  it('L1-002: destructures RunChecksResult correctly', async () => {
    const secrets: SecretLocation[] = [
      {
        filePath: 'src/config.ts',
        line: 5,
        endLine: 5,
        patternType: 'api-key',
        maskedValue: 'sk-***',
      },
    ];
    const result = makeCheckResult({ name: 'resource-drain', layer: 1, severity: 'warning' });

    mockRunChecks.mockResolvedValue({ results: [result], secretLocations: secrets });
    mockBuildReport.mockReturnValue(makeReport([result]));

    const output = await runPostTaskAudit(tempDir, 'm1-test', 1, null);

    expect(output.secretLocations).toEqual(secrets);
    expect(output.report).toBeDefined();
  });

  // L1-003: runPostTaskAudit persists report to correct path
  it('L1-003: persists report to correct path', async () => {
    const report = makeReport([]);
    mockBuildReport.mockReturnValue(report);

    await runPostTaskAudit(tempDir, 'm1-test', 42, null);

    const reportPath = join(tempDir, 'm1-test', 'audit', 'task-42-layer1.json');
    expect(existsSync(reportPath)).toBe(true);

    const persisted = JSON.parse(readFileSync(reportPath, 'utf-8'));
    expect(persisted.version).toBe('1.0.0');
    expect(persisted.mode).toBe('mechanical');
  });

  // L1-004: runPostTaskAudit creates audit/ directory if it does not exist
  it('L1-004: creates audit/ directory if it does not exist', async () => {
    mockBuildReport.mockReturnValue(makeReport([]));

    const auditDir = join(tempDir, 'm1-test', 'audit');
    expect(existsSync(auditDir)).toBe(false);

    await runPostTaskAudit(tempDir, 'm1-test', 1, null);

    expect(existsSync(auditDir)).toBe(true);
  });

  // L1-005: Clean project produces no findings
  it('L1-005: clean project produces no findings', async () => {
    const cleanResults = [
      makeCheckResult({ name: 'test-cheat', severity: 'clean', findings: [] }),
      makeCheckResult({ name: 'scope-creep', severity: 'clean', findings: [] }),
    ];

    mockRunChecks.mockResolvedValue({ results: cleanResults, secretLocations: [] });
    mockBuildReport.mockReturnValue(makeReport(cleanResults));

    const output = await runPostTaskAudit(tempDir, 'm1-test', 1, null);

    expect(output.classified).toHaveLength(0);
  });

  // L1-006: Errored check does not block, is reported in results
  it('L1-006: errored check does not block, is reported in results', async () => {
    const errorResult = makeCheckResult({
      name: 'fragility-metrics',
      layer: 1,
      status: 'error',
      severity: 'clean',
      errorMessage: 'Something went wrong',
    });
    const okResult = makeCheckResult({
      name: 'test-cheat',
      layer: 1,
      severity: 'warning',
      findings: [
        {
          file: 'src/a.ts',
          location: 'line 1',
          description: 'issue',
          suggestion: 'fix it',
        },
      ],
    });

    mockRunChecks.mockResolvedValue({
      results: [errorResult, okResult],
      secretLocations: [],
    });
    mockBuildReport.mockReturnValue(makeReport([errorResult, okResult]));

    const output = await runPostTaskAudit(tempDir, 'm1-test', 1, null);

    // The errored check should not appear in classified (status != completed)
    // but the function should not throw
    expect(output.classified).toHaveLength(1);
    expect(output.classified[0].checkName).toBe('test-cheat');
    // The report should contain both results
    expect(output.report.checks).toHaveLength(2);
  });

  // L1-007: Post-task audit includes clean-slate-bias mechanical result
  it('L1-007: includes clean-slate-bias mechanical result', async () => {
    const csbFinding = {
      file: 'src/helper.ts',
      location: 'line 1',
      description: 'Name collision with existing helper',
      suggestion: 'Rename to avoid collision',
    };
    const csbResult = makeCheckResult({
      name: 'clean-slate-bias',
      layer: 2,
      severity: 'info',
      findings: [csbFinding],
    });
    const l1Result = makeCheckResult({
      name: 'test-cheat',
      layer: 1,
      severity: 'clean',
      findings: [],
    });
    // Skipped L2 check that should be filtered out
    const skippedL2 = makeCheckResult({
      name: 'ghost-refactor',
      layer: 2,
      status: 'skipped',
      severity: 'clean',
    });

    mockRunChecks.mockResolvedValue({
      results: [l1Result, csbResult, skippedL2],
      secretLocations: [],
    });
    mockBuildReport.mockReturnValue(makeReport([l1Result, csbResult, skippedL2]));

    const output = await runPostTaskAudit(tempDir, 'm1-test', 1, null);

    // clean-slate-bias with info severity should be classified
    expect(output.classified).toHaveLength(1);
    expect(output.classified[0].checkName).toBe('clean-slate-bias');
    // Decision 14: clean-slate-bias per-task is Tier 2
    expect(output.classified[0].tier).toBe(2);
    expect(output.classified[0].action).toBe('generate-task');
  });

  // L1-008: Tier 3 finding produces blocked action
  it('L1-008: Tier 3 finding produces blocked action', async () => {
    const finding = {
      file: 'src/metrics.ts',
      location: 'module',
      description: 'Fragility score exceeds threshold',
      suggestion: 'Refactor',
    };
    const result = makeCheckResult({
      name: 'fragility-metrics',
      layer: 1,
      severity: 'warning',
      findings: [finding],
    });

    mockRunChecks.mockResolvedValue({ results: [result], secretLocations: [] });
    mockBuildReport.mockReturnValue(makeReport([result]));

    const output = await runPostTaskAudit(tempDir, 'm1-test', 1, null);

    expect(output.classified).toHaveLength(1);
    expect(output.classified[0].tier).toBe(3);
    expect(output.classified[0].action).toBe('escalate');
  });

  // L1-009: Tier 1/2 finding produces remediation task file (stub)
  it('L1-009: Tier 1/2 finding produces generate-task action (stub for INT-002)', async () => {
    const finding = {
      file: 'src/foo.ts',
      location: 'line 5',
      description: 'Out-of-scope file modified',
      suggestion: 'Revert changes',
    };
    const result = makeCheckResult({
      name: 'scope-creep',
      layer: 1,
      severity: 'warning',
      findings: [finding],
    });

    mockRunChecks.mockResolvedValue({ results: [result], secretLocations: [] });
    mockBuildReport.mockReturnValue(makeReport([result]));

    const output = await runPostTaskAudit(tempDir, 'm1-test', 1, null);

    expect(output.classified).toHaveLength(1);
    expect(output.classified[0].action).toBe('generate-task');
    expect(output.classified[0].tier).toBe(2);
    // Full remediation task file generation tested in Task 003 / INT-002
  });

  // L1-010: Post-task audit on empty milestone directory
  it('L1-010: handles empty milestone directory', async () => {
    const emptyContext = buildMockContext({ projectPath: tempDir, taskFiles: [] });
    mockScanProject.mockResolvedValue(emptyContext);
    mockRunChecks.mockResolvedValue({ results: [], secretLocations: [] });
    mockBuildReport.mockReturnValue(makeReport([]));

    const output = await runPostTaskAudit(tempDir, 'm1-test', 1, null);

    expect(output.classified).toHaveLength(0);
    expect(output.report).toBeDefined();
    expect(output.secretLocations).toEqual([]);
  });

  // L1-011: Post-task audit when task file references nonexistent source files
  it('L1-011: handles task referencing nonexistent source files', async () => {
    // The scanner will handle missing files gracefully.
    // The checks should still run and produce results.
    const finding = {
      file: 'src/nonexistent.ts',
      location: 'line 1',
      description: 'Referenced file not found in source tree',
      suggestion: 'Verify file paths',
    };
    const result = makeCheckResult({
      name: 'scope-creep',
      layer: 1,
      severity: 'info',
      findings: [finding],
    });

    mockRunChecks.mockResolvedValue({ results: [result], secretLocations: [] });
    mockBuildReport.mockReturnValue(makeReport([result]));

    const output = await runPostTaskAudit(tempDir, 'm1-test', 1, null);

    // info severity on scope-creep is still classified (non-clean)
    expect(output.classified).toHaveLength(1);
    expect(output.classified[0].finding.file).toBe('src/nonexistent.ts');
  });

  // Decision 20 verification: skipped L2 checks are excluded
  it('Decision 20: skipped L2 checks are excluded from classified output', async () => {
    const skippedResults: CheckResult[] = [
      makeCheckResult({ name: 'ghost-refactor', layer: 2, status: 'skipped', severity: 'clean' }),
      makeCheckResult({ name: 'deep-heresy', layer: 2, status: 'skipped', severity: 'clean' }),
      makeCheckResult({ name: 'document-heresy', layer: 2, status: 'skipped', severity: 'clean' }),
      makeCheckResult({ name: 'performance-critical', layer: 2, status: 'skipped', severity: 'clean' }),
      makeCheckResult({ name: 'react-fluidity', layer: 2, status: 'skipped', severity: 'clean' }),
      makeCheckResult({ name: 'refactoring-signals', layer: 2, status: 'skipped', severity: 'clean' }),
    ];

    mockRunChecks.mockResolvedValue({ results: skippedResults, secretLocations: [] });
    mockBuildReport.mockReturnValue(makeReport(skippedResults));

    const output = await runPostTaskAudit(tempDir, 'm1-test', 1, null);

    // All skipped L2 checks should be filtered out
    expect(output.classified).toHaveLength(0);
  });

  // BF-001: reworkOf triggers depth-based escalation
  it('BF-001: reworkOf non-null escalates remediation task findings to tier 3', async () => {
    const finding = { file: 'src/redo.ts', location: 'line 1', description: 'Issue', suggestion: 'Fix' };
    const result = makeCheckResult({
      name: 'test-cheat',
      layer: 1,
      severity: 'warning',
      findings: [finding],
    });

    mockRunChecks.mockResolvedValue({ results: [result], secretLocations: [] });
    mockBuildReport.mockReturnValue(makeReport([result]));

    const output = await runPostTaskAudit(tempDir, 'm1-test', 1, 'task-003');

    expect(output.classified).toHaveLength(1);
    expect(output.classified[0].tier).toBe(3);
    expect(output.classified[0].action).toBe('escalate');
  });

  // BF-002: reworkOf null keeps normal policy
  it('BF-002: reworkOf null follows normal tier 2 policy', async () => {
    const finding = { file: 'src/normal.ts', location: 'line 1', description: 'Issue', suggestion: 'Fix' };
    const result = makeCheckResult({
      name: 'test-cheat',
      layer: 1,
      severity: 'warning',
      findings: [finding],
    });

    mockRunChecks.mockResolvedValue({ results: [result], secretLocations: [] });
    mockBuildReport.mockReturnValue(makeReport([result]));

    const output = await runPostTaskAudit(tempDir, 'm1-test', 1, null);

    expect(output.classified).toHaveLength(1);
    expect(output.classified[0].tier).toBe(2);
    expect(output.classified[0].action).toBe('generate-task');
  });
});
