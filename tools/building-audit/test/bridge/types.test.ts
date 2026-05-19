import { describe, it, expect } from 'vitest';
import { isDetectionObject } from '../../src/bridge/types.js';
import type { Detection, DetectionEntry } from '../../src/bridge/types.js';

describe('isDetectionObject', () => {
  // SF-007a: full Detection object -> true
  it('SF-007a: returns true for a full Detection object', () => {
    const detection: Detection = {
      timestamp: '2026-05-19T00:00:00Z',
      trigger: 'task-complete',
      taskId: 5,
      layer: 1,
      results: [],
      actions: [],
    };
    expect(isDetectionObject(detection)).toBe(true);
  });

  // SF-007b: string -> false
  it('SF-007b: returns false for a string', () => {
    expect(isDetectionObject('task-5-l1.json')).toBe(false);
  });

  // SF-007c: null -> false
  it('SF-007c: returns false for null', () => {
    expect(isDetectionObject(null)).toBe(false);
  });

  // SF-007d: object without timestamp -> false
  it('SF-007d: returns false for object without timestamp', () => {
    expect(isDetectionObject({ trigger: 'task-complete', taskId: 5 })).toBe(false);
  });

  // DetectionEntry type alias is importable
  it('DetectionEntry type alias accepts both Detection and string', () => {
    const entries: DetectionEntry[] = [
      {
        timestamp: '2026-05-19T00:00:00Z',
        trigger: 'task-complete',
        taskId: 1,
        layer: 1,
        results: [],
        actions: [],
      },
      'task-1-l1.json',
    ];
    expect(entries).toHaveLength(2);
    expect(isDetectionObject(entries[0])).toBe(true);
    expect(isDetectionObject(entries[1])).toBe(false);
  });
});
