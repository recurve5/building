// Git state writer.
// Writes GitOpResult records to the top-level `git` field in state.json.
// DAY-ZERO contract 2.16, Decision 11 (top-level), Decision 16 (schema v2 unchanged).

import { readFileSync, writeFileSync } from 'fs';
import type { GitOpResult, StateGit } from './types.js';

/** Default empty StateGit — used when the `git` field is missing from state. */
function emptyStateGit(): StateGit {
  return {
    startTag: { created: false, ref: null, error: null },
    completeTag: { created: false, ref: null, error: null },
    rollbackBranch: { created: false, ref: null, error: null },
  };
}

/**
 * Write a GitOpResult to a specific field of the top-level `git` object in state.json.
 *
 * - Reads the file, parses JSON, updates `state.git.<field>`, writes back.
 * - If the `git` field does not exist, creates it with defaults before writing.
 * - If the file does not exist, throws (state.json should already exist by this point).
 */
export function writeGitState(
  statePath: string,
  field: 'startTag' | 'completeTag' | 'rollbackBranch',
  result: GitOpResult,
): void {
  const raw = readFileSync(statePath, 'utf-8');
  const state = JSON.parse(raw) as Record<string, unknown>;

  // Initialize git field if missing (backward-compatible with pre-M2 state)
  if (
    state.git == null ||
    typeof state.git !== 'object' ||
    Array.isArray(state.git)
  ) {
    state.git = emptyStateGit();
  }

  (state.git as StateGit)[field] = result;

  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}
