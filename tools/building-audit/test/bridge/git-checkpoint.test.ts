import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import {
  isInsideWorkTree,
  tagExists,
  branchExists,
  getRef,
  createTagIfNotExists,
  createBranch,
  tagMilestoneStart,
  tagMilestoneComplete,
  createRollbackBranch,
  TAG_PREFIX,
  BRANCH_PREFIX,
} from '../../src/bridge/git-checkpoint.js';

/** Create a temp git repo with one commit. Returns path and cleanup fn. */
function makeRepo(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'git-checkpoint-test-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], {
    cwd: dir,
    stdio: 'pipe',
  });
  execFileSync('git', ['config', 'user.name', 'Test'], {
    cwd: dir,
    stdio: 'pipe',
  });
  execFileSync('git', ['commit', '--allow-empty', '-m', 'initial commit'], {
    cwd: dir,
    stdio: 'pipe',
  });
  return {
    path: dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** Get HEAD SHA in a repo. */
function headSha(cwd: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();
}

// Accumulate cleanups to run after each test
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe('Git Checkpoint Operations', () => {
  // ---------- GIT-001: tagMilestoneStart creates tag at HEAD ----------
  it('GIT-001: tagMilestoneStart creates tag at HEAD', () => {
    const repo = makeRepo();
    cleanups.push(repo.cleanup);

    const result = tagMilestoneStart('m1-test', repo.path);
    expect(result.created).toBe(true);
    expect(result.error).toBeNull();
    expect(result.ref).toBe(headSha(repo.path));
    expect(tagExists(`${TAG_PREFIX}m1-test/start`, repo.path)).toBe(true);
  });

  // ---------- GIT-002: tagMilestoneComplete creates tag at HEAD ----------
  it('GIT-002: tagMilestoneComplete creates tag at HEAD', () => {
    const repo = makeRepo();
    cleanups.push(repo.cleanup);

    const result = tagMilestoneComplete('m1-test', repo.path);
    expect(result.created).toBe(true);
    expect(result.error).toBeNull();
    expect(result.ref).toBe(headSha(repo.path));
    expect(tagExists(`${TAG_PREFIX}m1-test/complete`, repo.path)).toBe(true);
  });

  // ---------- GIT-003: Existing start tag is not overwritten ----------
  it('GIT-003: existing start tag is not overwritten (idempotency)', () => {
    const repo = makeRepo();
    cleanups.push(repo.cleanup);

    const first = tagMilestoneStart('m1-test', repo.path);
    expect(first.created).toBe(true);
    const originalRef = first.ref;

    // Add another commit so HEAD changes
    execFileSync('git', ['commit', '--allow-empty', '-m', 'second commit'], {
      cwd: repo.path,
      stdio: 'pipe',
    });

    const second = tagMilestoneStart('m1-test', repo.path);
    expect(second.created).toBe(false);
    expect(second.ref).toBe(originalRef);
    expect(second.error).toBeNull();
  });

  // ---------- GIT-004: Existing complete tag is not overwritten ----------
  it('GIT-004: existing complete tag is not overwritten (idempotency)', () => {
    const repo = makeRepo();
    cleanups.push(repo.cleanup);

    const first = tagMilestoneComplete('m1-test', repo.path);
    expect(first.created).toBe(true);
    const originalRef = first.ref;

    execFileSync('git', ['commit', '--allow-empty', '-m', 'second commit'], {
      cwd: repo.path,
      stdio: 'pipe',
    });

    const second = tagMilestoneComplete('m1-test', repo.path);
    expect(second.created).toBe(false);
    expect(second.ref).toBe(originalRef);
    expect(second.error).toBeNull();
  });

  // ---------- GIT-005: createRollbackBranch from prior milestone's complete tag ----------
  it('GIT-005: createRollbackBranch from prior milestone complete tag', () => {
    const repo = makeRepo();
    cleanups.push(repo.cleanup);

    // Create prior milestone's complete tag
    tagMilestoneComplete('m1-prior', repo.path);
    const priorRef = headSha(repo.path);

    // Add a commit for the current milestone
    execFileSync('git', ['commit', '--allow-empty', '-m', 'milestone 2 work'], {
      cwd: repo.path,
      stdio: 'pipe',
    });

    const result = createRollbackBranch('m2-current', 'm1-prior', repo.path);
    expect(result.created).toBe(true);
    expect(result.ref).toBe(priorRef);
    expect(result.error).toBeNull();
    // No warning when prior complete tag exists (happy path)
    expect(result.warning).toBeUndefined();
    expect(branchExists(`${BRANCH_PREFIX}m2-current`, repo.path)).toBe(true);
  });

  // ---------- GIT-006: createRollbackBranch falls back to current start tag ----------
  it('GIT-006: createRollbackBranch falls back to start tag when no prior milestone', () => {
    const repo = makeRepo();
    cleanups.push(repo.cleanup);

    tagMilestoneStart('m1-first', repo.path);
    const startRef = headSha(repo.path);

    execFileSync('git', ['commit', '--allow-empty', '-m', 'work'], {
      cwd: repo.path,
      stdio: 'pipe',
    });

    // No prior milestone name provided
    const result = createRollbackBranch('m1-first', undefined, repo.path);
    expect(result.created).toBe(true);
    expect(result.ref).toBe(startRef);
    expect(result.error).toBeNull();
    // No warning when no prior milestone was specified (not a missing prerequisite)
    expect(result.warning).toBeUndefined();
  });

  // ---------- GIT-007: createRollbackBranch falls back to start tag when prior complete missing ----------
  it('GIT-007: createRollbackBranch falls back to start tag when prior complete tag missing', () => {
    const repo = makeRepo();
    cleanups.push(repo.cleanup);

    // Create start tag for current milestone but no complete tag for prior
    tagMilestoneStart('m2-current', repo.path);
    const startRef = headSha(repo.path);

    execFileSync('git', ['commit', '--allow-empty', '-m', 'work'], {
      cwd: repo.path,
      stdio: 'pipe',
    });

    // Prior milestone name provided but its complete tag does not exist
    const result = createRollbackBranch('m2-current', 'm1-prior', repo.path);
    expect(result.created).toBe(true);
    expect(result.ref).toBe(startRef);
    expect(result.error).toBeNull();
    // Decision 25: reports missing prerequisite tag
    expect(result.warning).toContain('Prerequisite tag missing');
    expect(result.warning).toContain('m1-prior/complete');
  });

  // ---------- GIT-008: createRollbackBranch fails gracefully when base ref not found ----------
  it('GIT-008: createRollbackBranch fails gracefully when no base ref found', () => {
    const repo = makeRepo();
    cleanups.push(repo.cleanup);

    // No tags exist at all
    const result = createRollbackBranch('m2-current', 'm1-prior', repo.path);
    expect(result.created).toBe(false);
    expect(result.ref).toBeNull();
    expect(result.error).toContain('No base ref found');
  });

  // ---------- GIT-009: Existing rollback branch is not overwritten ----------
  it('GIT-009: existing rollback branch is not overwritten', () => {
    const repo = makeRepo();
    cleanups.push(repo.cleanup);

    tagMilestoneStart('m1-test', repo.path);
    const first = createRollbackBranch('m1-test', undefined, repo.path);
    expect(first.created).toBe(true);
    const originalRef = first.ref;

    execFileSync('git', ['commit', '--allow-empty', '-m', 'more work'], {
      cwd: repo.path,
      stdio: 'pipe',
    });

    const second = createRollbackBranch('m1-test', undefined, repo.path);
    expect(second.created).toBe(false);
    expect(second.ref).toBe(originalRef);
    expect(second.error).toBeNull();
  });

  // ---------- GIT-010: Not a git repo returns error for all operations ----------
  it('GIT-010: non-git directory returns error for all operations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'not-a-repo-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));

    expect(isInsideWorkTree(dir)).toBe(false);
    expect(tagExists('any-tag', dir)).toBe(false);
    expect(branchExists('any-branch', dir)).toBe(false);
    expect(getRef('HEAD', dir)).toBeNull();

    const tagResult = createTagIfNotExists('test-tag', dir);
    expect(tagResult.created).toBe(false);
    expect(tagResult.error).toBe('Not inside a git work tree');

    const branchResult = createBranch('test-branch', 'HEAD', dir);
    expect(branchResult.created).toBe(false);
    expect(branchResult.error).toBe('Not inside a git work tree');

    const startResult = tagMilestoneStart('m1-test', dir);
    expect(startResult.created).toBe(false);
    expect(startResult.error).toBe('Not inside a git work tree');

    const completeResult = tagMilestoneComplete('m1-test', dir);
    expect(completeResult.created).toBe(false);
    expect(completeResult.error).toBe('Not inside a git work tree');

    const rollbackResult = createRollbackBranch('m1-test', undefined, dir);
    expect(rollbackResult.created).toBe(false);
    expect(rollbackResult.error).toBe('Not inside a git work tree');
  });

  // ---------- GIT-011: Tags are lightweight, not annotated ----------
  it('GIT-011: tags are lightweight (git cat-file -t returns commit)', () => {
    const repo = makeRepo();
    cleanups.push(repo.cleanup);

    tagMilestoneStart('m1-test', repo.path);
    const tagName = `${TAG_PREFIX}m1-test/start`;

    const objectType = execFileSync(
      'git',
      ['cat-file', '-t', tagName],
      { cwd: repo.path, encoding: 'utf-8', stdio: 'pipe' },
    ).trim();

    expect(objectType).toBe('commit');
  });

  // ---------- GIT-012: Tag name uses correct format ----------
  it('GIT-012: tag name uses correct format with milestone name', () => {
    const repo = makeRepo();
    cleanups.push(repo.cleanup);

    tagMilestoneStart('m2-audit-and-git', repo.path);
    tagMilestoneComplete('m2-audit-and-git', repo.path);

    expect(tagExists('building/milestone-m2-audit-and-git/start', repo.path)).toBe(true);
    expect(tagExists('building/milestone-m2-audit-and-git/complete', repo.path)).toBe(true);
  });

  // ---------- GIT-013: Git operations in detached HEAD state ----------
  it('GIT-013: operations work in detached HEAD state', () => {
    const repo = makeRepo();
    cleanups.push(repo.cleanup);

    const sha = headSha(repo.path);
    execFileSync('git', ['checkout', '--detach', sha], {
      cwd: repo.path,
      stdio: 'pipe',
    });

    expect(isInsideWorkTree(repo.path)).toBe(true);

    const tagResult = tagMilestoneStart('m1-detached', repo.path);
    expect(tagResult.created).toBe(true);
    expect(tagResult.ref).toBe(sha);

    const completeResult = tagMilestoneComplete('m1-detached', repo.path);
    expect(completeResult.created).toBe(true);
    expect(completeResult.ref).toBe(sha);
  });

  // ---------- GIT-014: Milestone name with special characters ----------
  it('GIT-014: milestone name with special characters in tag', () => {
    const repo = makeRepo();
    cleanups.push(repo.cleanup);

    // Hyphens and dots are common in milestone names
    const result = tagMilestoneStart('m1-audit.v2', repo.path);
    expect(result.created).toBe(true);
    expect(result.error).toBeNull();
    expect(tagExists(`${TAG_PREFIX}m1-audit.v2/start`, repo.path)).toBe(true);
  });

  // ---------- GIT-015: Milestone name with path separators ----------
  it('GIT-015: milestone name with path separators creates hierarchical ref', () => {
    const repo = makeRepo();
    cleanups.push(repo.cleanup);

    // Git allows hierarchical refs (slashes in tag names create directory structure)
    const result = tagMilestoneStart('m1/sub-milestone', repo.path);
    expect(result.created).toBe(true);
    expect(result.error).toBeNull();

    // Verify the tag exists and resolves
    const tagName = `${TAG_PREFIX}m1/sub-milestone/start`;
    expect(tagExists(tagName, repo.path)).toBe(true);
    expect(getRef(`refs/tags/${tagName}`, repo.path)).toBe(headSha(repo.path));
  });
});
