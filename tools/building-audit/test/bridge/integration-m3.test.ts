import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeHandoff } from '../../src/bridge/handoff-writer.js';
import { readHandoffHeader } from '../../src/bridge/handoff-reader.js';
import { writeDetectionFile } from '../../src/bridge/detection-file-writer.js';
import { appendDetection } from '../../src/bridge/detection-writer.js';
import { writeEvent } from '../../src/bridge/event-writer.js';
import type { HandoffPayload } from '../../src/bridge/types.js';
import type { Detection } from '../../src/bridge/types.js';

function makePayload(overrides: Partial<HandoffPayload> = {}): HandoffPayload {
  return {
    runId: 'run-int-test',
    project: 'trellis',
    milestone: 'm3-bridge',
    projectDir: '/home/user/trellis',
    stateDir: '/home/user/.building/projects/trellis',
    stage: 4,
    stageName: 'Build',
    halted: false,
    haltReason: null,
    stageOverrides: [],
    completedTasks: [
      { number: 1, shortName: 'setup', status: 'done' },
      { number: 2, shortName: 'schema', status: 'done' },
    ],
    currentTask: { number: 3, shortName: 'api', status: 'in progress' },
    remainingTasks: [
      { number: 4, shortName: 'tests', status: 'not started' },
    ],
    remediationTasks: [],
    decisions: [],
    openItems: [],
    auditSummary: null,
    gitCheckpoints: [],
    artifactPaths: [],
    nextStep: 'Resume task 3',
    ...overrides,
  };
}

function makeDetection(overrides: Partial<Detection> = {}): Detection {
  return {
    timestamp: '2026-05-19T00:00:00Z',
    trigger: 'task-complete',
    taskId: 5,
    layer: 1,
    results: [],
    actions: [],
    ...overrides,
  };
}

function createStateFile(dir: string): string {
  const path = join(dir, 'state.json');
  writeFileSync(path, JSON.stringify({ version: 2, detections: [] }, null, 2) + '\n');
  return path;
}

describe('M3 integration tests', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'int-m3-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('INT-001: handoff round-trip — write then read, header matches payload', () => {
    const payload = makePayload();
    writeHandoff(tmpDir, payload);
    const header = readHandoffHeader(tmpDir);

    expect(header).not.toBeNull();
    expect(header!.runId).toBe(payload.runId);
    expect(header!.project).toBe(payload.project);
    expect(header!.milestone).toBe(payload.milestone);
    expect(header!.stage).toBe(payload.stage);
    expect(header!.stageName).toBe(payload.stageName);
    expect(header!.halted).toBe(payload.halted);
    expect(header!.haltReason).toBeNull();
    expect(header!.completedTaskCount).toBe(payload.completedTasks.length);
    expect(header!.remainingTaskCount).toBe(payload.remainingTasks.length);
    expect(header!.currentTaskNumber).toBe(payload.currentTask!.number);
    expect(header!.nextStep).toBe(payload.nextStep);
  });

  it('INT-002: detection file + appendDetection — write file, store reference, read back', () => {
    const statePath = createStateFile(tmpDir);
    const detection = makeDetection();

    writeDetectionFile(tmpDir, detection, 'task-5-l1.json');
    appendDetection(statePath, detection, 'task-5-l1.json');

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.detections).toHaveLength(1);
    expect(state.detections[0]).toBe('task-5-l1.json');

    const filePath = join(tmpDir, 'detections', 'task-5-l1.json');
    const onDisk = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(onDisk).toEqual(detection);
  });

  it('INT-003: full session boundary sequence — handoff + events + continue', () => {
    const payload = makePayload();
    writeHandoff(tmpDir, payload);
    writeEvent(tmpDir, 'session_boundary', { stage: 4, reason: 'batch-complete' });
    writeEvent(tmpDir, 'handoff_written', { trigger: 'batch-complete', handoffPath: join(tmpDir, 'handoff.md') });

    expect(existsSync(join(tmpDir, 'handoff.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'continue'))).toBe(true);

    const eventFiles = readdirSync(join(tmpDir, 'events'));
    const sbFile = eventFiles.find((f) => f.endsWith('-session_boundary.json'));
    const hwFile = eventFiles.find((f) => f.endsWith('-handoff_written.json'));
    expect(sbFile).toBeDefined();
    expect(hwFile).toBeDefined();

    const sbEvent = JSON.parse(readFileSync(join(tmpDir, 'events', sbFile!), 'utf-8'));
    expect(sbEvent.event).toBe('session_boundary');
    expect(sbEvent.stage).toBe(4);

    const hwEvent = JSON.parse(readFileSync(join(tmpDir, 'events', hwFile!), 'utf-8'));
    expect(hwEvent.event).toBe('handoff_written');
    expect(hwEvent.trigger).toBe('batch-complete');
  });

  it('INT-004: resume fallback — missing handoff, reader returns null, state.json accessible', () => {
    writeFileSync(
      join(tmpDir, 'state.json'),
      JSON.stringify({ version: 2, current_stage: 5, detections: [] }, null, 2) + '\n',
    );

    const header = readHandoffHeader(tmpDir);
    expect(header).toBeNull();

    const state = JSON.parse(readFileSync(join(tmpDir, 'state.json'), 'utf-8'));
    expect(state.current_stage).toBe(5);
  });

  it('INT-005: stage mismatch — handoff header disagrees with state.json', () => {
    const payload = makePayload({ stage: 7, stageName: 'SDM Review' });
    writeHandoff(tmpDir, payload);
    writeFileSync(
      join(tmpDir, 'state.json'),
      JSON.stringify({ version: 2, current_stage: 5, detections: [] }, null, 2) + '\n',
    );

    const header = readHandoffHeader(tmpDir);
    const state = JSON.parse(readFileSync(join(tmpDir, 'state.json'), 'utf-8'));

    expect(header).not.toBeNull();
    expect(header!.stage).toBe(7);
    expect(state.current_stage).toBe(5);
    expect(header!.stage).not.toBe(state.current_stage);
  });

  it('INT-006: mixed detections array — inline object + file reference', () => {
    const statePath = createStateFile(tmpDir);
    const d1 = makeDetection({ taskId: 1 });
    const d2 = makeDetection({ taskId: 3 });

    appendDetection(statePath, d1);
    appendDetection(statePath, d2, 'task-3-l1.json');

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.detections).toHaveLength(2);
    expect(typeof state.detections[0]).toBe('object');
    expect((state.detections[0] as Detection).taskId).toBe(1);
    expect(typeof state.detections[1]).toBe('string');
    expect(state.detections[1]).toBe('task-3-l1.json');
  });

  it('INT-007: truncated handoff round-trips correctly — header reports true counts', () => {
    const manyTasks = Array.from({ length: 40 }, (_, i) => ({
      number: i + 1,
      shortName: `task-${i + 1}`,
      status: 'done',
    }));

    const payload = makePayload({
      completedTasks: manyTasks,
      remainingTasks: [{ number: 41, shortName: 'final', status: 'not started' }],
    });

    writeHandoff(tmpDir, payload);
    const header = readHandoffHeader(tmpDir);

    expect(header).not.toBeNull();
    expect(header!.completedTaskCount).toBe(40);
    expect(header!.remainingTaskCount).toBe(1);
    expect(header!.runId).toBe(payload.runId);
  });
});
