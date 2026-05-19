import { readFileSync, writeFileSync } from 'fs';
import type { Detection } from './types.js';

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
