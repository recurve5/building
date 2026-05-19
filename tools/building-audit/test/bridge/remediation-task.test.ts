// REM-001 through REM-007, REM-012: Remediation task generator tests.

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { generateRemediationTask } from '../../src/bridge/remediation-task.js';
import { parseTaskFile } from '../../src/parser/task-file-parser.js';
import { createFixtureProject } from './fixtures/fixture-factory.js';
import type { RemediationTaskSpec } from '../../src/bridge/types.js';

function makeSpec(overrides: Partial<RemediationTaskSpec> = {}): RemediationTaskSpec {
  return {
    originatingTaskNumber: 3,
    checkName: 'test-cheat',
    severity: 'warning',
    finding: {
      file: 'src/services/widget-service.ts',
      location: 'lines 42-58',
      description: 'Test uses toBeTruthy() instead of specific assertion.',
      suggestion: 'Replace toBeTruthy() with toEqual(expectedValue).',
    },
    remediationDepth: 0,
    ...overrides,
  };
}

describe('generateRemediationTask', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
  });

  // REM-001: Round-trip through parseTaskFile (highest-value test)
  it('REM-001: generated task file round-trips through parseTaskFile', async () => {
    const fixture = createFixtureProject({ tasks: [] });
    cleanups.push(fixture.cleanup);

    const milestonePath = join(fixture.path, 'm1-test');
    const spec = makeSpec();
    const result = await generateRemediationTask(milestonePath, spec);

    // Read the generated file
    const content = readFileSync(result.filePath, 'utf-8');
    const parsed = parseTaskFile(result.filePath, content);

    // Must not be a ParseError
    expect(parsed).not.toHaveProperty('reason');
    if ('reason' in parsed) return; // type guard

    expect(parsed.variant).toBe('fix');
    expect(parsed.reworkOf).toBe('003');
    expect(parsed.status).toBe('not started');
    expect(parsed.taskNumber).toBe(result.taskNumber);
    expect(parsed.whatToFix).toBeTruthy();
    expect(parsed.files.modify).toContain('src/services/widget-service.ts');
    expect(parsed.acceptanceCriteria.length).toBeGreaterThanOrEqual(2);
  });

  // REM-002: Sequential numbering respects existing tasks
  it('REM-002: sequential numbering respects existing tasks', async () => {
    const fixture = createFixtureProject({
      tasks: [
        { number: 1, name: 'setup', variant: 'full' },
        { number: 2, name: 'models', variant: 'full' },
        { number: 12, name: 'integration', variant: 'full' },
      ],
    });
    cleanups.push(fixture.cleanup);

    const milestonePath = join(fixture.path, 'm1-test');
    const spec = makeSpec();
    const result = await generateRemediationTask(milestonePath, spec);

    expect(result.taskNumber).toBe(13);
    expect(result.filePath).toContain('013-fix-');
  });

  // REM-003: Sequential numbering works with no existing tasks
  it('REM-003: sequential numbering works with no existing tasks', async () => {
    const fixture = createFixtureProject({ tasks: [] });
    cleanups.push(fixture.cleanup);

    const milestonePath = join(fixture.path, 'm1-test');
    const spec = makeSpec();
    const result = await generateRemediationTask(milestonePath, spec);

    expect(result.taskNumber).toBe(1);
    expect(result.filePath).toContain('001-fix-');
  });

  // REM-004: Generated file contains Audit Finding section
  it('REM-004: generated file contains Audit Finding section', async () => {
    const fixture = createFixtureProject({ tasks: [] });
    cleanups.push(fixture.cleanup);

    const milestonePath = join(fixture.path, 'm1-test');
    const spec = makeSpec();
    const result = await generateRemediationTask(milestonePath, spec);

    const content = readFileSync(result.filePath, 'utf-8');

    expect(content).toContain('## Audit Finding');
    expect(content).toContain('**Check:** test-cheat');
    expect(content).toContain('**Severity:** warning');
    expect(content).toContain('**File:** `src/services/widget-service.ts`');
    expect(content).toContain('**Location:** lines 42-58');
    expect(content).toContain('**Description:** Test uses toBeTruthy()');
    expect(content).toContain('**Suggestion:** Replace toBeTruthy()');
  });

  // REM-005: Generated file contains correct acceptance criteria
  it('REM-005: generated file contains correct acceptance criteria', async () => {
    const fixture = createFixtureProject({ tasks: [] });
    cleanups.push(fixture.cleanup);

    const milestonePath = join(fixture.path, 'm1-test');
    const spec = makeSpec();
    const result = await generateRemediationTask(milestonePath, spec);

    const content = readFileSync(result.filePath, 'utf-8');
    const parsed = parseTaskFile(result.filePath, content);

    expect(parsed).not.toHaveProperty('reason');
    if ('reason' in parsed) return;

    // AC 1: specific issue resolved
    expect(parsed.acceptanceCriteria[0].text).toContain('test-cheat');
    expect(parsed.acceptanceCriteria[0].text).toContain('widget-service.ts');

    // AC 2: originating task criteria still pass
    expect(parsed.acceptanceCriteria[1].text).toContain('003');
  });

  // REM-006: Rework of field references originating task number
  it('REM-006: rework of field references originating task number', async () => {
    const fixture = createFixtureProject({ tasks: [] });
    cleanups.push(fixture.cleanup);

    const milestonePath = join(fixture.path, 'm1-test');
    const spec = makeSpec({ originatingTaskNumber: 7 });
    const result = await generateRemediationTask(milestonePath, spec);

    const content = readFileSync(result.filePath, 'utf-8');
    const parsed = parseTaskFile(result.filePath, content);

    expect(parsed).not.toHaveProperty('reason');
    if ('reason' in parsed) return;

    expect(parsed.reworkOf).toBe('007');
    expect(parsed.variant).toBe('fix');
  });

  // REM-007: Multiple findings from same audit generate separate tasks
  it('REM-007: multiple findings from same audit generate separate tasks', async () => {
    const fixture = createFixtureProject({
      tasks: [
        { number: 5, name: 'existing', variant: 'full' },
      ],
    });
    cleanups.push(fixture.cleanup);

    const milestonePath = join(fixture.path, 'm1-test');

    const spec1 = makeSpec({
      checkName: 'test-cheat',
      finding: {
        file: 'src/a.ts',
        location: 'line 10',
        description: 'Weak assertion in test A.',
        suggestion: 'Fix A.',
      },
    });

    const spec2 = makeSpec({
      checkName: 'scope-creep',
      finding: {
        file: 'src/b.ts',
        location: 'line 20',
        description: 'Out-of-scope changes in B.',
        suggestion: 'Fix B.',
      },
    });

    const result1 = await generateRemediationTask(milestonePath, spec1);
    const result2 = await generateRemediationTask(milestonePath, spec2);

    expect(result1.taskNumber).toBe(6);
    expect(result2.taskNumber).toBe(7);
    expect(result1.filePath).not.toBe(result2.filePath);

    // Both round-trip
    const content1 = readFileSync(result1.filePath, 'utf-8');
    const content2 = readFileSync(result2.filePath, 'utf-8');
    const parsed1 = parseTaskFile(result1.filePath, content1);
    const parsed2 = parseTaskFile(result2.filePath, content2);

    expect(parsed1).not.toHaveProperty('reason');
    expect(parsed2).not.toHaveProperty('reason');
  });

  // REM-012: Task generation when tasks/ directory does not exist
  it('REM-012: task generation when tasks/ directory does not exist', async () => {
    const fixture = createFixtureProject({ tasks: [] });
    cleanups.push(fixture.cleanup);

    // Use a milestone path that doesn't have a tasks/ dir yet
    const milestonePath = join(fixture.path, 'm2-new-milestone');
    expect(existsSync(join(milestonePath, 'tasks'))).toBe(false);

    const spec = makeSpec();
    const result = await generateRemediationTask(milestonePath, spec);

    expect(result.taskNumber).toBe(1);
    expect(existsSync(result.filePath)).toBe(true);

    // Still round-trips
    const content = readFileSync(result.filePath, 'utf-8');
    const parsed = parseTaskFile(result.filePath, content);
    expect(parsed).not.toHaveProperty('reason');
  });
});
