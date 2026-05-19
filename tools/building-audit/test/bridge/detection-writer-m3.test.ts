import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { appendDetection } from '../../src/bridge/detection-writer.js';
import type { Detection } from '../../src/bridge/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStateFile(dir: string): string {
  const path = join(dir, 'state.json');
  writeFileSync(path, JSON.stringify({ version: 2, detections: [] }, null, 2) + '\n');
  return path;
}

function readState(path: string): { version: number; detections: unknown[] } {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function makeDetection(overrides?: Partial<Detection>): Detection {
  return {
    timestamp: '2026-05-19T00:00:00Z',
    trigger: 'task-complete',
    taskId: 1,
    layer: 1,
    results: [],
    actions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detection-writer M3 — file references', () => {
  it('DM-001: appendDetection without fileReference appends inline Detection object', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dm-001-'));
    const statePath = createStateFile(dir);
    const detection = makeDetection();

    appendDetection(statePath, detection);

    const state = readState(statePath);
    expect(state.detections).toHaveLength(1);
    expect(state.detections[0]).toEqual(detection);
  });

  it('DM-002: appendDetection with fileReference appends filename string', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dm-002-'));
    const statePath = createStateFile(dir);
    const detection = makeDetection();

    appendDetection(statePath, detection, 'detections/ghost-refactor-001.json');

    const state = readState(statePath);
    expect(state.detections).toHaveLength(1);
    expect(state.detections[0]).toBe('detections/ghost-refactor-001.json');
  });

  it('DM-003: appendDetection creates detections array if missing (both modes)', () => {
    // Inline mode — no detections key at all
    const dir1 = mkdtempSync(join(tmpdir(), 'dm-003a-'));
    const path1 = join(dir1, 'state.json');
    writeFileSync(path1, JSON.stringify({ version: 2 }, null, 2) + '\n');
    const detection = makeDetection();

    appendDetection(path1, detection);
    const state1 = readState(path1);
    expect(state1.detections).toHaveLength(1);
    expect(state1.detections[0]).toEqual(detection);

    // File reference mode — no detections key at all
    const dir2 = mkdtempSync(join(tmpdir(), 'dm-003b-'));
    const path2 = join(dir2, 'state.json');
    writeFileSync(path2, JSON.stringify({ version: 2 }, null, 2) + '\n');

    appendDetection(path2, detection, 'detections/ref.json');
    const state2 = readState(path2);
    expect(state2.detections).toHaveLength(1);
    expect(state2.detections[0]).toBe('detections/ref.json');
  });

  it('DM-004: mixed array — inline then fileReference produces both types', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dm-004-'));
    const statePath = createStateFile(dir);
    const detection = makeDetection({ taskId: 42 });

    appendDetection(statePath, detection);
    appendDetection(statePath, makeDetection(), 'detections/ghost-refactor-002.json');

    const state = readState(statePath);
    expect(state.detections).toHaveLength(2);
    // First entry is inline Detection object
    expect(typeof state.detections[0]).toBe('object');
    expect((state.detections[0] as Detection).taskId).toBe(42);
    // Second entry is filename string
    expect(state.detections[1]).toBe('detections/ghost-refactor-002.json');
  });

  it('DM-005: fileReference takes precedence — detection object is not stored', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dm-005-'));
    const statePath = createStateFile(dir);
    const detection = makeDetection({ taskId: 99 });

    appendDetection(statePath, detection, 'detections/ext-ref-only.json');

    const state = readState(statePath);
    expect(state.detections).toHaveLength(1);
    // Only the string reference is stored
    expect(state.detections[0]).toBe('detections/ext-ref-only.json');
    // The detection object fields are NOT present in the array
    const asString = JSON.stringify(state.detections);
    expect(asString).not.toContain('"taskId": 99');
  });
});
