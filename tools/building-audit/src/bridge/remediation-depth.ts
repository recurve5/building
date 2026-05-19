// Remediation depth tracker.
// DAY-ZERO 2.9, Decision 22: if task has reworkOf, depth is 1. No chain traversal.

import type { ParsedTaskFile } from '../types/index.js';

/**
 * Return the remediation depth of a task.
 *
 * Decision 22: depth is 0 for original tasks, 1 for any task with a
 * non-null `reworkOf` field. Chain traversal is intentionally omitted —
 * the function inspects only the immediate field.
 */
export function getRemediationDepth(task: ParsedTaskFile): number {
  return task.reworkOf !== null ? 1 : 0;
}
