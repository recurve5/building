import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ProjectContext, CandidateDump, Check, CheckResult } from '../../src/types/index.js';
import { buildMockContext } from './fixtures/fixture-factory.js';

// ---------------------------------------------------------------------------
// Mocks — same pattern as milestone-close-audit.test.ts
// ---------------------------------------------------------------------------

const mockScanProject = vi.fn<
  (projectPath: string, milestone?: string) => Promise<ProjectContext>
>();
const mockGetChecks = vi.fn<(layer?: 1 | 2) => Check[]>();
const mockRunChecks = vi.fn<
  (context: ProjectContext, mode: 'mechanical' | 'full') => Promise<{
    results: CheckResult[];
    secretLocations: never[];
  }>
>();

vi.mock('../../src/scanner/project-scanner.js', () => ({
  scanProject: (...args: any[]) => mockScanProject(...args),
}));

vi.mock('../../src/checks/registry.js', () => ({
  getChecks: (...args: any[]) => mockGetChecks(...args),
  runChecks: (...args: any[]) => mockRunChecks(...args),
  registerCheck: vi.fn(),
  clearRegistry: vi.fn(),
}));

vi.mock('../../src/bridge/register-checks.js', () => ({}));

// We need to mock buildReport for the post-task audit path in INT tests
vi.mock('../../src/report/json-builder.js', () => ({
  buildReport: (
    results: CheckResult[],
    _parseErrors: unknown[],
    mode: string,
    projectPath: string,
    milestone: string | null,
  ) => ({
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    project: projectPath,
    mode,
    milestone,
    checks: results,
    parseErrors: [],
    summary: {
      critical: 0,
      warning: results.filter((r: CheckResult) => r.severity === 'warning').length,
      info: 0,
      clean: results.filter((r: CheckResult) => r.severity === 'clean').length,
      skipped: results.filter((r: CheckResult) => r.status === 'skipped').length,
      refactoringAssessment: null,
      top3: [],
    },
  }),
  redactSecrets: (text: string) => text,
}));

// Import after mocks
const { prepareMilestoneCloseAudit, finalizeMilestoneCloseAudit } =
  await import('../../src/bridge/milestone-close-flow.js');
const { runPostTaskAudit } = await import(
  '../../src/bridge/post-task-audit.js'
);
const { appendDetection } = await import(
  '../../src/bridge/detection-writer.js'
);
const { classifyFinding } = await import('../../src/bridge/policy.js');
const { generateRemediationTask } = await import(
  '../../src/bridge/remediation-task.js'
);

import type { JudgmentResult } from '../../src/bridge/milestone-close-flow.js';
import type { Detection, DetectionAction } from '../../src/bridge/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a realistic mock candidate for a given check name. */
function mockCandidateFor(checkName: string): unknown {
  switch (checkName) {
    case 'ghost-refactor':
      return {
        commit: { hash: 'abc1234', message: 'refactor utils', insertions: 300, deletions: 200 },
        task: { taskNumber: 1, shortName: 'build-utils', whatToBuild: 'Utility module' },
      };
    case 'clean-slate-bias':
      return {
        name: 'formatDate',
        fileA: 'src/utils.ts',
        fileB: 'src/helpers.ts',
        signatureA: 'formatDate(d: Date): string',
        signatureB: 'formatDate(date: Date): string',
      };
    case 'deep-heresy':
      return {
        decisionNumber: 5,
        decisionText: 'Kill custom ORM',
        rationale: 'Use Prisma instead',
        filePath: 'src/db.ts',
        content: 'class CustomORM {}',
        matchedKeywordCount: 3,
      };
    case 'document-heresy':
      return {
        decisionNumber: 5,
        decisionText: 'Kill custom ORM',
        rationale: 'Use Prisma instead',
        filePath: 'docs/architecture.md',
        content: 'We use our custom ORM for...',
        matchedTermCount: 2,
      };
    case 'performance-critical':
      return {
        entryPoint: 'handleRequest',
        filePath: 'src/server.ts',
        chain: ['handleRequest', 'fetchData', 'queryDB'],
        ioOperations: ['queryDB'],
        depth: 3,
      };
    case 'react-fluidity':
      return {
        file: 'src/App.tsx',
        line: 42,
        pattern: 'setState-in-loop',
        snippet: 'items.forEach(i => setCount(c => c+1))',
        componentContext: 'App',
      };
    case 'refactoring-signals':
      return {
        couplingHotspots: [{ file: 'src/core.ts', taskCount: 4 }],
        averageFunctionLength: 25.3,
        totalFunctions: 80,
        structuralConcerns: [],
      };
    default:
      return { file: 'src/unknown.ts' };
  }
}

