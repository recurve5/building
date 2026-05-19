#!/usr/bin/env node
import { readFileSync } from 'fs';
import { readHandoffHeader } from '../../src/bridge/handoff-reader.js';

try {
  const input = JSON.parse(readFileSync('/dev/stdin', 'utf-8'));
  if (!input.runDir) {
    process.stderr.write(JSON.stringify({ error: 'Missing required field: runDir' }) + '\n');
    process.exit(1);
  }
  const header = readHandoffHeader(input.runDir);
  process.stdout.write(JSON.stringify(header) + '\n');
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(JSON.stringify({ error: msg }) + '\n');
  process.exit(1);
}
