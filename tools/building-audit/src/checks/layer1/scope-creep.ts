import type {
  Check,
  CheckResult,
  Finding,
  ProjectContext,
} from '../../types/index.js';
import { registerCheck } from '../registry.js';

// ---------------------------------------------------------------------------
// Scope Creep Check (Layer 1)
// ---------------------------------------------------------------------------
// For each task: maps commits via taskId, diffs committed files against
// declared scope (files.create, files.modify, files.doNotTouch).
//
// Findings:
//   - File modified not in create/modify: warning
//   - File in doNotTouch modified: critical
//   - Commit without [TASK_ID] prefix: warning
//   - Legacy project (>90% commits lack prefix): single info note
//   - No task files: check skipped (Decision 17)
// ---------------------------------------------------------------------------

const LEGACY_THRESHOLD = 0.9;

/**
 * Returns true if `filePath` matches a doNotTouch entry.
 * Directory entries (ending with `/`) match any file under that path.
 */
function matchesDoNotTouch(filePath: string, doNotTouchEntries: string[]): boolean {
  for (const entry of doNotTouchEntries) {
    if (entry.endsWith('/')) {
      // Directory match — any file under this path
      if (filePath === entry.slice(0, -1) || filePath.startsWith(entry)) {
        return true;
      }
    } else {
      if (filePath === entry) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns true if `filePath` is within the declared scope
 * (create or modify lists) for a task.
 */
function isInDeclaredScope(filePath: string, create: string[], modify: string[]): boolean {
  return create.includes(filePath) || modify.includes(filePath);
}

const scopeCreepCheck: Check = {
  name: 'scope-creep',
  layer: 1,

  async run(context: ProjectContext): Promise<CheckResult> {
    // Decision 17: no task files -> skip
    if (context.taskFiles.length === 0) {
      return {
        name: 'scope-creep',
        layer: 1,
        status: 'skipped',
        severity: 'clean',
        findings: [],
        errorMessage: 'No task files found — scope creep check requires task file declarations.',
      };
    }

    const findings: Finding[] = [];

    // --- Check for commits without [TASK_ID] prefix ---
    const totalCommits = context.gitLog.length;
    const commitsWithoutTaskId = context.gitLog.filter((c) => c.taskId === null);
    const missingPrefixRatio = totalCommits > 0 ? commitsWithoutTaskId.length / totalCommits : 0;

    if (totalCommits > 0 && missingPrefixRatio > LEGACY_THRESHOLD) {
      // Decision 16: legacy project — single info-level note
      findings.push({
        file: '',
        location: 'project-wide',
        description: `Legacy project detected: ${commitsWithoutTaskId.length}/${totalCommits} commits (${(missingPrefixRatio * 100).toFixed(0)}%) lack [TASK_ID] prefix. Suppressing per-commit warnings.`,
        suggestion:
          'Consider using --convention-start to specify when the commit convention began.',
      });
    } else {
      // Individual warnings for each commit missing a task ID
      for (const commit of commitsWithoutTaskId) {
        findings.push({
          file: '',
          location: `commit ${commit.hash}`,
          description: `Commit "${commit.message}" lacks [TASK_ID] prefix.`,
          suggestion: 'Prefix commit messages with [TASK_ID] to enable scope tracking.',
        });
      }
    }

    // --- Check file scope per task ---
    // Build a map: taskNumber -> set of files changed by commits attributed to that task
    const taskToFiles = new Map<number, Set<string>>();
    for (const commit of context.gitLog) {
      if (commit.taskId !== null) {
        let fileSet = taskToFiles.get(commit.taskId);
        if (!fileSet) {
          fileSet = new Set();
          taskToFiles.set(commit.taskId, fileSet);
        }
        for (const f of commit.filesChanged) {
          fileSet.add(f);
        }
      }
    }

    for (const task of context.taskFiles) {
      const filesChanged = taskToFiles.get(task.taskNumber);
      if (!filesChanged) continue;

      const { create, modify, doNotTouch } = task.files;

      for (const filePath of Array.from(filesChanged)) {
        // Check doNotTouch first — critical severity
        if (matchesDoNotTouch(filePath, doNotTouch)) {
          findings.push({
            file: filePath,
            location: `task ${task.taskNumber}`,
            description: `File "${filePath}" is in the doNotTouch list for task ${task.taskNumber} but was modified.`,
            suggestion: 'Revert changes to this file or update the task scope declaration.',
            evidence: { taskNumber: task.taskNumber, violationType: 'doNotTouch' },
          });
        } else if (!isInDeclaredScope(filePath, create, modify)) {
          // File not in create or modify — warning severity
          findings.push({
            file: filePath,
            location: `task ${task.taskNumber}`,
            description: `File "${filePath}" was modified in task ${task.taskNumber} but is not listed in create or modify.`,
            suggestion: 'Add this file to the task scope declaration or move the change to the correct task.',
            evidence: { taskNumber: task.taskNumber, violationType: 'outOfScope' },
          });
        }
      }
    }

    // Determine overall severity from findings
    let severity: CheckResult['severity'] = 'clean';
    for (const f of findings) {
      const evidence = f.evidence as Record<string, unknown> | undefined;
      if (evidence?.['violationType'] === 'doNotTouch') {
        severity = 'critical';
        break;
      }
    }
    if (severity !== 'critical' && findings.length > 0) {
      // Check if any are warnings (out-of-scope files or missing prefix) vs just info (legacy)
      const hasWarnings = findings.some((f) => {
        const evidence = f.evidence as Record<string, unknown> | undefined;
        return (
          evidence?.['violationType'] === 'outOfScope' ||
          f.location.startsWith('commit ')
        );
      });
      severity = hasWarnings ? 'warning' : 'info';
    }

    return {
      name: 'scope-creep',
      layer: 1,
      status: 'completed',
      severity,
      findings,
      errorMessage: null,
    };
  },
};

registerCheck(scopeCreepCheck);

export { scopeCreepCheck };