function makeMockCheck(
  name: string,
  candidates?: unknown[],
  context?: Record<string, unknown>,
): Check {
  const resolvedCandidates = candidates ?? [mockCandidateFor(name)];
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
      return { check: name, count: resolvedCandidates.length, candidates: resolvedCandidates, context };
    },
  };
}

function makeCheckResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    name: overrides.name ?? 'test-cheat',
    layer: overrides.layer ?? 1,
    status: overrides.status ?? 'completed',
    severity: overrides.severity ?? 'clean',
    findings: overrides.findings ?? [],
    errorMessage: overrides.errorMessage ?? null,
  };
}

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
// Test setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let statePath: string;

beforeEach(() => {
  vi.clearAllMocks();
  tmpDir = mkdtempSync(join(tmpdir(), 'mcf-test-'));
  statePath = join(tmpDir, 'state.json');
  writeFileSync(statePath, JSON.stringify({ version: 2 }, null, 2));

  mockScanProject.mockResolvedValue(
    buildMockContext({ projectPath: tmpDir, milestone: 'm1-test' }),
  );
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// INT-001: Full post-task audit flow — clean project
// ---------------------------------------------------------------------------

describe('INT-001: Full post-task audit flow — clean project', () => {
  it('clean project produces no findings and no remediation tasks', async () => {
    // Setup: all checks return clean
    const cleanResults: CheckResult[] = [
      makeCheckResult({ name: 'test-cheat', severity: 'clean' }),
      makeCheckResult({ name: 'scope-creep', severity: 'clean' }),
      makeCheckResult({ name: 'dependency-grab', severity: 'clean' }),
      makeCheckResult({ name: 'clean-slate-bias', layer: 2, severity: 'clean' }),
    ];

    mockRunChecks.mockResolvedValue({
      results: cleanResults,
      secretLocations: [],
    });

    const { report, classified, secretLocations } = await runPostTaskAudit(
      tmpDir,
      'm1-test',
      1,
      null,
    );

    // No classified findings
    expect(classified).toHaveLength(0);
    expect(secretLocations).toHaveLength(0);

    // Report was persisted
    const reportPath = join(tmpDir, 'm1-test', 'audit', 'task-1-layer1.json');
    expect(existsSync(reportPath)).toBe(true);

    // Detection record can be appended (clean acceptance)
    const detection: Detection = {
      timestamp: new Date().toISOString(),
      trigger: 'task-complete',
      taskId: 1,
      layer: 1,
      results: cleanResults.filter(
        (r) => r.layer === 1 || r.name === 'clean-slate-bias',
      ),
      actions: [
        {
          type: 'accepted',
          taskNumber: null,
          findingCheck: null,
          findingFile: null,
          resolution: 'All checks clean.',
        },
      ],
    };
    appendDetection(statePath, detection);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.detections).toHaveLength(1);
    expect(state.detections[0].trigger).toBe('task-complete');
    expect(state.detections[0].actions[0].type).toBe('accepted');
  });
});

// ---------------------------------------------------------------------------
// INT-002: Full post-task audit flow — Tier 2 finding generates task and detection
// ---------------------------------------------------------------------------

describe('INT-002: Tier 2 finding generates task and detection record', () => {
  it('warning finding classifies as Tier 2, generates remediation task, records detection', async () => {
    const finding = {
      file: 'src/utils.ts',
      location: 'line 15',
      description: 'Weak assertion: toBeTruthy on object',
      suggestion: 'Use toEqual or toMatchObject with specific properties.',
    };

    const warningResults: CheckResult[] = [
      makeCheckResult({
        name: 'test-cheat',
        severity: 'warning',
        findings: [finding],
      }),
      makeCheckResult({ name: 'scope-creep', severity: 'clean' }),
    ];

    mockRunChecks.mockResolvedValue({
      results: warningResults,
      secretLocations: [],
    });

    const { classified } = await runPostTaskAudit(tmpDir, 'm1-test', 3, null);

    // Should have one classified finding
    expect(classified).toHaveLength(1);
    expect(classified[0].checkName).toBe('test-cheat');
    expect(classified[0].tier).toBe(2);
    expect(classified[0].action).toBe('generate-task');

    // Generate remediation task
    const milestonePath = join(tmpDir, 'm1-test');
    const { taskNumber, filePath } = await generateRemediationTask(
      milestonePath,
      {
        originatingTaskNumber: 3,
        checkName: 'test-cheat',
        severity: 'warning',
        finding,
        remediationDepth: 0,
      },
    );

    expect(taskNumber).toBeGreaterThan(0);
    expect(existsSync(filePath)).toBe(true);

    // Read and verify task file content
    const taskContent = readFileSync(filePath, 'utf-8');
    expect(taskContent).toContain('Rework of:');
    expect(taskContent).toContain('test-cheat');

    // Write detection record
    const detection: Detection = {
      timestamp: new Date().toISOString(),
      trigger: 'task-complete',
      taskId: 3,
      layer: 1,
      results: warningResults,
      actions: [
        {
          type: 'task-created',
          taskNumber,
          findingCheck: 'test-cheat',
          findingFile: 'src/utils.ts',
          resolution: `Remediation task ${taskNumber} generated.`,
        },
      ],
    };
    appendDetection(statePath, detection);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.detections).toHaveLength(1);
    expect(state.detections[0].actions[0].type).toBe('task-created');
    expect(state.detections[0].actions[0].taskNumber).toBe(taskNumber);
  });
});

