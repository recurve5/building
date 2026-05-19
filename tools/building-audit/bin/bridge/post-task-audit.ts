#!/usr/bin/env node
import { readFileSync } from 'fs';
import '../../../src/bridge/register-checks.js';
import { runPostTaskAudit } from '../../src/bridge/post-task-audit.js';

try {
  const input = JSON.parse(readFileSync('/dev/stdin', 'utf-8'));
  if (!input.projectPath || !input.milestone || input.taskId == null) {
    process.stderr.write(JSON.stringify({ error: 'Missing required fields: projectPath, milestone, taskId' }) + '\n');
    process.exit(1);
  }
  const result = await runPostTaskAudit(
    input.projectPath,
    input.milestone,
    input.taskId,
    input.reworkOf ?? null,
  );
  process.stdout.write(JSON.stringify({
    classified: result.classified,
    secretLocationCount: result.secretLocations.length,
  }) + '\n');
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(JSON.stringify({ error: msg }) + '\n');
  process.exit(1);
}
