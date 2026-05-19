import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeDetectionFile } from '../../src/bridge/detection-file-writer.js';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Detection } from '../../src/bridge/types.js';

function makeDetection(overrides: Partial<Detection> = {}): Detection {
  return {
    timestamp: '2026-05-19T00:00:00Z',
    trigger: 'task-complete',
    taskId: 7,
    layer: 1,
    results: [],
    actions: [],
    ...overrides,
  };
}

describe('detection-file-writer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'df-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // DF-001: writeDetectionFile writes valid JSON to <runDir>/detections/<filename>
  it('DF-001: writes valid JSON to detections/<filename>', () => {
    const detection = makeDetection();
    writeDetectionFile(tmpDir, detection, 'task-complete-l1.json');

    const filePath = join(tmpDir, 'detections', 'task-complete-l1.json');
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual(detection);
  });

  // DF-002: writeDetectionFile creates detections/ directory if missing
  it('DF-002: creates detections/ directory if missing', () => {
    const detectionsDir = join(tmpDir, 'detections');
    expect(existsSync(detectionsDir)).toBe(false);

    writeDetectionFile(tmpDir, makeDetection(), 'test.json');

    expect(existsSync(detectionsDir)).toBe(true);
  });

  // DF-003: writeDetectionFile with milestone-close filename
  it('DF-003: writes file with milestone-close filename at correct path', () => {
    writeDetectionFile(tmpDir, makeDetection(), 'milestone-close-l2.json');

    const filePath = join(tmpDir, 'detections', 'milestone-close-l2.json');
    expect(existsSync(filePath)).toBe(true);
  });

  // DF-004: writeDetectionFile does not overwrite sibling files
  it('DF-004: does not overwrite sibling files', () => {
    const d1 = makeDetection({ taskId: 1 });
    const d2 = makeDetection({ taskId: 2 });

    writeDetectionFile(tmpDir, d1, 'first.json');
    writeDetectionFile(tmpDir, d2, 'second.json');

    const firstPath = join(tmpDir, 'detections', 'first.json');
    const secondPath = join(tmpDir, 'detections', 'second.json');

    expect(existsSync(firstPath)).toBe(true);
    expect(existsSync(secondPath)).toBe(true);

    const firstParsed = JSON.parse(readFileSync(firstPath, 'utf-8'));
    expect(firstParsed.taskId).toBe(1);

    const secondParsed = JSON.parse(readFileSync(secondPath, 'utf-8'));
    expect(secondParsed.taskId).toBe(2);
  });

  // DF-005: writeDetectionFile overwrites file with same name
  it('DF-005: overwrites file with same name', () => {
    const d1 = makeDetection({ taskId: 10 });
    const d2 = makeDetection({ taskId: 20 });

    writeDetectionFile(tmpDir, d1, 'same.json');
    writeDetectionFile(tmpDir, d2, 'same.json');

    const filePath = join(tmpDir, 'detections', 'same.json');
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(parsed.taskId).toBe(20);
  });

  // DF-006: writeDetectionFile preserves all Detection fields
  it('DF-006: preserves all Detection fields', () => {
    const detection = makeDetection({
      timestamp: '2026-05-19T12:30:00Z',
      trigger: 'milestone-close',
      taskId: 42,
      layer: 2,
      results: [
        {
          name: 'ghost-refactor',
          layer: 2 as const,
          status: 'completed' as const,
          severity: 'warning' as const,
          findings: [{ file: 'src/foo.ts', location: '1-10', description: 'Ghost ref', suggestion: 'Remove' }],
          errorMessage: null,
        },
      ],
      actions: [
        { type: 'escalated' as const, taskNumber: null, findingCheck: 'ghost-refactor', findingFile: 'src/foo.ts', resolution: null },
      ],
    });

    writeDetectionFile(tmpDir, detection, 'full.json');

    const filePath = join(tmpDir, 'detections', 'full.json');
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));

    expect(parsed.timestamp).toBe('2026-05-19T12:30:00Z');
    expect(parsed.trigger).toBe('milestone-close');
    expect(parsed.taskId).toBe(42);
    expect(parsed.layer).toBe(2);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].name).toBe('ghost-refactor');
    expect(parsed.results[0].severity).toBe('warning');
    expect(parsed.results[0].findings).toHaveLength(1);
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0].type).toBe('escalated');
    expect(parsed.actions[0].findingCheck).toBe('ghost-refactor');
  });

  // DF-007: writeDetectionFile with empty results and actions arrays
  it('DF-007: handles empty results and actions arrays', () => {
    const detection = makeDetection({ results: [], actions: [] });

    expect(() => {
      writeDetectionFile(tmpDir, detection, 'empty-arrays.json');
    }).not.toThrow();

    const filePath = join(tmpDir, 'detections', 'empty-arrays.json');
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(parsed.results).toEqual([]);
    expect(parsed.actions).toEqual([]);
  });
});