// ---------------------------------------------------------------------------
// INT-003: Full post-task audit flow — Tier 3 finding blocks and records
// ---------------------------------------------------------------------------

describe('INT-003: Tier 3 finding blocks and records', () => {
  it('critical contextual finding classifies as Tier 3 and blocks', async () => {
    const finding = {
      file: 'src/core.ts',
      location: 'line 42',
      description: 'Premature abstraction: unused generic interface',
      suggestion: 'Remove the generic and use concrete types.',
    };

    const criticalResults: CheckResult[] = [
      makeCheckResult({
        name: 'premature-abstraction',
        severity: 'critical',
        findings: [finding],
      }),
    ];

    mockRunChecks.mockResolvedValue({
      results: criticalResults,
      secretLocations: [],
    });

    const { classified } = await runPostTaskAudit(tmpDir, 'm1-test', 5, null);

    expect(classified).toHaveLength(1);
    expect(classified[0].checkName).toBe('premature-abstraction');
    expect(classified[0].tier).toBe(3);
    expect(classified[0].action).toBe('escalate');

    // Record blocked detection
    const detection: Detection = {
      timestamp: new Date().toISOString(),
      trigger: 'task-complete',
      taskId: 5,
      layer: 1,
      results: criticalResults,
      actions: [
        {
          type: 'blocked',
          taskNumber: null,
          findingCheck: 'premature-abstraction',
          findingFile: 'src/core.ts',
          resolution: 'Task blocked: critical premature-abstraction finding.',
        },
      ],
    };
    appendDetection(statePath, detection);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.detections[0].actions[0].type).toBe('blocked');
  });
});

