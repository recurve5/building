#!/usr/bin/env node
import { readFileSync } from 'fs';
import { writeEvent } from '../../src/bridge/event-writer.js';

try {
  const input = JSON.parse(readFileSync('/dev/stdin', 'utf-8'));
  if (!input.runDir || !input.eventType || !input.payload) {
    process.stderr.write(JSON.stringify({ error: 'Missing required fields: runDir, eventType, payload' }) + '\n');
    process.exit(1);
  }
  writeEvent(input.runDir, input.eventType, input.payload);
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(JSON.stringify({ error: msg }) + '\n');
  process.exit(1);
}
