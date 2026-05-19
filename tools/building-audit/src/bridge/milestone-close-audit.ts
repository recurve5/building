// Milestone-close audit bridge: dumps Layer 2 candidates for external judgment.
// XRD Section 3, DAY-ZERO 2.7, Peer Review Issue #7.

import './register-checks.js';
import { scanProject } from '../scanner/project-scanner.js';
import { getChecks } from '../checks/registry.js';
import type { CandidateDump } from '../types/index.js';

/**
 * Scan the project and collect Layer 2 candidate dumps for external judgment.
 *
 * Each Layer 2 check's `dumpCandidates` is called. Checks that lack the method
 * or throw during execution produce an entry in the `errors` map. Other checks
 * still run — a single failure does not prevent partial results.
 *
 * Returns candidates (not findings). The orchestrator applies LLM judgment
 * separately (Tasks 007-008).
 */
export async function runMilestoneCloseAudit(
  projectPath: string,
  milestone: string,
): Promise<{
  candidates: Map<string, CandidateDump>;
  errors: Map<string, string>;
}> {
  // Step 1: Scan project to build context
  const context = await scanProject(projectPath, milestone);

  // Step 2: Get all Layer 2 checks from registry
  const layer2Checks = getChecks(2);

  const candidates = new Map<string, CandidateDump>();
  const errors = new Map<string, string>();

  // Step 3: Call dumpCandidates on each check
  for (const check of layer2Checks) {
    if (typeof check.dumpCandidates !== 'function') {
      // Peer Review Issue #7: checks without dumpCandidates get an error entry
      errors.set(
        check.name,
        `Check "${check.name}" does not implement dumpCandidates`,
      );
      continue;
    }

    try {
      const dump = check.dumpCandidates(context);
      candidates.set(check.name, dump);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.set(check.name, message);
    }
  }

  return { candidates, errors };
}
