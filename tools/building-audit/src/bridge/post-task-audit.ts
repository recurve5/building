// Post-task audit bridge: runs Layer 1 checks after task completion.
// XRD Section 3, DAY-ZERO 2.6, Decision 20.

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import './register-checks.js';
import { scanProject } from '../scanner/project-scanner.js';
import { runChecks } from '../checks/registry.js';
import { buildReport } from '../report/json-builder.js';
import { classifyFinding } from './policy.js';
import type { AuditReport, CheckResult, SecretLocation } from '../types/index.js';
import type { ClassifiedFinding } from './types.js';

/**
 * Run a post-task audit: scan the project, execute mechanical checks,
 * persist a JSON report, filter and classify findings.
 *
 * Decision 20: only L1 checks and clean-slate-bias appear in the output.
 * Skipped L2 checks are excluded from the returned results and classified array.
 */
export async function runPostTaskAudit(
  projectPath: string,
  milestone: string,
  taskId: number,
): Promise<{
  report: AuditReport;
  classified: ClassifiedFinding[];
  secretLocations: SecretLocation[];
}> {
  // Step 1: Scan project
  const context = await scanProject(projectPath, milestone);

  // Step 2: Run mechanical checks
  const { results, secretLocations } = await runChecks(context, 'mechanical');

  // Step 3: Build the full report (includes all results, even skipped)
  const report = buildReport(
    results,
    context.parseErrors,
    'mechanical',
    projectPath,
    milestone,
    secretLocations,
  );

  // Step 4: Persist report to <milestone>/audit/task-<taskId>-layer1.json
  const auditDir = join(projectPath, milestone, 'audit');
  await mkdir(auditDir, { recursive: true });
  const reportPath = join(auditDir, `task-${taskId}-layer1.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  // Step 5: Filter results per Decision 20
  // Keep only L1 checks and clean-slate-bias. Remove skipped L2 checks.
  const filteredResults = results.filter((r) => {
    if (r.layer === 1) return true;
    if (r.name === 'clean-slate-bias') return true;
    return false;
  });

  // Step 6: Classify non-clean, completed findings
  const classified: ClassifiedFinding[] = [];
  for (const result of filteredResults) {
    if (result.status !== 'completed') continue;
    if (result.severity === 'clean') continue;

    for (const finding of result.findings) {
      const { tier, action } = classifyFinding(
        result.name,
        result.severity,
        0, // remediationDepth: 0 for original tasks
        'task-complete',
      );
      classified.push({
        checkName: result.name,
        checkResult: result,
        finding,
        tier,
        action,
      });
    }
  }

  return { report, classified, secretLocations };
}
