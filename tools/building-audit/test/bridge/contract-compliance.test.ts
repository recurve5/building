import { describe, it, expect } from 'vitest';
import type {
  HandoffPayload,
  HandoffHeader,
  ClassifiedFinding,
  Detection,
  DetectionAction,
  RemediationTaskSpec,
  GitOpResult,
  StateGit,
} from '../../src/bridge/types.js';
import type { Layer2ReportCheck } from '../../src/bridge/milestone-close-flow.js';
import type { CheckResult, Finding } from '../../src/types/index.js';

describe('Contract compliance — compile-time type checks', () => {
  // CC-001: HandoffPayload with all ratified names
  it('CC-001: HandoffPayload with all ratified names compiles', () => {
    const payload: HandoffPayload = {
      runId: 'test',
      project: 'test',
      milestone: 'test',
      projectDir: '/tmp',
      stateDir: '/tmp/.building',
      stage: 1,
      stageName: 'PRD',
      halted: false,
      haltReason: null,
      stageOverrides: [{ stage: 2, reason: 'test' }],
      completedTasks: [{ number: 1, shortName: 'test', status: 'done' }],
      currentTask: null,
      remainingTasks: [],
      remediationTasks: [{ number: 2, shortName: 'fix', status: 'pending', originatingTask: 1 }],
      decisions: [{ number: 1, decision: 'test', rationale: 'test' }],
      openItems: [{ description: 'test', context: 'test' }],
      auditSummary: {
        l1Findings: [{ taskId: 1, check: 'test', action: 'generate-task', filePath: '/tmp/f' }],
        l2Findings: [{ check: 'test', action: 'escalate' }],
        detectionFiles: [],
      },
      gitCheckpoints: [{ type: 'tag', ref: 'abc123' }],
      artifactPaths: [],
      nextStep: 'Continue',
    };
    expect(payload.stage).toBe(1);
    expect(payload.stageOverrides[0].reason).toBe('test');
    expect(payload.remediationTasks[0].originatingTask).toBe(1);
    expect(payload.auditSummary!.l1Findings[0].taskId).toBe(1);
    expect(payload.gitCheckpoints[0].type).toBe('tag');
  });

  // CC-002: HandoffHeader with stage/stageName
  it('CC-002: HandoffHeader with stage/stageName compiles', () => {
    const header: HandoffHeader = {
      runId: 'test',
      project: 'test',
      milestone: 'test',
      stage: 5,
      stageName: 'Peer Review',
      halted: false,
      haltReason: null,
      completedTaskCount: 3,
      remainingTaskCount: 2,
      currentTaskNumber: 4,
      nextStep: 'Continue',
    };
    expect(header.stage).toBe(5);
    expect(header.stageName).toBe('Peer Review');
  });

  // CC-003: ClassifiedFinding with source and escalate action
  it('CC-003: ClassifiedFinding with source and escalate action compiles', () => {
    const mockResult: CheckResult = {
      name: 'test-cheat',
      layer: 1,
      status: 'completed',
      severity: 'warning',
      findings: [],
      errorMessage: null,
    };
    const mockFinding: Finding = {
      file: 'src/foo.ts',
      location: 'line 1',
      description: 'test',
      suggestion: 'fix',
    };
    const cf: ClassifiedFinding = {
      checkName: 'test-cheat',
      checkResult: mockResult,
      finding: mockFinding,
      tier: 3,
      action: 'escalate',
      source: 'contextual_promotion',
    };
    expect(cf.source).toBe('contextual_promotion');
    expect(cf.action).toBe('escalate');
    // 'block' is not assignable to Action — compile-time verification
  });

  // CC-004: Layer2ReportCheck with populated candidates and judgment
  it('CC-004: Layer2ReportCheck with candidates and judgment compiles', () => {
    const check: Layer2ReportCheck = {
      check: 'ghost-refactor',
      candidateCount: 2,
      candidates: [{ file: 'src/foo.ts', commit: 'abc' }],
      prompt: 'Evaluate these candidates',
      judgment: 'All necessary rewrites.',
      hasFindings: false,
    };
    expect(check.candidateCount).toBe(2);
    expect(check.judgment).toBe('All necessary rewrites.');
  });

  // CC-005: Detection with all fields
  it('CC-005: Detection with all fields compiles', () => {
    const d: Detection = {
      timestamp: '2026-05-19T00:00:00Z',
      trigger: 'task-complete',
      taskId: 5,
      layer: 1,
      results: [],
      actions: [],
    };
    expect(d.trigger).toBe('task-complete');
    expect(d.layer).toBe(1);
  });

  // CC-006: DetectionAction with all fields
  it('CC-006: DetectionAction with all fields compiles', () => {
    const a: DetectionAction = {
      type: 'task-created',
      taskNumber: 14,
      findingCheck: 'test-cheat',
      findingFile: 'src/foo.ts',
      resolution: 'Remediation task generated.',
    };
    expect(a.type).toBe('task-created');
    expect(a.taskNumber).toBe(14);
  });

  // CC-007: RemediationTaskSpec with all fields
  it('CC-007: RemediationTaskSpec with all fields compiles', () => {
    const spec: RemediationTaskSpec = {
      originatingTaskNumber: 3,
      checkName: 'test-cheat',
      severity: 'warning',
      finding: { file: 'src/foo.ts', location: 'line 1', description: 'test', suggestion: 'fix' },
      remediationDepth: 0,
    };
    expect(spec.originatingTaskNumber).toBe(3);
    expect(spec.remediationDepth).toBe(0);
  });

  // CC-008: GitOpResult with all fields
  it('CC-008: GitOpResult with all fields compiles', () => {
    const r: GitOpResult = {
      created: true,
      ref: 'milestone/m1-start',
      error: null,
      warning: 'Some warning',
    };
    expect(r.created).toBe(true);
    expect(r.ref).toBe('milestone/m1-start');
  });

  // CC-009: StateGit with all fields
  it('CC-009: StateGit with all fields compiles', () => {
    const sg: StateGit = {
      startTag: { created: true, ref: 'milestone/m1-start', error: null },
      completeTag: { created: false, ref: null, error: null },
      rollbackBranch: { created: false, ref: null, error: null },
    };
    expect(sg.startTag.created).toBe(true);
    expect(sg.completeTag.ref).toBeNull();
  });
});
