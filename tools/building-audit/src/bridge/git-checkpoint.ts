// Git checkpoint operations for milestone tagging and rollback branches.
// DAY-ZERO contracts 2.10, 2.11
// Decision 4: lightweight tags. Decision 5: failures logged, not blocking.
// Decision 6: never overwrite existing tags or branches.
// Decision 10: raw git CLI via execFileSync (no shell, defense in depth).

import { execFileSync } from 'child_process';
import type { GitOpResult } from './types.js';

export type { GitOpResult } from './types.js';

export const TAG_PREFIX = 'building/milestone-';
export const BRANCH_PREFIX = 'building/rollback/';

// ---------- low-level wrappers ----------

/** Check whether `cwd` is inside a git work tree. */
export function isInsideWorkTree(cwd: string): boolean {
  try {
    const out = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return out.trim() === 'true';
  } catch {
    return false;
  }
}

/** Return whether a tag exists in the repo at `cwd`. */
export function tagExists(tagName: string, cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', `refs/tags/${tagName}`], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/** Return whether a branch exists in the repo at `cwd`. */
export function branchExists(branchName: string, cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', `refs/heads/${branchName}`], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/** Resolve a ref to its SHA, or return null if it does not exist. */
export function getRef(refName: string, cwd: string): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', '--verify', refName], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Create a lightweight tag if it does not already exist.
 * Decision 6: never overwrites an existing tag.
 */
export function createTagIfNotExists(
  tagName: string,
  cwd: string,
): GitOpResult {
  try {
    if (!isInsideWorkTree(cwd)) {
      return { created: false, ref: null, error: 'Not inside a git work tree' };
    }

    // If the tag already exists, return idempotent result
    const existingRef = getRef(`refs/tags/${tagName}`, cwd);
    if (existingRef) {
      return { created: false, ref: existingRef, error: null };
    }

    // Create lightweight tag at HEAD
    execFileSync('git', ['tag', tagName], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const newRef = getRef(`refs/tags/${tagName}`, cwd);
    return { created: true, ref: newRef, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { created: false, ref: null, error: message };
  }
}

/**
 * Create a branch from a given base ref.
 * Decision 6: never overwrites an existing branch.
 */
export function createBranch(
  branchName: string,
  baseRef: string,
  cwd: string,
): GitOpResult {
  try {
    if (!isInsideWorkTree(cwd)) {
      return { created: false, ref: null, error: 'Not inside a git work tree' };
    }

    // If the branch already exists, return idempotent result
    const existingRef = getRef(`refs/heads/${branchName}`, cwd);
    if (existingRef) {
      return { created: false, ref: existingRef, error: null };
    }

    // Verify the base ref exists
    const resolvedBase = getRef(baseRef, cwd);
    if (!resolvedBase) {
      return {
        created: false,
        ref: null,
        error: `Base ref not found: ${baseRef}`,
      };
    }

    execFileSync('git', ['branch', branchName, baseRef], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const newRef = getRef(`refs/heads/${branchName}`, cwd);
    return { created: true, ref: newRef, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { created: false, ref: null, error: message };
  }
}

// ---------- high-level composites ----------

/** Create the milestone start tag: `building/milestone-<name>/start`. */
export function tagMilestoneStart(
  milestoneName: string,
  cwd?: string,
): GitOpResult {
  const dir = cwd ?? process.cwd();
  const tagName = `${TAG_PREFIX}${milestoneName}/start`;
  return createTagIfNotExists(tagName, dir);
}

/** Create the milestone complete tag: `building/milestone-<name>/complete`. */
export function tagMilestoneComplete(
  milestoneName: string,
  cwd?: string,
): GitOpResult {
  const dir = cwd ?? process.cwd();
  const tagName = `${TAG_PREFIX}${milestoneName}/complete`;
  return createTagIfNotExists(tagName, dir);
}

/**
 * Create a rollback branch from the prior milestone's complete tag.
 * Falls back to the current milestone's start tag if no prior milestone
 * or prior complete tag is missing.
 * Decision 25: reports missing prerequisite tags at rollback time.
 */
export function createRollbackBranch(
  milestoneName: string,
  priorMilestoneName?: string,
  cwd?: string,
): GitOpResult {
  const dir = cwd ?? process.cwd();

  if (!isInsideWorkTree(dir)) {
    return { created: false, ref: null, error: 'Not inside a git work tree' };
  }

  const branchName = `${BRANCH_PREFIX}${milestoneName}`;

  // If the branch already exists, return idempotent result (Decision 6)
  const existingRef = getRef(`refs/heads/${branchName}`, dir);
  if (existingRef) {
    return { created: false, ref: existingRef, error: null };
  }

  // Try prior milestone's complete tag first
  if (priorMilestoneName) {
    const priorCompleteTag = `${TAG_PREFIX}${priorMilestoneName}/complete`;
    const priorRef = getRef(`refs/tags/${priorCompleteTag}`, dir);
    if (priorRef) {
      return createBranch(branchName, priorCompleteTag, dir);
    }
    // Fall through to start tag fallback — Decision 25: report the missing tag
  }

  // Fallback: current milestone's start tag
  const startTag = `${TAG_PREFIX}${milestoneName}/start`;
  const startRef = getRef(`refs/tags/${startTag}`, dir);
  if (startRef) {
    const result = createBranch(branchName, startTag, dir);
    // Decision 25: warn when falling back because prior complete tag was missing
    if (priorMilestoneName && result.ref) {
      const priorCompleteTag = `${TAG_PREFIX}${priorMilestoneName}/complete`;
      result.warning = `Prerequisite tag missing: ${priorCompleteTag}. Fell back to ${startTag}.`;
    }
    return result;
  }

  // No usable base ref found
  return {
    created: false,
    ref: null,
    error: `No base ref found for rollback branch. Checked: ${
      priorMilestoneName
        ? `${TAG_PREFIX}${priorMilestoneName}/complete, `
        : ''
    }${startTag}`,
  };
}
