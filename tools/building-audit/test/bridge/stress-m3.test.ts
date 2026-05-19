import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { renderHandoff, writeHandoff } from '../../src/bridge/handoff-writer.js';
import { readHandoffHeader } from '../../src/bridge/handoff-reader.js';
import { writeDetectionFile } from '../../src/bridge/detection-file-writer.js';
import type { HandoffPayload } from '../../src/bridge/types.js';
import type { Detection } from '../../src/bridge/types.js';

function makePayload(overrides: Partial<HandoffPayload> = {}): HandoffPayload {
  return {
    runId: 'run-stress-test',
    project: 'trellis',
    milestone: 'm3-bridge',
    projectDir: '/home/user/trellis',
    stateDir: '/home/user/.building/projects/trellis',
    stage: 4,
    stageName: 'Build',
    halted: false,
    haltReason: null,
    stageOverrides: [],
    completedTasks: [],
    currentTask: null,
    remainingTasks: [],
    remediationTasks: [],
    decisions: [],
    openItems: [],
    auditSummary: null,
    gitCheckpoints: [],
    artifactPaths: [],
    nextStep: 'Continue build',
    ...overrides,
  };
}

function makeDetection(taskId: number): Detection {
  return {
    timestamp: '2026-05-19T00:00:00Z',
    trigger: 'task-complete',
    taskId,
    layer: 1,
    results: [
      {
        name: `check-a-${taskId}`,
        layer: 1 as const,
        status: 'completed' as const,
        severity: 'info' as const,
        findings: [{ file: `src/mod-${taskId}.ts`, location: '1-10', description: 'Finding A', suggestion: 'Fix A' }],
        errorMessage: null,
      },
      {
        name: `check-b-${taskId}`,
        layer: 1 as const,
        status: 'completed' as const,
        severity: 'warning' as const,
        findings: [{ file: `src/mod-${taskId}.ts`, location: '11-20', description: 'Finding B', suggestion: 'Fix B' }],
        errorMessage: null,
      },
    ],
    actions: [],
  };
}

