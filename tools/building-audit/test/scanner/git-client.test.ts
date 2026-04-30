import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { simpleGit, type SimpleGit } from 'simple-git';
import { getGitLog, buildFileToTaskMapping, parseTaskId } from '../../src/scanner/git-client.js';

// Helper: create a temp git repo with commits
async function createTempRepo(): Promise<{ path: string; git: SimpleGit }> {
  const path = await mkdtemp(join(tmpdir(), 'git-client-test-'));
  const git = simpleGit(path);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test');
  return { path, git };
}

async function addCommit(
  git: SimpleGit,
  repoPath: string,
  message: string,
  files: Record<string, string>,
): Promise<string> {
  for (const [name, content] of Object.entries(files)) {
    const filePath = join(repoPath, name);
    const dir = join(repoPath, ...name.split('/').slice(0, -1));
    if (name.includes('/')) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(filePath, content);
  }
  await git.add('.');
  const result = await git.commit(message);
  return result.commit;
}

describe('parseTaskId', () => {
  it('extracts numeric task ID from [NNN] prefix', () => {
    expect(parseTaskId('[003] implement feature')).toBe(3);
    expect(parseTaskId('[42] fix bug')).toBe(42);
    expect(parseTaskId('[100] refactor module')).toBe(100);
  });

  it('returns null when no prefix present', () => {
    expect(parseTaskId('fix bug without prefix')).toBeNull();
    expect(parseTaskId('Initial commit')).toBeNull();
    expect(parseTaskId('')).toBeNull();
  });

  it('returns null for malformed prefixes', () => {
    expect(parseTaskId('[abc] not a number')).toBeNull();
    expect(parseTaskId('[] empty brackets')).toBeNull();
    expect(parseTaskId('mid [003] message')).toBeNull();
  });
});

