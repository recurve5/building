import type { Check, CheckResult, Finding, ProjectContext } from '../types.js';
import { registerCheck } from '../registry.js';

// ---------------------------------------------------------------------------
// Confidence Bluff Check
// ---------------------------------------------------------------------------
// Parses Completed sections for claims and verifies them statically.
// - "Created [file]" -> file existence check
// - "Modified [file]" -> git diff check
// - Function/class existence -> AST check
// - Test result claims -> flagged as "unverifiable" (Decision 14)

// Claim extraction patterns
const CREATED_PATTERN = /[Cc]reated?\s+`([^`]+)`/g;
const MODIFIED_PATTERN = /[Mm]odified?\s+`([^`]+)`/g;
const IMPLEMENTED_PATTERN = /[Ii]mplemented?\s+`([^`]+)`/g;
const TEST_PASS_PATTERN = /[Aa]ll\s+tests?\s+pass|tests?\s+(pass|passing|passed|succeed)/i;

interface Claim {
  type: 'created' | 'modified' | 'implemented' | 'test-result';
  value: string;
  raw: string;
}

function extractClaims(completedText: string): Claim[] {
  const claims: Claim[] = [];

  let match: RegExpExecArray | null;

  const createdRe = new RegExp(CREATED_PATTERN.source, 'g');
  while ((match = createdRe.exec(completedText)) !== null) {
    claims.push({ type: 'created', value: match[1], raw: match[0] });
  }

  const modifiedRe = new RegExp(MODIFIED_PATTERN.source, 'g');
  while ((match = modifiedRe.exec(completedText)) !== null) {
    claims.push({ type: 'modified', value: match[1], raw: match[0] });
  }

  const implementedRe = new RegExp(IMPLEMENTED_PATTERN.source, 'g');
  while ((match = implementedRe.exec(completedText)) !== null) {
    claims.push({ type: 'implemented', value: match[1], raw: match[0] });
  }

  if (TEST_PASS_PATTERN.test(completedText)) {
    claims.push({ type: 'test-result', value: 'all tests pass', raw: completedText.match(TEST_PASS_PATTERN)![0] });
  }

  return claims;
}

function fileExists(filePath: string, context: ProjectContext): boolean {
  return context.sourceFiles.has(filePath) || context.rawFiles.has(filePath);
}

function fileInGitDiff(filePath: string, taskId: number, context: ProjectContext): boolean {
  const taskCommits = context.gitLog.filter((c) => c.taskId === taskId);
  return taskCommits.some((c) => c.filesChanged.some((f) => f.includes(filePath) || filePath.includes(f)));
}

function declarationExists(name: string, context: ProjectContext): boolean {
  for (const [, analyzed] of context.sourceFiles) {
    const inFunctions = analyzed.functions.some((f) => f.name === name);
    const inClasses = analyzed.classes.some((c) => c.name === name);
    const inInterfaces = analyzed.interfaces.some((i) => i.name === name);
    if (inFunctions || inClasses || inInterfaces) return true;
  }
  return false;
}

function getCompletedText(completed: { deviations: string | null; insightImplication: string | null; decisions: string | null; date: string | null }): string {
  return [completed.deviations, completed.insightImplication, completed.decisions].filter(Boolean).join('\n');
}

const confidenceBluff: Check = {
  name: 'confidence-bluff',
  layer: 1,

  async run(context: ProjectContext): Promise<CheckResult> {
    const { taskFiles, testResultFiles } = context;
    const findings: Finding[] = [];

    for (const task of taskFiles) {
      if (!task.completed) continue;

      const completedText = getCompletedText(task.completed);
      if (!completedText) continue;

      const claims = extractClaims(completedText);

      for (const claim of claims) {
        switch (claim.type) {
          case 'created': {
            if (!fileExists(claim.value, context)) {
              findings.push({
                file: claim.value,
                location: `task ${task.taskNumber} completed section`,
                description: `Claim "Created \`${claim.value}\`" but file does not exist.`,
                suggestion: `Verify the file was created and the path is correct.`,
                evidence: { taskNumber: task.taskNumber, claim: claim.raw, verificationType: 'file-existence' },
              });
            }
            break;
          }

          case 'modified': {
            if (!fileInGitDiff(claim.value, task.taskNumber, context)) {
              findings.push({
                file: claim.value,
                location: `task ${task.taskNumber} completed section`,
                description: `Claim "Modified \`${claim.value}\`" but file does not appear in task's git diff.`,
                suggestion: `Verify the file was modified in this task's commits.`,
                evidence: { taskNumber: task.taskNumber, claim: claim.raw, verificationType: 'git-diff' },
              });
            }
            break;
          }

          case 'implemented': {
            if (!declarationExists(claim.value, context)) {
              findings.push({
                file: 'project',
                location: `task ${task.taskNumber} completed section`,
                description: `Claim "Implemented \`${claim.value}\`" but no matching declaration found in AST.`,
                suggestion: `Verify the function/class "${claim.value}" exists in the codebase.`,
                evidence: { taskNumber: task.taskNumber, claim: claim.raw, verificationType: 'ast-lookup' },
              });
            }
            break;
          }

          case 'test-result': {
            const evidence: Record<string, unknown> = {
              taskNumber: task.taskNumber,
              claim: claim.raw,
              verificationType: 'unverifiable',
            };

            if (testResultFiles.length > 0) {
              evidence['supplementaryTestResults'] = testResultFiles.map((t) => ({
                file: t.filePath,
                format: t.format,
                suiteCount: t.suites.length,
                totalTests: t.suites.reduce((sum, s) => sum + s.tests.length, 0),
                failedTests: t.suites.reduce(
                  (sum, s) => sum + s.tests.filter((tc) => tc.status === 'failed').length, 0,
                ),
              }));
            }

            findings.push({
              file: 'project',
              location: `task ${task.taskNumber} completed section`,
              description: `Claim "${claim.raw}" is unverifiable by static analysis.`,
              suggestion: `Test result claims require runtime verification. Run the test suite to confirm.`,
              evidence,
            });
            break;
          }
        }
      }
    }

    // Determine severity
    let severity: CheckResult['severity'] = 'clean';
    if (findings.length > 0) {
      const hasCritical = findings.some(
        (f) => (f.evidence as Record<string, unknown>)?.['verificationType'] !== 'unverifiable',
      );
      severity = hasCritical ? 'critical' : 'warning';
    }

    return {
      name: 'confidence-bluff',
      layer: 1,
      status: 'completed',
      severity,
      findings,
      errorMessage: null,
    };
  },
};

registerCheck(confidenceBluff);

export { confidenceBluff };
