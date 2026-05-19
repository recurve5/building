import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { renderHandoff, writeHandoff, removeContinueFile } from '../../src/bridge/handoff-writer.js';
import { readHandoffHeader } from '../../src/bridge/handoff-reader.js';
import type { HandoffPayload } from '../../src/bridge/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePayload(overrides: Partial<HandoffPayload> = {}): HandoffPayload {
  return {
    runId: 'run-abc-123',
    project: 'trellis',
    milestone: 'm3-bridge',
    projectDir: '/home/user/trellis',
    stateDir: '/home/user/trellis/.build-state',
    stage: 4,
    stageName: 'Build',
    halted: false,
    haltReason: null,
    stageOverrides: [],
    completedTasks: [
      { number: 1, shortName: 'setup-project', status: 'done' },
      { number: 2, shortName: 'create-schema', status: 'done' },
    ],
    currentTask: { number: 3, shortName: 'write-api', status: 'in progress' },
    remainingTasks: [
      { number: 4, shortName: 'add-tests', status: 'not started' },
      { number: 5, shortName: 'deploy', status: 'not started' },
    ],
    remediationTasks: [],
    decisions: [
      { number: 1, decision: 'Use SQLite', rationale: 'Simpler for v1' },
    ],
    openItems: [
      { description: 'Auth strategy TBD', context: 'Tier 3 — needs product input' },
    ],
    auditSummary: {
      l1Findings: [
        { taskId: 1, check: 'ghost-refactor', action: 'generate-task', filePath: 'src/old.ts' },
        { taskId: 2, check: 'test-cheat', action: 'generate-task', filePath: 'src/test.ts' },
      ],
      l2Findings: [
        { check: 'dead-code', action: 'generate-task' },
      ],
      detectionFiles: ['l1-ghost-refactor.json', 'l2-dead-code.json'],
    },
    gitCheckpoints: [
      { type: 'tag', ref: 'audit/m3-pre-build' },
      { type: 'tag', ref: 'audit/m3-post-task-2' },
    ],
    artifactPaths: ['m3-bridge/PRD.md', 'm3-bridge/XRD.md'],
    nextStep: 'Resume task 3: write-api',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handoff-writer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'hw-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // HW-001
  it('HW-001: renderHandoff produces string containing all 9 section headings', () => {
    const output = renderHandoff(makePayload());
    const headings = [
      '## 1. Run Identity',
      '## 2. Pipeline Position',
      '## 3. Task Progress',
      '## 4. Decisions Made This Session',
      '## 5. Open Items',
      '## 6. Audit Summary',
      '## 7. Git Checkpoints',
      '## 8. Artifact Paths',
      '## 9. Next Step',
    ];
    for (const heading of headings) {
      expect(output).toContain(heading);
    }
  });

  // HW-002
  it('HW-002: renderHandoff header block contains run_id', () => {
    const output = renderHandoff(makePayload({ runId: 'run-xyz-789' }));
    expect(output).toContain('run_id: run-xyz-789');
  });

  // HW-003
  it('HW-003: renderHandoff header block contains stage number', () => {
    const output = renderHandoff(makePayload({ stage: 7 }));
    expect(output).toContain('stage: 7');
  });

  // HW-004
  it('HW-004: renderHandoff header block contains halted status', () => {
    const output = renderHandoff(makePayload({ halted: true, haltReason: 'audit-fail' }));
    expect(output).toContain('halted: true');
    expect(output).toContain('halt_reason: audit-fail');
  });

  // HW-005
  it('HW-005: renderHandoff header block contains next_step', () => {
    const output = renderHandoff(makePayload({ nextStep: 'Run security review' }));
    expect(output).toContain('next_step: Run security review');
  });

  // HW-006
  it('HW-006: renderHandoff includes completed tasks in body', () => {
    const output = renderHandoff(makePayload());
    expect(output).toContain('setup-project');
    expect(output).toContain('create-schema');
  });

  // HW-007
  it('HW-007: renderHandoff includes decisions in body', () => {
    const output = renderHandoff(makePayload());
    expect(output).toContain('Use SQLite');
    expect(output).toContain('Simpler for v1');
  });

  // HW-008
  it('HW-008: renderHandoff includes audit summary in body', () => {
    const output = renderHandoff(makePayload());
    expect(output).toContain('L1 Findings');
    expect(output).toContain('L2 Findings');
    expect(output).toContain('ghost-refactor');
    expect(output).toContain('l1-ghost-refactor.json');
  });

  // HW-009
  it('HW-009: renderHandoff with empty arrays produces valid markdown', () => {
    const output = renderHandoff(makePayload({
      completedTasks: [],
      remainingTasks: [],
      remediationTasks: [],
      decisions: [],
      openItems: [],
      auditSummary: null,
      gitCheckpoints: [],
      artifactPaths: [],
      stageOverrides: [],
    }));
    expect(output).toContain('_None_');
    expect(output).toContain('_No audit run this session._');
    // Should still have all 9 sections
    expect(output).toContain('## 9. Next Step');
  });

  // HW-010
  it('HW-010: renderHandoff truncation activates when output exceeds 15000 chars', () => {
    // Create enough completed tasks to push output over 15000 chars
    const bigTasks = Array.from({ length: 200 }, (_, i) => ({
      number: i + 1,
      shortName: `task-with-a-very-long-descriptive-name-number-${i + 1}-padding`.padEnd(80, 'x'),
      status: 'done' as const,
    }));
    const output = renderHandoff(makePayload({ completedTasks: bigTasks }));
    expect(output).toContain('omitted for brevity');
  });

  // HW-011
  it('HW-011: renderHandoff truncation preserves header block', () => {
    const bigTasks = Array.from({ length: 200 }, (_, i) => ({
      number: i + 1,
      shortName: `task-with-long-name-${i + 1}`.padEnd(80, 'x'),
      status: 'done' as const,
    }));
    const payload = makePayload({ completedTasks: bigTasks, runId: 'run-preserve-header' });
    const output = renderHandoff(payload);
    expect(output).toContain('```handoff-header');
    expect(output).toContain('run_id: run-preserve-header');
    expect(output).toContain('completed_tasks: 200');
  });

  // HW-012
  it('HW-012: renderHandoff truncation shows last 10 completed tasks', () => {
    const bigTasks = Array.from({ length: 200 }, (_, i) => ({
      number: i + 1,
      shortName: `task-long-name-${i + 1}`.padEnd(80, 'x'),
      status: 'done' as const,
    }));
    const output = renderHandoff(makePayload({ completedTasks: bigTasks }));
    // Should contain the last 10 (191-200) but not the first ones
    expect(output).toContain('task-long-name-200');
    expect(output).toContain('task-long-name-191');
    expect(output).not.toContain('task-long-name-1x');
  });

  // HW-013
  it('HW-013: writeHandoff creates handoff.md at correct path', () => {
    writeHandoff(tmpDir, makePayload());
    const handoffPath = join(tmpDir, 'handoff.md');
    expect(existsSync(handoffPath)).toBe(true);
    const content = readFileSync(handoffPath, 'utf-8');
    expect(content).toContain('```handoff-header');
    // tmp file should not remain
    expect(existsSync(join(tmpDir, 'handoff.md.tmp'))).toBe(false);
  });

  // HW-014
  it('HW-014: writeHandoff creates continue file', () => {
    writeHandoff(tmpDir, makePayload());
    const continuePath = join(tmpDir, 'continue');
    expect(existsSync(continuePath)).toBe(true);
    const content = readFileSync(continuePath, 'utf-8');
    expect(content).toBe('/build --resume');
  });

  // HW-015
  it('HW-015: writeHandoff overwrites existing handoff.md', () => {
    writeFileSync(join(tmpDir, 'handoff.md'), 'old content', 'utf-8');
    writeHandoff(tmpDir, makePayload({ runId: 'run-overwrite' }));
    const content = readFileSync(join(tmpDir, 'handoff.md'), 'utf-8');
    expect(content).toContain('run-overwrite');
    expect(content).not.toContain('old content');
  });

  // BF-007: Structured stageOverrides render with stage number and reason
  it('BF-007: structured stageOverrides renders stage number and reason', () => {
    const output = renderHandoff(makePayload({
      stageOverrides: [{ stage: 2, reason: 'human override' }],
    }));
    expect(output).toContain('Stage 2: human override');
  });

  // BF-008: Structured gitCheckpoints render with type and ref
  it('BF-008: structured gitCheckpoints renders type and ref per checkpoint', () => {
    const output = renderHandoff(makePayload({
      gitCheckpoints: [{ type: 'tag', ref: 'milestone/m1-start' }],
    }));
    expect(output).toContain('tag: milestone/m1-start');
  });

  // BF-009: Structured l1Findings render per-finding detail
  it('BF-009: structured auditSummary.l1Findings renders per-finding detail', () => {
    const output = renderHandoff(makePayload({
      auditSummary: {
        l1Findings: [{ taskId: 3, check: 'test-cheat', action: 'generate-task', filePath: 'src/foo.ts' }],
        l2Findings: [],
        detectionFiles: [],
      },
    }));
    expect(output).toContain('Task 3: test-cheat');
    expect(output).toContain('generate-task');
    expect(output).toContain('src/foo.ts');
  });

  // BF-010: Remediation tasks with originatingTask render correctly
  it('BF-010: remediationTasks with originatingTask renders originating task number', () => {
    const output = renderHandoff(makePayload({
      remediationTasks: [{ number: 14, shortName: 'fix-cheat', status: 'not started', originatingTask: 3 }],
    }));
    expect(output).toContain('from task 3');
  });

  // BF-011: Write handoff with stage/stageName, read header returns stage/stageName
  it('BF-011: write handoff with stage/stageName, read header returns stage/stageName', () => {
    writeHandoff(tmpDir, makePayload({ stage: 5, stageName: 'Peer Review' }));
    const header = readHandoffHeader(tmpDir);
    expect(header).not.toBeNull();
    expect(header!.stage).toBe(5);
    expect(header!.stageName).toBe('Peer Review');
    expect((header as any).currentStage).toBeUndefined();
    expect((header as any).currentStageName).toBeUndefined();
  });

  // HW-016
  it('HW-016: removeContinueFile deletes continue file; no-op if missing', () => {
    const continuePath = join(tmpDir, 'continue');

    // Write then remove
    writeFileSync(continuePath, '/build --resume', 'utf-8');
    expect(existsSync(continuePath)).toBe(true);
    removeContinueFile(tmpDir);
    expect(existsSync(continuePath)).toBe(false);

    // No-op when missing — should not throw
    expect(() => removeContinueFile(tmpDir)).not.toThrow();
  });
});