// ---------------------------------------------------------------------------
// INT-004: Remediation task audit — finding on fix escalates
// ---------------------------------------------------------------------------

describe('INT-004: Finding on remediation task escalates', () => {
  it('finding at remediation depth 1 escalates to Tier 3', () => {
    // A finding on a remediation task (depth >= MAX_REMEDIATION_DEPTH)
    const { tier, action } = classifyFinding(
      'test-cheat',
      'warning',
      1, // depth 1 = remediation task
      'task-complete',
    );

    expect(tier).toBe(3);
    expect(action).toBe('escalate');
  });

  it('detection record for escalated remediation finding', () => {
    const detection: Detection = {
      timestamp: new Date().toISOString(),
      trigger: 'task-complete',
      taskId: 12, // remediation task number
      layer: 1,
      results: [
        makeCheckResult({
          name: 'test-cheat',
          severity: 'warning',
          findings: [
            {
              file: 'src/utils.ts',
              location: 'line 20',
              description: 'Still weak',
              suggestion: 'Fix it properly.',
            },
          ],
        }),
      ],
      actions: [
        {
          type: 'escalated',
          taskNumber: null,
          findingCheck: 'test-cheat',
          findingFile: 'src/utils.ts',
          resolution:
            'Finding on remediation task (depth 1). Escalated to Tier 3.',
        },
      ],
    };
    appendDetection(statePath, detection);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.detections[0].actions[0].type).toBe('escalated');
    expect(state.detections[0].actions[0].resolution).toContain('depth 1');
  });
});

// ---------------------------------------------------------------------------
// INT-005: Git checkpoint state integration (partial)
// ---------------------------------------------------------------------------

