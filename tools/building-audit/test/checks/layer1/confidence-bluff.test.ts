import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearRegistry } from '../../../src/checks/registry.js';
import { confidenceBluff } from '../../../src/checks/layer1/confidence-bluff.js';
import { createProjectContext, createTaskFile, createAnalyzedFile, createGitCommit } from '../../factories/index.js';

beforeEach(() => {
  clearRegistry();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('confidence-bluff', () => {
  it('CB-001: "Created [file]" claim -- file exists -- no finding', async () => {
    const ctx = createProjectContext({
      taskFiles: [createTaskFile({
        taskNumber: 3,
        completed: {
          date: '2026-04-13',
          deviations: 'Created `src/app.ts` as planned.',
          insightImplication: null,
          decisions: null,
        },
      })],
      sourceFiles: new Map([['src/app.ts', createAnalyzedFile({ filePath: 'src/app.ts' })]]),
    });

    const result = await confidenceBluff.run(ctx);

    expect(result.findings.filter((f) => f.description.includes('Created'))).toHaveLength(0);
  });

  it('CB-002: "Created [file]" claim -- file does not exist -- critical', async () => {
    const ctx = createProjectContext({
      taskFiles: [createTaskFile({
        taskNumber: 3,
        completed: {
          date: '2026-04-13',
          deviations: 'Created `src/missing.ts` successfully.',
          insightImplication: null,
          decisions: null,
        },
      })],
      sourceFiles: new Map(),
      rawFiles: new Map(),
    });

    const result = await confidenceBluff.run(ctx);

    expect(result.severity).toBe('critical');
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings[0].description).toContain('src/missing.ts');
    expect(result.findings[0].description).toContain('does not exist');
  });

  it('CB-003: "Modified [file]" claim -- file not in git diff -- critical', async () => {
    const ctx = createProjectContext({
      taskFiles: [createTaskFile({
        taskNumber: 5,
        completed: {
          date: '2026-04-13',
          deviations: 'Modified `src/config.ts` to add new setting.',
          insightImplication: null,
          decisions: null,
        },
      })],
      gitLog: [createGitCommit({ taskId: 5, filesChanged: ['src/app.ts'] })],
      sourceFiles: new Map(),
      rawFiles: new Map(),
    });

    const result = await confidenceBluff.run(ctx);

    expect(result.severity).toBe('critical');
    const modFinding = result.findings.find((f) => f.description.includes('Modified'));
    expect(modFinding).toBeDefined();
    expect(modFinding!.description).toContain('src/config.ts');
  });

  it('CB-004: test result claim -- flagged as unverifiable -- warning', async () => {
    const ctx = createProjectContext({
      taskFiles: [createTaskFile({
        taskNumber: 3,
        completed: {
          date: '2026-04-13',
          deviations: 'All tests pass.',
          insightImplication: null,
          decisions: null,
        },
      })],
    });

    const result = await confidenceBluff.run(ctx);

    expect(result.severity).toBe('warning');
    const testFinding = result.findings.find((f) => f.description.includes('unverifiable'));
    expect(testFinding).toBeDefined();
  });

  it('CB-005: test result files parsed as supplementary evidence', async () => {
    const ctx = createProjectContext({
      taskFiles: [createTaskFile({
        taskNumber: 3,
        completed: {
          date: '2026-04-13',
          deviations: 'All tests pass.',
          insightImplication: null,
          decisions: null,
        },
      })],
      testResultFiles: [{
        filePath: 'test-results.json',
        format: 'vitest-json',
        suites: [{
          name: 'app',
          tests: [
            { name: 'works', status: 'passed', duration: 10, errorMessage: null },
          ],
        }],
      }],
    });

    const result = await confidenceBluff.run(ctx);

    const testFinding = result.findings.find((f) => f.description.includes('unverifiable'));
    expect(testFinding).toBeDefined();
    expect(testFinding!.evidence?.['supplementaryTestResults']).toBeDefined();
  });

  it('CB-006: function existence claim -- function not in AST -- critical', async () => {
    const ctx = createProjectContext({
      taskFiles: [createTaskFile({
        taskNumber: 3,
        completed: {
          date: '2026-04-13',
          deviations: 'Implemented `processData` handler.',
          insightImplication: null,
          decisions: null,
        },
      })],
      sourceFiles: new Map([
        ['src/app.ts', createAnalyzedFile({
          functions: [{ name: 'initApp', params: [], returnType: null, startLine: 1, endLine: 5, isAsync: false, isGenerator: false }],
        })],
      ]),
    });

    const result = await confidenceBluff.run(ctx);

    expect(result.severity).toBe('critical');
    const implFinding = result.findings.find((f) => f.description.includes('processData'));
    expect(implFinding).toBeDefined();
  });

  it('CB-007: task with no Completed section -- no findings', async () => {
    const ctx = createProjectContext({
      taskFiles: [createTaskFile({ taskNumber: 3, completed: null })],
    });

    const result = await confidenceBluff.run(ctx);

    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
  });
});
