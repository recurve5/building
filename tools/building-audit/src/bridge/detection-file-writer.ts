import { mkdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import type { Detection } from './types.js';

export function writeDetectionFile(
  runDir: string,
  detection: Detection,
  filename: string,
): void {
  const safe = basename(filename);
  const detectionsDir = join(runDir, 'detections');
  mkdirSync(detectionsDir, { recursive: true });
  const filePath = join(detectionsDir, safe);
  writeFileSync(filePath, JSON.stringify(detection, null, 2) + '\n', 'utf-8');
}
