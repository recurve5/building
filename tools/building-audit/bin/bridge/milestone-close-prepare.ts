#!/usr/bin/env node
import { readFileSync } from 'fs';
import { prepareMilestoneCloseAudit } from '../../src/bridge/milestone-close-flow.js';

try {
  const input = JSON.parse(readFileSync('/dev/stdin', 'utf-8'));
  if (!input.projectPath || !input.milestone) {
    process.stderr.write(JSON.stringify({ error: 'Missing required fields: projectPath, milestone' }) + '\n');
    process.exit(1);
  }
  const result = await prepareMilestoneCloseAudit(input.projectPath, input.milestone);
  process.stdout.write(JSON.stringify({
    checkCount: result.candidates.size,
    promptCount: result.prompts.size,
    errorCount: result.errors.size,
  }) + '\n');
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(JSON.stringify({ error: msg }) + '\n');
  process.exit(1);
}
