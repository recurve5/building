import { simpleGit, type SimpleGit, type LogResult, type DefaultLogFields } from 'simple-git';
import type { GitCommit } from '../types/index.js';

/**
 * Parse [TASK_ID] prefix from a commit message.
 * Pattern: /^\[(\d+)\]/ — extracts numeric task ID, returns null if absent.
 */
export function parseTaskId(message: string): number | null {
  const match = message.match(/^\[(\d+)\]/);
  return match ? parseInt(match[1], 10) : null;
}

export interface GitLogOptions {
  milestoneTaskIds?: number[];
  conventionStartHash?: string;
}

/**
 * Extract commit history from a git repository as GitCommit[].
 *
 * - Parses [TASK_ID] prefix from each commit message.
 * - When conventionStartHash is provided, commits before that hash get taskId=null
 *   regardless of message content.
 * - When milestoneTaskIds is provided, filters to commits whose taskId is in the list
 *   plus unattributed commits (taskId=null) that touch files in the milestone directory.
 *
 * Uses simple-git library API — never child_process.exec (XRD FINDING-1).
 */
export async function getGitLog(
  projectPath: string,
  options?: GitLogOptions,
): Promise<GitCommit[]> {
  const git: SimpleGit = simpleGit(projectPath);

  // Check if this is a valid git repo with commits
  try {
    await git.log(['--oneline', '-1']);
  } catch {
    // Empty repo or not a git repo — return empty array
    return [];
  }

  // Get full log with diff stats
  const log: LogResult<DefaultLogFields> = await git.log(['--stat', '--stat-width=1000']);

  if (!log.all || log.all.length === 0) {
    return [];
  }

  // If conventionStartHash is set, find its position to determine which commits
  // are "before" it (older). Git log returns newest-first.
  let conventionStartIndex = -1;
  if (options?.conventionStartHash) {
    conventionStartIndex = log.all.findIndex(
      (entry) => entry.hash.startsWith(options.conventionStartHash!) ||
                  options.conventionStartHash!.startsWith(entry.hash),
    );
  }

  // Build GitCommit[] with per-commit file lists and diff stats
  const commits: GitCommit[] = [];

  for (let i = 0; i < log.all.length; i++) {
    const entry = log.all[i];

    // Determine if this commit is before the convention start
    const isBeforeConvention = conventionStartIndex !== -1 && i > conventionStartIndex;

    const taskId = isBeforeConvention ? null : parseTaskId(entry.message);

    // Parse diff stat from the entry
    const diffStat = entry.diff;
    const filesChanged: string[] = diffStat?.files?.map((f) => f.file) ?? [];
    const insertions = diffStat?.insertions ?? 0;
    const deletions = diffStat?.deletions ?? 0;

    commits.push({
      hash: entry.hash,
      message: entry.message,
      taskId,
      date: entry.date,
      filesChanged,
      insertions,
      deletions,
    });
  }

  // Apply milestone filtering if milestoneTaskIds provided
  if (options?.milestoneTaskIds && options.milestoneTaskIds.length > 0) {
    const taskIdSet = new Set(options.milestoneTaskIds);
    return commits.filter((commit) => {
      // Include commits with matching task IDs
      if (commit.taskId !== null && taskIdSet.has(commit.taskId)) {
        return true;
      }
      // Include unattributed commits — downstream consumers decide relevance
      if (commit.taskId === null) {
        return true;
      }
      return false;
    });
  }

  return commits;
}

/**
 * Build a mapping from file paths to the task IDs that touched them.
 * Commits with taskId=null are excluded from the mapping.
 */
export function buildFileToTaskMapping(commits: GitCommit[]): Map<string, number[]> {
  const mapping = new Map<string, number[]>();

  for (const commit of commits) {
    if (commit.taskId === null) continue;

    for (const file of commit.filesChanged) {
      const existing = mapping.get(file);
      if (existing) {
        if (!existing.includes(commit.taskId)) {
          existing.push(commit.taskId);
        }
      } else {
        mapping.set(file, [commit.taskId]);
      }
    }
  }

  return mapping;
}