describe('getGitLog', () => {
  let repoPath: string;
  let git: SimpleGit;

  beforeEach(async () => {
    const repo = await createTempRepo();
    repoPath = repo.path;
    git = repo.git;
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  // SCN-001: Scanner assembles ProjectContext (git portion)
  it('extracts commits with hash, message, date, filesChanged, insertions, deletions', async () => {
    await addCommit(git, repoPath, '[001] add feature', { 'src/app.ts': 'const x = 1;\n' });
    await addCommit(git, repoPath, '[002] add utils', { 'src/utils.ts': 'export function foo() {}\n' });

    const commits = await getGitLog(repoPath);

    expect(commits).toHaveLength(2);
    // newest first
    const latest = commits[0];
    expect(latest.hash).toBeTruthy();
    expect(latest.message).toBe('[002] add utils');
    expect(latest.taskId).toBe(2);
    expect(latest.date).toBeTruthy();
    expect(latest.filesChanged).toContain('src/utils.ts');
    expect(latest.insertions).toBeGreaterThanOrEqual(1);

    const first = commits[1];
    expect(first.taskId).toBe(1);
    expect(first.filesChanged).toContain('src/app.ts');
  });

  // SC-003: Commit without task ID prefix
  it('commits without [TASK_ID] prefix have taskId = null', async () => {
    await addCommit(git, repoPath, 'Initial commit', { 'README.md': '# Test\n' });
    await addCommit(git, repoPath, '[001] add feature', { 'src/app.ts': 'code\n' });

    const commits = await getGitLog(repoPath);

    expect(commits).toHaveLength(2);
    const unattributed = commits.find((c) => c.message === 'Initial commit');
    expect(unattributed?.taskId).toBeNull();

    const attributed = commits.find((c) => c.taskId === 1);
    expect(attributed?.message).toBe('[001] add feature');
  });

  it('handles empty repo gracefully', async () => {
    const commits = await getGitLog(repoPath);
    expect(commits).toEqual([]);
  });

  it('handles non-git directory gracefully', async () => {
    const tempPath = await mkdtemp(join(tmpdir(), 'not-git-'));
    try {
      const commits = await getGitLog(tempPath);
      expect(commits).toEqual([]);
    } finally {
      await rm(tempPath, { recursive: true, force: true });
    }
  });

  // SCN-002: Milestone scoping filters correctly
  describe('milestone filtering', () => {
    it('returns only commits with matching task IDs plus unattributed commits', async () => {
      await addCommit(git, repoPath, 'Initial commit', { 'README.md': '# Test\n' });
      await addCommit(git, repoPath, '[001] task one', { 'src/a.ts': 'a\n' });
      await addCommit(git, repoPath, '[002] task two', { 'src/b.ts': 'b\n' });
      await addCommit(git, repoPath, '[003] task three', { 'src/c.ts': 'c\n' });

      const commits = await getGitLog(repoPath, { milestoneTaskIds: [1, 3] });

      // Should include task 1, task 3, and the unattributed Initial commit
      const taskIds = commits.map((c) => c.taskId);
      expect(taskIds).toContain(1);
      expect(taskIds).toContain(3);
      expect(taskIds).toContain(null);
      expect(taskIds).not.toContain(2);
    });

    it('returns all commits when milestoneTaskIds is empty', async () => {
      await addCommit(git, repoPath, '[001] task one', { 'src/a.ts': 'a\n' });
      await addCommit(git, repoPath, '[002] task two', { 'src/b.ts': 'b\n' });

      const commits = await getGitLog(repoPath, { milestoneTaskIds: [] });
      expect(commits).toHaveLength(2);
    });
  });

  // Convention-start filtering (Decision 19)
  describe('conventionStartHash', () => {
    it('commits before convention start have taskId=null regardless of message', async () => {
      // Commit 1 (oldest): has prefix but is before convention start
      const hash1 = await addCommit(git, repoPath, '[001] old commit with prefix', {
        'old.ts': 'old\n',
      });
      // Commit 2: this is the convention start
      const hash2 = await addCommit(git, repoPath, '[002] convention starts here', {
        'start.ts': 'start\n',
      });
      // Commit 3: after convention start
      await addCommit(git, repoPath, '[003] new commit', { 'new.ts': 'new\n' });

      const commits = await getGitLog(repoPath, { conventionStartHash: hash2 });

      // Commit 1 should have taskId=null (before convention)
      const oldCommit = commits.find((c) => c.message.includes('old commit'));
      expect(oldCommit?.taskId).toBeNull();

      // Commit 2 (convention start) should be parsed normally
      const startCommit = commits.find((c) => c.message.includes('convention starts'));
      expect(startCommit?.taskId).toBe(2);

      // Commit 3 should be parsed normally
      const newCommit = commits.find((c) => c.message.includes('new commit'));
      expect(newCommit?.taskId).toBe(3);
    });

    it('works with abbreviated hashes', async () => {
      await addCommit(git, repoPath, '[001] before', { 'a.ts': 'a\n' });
      const hash2 = await addCommit(git, repoPath, '[002] start', { 'b.ts': 'b\n' });
      await addCommit(git, repoPath, '[003] after', { 'c.ts': 'c\n' });

      // Use short hash (7 chars)
      const shortHash = hash2.substring(0, 7);
      const commits = await getGitLog(repoPath, { conventionStartHash: shortHash });

      const before = commits.find((c) => c.message.includes('before'));
      expect(before?.taskId).toBeNull();

      const after = commits.find((c) => c.message.includes('after'));
      expect(after?.taskId).toBe(3);
    });
  });

  // SC-005: Legacy project auto-detect (data layer -- >90% without prefix)
  it('legacy project: most commits without prefix still have taskId=null', async () => {
    // Simulate a legacy project: 10 commits, only 1 has prefix
    for (let i = 0; i < 9; i++) {
      await addCommit(git, repoPath, `commit ${i} no prefix`, {
        [`file${i}.ts`]: `content ${i}\n`,
      });
    }
    await addCommit(git, repoPath, '[001] first tagged commit', {
      'tagged.ts': 'tagged\n',
    });

    const commits = await getGitLog(repoPath);
    const withPrefix = commits.filter((c) => c.taskId !== null);
    const withoutPrefix = commits.filter((c) => c.taskId === null);

    expect(withoutPrefix.length).toBe(9);
    expect(withPrefix.length).toBe(1);
    // > 90% without prefix
    expect(withoutPrefix.length / commits.length).toBeGreaterThanOrEqual(0.9);
  });
});

describe('buildFileToTaskMapping', () => {
  it('maps files to task IDs from commits', () => {
    const commits = [
      {
        hash: 'aaa',
        message: '[001] add app',
        taskId: 1,
        date: '2026-04-13',
        filesChanged: ['src/app.ts', 'src/utils.ts'],
        insertions: 10,
        deletions: 0,
      },
      {
        hash: 'bbb',
        message: '[002] add tests',
        taskId: 2,
        date: '2026-04-13',
        filesChanged: ['src/app.ts', 'test/app.test.ts'],
        insertions: 20,
        deletions: 5,
      },
    ];

    const mapping = buildFileToTaskMapping(commits);

    expect(mapping.get('src/app.ts')).toEqual([1, 2]);
    expect(mapping.get('src/utils.ts')).toEqual([1]);
    expect(mapping.get('test/app.test.ts')).toEqual([2]);
  });

  it('excludes commits with taskId=null', () => {
    const commits = [
      {
        hash: 'aaa',
        message: 'Initial commit',
        taskId: null,
        date: '2026-04-13',
        filesChanged: ['README.md'],
        insertions: 1,
        deletions: 0,
      },
      {
        hash: 'bbb',
        message: '[001] add feature',
        taskId: 1,
        date: '2026-04-13',
        filesChanged: ['src/app.ts'],
        insertions: 10,
        deletions: 0,
      },
    ];

    const mapping = buildFileToTaskMapping(commits);

    expect(mapping.has('README.md')).toBe(false);
    expect(mapping.get('src/app.ts')).toEqual([1]);
  });

  it('deduplicates task IDs per file', () => {
    const commits = [
      {
        hash: 'aaa',
        message: '[001] first change',
        taskId: 1,
        date: '2026-04-13',
        filesChanged: ['src/app.ts'],
        insertions: 5,
        deletions: 0,
      },
      {
        hash: 'bbb',
        message: '[001] second change',
        taskId: 1,
        date: '2026-04-13',
        filesChanged: ['src/app.ts'],
        insertions: 3,
        deletions: 1,
      },
    ];

    const mapping = buildFileToTaskMapping(commits);

    expect(mapping.get('src/app.ts')).toEqual([1]);
  });

  it('returns empty map for empty commits', () => {
    const mapping = buildFileToTaskMapping([]);
    expect(mapping.size).toBe(0);
  });
});
