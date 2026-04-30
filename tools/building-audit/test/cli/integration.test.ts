import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ProjectContext, AuditReport, CheckResult, SecretLocation, ParseError } from '../../src/types/index.js';

// --- Mocks ---

const mockScanProject = vi.fn();
const mockRunChecks = vi.fn();
const mockBuildReport = vi.fn();
const mockFormatTerminalOutput = vi.fn();
const mockWriteFileSync = vi.fn();

let mockAnthropicConstructorThrows = false;
const mockSetSecretLocations = vi.fn();

vi.mock('../../src/scanner/project-scanner.js', () => ({
  scanProject: (...args: unknown[]) => mockScanProject(...args),
}));

vi.mock('../../src/checks/registry.js', () => ({
  runChecks: (...args: unknown[]) => mockRunChecks(...args),
}));

vi.mock('../../src/report/json-builder.js', () => ({
  buildReport: (...args: unknown[]) => mockBuildReport(...args),
}));

vi.mock('../../src/report/terminal-formatter.js', () => ({
  formatTerminalOutput: (...args: unknown[]) => mockFormatTerminalOutput(...args),
}));

vi.mock('../../src/llm/client.js', () => ({
  AnthropicLLMClient: class {
    setSecretLocations = mockSetSecretLocations;
    constructor() {
      if (mockAnthropicConstructorThrows) {
        throw new Error('ANTHROPIC_API_KEY environment variable is required');
      }
    }
    async query() {
      return { content: '', usage: { input: 0, output: 0 } };
    }
  },
}));

// Mock all check registration imports (they are side-effect-only)
vi.mock('../../src/checks/layer1/test-cheat.js', () => ({}));
vi.mock('../../src/checks/layer1/scope-creep.js', () => ({}));
vi.mock('../../src/checks/layer1/dependency-grab.js', () => ({}));
vi.mock('../../src/checks/layer1/premature-abstraction.js', () => ({}));
vi.mock('../../src/checks/layer1/surface-heresy.js', () => ({}));
vi.mock('../../src/checks/layer1/confidence-bluff.js', () => ({}));
vi.mock('../../src/checks/layer1/fragility-metrics.js', () => ({}));
vi.mock('../../src/checks/layer1/resource-drain.js', () => ({}));
vi.mock('../../src/checks/layer1/unoptimized-defaults.js', () => ({}));
vi.mock('../../src/checks/layer2/ghost-refactor.js', () => ({}));
vi.mock('../../src/checks/layer2/clean-slate-bias.js', () => ({}));
vi.mock('../../src/checks/layer2/deep-heresy.js', () => ({}));
vi.mock('../../src/checks/layer2/document-heresy.js', () => ({}));
vi.mock('../../src/checks/layer2/performance-critical.js', () => ({}));
vi.mock('../../src/checks/layer2/react-fluidity.js', () => ({}));
vi.mock('../../src/checks/layer2/refactoring-signals.js', () => ({}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: {
      ...actual,
      writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    },
  };
});

// --- Helpers ---

function minimalProjectContext(): ProjectContext {
  return {
    projectPath: '/fake/project',
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
  };
}

function minimalReport(criticalCount = 0): AuditReport {
  return {
    version: '1.0.0',
    timestamp: '2026-04-13T00:00:00Z',
    project: '/fake/project',
    mode: 'mechanical',
    milestone: null,
    checks: [],
    parseErrors: [],
    summary: {
      critical: criticalCount,
      warning: 0,
      info: 0,
      clean: 0,
      skipped: 0,
      refactoringAssessment: null,
      top3: [],
    },
  };
}

let exitSpy: any;
let stderrSpy: any;
let consoleLogSpy: any;

beforeEach(() => {
  vi.resetAllMocks();
  mockAnthropicConstructorThrows = false;

  mockScanProject.mockResolvedValue(minimalProjectContext());
  mockRunChecks.mockResolvedValue({ results: [], secretLocations: [] });
  mockBuildReport.mockReturnValue(minimalReport(0));
  mockFormatTerminalOutput.mockReturnValue('terminal output');

  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`EXIT_${code ?? 0}`);
  }) as never);

  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as never);
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  exitSpy.mockRestore();
  stderrSpy.mockRestore();
  consoleLogSpy.mockRestore();
});

