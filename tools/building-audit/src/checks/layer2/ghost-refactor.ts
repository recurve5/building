import type { Check, CheckResult, Finding, ProjectContext, LLMClient, CandidateDump } from '../types.js';
import { registerCheck } from '../registry.js';

// ---------------------------------------------------------------------------
// Ghost Refactor Check (Layer 2)
// ---------------------------------------------------------------------------
// Identifies commits with large diffs (>200 lines) on tasks that are NOT
// labeled as refactoring, then asks the LLM whether the rewrite was necessary
// to accomplish the task's stated goal.

const LARGE_DIFF_THRESHOLD = 200;
const REFACTOR_PATTERN = /refactor|restructure/i;

interface Candidate {
  commit: { hash: string; message: string; insertions: number; deletions: number };
  task: { taskNumber: number; shortName: string; whatToBuild: string | null };
}

function isRefactoringTask(task: { shortName: string; whatToBuild: string | null }): boolean {
  if (REFACTOR_PATTERN.test(task.shortName)) return true;
  if (task.whatToBuild && REFACTOR_PATTERN.test(task.whatToBuild)) return true;
  return false;
}

function findCandidates(context: ProjectContext): Candidate[] {
  const candidates: Candidate[] = [];
  const taskMap = new Map(context.taskFiles.map((t) => [t.taskNumber, t]));

  for (const commit of context.gitLog) {
    if (commit.taskId === null) continue;
    const totalDiff = commit.insertions + commit.deletions;
    if (totalDiff <= LARGE_DIFF_THRESHOLD) continue;

    const task = taskMap.get(commit.taskId);
    if (!task) continue;
    if (isRefactoringTask(task)) continue;

    candidates.push({
      commit: {
        hash: commit.hash,
        message: commit.message,
        insertions: commit.insertions,
        deletions: commit.deletions,
      },
      task: {
        taskNumber: task.taskNumber,
        shortName: task.shortName,
        whatToBuild: task.whatToBuild,
      },
    });
  }

  return candidates;
}

function buildPrompt(candidate: Candidate): string {
  return [
    'This diff was produced by a task that is not a refactoring task.',
    'Was this rewrite necessary to accomplish the task\'s stated goal, or is it a stylistic rewrite of working code?',
    '',
    `Task goal: ${candidate.task.whatToBuild ?? '(not specified)'}`,
    `Commit message: ${candidate.commit.message}`,
    `Diff size: +${candidate.commit.insertions} -${candidate.commit.deletions} lines`,
  ].join('\n');
}

type Verdict = 'unnecessary' | 'necessary' | 'ambiguous';

function parseVerdict(response: string): Verdict {
  const lower = response.toLowerCase();
  if (/\b(unnecessary|stylistic|not needed)\b/.test(lower)) return 'unnecessary';
  if (/\b(necessary|required|needed)\b/.test(lower)) return 'necessary';
  return 'ambiguous';
}

export const ghostRefactorCheck: Check = {
  name: 'ghost-refactor',
  layer: 2,

  dumpCandidates(context: ProjectContext): CandidateDump {
    const candidates = findCandidates(context);
    return { check: 'ghost-refactor', count: candidates.length, candidates };
  },

  async run(context: ProjectContext, llmClient?: LLMClient): Promise<CheckResult> {
    if (!llmClient) {
      return {
        name: 'ghost-refactor',
        layer: 2,
        status: 'skipped',
        severity: 'clean',
        findings: [],
        errorMessage: 'No LLM client provided',
      };
    }

    const candidates = findCandidates(context);

    // Decision 7: zero candidates → clean, no LLM call.
    if (candidates.length === 0) {
      return {
        name: 'ghost-refactor',
        layer: 2,
        status: 'completed',
        severity: 'clean',
        findings: [],
        errorMessage: null,
      };
    }

    const findings: Finding[] = [];
    let totalInput = 0;
    let totalOutput = 0;

    for (const candidate of candidates) {
      const prompt = buildPrompt(candidate);
      const response = await llmClient.query(prompt);
      totalInput += response.usage.input;
      totalOutput += response.usage.output;

      const verdict = parseVerdict(response.content);

      if (verdict === 'unnecessary') {
        findings.push({
          file: `commit:${candidate.commit.hash}`,
          location: `task ${candidate.task.taskNumber}`,
          description: `Large diff (+${candidate.commit.insertions} -${candidate.commit.deletions}) on non-refactoring task "${candidate.task.shortName}" appears to be an unnecessary rewrite`,
          suggestion: 'Verify the rewrite was required to meet the task goal; stylistic rewrites of working code waste tokens and introduce risk',
          evidence: {
            commitMessage: candidate.commit.message,
            taskGoal: candidate.task.whatToBuild,
            llmVerdict: verdict,
          },
        });
      } else if (verdict === 'ambiguous') {
        findings.push({
          file: `commit:${candidate.commit.hash}`,
          location: `task ${candidate.task.taskNumber}`,
          description: `Large diff (+${candidate.commit.insertions} -${candidate.commit.deletions}) on non-refactoring task "${candidate.task.shortName}" — LLM could not determine if rewrite was necessary`,
          suggestion: 'Manually review whether this rewrite was required or stylistic',
          evidence: {
            commitMessage: candidate.commit.message,
            taskGoal: candidate.task.whatToBuild,
            llmVerdict: verdict,
          },
        });
      }
      // verdict === 'necessary' → no finding
    }

    // Determine overall severity from findings.
    let severity: 'warning' | 'info' | 'clean' = 'clean';
    if (findings.some((f) => f.evidence?.['llmVerdict'] === 'unnecessary')) {
      severity = 'warning';
    } else if (findings.length > 0) {
      severity = 'info';
    }

    return {
      name: 'ghost-refactor',
      layer: 2,
      status: 'completed',
      severity,
      findings,
      errorMessage: null,
      tokenUsage: { input: totalInput, output: totalOutput },
    };
  },
};

registerCheck(ghostRefactorCheck);
