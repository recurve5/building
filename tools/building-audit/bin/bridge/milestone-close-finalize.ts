#!/usr/bin/env node
import { readFileSync } from 'fs';
import { finalizeMilestoneCloseAudit } from '../../src/bridge/milestone-close-flow.js';

try {
  const input = JSON.parse(readFileSync('/dev/stdin', 'utf-8'));
  if (!input.statePath || !input.projectPath || !input.milestone || !input.judgments) {
    process.stderr.write(JSON.stringify({ error: 'Missing required fields: statePath, projectPath, milestone, judgments' }) + '\n');
    process.exit(1);
  }
  const { report, detection } = await finalizeMilestoneCloseAudit({
    statePath: input.statePath,
    projectPath: input.projectPath,
    milestone: input.milestone,
    judgments: input.judgments,
    remediatedChecks: input.remediatedChecks,
    preJudgmentReportPath: input.preJudgmentReportPath,
  });
  process.stdout.write(JSON.stringify({ report, detection }) + '\n');
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(JSON.stringify({ error: msg }) + '\n');
  process.exit(1);
}