async function runCli(args: string[]): Promise<{ exitCode: number | null; error?: Error }> {
  // Dynamic import to get the module with mocks applied
  const { createProgram } = await import('../../src/cli/index.js');
  const program = createProgram();
  program.exitOverride();

  try {
    await program.parseAsync(['node', 'building-audit', ...args]);
    return { exitCode: null };
  } catch (e) {
    const err = e as Error;
    const match = err.message.match(/^EXIT_(\d+)$/);
    if (match) {
      return { exitCode: parseInt(match[1], 10) };
    }
    return { exitCode: null, error: err };
  }
}

// --- Tests ---

describe('CLI Integration', () => {
  // CLI-001: --mechanical runs pipeline with mode='mechanical', no LLM client
  it('CLI-001: --mechanical runs pipeline with mechanical mode and no LLM client', async () => {
    const result = await runCli(['--mechanical']);

    expect(mockScanProject).toHaveBeenCalledOnce();
    expect(mockRunChecks).toHaveBeenCalledWith(
      expect.anything(),
      'mechanical',
      undefined,
    );
    expect(result.exitCode).toBe(0);
  });

  // CLI-002: --full with ANTHROPIC_API_KEY runs with LLM client
  it('CLI-002: --full with API key creates LLM client', async () => {
    mockAnthropicConstructorThrows = false;

    const result = await runCli(['--full']);

    expect(mockRunChecks).toHaveBeenCalledWith(
      expect.anything(),
      'full',
      expect.objectContaining({ setSecretLocations: expect.any(Function) }),
    );
    expect(result.exitCode).toBe(0);
  });

  // CLI-005: --full without ANTHROPIC_API_KEY -- pipeline runs, Layer 2 skipped
  it('CLI-005: --full without API key logs warning and proceeds without LLM', async () => {
    mockAnthropicConstructorThrows = true;

    const result = await runCli(['--full']);

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('ANTHROPIC_API_KEY'),
    );
    expect(mockRunChecks).toHaveBeenCalledWith(
      expect.anything(),
      'full',
      undefined,
    );
    expect(result.exitCode).toBe(0);
  });

  // CLI-006: --output sets report file path
  it('CLI-006: --output sets the report file path', async () => {
    const result = await runCli(['--mechanical', '--output', 'custom-report.json']);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      'custom-report.json',
      expect.any(String),
    );
    expect(result.exitCode).toBe(0);
  });

  // CLI-007: Default output path is building-audit-report.json
  it('CLI-007: default output path is building-audit-report.json', async () => {
    const result = await runCli(['--mechanical']);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      'building-audit-report.json',
      expect.any(String),
    );
    expect(result.exitCode).toBe(0);
  });

  // CLI-011: --verbose passed to formatTerminalOutput
  it('CLI-011: --verbose is passed to formatTerminalOutput', async () => {
    await runCli(['--mechanical', '--verbose']);

    expect(mockFormatTerminalOutput).toHaveBeenCalledWith(
      expect.anything(),
      true,
    );
  });

  // CLI-012: Exit code 0 when no critical findings
  it('CLI-012: exit code 0 when no critical findings', async () => {
    mockBuildReport.mockReturnValue(minimalReport(0));

    const result = await runCli(['--mechanical']);

    expect(result.exitCode).toBe(0);
  });

  // CLI-013: Exit code 1 when critical findings present
  it('CLI-013: exit code 1 when critical findings present', async () => {
    mockBuildReport.mockReturnValue(minimalReport(3));

    const result = await runCli(['--mechanical']);

    expect(result.exitCode).toBe(1);
  });

  // CLI-014: Exit code 2 on scanner error
  it('CLI-014: exit code 2 on scanner error', async () => {
    mockScanProject.mockRejectedValue(new Error('Scanner failed: not a git repo'));

    const result = await runCli(['--mechanical']);

    expect(result.exitCode).toBe(2);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Scanner failed'),
    );
  });
});
