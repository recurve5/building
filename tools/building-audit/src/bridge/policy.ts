// Policy table and classification logic for the audit bridge.
// XRD Section 6, Decisions 14, 15, 19, 21.

import type { CheckResult } from '../types/index.js';
import type { ClassifiedFinding } from './types.js';

export type Tier = 1 | 2 | 3;

export type Action = 'generate-task' | 'escalate';

export type AuditTrigger = 'task-complete' | 'milestone-close';

export interface PolicyEntry {
  tier: Tier;
  action: Action;
  /** When true, the tier depends on context. The classifier reads
      the finding's severity to disambiguate. */
  contextual: boolean;
  notes: string;
}

export const POLICY_TABLE: Record<string, PolicyEntry> = {
  // --- Layer 1 checks (inner loop) ---
  'test-cheat': {
    tier: 2,
    action: 'generate-task',
    contextual: false,
    notes: 'Reject weak assertions, generate fix task with assertion specifics.',
  },
  'scope-creep': {
    tier: 2,
    action: 'generate-task',
    contextual: false,
    notes: 'Revert out-of-scope files, retry with constraint explicit.',
  },
  'dependency-grab': {
    tier: 2,
    action: 'generate-task',
    contextual: false,
    notes: 'Revert added dependency unless justified in task contracts.',
  },
  'confidence-bluff': {
    tier: 2,
    action: 'generate-task',
    contextual: false,
    notes: 'Harness verifies claim deterministically; if false, fix task with specifics.',
  },
  'surface-heresy': {
    tier: 2,
    action: 'generate-task',
    contextual: false,
    notes: 'Remove ghost references mechanically.',
  },
  'premature-abstraction': {
    tier: 2,
    action: 'generate-task',
    contextual: true,
    notes: 'Tier 2 if removal is simple. Tier 3 if removal requires rework. Severity critical -> Tier 3.',
  },
  'unoptimized-defaults': {
    tier: 2,
    action: 'generate-task',
    contextual: true,
    notes: 'Tier 2 for well-defined fixes. Tier 3 if architectural. Severity critical -> Tier 3.',
  },
  'resource-drain': {
    tier: 2,
    action: 'generate-task',
    contextual: false,
    notes: 'Secret/credential leak detection. Generate fix task to remove.',
  },
  'fragility-metrics': {
    tier: 3,
    action: 'escalate',
    contextual: false,
    notes: 'Accumulating Fragility. SDM post-milestone surfaces refactor recommendations.',
  },

  // --- Layer 2 checks (outer loop, milestone close) ---
  'ghost-refactor': {
    tier: 3,
    action: 'escalate',
    contextual: false,
    notes: 'All Layer 2 findings are Tier 3 at milestone close (Decision 3).',
  },
  'clean-slate-bias': {
    tier: 3,
    action: 'escalate',
    contextual: false,
    notes: 'All Layer 2 findings are Tier 3 at milestone close (Decision 3).',
  },
  'deep-heresy': {
    tier: 3,
    action: 'escalate',
    contextual: false,
    notes: 'All Layer 2 findings are Tier 3 at milestone close (Decision 3).',
  },
  'document-heresy': {
    tier: 3,
    action: 'escalate',
    contextual: false,
    notes: 'All Layer 2 findings are Tier 3 at milestone close (Decision 3).',
  },
  'performance-critical': {
    tier: 3,
    action: 'escalate',
    contextual: false,
    notes: 'All Layer 2 findings are Tier 3 at milestone close (Decision 3).',
  },
  'react-fluidity': {
    tier: 3,
    action: 'escalate',
    contextual: false,
    notes: 'All Layer 2 findings are Tier 3 at milestone close (Decision 3).',
  },
  'refactoring-signals': {
    tier: 3,
    action: 'escalate',
    contextual: false,
    notes: 'All Layer 2 findings are Tier 3 at milestone close (Decision 3).',
  },
};

/**
 * Maximum depth of remediation tasks before escalating to Tier 3.
 * Depth 0 = original task. Depth 1 = first remediation. Any finding
 * at depth >= MAX_REMEDIATION_DEPTH escalates regardless of policy table.
 */
export const MAX_REMEDIATION_DEPTH = 1;

/**
 * Classify a finding into a tier and action based on the policy table.
 *
 * Decision 14: clean-slate-bias is Tier 2 per-task, Tier 3 at milestone close.
 * Decision 15: Unknown checks default to Tier 3.
 * Decision 19: trigger parameter enables Decision 14.
 */
export function classifyFinding(
  checkName: string,
  severity: CheckResult['severity'],
  remediationDepth: number,
  trigger: AuditTrigger,
): { tier: Tier; action: Action; source: ClassifiedFinding['source'] } {
  if (remediationDepth >= MAX_REMEDIATION_DEPTH) {
    return { tier: 3, action: 'escalate', source: 'depth_limit' };
  }

  const entry = POLICY_TABLE[checkName];
  if (!entry) {
    return { tier: 3, action: 'escalate', source: 'unknown_check' };
  }

  if (checkName === 'clean-slate-bias' && trigger === 'task-complete') {
    return { tier: 2, action: 'generate-task', source: 'policy_default' };
  }

  if (entry.contextual && severity === 'critical') {
    return { tier: 3, action: 'escalate', source: 'contextual_promotion' };
  }

  return { tier: entry.tier, action: entry.action, source: 'policy_default' };
}
