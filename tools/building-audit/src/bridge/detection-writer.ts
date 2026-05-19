import { readFileSync, writeFileSync } from 'fs';
import type { Detection } from './types.js';

/**
 * Append a detection to state.json. When `fileReference` is provided, the string
 * is stored instead of the Detection object, producing a mixed-type
 * `Array<Detection | string>` (see `DetectionEntry`). Consumers must use
 * `isDetectionObject()` before accessing Detection-specific fields.
 */
export function appendDetection(
  statePath: string,
  detection: Detection,
  fileReference?: string,
): void {
  const raw = readFileSync(statePath, 'utf-8');
  const state = JSON.parse(raw) as Record<string, unknown>;

  if (!Array.isArray(state.detections)) {
    state.detections = [];
  }

  if (fileReference) {
    (state.detections as unknown[]).push(fileReference);
  } else {
    (state.detections as Detection[]).push(detection);
  }

  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}
