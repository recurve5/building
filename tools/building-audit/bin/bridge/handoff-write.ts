#!/usr/bin/env node
import { readFileSync } from 'fs';
import { writeHandoff } from '../../src/bridge/handoff-writer.js';

try {
  const input = JSON.parse(readFileSync('/dev/stdin', 'utf-8'));
  if (!input.runDir || !input.payload) {
    process.stderr.write(JSON.stringify({ error: 'Missing required fields: runDir, payload' }) + '\n');
    process.exit(1);
  }
  writeHandoff(input.runDir, input.payload);
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(JSON.stringify({ error: msg }) + '\n');
  process.exit(1);
}
