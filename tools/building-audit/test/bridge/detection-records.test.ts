import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { appendDetection } from '../../src/bridge/detection-writer.js';
import type { Detection, DetectionAction } from '../../src/bridge/types.js';
import type { CheckResult } from '../../src/types/index.js';

/** Build a minimal CheckResult for testing. */
function makeCheckResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    name: overrides.name ?? 'test-cheat',
    layer: overrides.layer ?? 1,
    status: overrides.status ?? 'completed',
    severity: overrides.severity ?? 'warning',
    findings: overrides.findings ?? [],
    errorMessage: overrides.errorMessage ?? null,
  };
}

/** Build a minimal Detection for testing. */
function makeDetection(overrides: Partial<Detection> = {}): Detection {
  return {
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    trigger: overrides.trigger ?? 'task-complete',
    taskId: 'taskId' in overrides ? overrides.taskId! : 1,
    layer: overrides.layer ?? 1,
    results: overrides.results ?? [makeCheckResult()],
    actions: overrides.actions ?? [],
  };
}

describe('Detection Record Writer', () => {
  let tmpDir: string;
  let statePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'det-test-'));
    statePath = join(tmpDir, 'state.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // DET-001: Detection record is appended, not overwritten
  it('DET-001: appending a detection preserves existing entries', () => {
    const existing = makeDetection({ taskId: 1 });
    writeFileSync(
      statePath,
      JSON.stringify({ version: 2, detections: [existing] }, null, 2),
    );

    const newDetection = makeDetection({ taskId: 2 });
    appendDetection(statePath, newDetection);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.detections).toHaveLength(2);
    expect(state.detections[0].taskId).toBe(1);
    expect(state.detections[1].taskId).toBe(2);
  });

  // DET-002: Detection record for task-complete has correct structure
  it('DET-002: task-complete detection has correct structure', () => {
    writeFileSync(statePath, JSON.stringify({ version: 2 }, null, 2));

    const detection = makeDetection({
      trigger: 'task-complete',
      taskId: 5,
      layer: 1,
      results: [makeCheckResult({ name: 'scope-creep', severity: 'clean' })],
    });
    appendDetection(statePath, detection);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    const stored = state.detections[0];
    expect(stored.trigger).toBe('task-complete');
    expect(stored.taskId).toBe(5);
    expect(stored.layer).toBe(1);
    expect(stored.results).toHaveLength(1);
    expect(stored.results[0].name).toBe('scope-creep');
  });

  // DET-003: Detection record for blocked finding has correct action type
  it('DET-003: blocked finding has correct DetectionAction shape', () => {
    writeFileSync(statePath, JSON.stringify({ version: 2 }, null, 2));

    const blockedAction: DetectionAction = {
      type: 'blocked',
      taskNumber: null,
      findingCheck: 'test-cheat',
      findingFile: 'src/utils.ts',
      resolution: 'Task blocked pending manual review.',
    };

    const detection = makeDetection({
      actions: [blockedAction],
    });
    appendDetection(statePath, detection);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    const action = state.detections[0].actions[0];
    expect(action.type).toBe('blocked');
    expect(action.findingCheck).toBe('test-cheat');
    expect(action.findingFile).toBe('src/utils.ts');
    expect(action.resolution).toBe('Task blocked pending manual review.');
    expect(action.taskNumber).toBeNull();
  });

  // DET-004: Detection record for milestone-close has correct structure
  it('DET-004: milestone-close detection has correct structure', () => {
    writeFileSync(statePath, JSON.stringify({ version: 2 }, null, 2));

    const detection = makeDetection({
      trigger: 'milestone-close',
      taskId: null,
      layer: 2,
      results: [
        makeCheckResult({ name: 'ghost-refactor', layer: 2, severity: 'warning' }),
      ],
    });
    appendDetection(statePath, detection);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    const stored = state.detections[0];
    expect(stored.trigger).toBe('milestone-close');
    expect(stored.taskId).toBeNull();
    expect(stored.layer).toBe(2);
  });

  // DET-008: Detection record timestamp is ISO 8601
  it('DET-008: detection timestamp is ISO 8601 format', () => {
    writeFileSync(statePath, JSON.stringify({ version: 2 }, null, 2));

    const ts = '2025-06-15T14:30:00.000Z';
    const detection = makeDetection({ timestamp: ts });
    appendDetection(statePath, detection);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    const stored = state.detections[0];
    expect(stored.timestamp).toBe(ts);
    // Verify it parses as a valid date
    const parsed = new Date(stored.timestamp);
    expect(parsed.toISOString()).toBe(ts);
  });

  // DET-009: Detection record when state.json has no detections array
  it('DET-009: creates detections array when missing from state', () => {
    writeFileSync(
      statePath,
      JSON.stringify({ version: 2, pipeline: { stage: 'build' } }, null, 2),
    );

    const detection = makeDetection({ taskId: 3 });
    appendDetection(statePath, detection);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(Array.isArray(state.detections)).toBe(true);
    expect(state.detections).toHaveLength(1);
    expect(state.detections[0].taskId).toBe(3);
    // Other fields are preserved
    expect(state.version).toBe(2);
    expect(state.pipeline.stage).toBe('build');
  });

  // Additional: all action types are correctly encoded
  it('DET-003b: all action types are correctly encoded', () => {
    writeFileSync(statePath, JSON.stringify({ version: 2 }, null, 2));

    const actions: DetectionAction[] = [
      {
        type: 'blocked',
        taskNumber: null,
        findingCheck: 'scope-creep',
        findingFile: 'src/a.ts',
        resolution: null,
      },
      {
        type: 'task-created',
        taskNumber: 12,
        findingCheck: 'test-cheat',
        findingFile: 'src/b.ts',
        resolution: 'Remediation task 012 generated.',
      },
      {
        type: 'escalated',
        taskNumber: null,
        findingCheck: 'ghost-refactor',
        findingFile: 'src/c.ts',
        resolution: 'Escalated to Tier 3.',
      },
      {
        type: 'accepted',
        taskNumber: null,
        findingCheck: null,
        findingFile: null,
        resolution: 'All checks clean.',
      },
    ];

    const detection = makeDetection({ actions });
    appendDetection(statePath, detection);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    const stored = state.detections[0].actions;
    expect(stored).toHaveLength(4);
    expect(stored.map((a: DetectionAction) => a.type)).toEqual([
      'blocked',
      'task-created',
      'escalated',
      'accepted',
    ]);
  });

  // Verify other fields in state.json are not corrupted
  it('does not corrupt other fields in state.json', () => {
    const original = {
      version: 2,
      pipeline: { stage: 'build', currentTask: 5 },
      git: { startTag: { created: true, ref: 'milestone/m1-start', error: null } },
      detections: [makeDetection({ taskId: 1 })],
    };
    writeFileSync(statePath, JSON.stringify(original, null, 2));

    appendDetection(statePath, makeDetection({ taskId: 2 }));

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.version).toBe(2);
    expect(state.pipeline.stage).toBe('build');
    expect(state.pipeline.currentTask).toBe(5);
    expect(state.git.startTag.ref).toBe('milestone/m1-start');
    expect(state.detections).toHaveLength(2);
  });

  // Missing state.json throws
  it('throws when state.json does not exist', () => {
    const missingPath = join(tmpDir, 'nonexistent.json');
    expect(() => appendDetection(missingPath, makeDetection())).toThrow();
  });
});
