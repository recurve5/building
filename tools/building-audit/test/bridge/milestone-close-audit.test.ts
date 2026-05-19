import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectContext, CandidateDump, Check } from '../../src/types/index.js';
import { buildMockContext } from './fixtures/fixture-factory.js';
import { classifyFinding } from '../../src/bridge/policy.js';

// ---------------------------------------------------------------------------
// Mocks — mock scanProject and getChecks so unit tests don't need real
// filesystem projects or the full check registry.
// ---------------------------------------------------------------------------

const mockScanProject = vi.fn<
  (projectPath: string, milestone?: string) => Promise<ProjectContext>
>();
const mockGetChecks = vi.fn<(layer?: 1 | 2) => Check[]>();

vi.mock('../../src/scanner/project-scanner.js', () => ({
  scanProject: (...args: any[]) => mockScanProject(...args),
}));

vi.mock('../../src/checks/registry.js', () => ({
  getChecks: (...args: any[]) => mockGetChecks(...args),
  registerCheck: vi.fn(),
  clearRegistry: vi.fn(),
}));

// Mock register-checks to avoid importing actual check modules
vi.mock('../../src/bridge/register-checks.js', () => ({}));

// Import after mocks
const { runMilestoneCloseAudit } = await import(
  '../../src/bridge/milestone-close-audit.js'
);

// ---------------------------------------------------------------------------
// Layer 2 check names (all 7)
// ---------------------------------------------------------------------------

