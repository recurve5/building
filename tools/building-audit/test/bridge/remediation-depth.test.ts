import { describe, it, expect } from 'vitest';
import { getRemediationDepth } from '../../src/bridge/remediation-depth.js';
import { classifyFinding } from '../../src/bridge/policy.js';
import type { ParsedTaskFile } from '../../src/types/index.js';

/** Build a minimal ParsedTaskFile with the fields relevant to depth tracking. */
function makeTask(overrides: Partial<ParsedTaskFile> = {}): ParsedTaskFile {
  return {
    filePath: overrides.filePath ?? '/tmp/tasks/001-example.md',
    variant: overrides.variant ?? 'full',
    taskNumber: overrides.taskNumber ?? 1,
    shortName: overrides.shortName ?? 'example',
    track: overrides.track ?? null,
    phase: overrides.phase ?? null,
    status: overrides.status ?? 'done',
    dependsOn: overrides.dependsOn ?? [],
    context: overrides.context ?? { defaults: [], taskSpecific: [] },
    reworkOf: overrides.reworkOf ?? null,
    whatToBuild: overrides.whatToBuild ?? 'Build something.',
    whatToFix: overrides.whatToFix ?? null,
    files: overrides.files ?? { create: [], modify: [], doNotTouch: [] },
    contracts: overrides.contracts ?? null,
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    tests: overrides.tests ?? [],
    deployment: overrides.deployment ?? null,
    executionPlan: overrides.executionPlan ?? null,
    notes: overrides.notes ?? null,
    completed: overrides.completed ?? null,
  };
}

describe('Remediation Depth Tracker', () => {
  // REM-008: Original task has remediation depth 0
  it('REM-008: original task (reworkOf null) has remediation depth 0', () => {
    const task = makeTask({ reworkOf: null });
    expect(getRemediationDepth(task)).toBe(0);
  });

  // REM-009: First remediation task has depth 1
  it('REM-009: first remediation task (reworkOf non-null) has depth 1', () => {
    const task = makeTask({ reworkOf: '7', variant: 'fix' });
    expect(getRemediationDepth(task)).toBe(1);
  });

  // REM-010: Finding on remediation task escalates to Tier 3
  it('REM-010: finding on remediation task escalates to Tier 3 via classifyFinding', () => {
    const task = makeTask({ reworkOf: '3', variant: 'fix' });
    const depth = getRemediationDepth(task);
    expect(depth).toBe(1);

    // test-cheat is normally Tier 2 / generate-task.
    // At depth 1 (>= MAX_REMEDIATION_DEPTH), it should escalate to Tier 3.
    const classification = classifyFinding('test-cheat', 'warning', depth, 'task-complete');
    expect(classification).toEqual({ tier: 3, action: 'escalate', source: 'depth_limit' });
  });

  // REM-011: Depth tracker follows Rework-of chain correctly
  // A hypothetical depth-2 chain (task C reworkOf B, B reworkOf A) still
  // returns depth 1 for task C — the function only inspects the immediate
  // reworkOf field, not the chain. This documents the Decision 22 limitation.
  it('REM-011: hypothetical depth-2 chain still returns depth 1 (no chain traversal)', () => {
    // Task A: original
    const taskA = makeTask({ taskNumber: 1, reworkOf: null });
    expect(getRemediationDepth(taskA)).toBe(0);

    // Task B: rework of A
    const taskB = makeTask({ taskNumber: 2, reworkOf: '1', variant: 'fix' });
    expect(getRemediationDepth(taskB)).toBe(1);

    // Task C: rework of B (hypothetical depth-2, but function reports 1)
    const taskC = makeTask({ taskNumber: 3, reworkOf: '2', variant: 'fix' });
    expect(getRemediationDepth(taskC)).toBe(1);

    // Any non-null reworkOf string yields depth 1, regardless of the value
    const taskD = makeTask({ taskNumber: 4, reworkOf: '13', variant: 'fix' });
    expect(getRemediationDepth(taskD)).toBe(1);
  });
});
