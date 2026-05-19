import { describe, it, expect } from 'vitest';
import {
  POLICY_TABLE,
  MAX_REMEDIATION_DEPTH,
  classifyFinding,
} from '../../src/bridge/policy.js';
import type { Action } from '../../src/bridge/policy.js';

const LAYER_1_CHECKS = [
  'test-cheat',
  'scope-creep',
  'dependency-grab',
  'confidence-bluff',
  'surface-heresy',
  'premature-abstraction',
  'unoptimized-defaults',
  'resource-drain',
  'fragility-metrics',
];

const LAYER_2_CHECKS = [
  'ghost-refactor',
  'clean-slate-bias',
  'deep-heresy',
  'document-heresy',
  'performance-critical',
  'react-fluidity',
  'refactoring-signals',
];

describe('Policy Table and Classifier', () => {
  // POL-001: Standard Tier 2 findings return generate-task action
  it('POL-001: standard Tier 2 findings return generate-task action', () => {
    const result = classifyFinding('test-cheat', 'warning', 0, 'task-complete');
    expect(result).toEqual({ tier: 2, action: 'generate-task' });
  });

  // POL-002: Tier 3 findings return escalate action
  it('POL-002: Tier 3 findings return escalate action', () => {
    const result = classifyFinding('fragility-metrics', 'warning', 0, 'task-complete');
    expect(result).toEqual({ tier: 3, action: 'escalate' });
  });

  // POL-003: Contextual checks promote to Tier 3 on critical severity
  it('POL-003: contextual checks promote to Tier 3 on critical severity', () => {
    const result = classifyFinding('premature-abstraction', 'critical', 0, 'task-complete');
    expect(result).toEqual({ tier: 3, action: 'block' });
  });

  // POL-004: Contextual checks stay Tier 2 on non-critical severity
  it('POL-004: contextual checks stay Tier 2 on non-critical severity', () => {
    const result = classifyFinding('premature-abstraction', 'warning', 0, 'task-complete');
    expect(result).toEqual({ tier: 2, action: 'generate-task' });
  });

  // POL-005: Remediation depth >= MAX_REMEDIATION_DEPTH escalates to Tier 3
  it('POL-005: remediation depth >= MAX_REMEDIATION_DEPTH escalates to Tier 3', () => {
    const result = classifyFinding('test-cheat', 'warning', 1, 'task-complete');
    expect(result).toEqual({ tier: 3, action: 'escalate' });
  });

  // POL-006: Remediation depth > MAX_REMEDIATION_DEPTH also escalates
  it('POL-006: remediation depth > MAX_REMEDIATION_DEPTH also escalates', () => {
    const result = classifyFinding('test-cheat', 'warning', 5, 'task-complete');
    expect(result).toEqual({ tier: 3, action: 'escalate' });
  });

  // POL-007: Unknown check name defaults to Tier 3
  it('POL-007: unknown check name defaults to Tier 3', () => {
    const result = classifyFinding('nonexistent-check', 'warning', 0, 'task-complete');
    expect(result).toEqual({ tier: 3, action: 'escalate' });
  });

  // POL-008: clean-slate-bias is Tier 2 on task-complete trigger
  it('POL-008: clean-slate-bias is Tier 2 on task-complete trigger', () => {
    const result = classifyFinding('clean-slate-bias', 'warning', 0, 'task-complete');
    expect(result).toEqual({ tier: 2, action: 'generate-task' });
  });

  // POL-009: clean-slate-bias is Tier 3 on milestone-close trigger
  it('POL-009: clean-slate-bias is Tier 3 on milestone-close trigger', () => {
    const result = classifyFinding('clean-slate-bias', 'warning', 0, 'milestone-close');
    expect(result).toEqual({ tier: 3, action: 'escalate' });
  });

  // POL-010: All Layer 2 check names present in POLICY_TABLE
  it('POL-010: all Layer 2 check names present in POLICY_TABLE', () => {
    for (const name of LAYER_2_CHECKS) {
      expect(POLICY_TABLE).toHaveProperty(name);
      expect(POLICY_TABLE[name].tier).toBe(3);
      expect(POLICY_TABLE[name].action).toBe('escalate');
    }
  });

  // POL-011: All Layer 1 check names present in POLICY_TABLE
  it('POL-011: all Layer 1 check names present in POLICY_TABLE', () => {
    for (const name of LAYER_1_CHECKS) {
      expect(POLICY_TABLE).toHaveProperty(name);
    }
    // Verify total count: 9 L1 + 7 L2 = 16
    expect(Object.keys(POLICY_TABLE)).toHaveLength(16);
  });

  // POL-012: classifyFinding handles clean severity
  it('POL-012: classifyFinding handles clean severity', () => {
    // clean severity on a non-contextual check should return normal policy entry
    const result = classifyFinding('test-cheat', 'clean', 0, 'task-complete');
    expect(result).toEqual({ tier: 2, action: 'generate-task' });
  });

  // POL-013: classifyFinding with info severity on non-contextual check
  it('POL-013: classifyFinding with info severity on non-contextual check', () => {
    const result = classifyFinding('scope-creep', 'info', 0, 'task-complete');
    expect(result).toEqual({ tier: 2, action: 'generate-task' });
  });

  // Decision 21 verification: Action type does not include 'fix-and-retry'
  it('Decision 21: no policy table entry uses fix-and-retry', () => {
    for (const [, entry] of Object.entries(POLICY_TABLE)) {
      expect(entry.action).not.toBe('fix-and-retry');
    }
    // Also verify the Action type at the type level:
    // 'fix-and-retry' is not assignable to Action. This is a compile-time check.
    // At runtime, verify no entry produces it.
    const actions = new Set(Object.values(POLICY_TABLE).map((e) => e.action));
    expect(actions).not.toContain('fix-and-retry');
  });

  // MAX_REMEDIATION_DEPTH is 1
  it('MAX_REMEDIATION_DEPTH is 1', () => {
    expect(MAX_REMEDIATION_DEPTH).toBe(1);
  });
});