const LAYER2_CHECK_NAMES = [
  'ghost-refactor',
  'clean-slate-bias',
  'deep-heresy',
  'document-heresy',
  'performance-critical',
  'react-fluidity',
  'refactoring-signals',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock Layer 2 check with a working dumpCandidates. */
function makeMockCheck(
  name: string,
  candidates: unknown[] = [],
  context?: Record<string, unknown>,
): Check {
  return {
    name,
    layer: 2,
    async run() {
      return {
        name,
        layer: 2 as const,
        status: 'skipped' as const,
        severity: 'clean' as const,
        findings: [],
        errorMessage: null,
      };
    },
    dumpCandidates(_ctx: ProjectContext): CandidateDump {
      return { check: name, count: candidates.length, candidates, context };
    },
  };
}

/** Build a mock check whose dumpCandidates throws. */
function makeThrowingCheck(name: string, errorMessage: string): Check {
  return {
    name,
    layer: 2,
    async run() {
      return {
        name,
        layer: 2 as const,
        status: 'skipped' as const,
        severity: 'clean' as const,
        findings: [],
        errorMessage: null,
      };
    },
    dumpCandidates(_ctx: ProjectContext): CandidateDump {
      throw new Error(errorMessage);
    },
  };
}

/** Build a mock check without dumpCandidates (missing optional method). */
function makeCheckWithoutDump(name: string): Check {
  return {
    name,
    layer: 2,
    async run() {
      return {
        name,
        layer: 2 as const,
        status: 'skipped' as const,
        severity: 'clean' as const,
        findings: [],
        errorMessage: null,
      };
    },
    // No dumpCandidates — tests the "optional method" path
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockScanProject.mockResolvedValue(
    buildMockContext({ projectPath: '/tmp/mock-project' }),
  );
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runMilestoneCloseAudit', () => {
  // L2-001: runMilestoneCloseAudit returns candidate map for all Layer 2 checks
  it('L2-001: returns candidate map for all Layer 2 checks', async () => {
    const checks = LAYER2_CHECK_NAMES.map((name) =>
      makeMockCheck(name, [{ file: 'src/a.ts' }]),
    );
    mockGetChecks.mockReturnValue(checks);

    const { candidates, errors } = await runMilestoneCloseAudit(
      '/tmp/mock-project',
      'm1-test',
    );

    // All 7 check names should be present as keys
    expect(candidates.size).toBe(7);
    for (const name of LAYER2_CHECK_NAMES) {
      expect(candidates.has(name)).toBe(true);
    }
    expect(errors.size).toBe(0);
  });

  // L2-002: All 7 Layer 2 checks implement dumpCandidates
  // This test imports the real checks (not mocks) to verify the assumption.
  it('L2-002: all 7 Layer 2 checks implement dumpCandidates', async () => {
    // Import real checks by side-effect, then get them from the real registry.
    // We use dynamic imports to avoid the mocked registry.
    const realChecks: Check[] = [];

    // Import each check module and extract the registered check object
    const ghostRefactor = await import(
      '../../src/checks/layer2/ghost-refactor.js'
    );
    realChecks.push(ghostRefactor.ghostRefactorCheck);

    const cleanSlateBias = await import(
      '../../src/checks/layer2/clean-slate-bias.js'
    );
    realChecks.push(cleanSlateBias.cleanSlateBias);

    const deepHeresy = await import('../../src/checks/layer2/deep-heresy.js');
    realChecks.push(deepHeresy.deepHeresy);

    const documentHeresy = await import(
      '../../src/checks/layer2/document-heresy.js'
    );
    realChecks.push(documentHeresy.documentHeresy);

    const performanceCritical = await import(
      '../../src/checks/layer2/performance-critical.js'
    );
    realChecks.push(performanceCritical.performanceCriticalCheck);

    const reactFluidity = await import(
      '../../src/checks/layer2/react-fluidity.js'
    );
    realChecks.push(reactFluidity.reactFluidityCheck);

    const refactoringSignals = await import(
      '../../src/checks/layer2/refactoring-signals.js'
    );
    realChecks.push(refactoringSignals.refactoringSignals);

    expect(realChecks).toHaveLength(7);
    for (const check of realChecks) {
      expect(typeof check.dumpCandidates).toBe('function');
    }
  });

  // L2-003: dumpCandidates returns valid CandidateDump structure for each check
  it('L2-003: dumpCandidates returns valid CandidateDump structure', async () => {
    const checks = LAYER2_CHECK_NAMES.map((name) =>
      makeMockCheck(name, [{ file: 'src/a.ts', reason: 'test' }]),
    );
    mockGetChecks.mockReturnValue(checks);

    const { candidates } = await runMilestoneCloseAudit(
      '/tmp/mock-project',
      'm1-test',
    );

    for (const [name, dump] of candidates) {
      // Valid CandidateDump: has check, count, candidates fields
      expect(dump).toHaveProperty('check');
      expect(dump).toHaveProperty('count');
      expect(dump).toHaveProperty('candidates');
      expect(dump.check).toBe(name);
      expect(typeof dump.count).toBe('number');
      expect(Array.isArray(dump.candidates)).toBe(true);
      expect(dump.count).toBe(dump.candidates.length);
    }
  });

  // L2-004: Checks with zero candidates return count 0 and empty array
  it('L2-004: zero candidates returns count 0 and empty array', async () => {
    const checks = LAYER2_CHECK_NAMES.map((name) =>
      makeMockCheck(name, []), // empty candidates
    );
    mockGetChecks.mockReturnValue(checks);

    const { candidates } = await runMilestoneCloseAudit(
      '/tmp/mock-project',
      'm1-test',
    );

    for (const [_name, dump] of candidates) {
      expect(dump.count).toBe(0);
      expect(dump.candidates).toEqual([]);
    }
  });

  // L2-007: Check that errors during dumpCandidates is reported, not thrown
  it('L2-007: dumpCandidates error is reported in errors map, not thrown', async () => {
    const okCheck = makeMockCheck('ghost-refactor', [{ file: 'src/a.ts' }]);
    const throwingCheck = makeThrowingCheck(
      'deep-heresy',
      'Simulated dumpCandidates failure',
    );
    const anotherOkCheck = makeMockCheck('clean-slate-bias', []);

    mockGetChecks.mockReturnValue([okCheck, throwingCheck, anotherOkCheck]);

    const { candidates, errors } = await runMilestoneCloseAudit(
      '/tmp/mock-project',
      'm1-test',
    );

    // The throwing check should be in errors, not candidates
    expect(errors.has('deep-heresy')).toBe(true);
    expect(errors.get('deep-heresy')).toBe(
      'Simulated dumpCandidates failure',
    );

    // Other checks should still succeed
    expect(candidates.has('ghost-refactor')).toBe(true);
    expect(candidates.has('clean-slate-bias')).toBe(true);
    expect(candidates.size).toBe(2);
  });

  // Additional coverage: check without dumpCandidates method records error
  it('L2-007b: check without dumpCandidates method records error, does not crash', async () => {
    const okCheck = makeMockCheck('ghost-refactor', [{ file: 'src/a.ts' }]);
    const noDumpCheck = makeCheckWithoutDump('deep-heresy');

    mockGetChecks.mockReturnValue([okCheck, noDumpCheck]);

    const { candidates, errors } = await runMilestoneCloseAudit(
      '/tmp/mock-project',
      'm1-test',
    );

    expect(errors.has('deep-heresy')).toBe(true);
    expect(errors.get('deep-heresy')).toContain('does not implement dumpCandidates');
    expect(candidates.has('ghost-refactor')).toBe(true);
  });

  // L2-008: All Layer 2 findings at milestone-close are Tier 3
  it('L2-008: all Layer 2 check names classify as Tier 3 at milestone-close', () => {
    for (const checkName of LAYER2_CHECK_NAMES) {
      const { tier, action } = classifyFinding(
        checkName,
        'warning',
        0,
        'milestone-close',
      );
      expect(tier).toBe(3);
      expect(action).toBe('escalate');
    }
  });
});