describe('INT-005: Git checkpoint state integration (partial)', () => {
  it('detection record coexists with git state in state.json', () => {
    // Pre-populate state.json with git state
    const stateWithGit = {
      version: 2,
      git: {
        startTag: { created: true, ref: 'milestone/m1-test-start', error: null },
        completeTag: { created: false, ref: null, error: null },
        rollbackBranch: { created: false, ref: null, error: null },
      },
    };
    writeFileSync(statePath, JSON.stringify(stateWithGit, null, 2));

    // Append detection
    const detection: Detection = {
      timestamp: new Date().toISOString(),
      trigger: 'task-complete',
      taskId: 1,
      layer: 1,
      results: [makeCheckResult({ severity: 'clean' })],
      actions: [
        {
          type: 'accepted',
          taskNumber: null,
          findingCheck: null,
          findingFile: null,
          resolution: 'Clean.',
        },
      ],
    };
    appendDetection(statePath, detection);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    // Git state preserved
    expect(state.git.startTag.ref).toBe('milestone/m1-test-start');
    // Detection added
    expect(state.detections).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// INT-006: Layer 2 candidate dump with judgment prompt produces well-formed output
// ---------------------------------------------------------------------------

describe('INT-006: Candidate dump + judgment prompt well-formed output', () => {
  it('prepareMilestoneCloseAudit returns candidates and prompts for all checks', async () => {
    const checks = LAYER2_CHECK_NAMES.map((name) =>
      makeMockCheck(name),
    );
    mockGetChecks.mockReturnValue(checks);

    const { candidates, prompts, errors } =
      await prepareMilestoneCloseAudit(tmpDir, 'm1-test');

    // All 7 checks should have candidates and prompts
    expect(candidates.size).toBe(7);
    expect(prompts.size).toBe(7);
    expect(errors.size).toBe(0);

    // Each prompt is a non-empty string
    for (const [checkName, prompt] of prompts) {
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      // Prompt should reference the check's domain
      // (at minimum, it's not an error message)
      expect(prompt).not.toContain('No judgment prompt template');
    }

    // Report was persisted
    const reportPath = join(tmpDir, 'm1-test', 'audit', 'milestone-close-layer2.json');
    expect(existsSync(reportPath)).toBe(true);

    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    expect(report.phase).toBe('pre-judgment');
    expect(report.checks).toHaveLength(7);
  });

  it('errors in candidate dump appear in errors map and report', async () => {
    const okCheck = makeMockCheck('ghost-refactor');
    const throwingCheck: Check = {
      name: 'deep-heresy',
      layer: 2,
      async run() {
        return {
          name: 'deep-heresy',
          layer: 2 as const,
          status: 'skipped' as const,
          severity: 'clean' as const,
          findings: [],
          errorMessage: null,
        };
      },
      dumpCandidates(): CandidateDump {
        throw new Error('Simulated failure');
      },
    };

    mockGetChecks.mockReturnValue([okCheck, throwingCheck]);

    const { candidates, prompts, errors } =
      await prepareMilestoneCloseAudit(tmpDir, 'm1-test');

    expect(candidates.size).toBe(1);
    expect(prompts.size).toBe(1);
    expect(errors.has('deep-heresy')).toBe(true);

    // Report includes the error
    const reportPath = join(tmpDir, 'm1-test', 'audit', 'milestone-close-layer2.json');
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors.some((e: { check: string }) => e.check === 'deep-heresy')).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// INT-007: Report file is valid Layer2Report JSON
// ---------------------------------------------------------------------------

describe('INT-007: Report file is valid Layer2Report JSON', () => {
  it('pre-judgment report has correct structure', async () => {
    const checks = LAYER2_CHECK_NAMES.map((name) => makeMockCheck(name));
    mockGetChecks.mockReturnValue(checks);

    await prepareMilestoneCloseAudit(tmpDir, 'm1-test');

    const reportPath = join(tmpDir, 'm1-test', 'audit', 'milestone-close-layer2.json');
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));

    // Required top-level fields
    expect(report).toHaveProperty('version');
    expect(report).toHaveProperty('timestamp');
    expect(report).toHaveProperty('project');
    expect(report).toHaveProperty('milestone');
    expect(report).toHaveProperty('phase');
    expect(report).toHaveProperty('checks');
    expect(report).toHaveProperty('errors');

    expect(report.version).toBe('1.0.0');
    expect(report.phase).toBe('pre-judgment');
    expect(report.milestone).toBe('m1-test');

    // Timestamp is ISO 8601
    const parsed = new Date(report.timestamp);
    expect(parsed.toISOString()).toBe(report.timestamp);

    // Each check entry has required fields
    for (const check of report.checks) {
      expect(check).toHaveProperty('check');
      expect(check).toHaveProperty('candidateCount');
      expect(check).toHaveProperty('candidates');
      expect(check).toHaveProperty('prompt');
      expect(typeof check.check).toBe('string');
      expect(typeof check.candidateCount).toBe('number');
      expect(Array.isArray(check.candidates)).toBe(true);
      expect(typeof check.prompt).toBe('string');
    }
  });

  it('finalized report has correct structure with judgments', async () => {
    const judgments: JudgmentResult[] = [
      {
        checkName: 'ghost-refactor',
        judgment: 'All candidates are necessary rewrites.',
        hasFindings: false,
      },
      {
        checkName: 'clean-slate-bias',
        judgment: 'One duplicate found in utils.',
        hasFindings: true,
      },
    ];

    const { report, detection } = await finalizeMilestoneCloseAudit({
      statePath,
      projectPath: tmpDir,
      milestone: 'm1-test',
      judgments,
    });

    expect(report.phase).toBe('finalized');
    expect(report.checks).toHaveLength(2);

    // Check with findings should have judgment
    const csbCheck = report.checks.find(
      (c) => c.check === 'clean-slate-bias',
    );
    expect(csbCheck?.judgment).toContain('duplicate');
    expect(csbCheck?.hasFindings).toBe(true);

    // Detection record written
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.detections).toHaveLength(1);
    expect(state.detections[0].trigger).toBe('milestone-close');
    expect(state.detections[0].taskId).toBeNull();
    expect(state.detections[0].layer).toBe(2);

    // Escalated action for the finding
    const escalated = state.detections[0].actions.find(
      (a: DetectionAction) => a.type === 'escalated',
    );
    expect(escalated).toBeDefined();
    expect(escalated.findingCheck).toBe('clean-slate-bias');
  });

  it('finalized report includes Decision 23 not-re-verified notice', async () => {
    const judgments: JudgmentResult[] = [
      {
        checkName: 'ghost-refactor',
        judgment: 'Clean.',
        hasFindings: false,
      },
    ];

    const { report } = await finalizeMilestoneCloseAudit({
      statePath,
      projectPath: tmpDir,
      milestone: 'm1-test',
      judgments,
      remediatedChecks: ['test-cheat', 'scope-creep'],
    });

    // Notice present
    expect(report.notReVerifiedNotice).toBeDefined();
    expect(report.notReVerifiedNotice).toContain('test-cheat');
    expect(report.notReVerifiedNotice).toContain('scope-creep');
    expect(report.notReVerifiedNotice).toContain('not been re-verified');

    // Detection record includes the notice as an accepted action
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    const acceptedAction = state.detections[0].actions.find(
      (a: DetectionAction) => a.type === 'accepted',
    );
    expect(acceptedAction).toBeDefined();
    expect(acceptedAction.resolution).toContain('not been re-verified');
  });

  it('all-clean finalize produces accepted action with no escalations', async () => {
    const judgments: JudgmentResult[] = [
      {
        checkName: 'ghost-refactor',
        judgment: 'Clean.',
        hasFindings: false,
      },
      {
        checkName: 'deep-heresy',
        judgment: 'No violations.',
        hasFindings: false,
      },
    ];

    await finalizeMilestoneCloseAudit({
      statePath,
      projectPath: tmpDir,
      milestone: 'm1-test',
      judgments,
    });

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.detections[0].actions).toHaveLength(1);
    expect(state.detections[0].actions[0].type).toBe('accepted');
    expect(state.detections[0].actions[0].resolution).toContain('clean');
  });
});

// ---------------------------------------------------------------------------
// SF-001: Prepare then finalize preserves candidate data
// ---------------------------------------------------------------------------

describe('SF-001: Prepare then finalize preserves candidate data', () => {
  it('finalized entries have candidateCount > 0 and candidates populated', async () => {
    const checks = LAYER2_CHECK_NAMES.map((name) => makeMockCheck(name));
    mockGetChecks.mockReturnValue(checks);

    await prepareMilestoneCloseAudit(tmpDir, 'm1-test');

    const judgments: JudgmentResult[] = LAYER2_CHECK_NAMES.map((name) => ({
      checkName: name,
      judgment: `Clean for ${name}.`,
      hasFindings: false,
    }));

    const { report } = await finalizeMilestoneCloseAudit({
      statePath,
      projectPath: tmpDir,
      milestone: 'm1-test',
      judgments,
    });

    expect(report.phase).toBe('finalized');
    for (const check of report.checks) {
      expect(check.candidateCount).toBeGreaterThan(0);
      expect(check.candidates.length).toBeGreaterThan(0);
      expect(check.judgment).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// SF-002: Finalize without prior prepare degrades gracefully
// ---------------------------------------------------------------------------

describe('SF-002: Finalize without prior prepare degrades gracefully', () => {
  it('candidateCount is 0, candidates empty, no exception', async () => {
    const judgments: JudgmentResult[] = [
      { checkName: 'ghost-refactor', judgment: 'Clean.', hasFindings: false },
    ];

    const { report } = await finalizeMilestoneCloseAudit({
      statePath,
      projectPath: tmpDir,
      milestone: 'm1-test',
      judgments,
    });

    expect(report.checks).toHaveLength(1);
    expect(report.checks[0].candidateCount).toBe(0);
    expect(report.checks[0].candidates).toEqual([]);
    expect(report.checks[0].judgment).toBe('Clean.');
  });
});