describe('M3 stress tests', { timeout: 60_000 }, () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'stress-m3-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('STR-001: handoff with 40 tasks + 15 findings — truncation, under char cap, round-trips', () => {
    const completedTasks = Array.from({ length: 40 }, (_, i) => ({
      number: i + 1,
      shortName: `task-${i + 1}-implementation`,
      status: 'done',
    }));

    const remainingTasks = Array.from({ length: 10 }, (_, i) => ({
      number: 41 + i,
      shortName: `task-${41 + i}-remaining`,
      status: 'not started',
    }));

    const payload = makePayload({
      completedTasks,
      remainingTasks,
      currentTask: { number: 41, shortName: 'task-41-remaining', status: 'in progress' },
      decisions: [
        { number: 1, decision: 'Use SQLite', rationale: 'Simpler for v1' },
        { number: 2, decision: 'Skip auth', rationale: 'Not needed for internal tool' },
        { number: 3, decision: 'Flat file storage', rationale: 'Avoids DB dependency' },
      ],
      openItems: [
        { description: 'Auth strategy', context: 'Tier 3' },
        { description: 'Deploy target', context: 'Tier 3' },
      ],
      auditSummary: {
        l1Findings: Array.from({ length: 15 }, (_, i) => ({ taskId: i + 1, check: `check-${i + 1}`, action: 'generate-task', filePath: `src/mod-${i + 1}.ts` })),
        l2Findings: Array.from({ length: 5 }, (_, i) => ({ check: `l2-check-${i + 1}`, action: 'generate-task' })),
        detectionFiles: Array.from({ length: 15 }, (_, i) => `l1-task-${i + 1}.json`),
      },
      gitCheckpoints: Array.from({ length: 6 }, (_, i) => ({ type: 'tag', ref: `audit/m3-checkpoint-${i + 1}` })),
      artifactPaths: Array.from({ length: 10 }, (_, i) => `m3-bridge/artifact-${i + 1}.md`),
    });

    const start = Date.now();
    const output = renderHandoff(payload);
    writeHandoff(tmpDir, payload);
    const header = readHandoffHeader(tmpDir);
    const elapsed = Date.now() - start;

    expect(output.length).toBeLessThanOrEqual(15_000);
    expect(header).not.toBeNull();
    expect(header!.completedTaskCount).toBe(40);
    expect(header!.remainingTaskCount).toBe(10);
    expect(elapsed).toBeLessThan(2_000);
  });

  it('STR-002: 50 detection files — all valid JSON, no collisions, under 5s', () => {
    const start = Date.now();

    for (let i = 1; i <= 50; i++) {
      writeDetectionFile(tmpDir, makeDetection(i), `task-${i}-l1.json`);
    }

    const elapsed = Date.now() - start;
    const files = readdirSync(join(tmpDir, 'detections'));

    expect(files).toHaveLength(50);
    expect(new Set(files).size).toBe(50);

    for (let i = 1; i <= 50; i++) {
      const content = readFileSync(join(tmpDir, 'detections', `task-${i}-l1.json`), 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.taskId).toBe(i);
      expect(parsed.results).toHaveLength(2);
    }

    expect(elapsed).toBeLessThan(5_000);
  });

  it('STR-003: 25 sequential handoff write/read cycles — correct results, bounded memory', () => {
    const baselineRss = process.memoryUsage().rss;

    for (let i = 0; i < 25; i++) {
      const payload = makePayload({
        stage: i % 12,
        stageName: `Stage-${i}`,
        completedTasks: Array.from({ length: i + 1 }, (_, j) => ({
          number: j + 1,
          shortName: `task-${j + 1}`,
          status: 'done',
        })),
        nextStep: `Continue at cycle ${i}`,
      });

      writeHandoff(tmpDir, payload);
      const header = readHandoffHeader(tmpDir);

      expect(header).not.toBeNull();
      expect(header!.stage).toBe(i % 12);
      expect(header!.completedTaskCount).toBe(i + 1);
    }

    const finalRss = process.memoryUsage().rss;
    const growth = finalRss - baselineRss;
    expect(growth).toBeLessThan(50 * 1024 * 1024);

    expect(existsSync(join(tmpDir, 'handoff.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'handoff.md.tmp'))).toBe(false);
  });

  it('STR-004: 5 corruption variants — all return null, no exceptions, under 1s each', () => {
    const corruptVariants: Array<{ name: string; content: string | Buffer }> = [
      { name: 'truncated-mid-header', content: '```handoff-header\nrun_id: abc\nstage: 3\n' },
      { name: 'garbled-numerics', content: '```handoff-header\nrun_id: abc\nproject: test\nmilestone: m1\nstage: not-a-number\nstage_name: Build\nhalted: false\nhalt_reason: none\ncompleted_tasks: two\nremaining_tasks: 1\ncurrent_task: 3\nnext_step: Go\n```\n' },
      { name: 'no-fenced-block', content: 'run_id: abc\nstage: 3\nproject: test\nmilestone: m1\nstage_name: Build\nhalted: false' },
      { name: 'binary-content', content: Buffer.from(Array.from({ length: 200 }, () => Math.floor(Math.random() * 256))) },
      { name: 'missing-required-fields', content: '```handoff-header\nrun_id: abc\nstage: 3\n```\n' },
    ];

    for (const variant of corruptVariants) {
      const varDir = mkdtempSync(join(tmpdir(), `corrupt-${variant.name}-`));
      writeFileSync(join(varDir, 'handoff.md'), variant.content);

      const start = Date.now();
      let result: ReturnType<typeof readHandoffHeader>;
      expect(() => {
        result = readHandoffHeader(varDir);
      }).not.toThrow();
      const elapsed = Date.now() - start;

      expect(result!).toBeNull();
      expect(elapsed).toBeLessThan(1_000);

      rmSync(varDir, { recursive: true, force: true });
    }
  });
});
