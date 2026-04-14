import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearRegistry } from '../../../src/checks/registry.js';
import { fragilityMetrics } from '../../../src/checks/layer1/fragility-metrics.js';
import { createProjectContext, createAnalyzedFile } from '../../factories/index.js';

beforeEach(() => {
  clearRegistry();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('fragility-metrics', () => {
  it('FM-001: file exceeding length threshold -- warning', async () => {
    const sourceFiles = new Map([
      ['src/big.ts', createAnalyzedFile({ filePath: 'src/big.ts', lineCount: 550 })],
    ]);

    const ctx = createProjectContext({ sourceFiles });
    const result = await fragilityMetrics.run(ctx);

    expect(result.severity).toBe('warning');
    const finding = result.findings.find((f) => f.file === 'src/big.ts' && f.description.includes('550'));
    expect(finding).toBeDefined();
  });

  it('FM-002: function exceeding length threshold -- warning', async () => {
    const sourceFiles = new Map([
      ['src/app.ts', createAnalyzedFile({
        filePath: 'src/app.ts',
        lineCount: 200,
        functions: [{
          name: 'bigFunction',
          params: [],
          returnType: null,
          startLine: 10,
          endLine: 120,
          isAsync: false,
          isGenerator: false,
        }],
      })],
    ]);

    const ctx = createProjectContext({ sourceFiles });
    const result = await fragilityMetrics.run(ctx);

    expect(result.severity).toBe('warning');
    const finding = result.findings.find((f) => f.description.includes('bigFunction'));
    expect(finding).toBeDefined();
    expect(finding!.description).toContain('110');
  });

  it('FM-003: high modification coupling -- warning', async () => {
    const sourceFiles = new Map([
      ['src/shared.ts', createAnalyzedFile({ filePath: 'src/shared.ts', lineCount: 50 })],
    ]);
    const fileToTaskMapping = new Map([
      ['src/shared.ts', [1, 2, 3, 4, 5]],
    ]);

    const ctx = createProjectContext({ sourceFiles, fileToTaskMapping });
    const result = await fragilityMetrics.run(ctx);

    expect(result.severity).toBe('warning');
    const finding = result.findings.find((f) => f.description.includes('5 tasks'));
    expect(finding).toBeDefined();
  });

  it('FM-004: TODO/HACK/FIXME density above threshold', async () => {
    // 10 lines with 1 TODO = 10 per 100 lines (above 5 threshold)
    const content = Array.from({ length: 10 }, (_, i) =>
      i === 0 ? '// TODO: fix this' : '// TODO: also fix',
    ).join('\n');

    const rawFiles = new Map([['src/messy.ts', content]]);
    const ctx = createProjectContext({ rawFiles });
    const result = await fragilityMetrics.run(ctx);

    const finding = result.findings.find((f) => f.description.includes('TODO'));
    expect(finding).toBeDefined();
  });

  it('FM-005: test setup complexity -- high setup-to-assertion ratio', async () => {
    const sourceFiles = new Map([
      ['test/app.test.ts', createAnalyzedFile({
        filePath: 'test/app.test.ts',
        lineCount: 100,
        testFunctions: [
          {
            name: 'test 1',
            startLine: 1,
            endLine: 51,
            assertions: [{ method: 'toBe', strength: 'strong', line: 50 }],
          },
        ],
      })],
    ]);

    const ctx = createProjectContext({ sourceFiles });
    const result = await fragilityMetrics.run(ctx);

    const finding = result.findings.find((f) => f.description.includes('setup-to-assertion'));
    expect(finding).toBeDefined();
  });

  it('FM-006: clean file -- no findings', async () => {
    const sourceFiles = new Map([
      ['src/small.ts', createAnalyzedFile({ filePath: 'src/small.ts', lineCount: 50 })],
    ]);

    const ctx = createProjectContext({ sourceFiles });
    const result = await fragilityMetrics.run(ctx);

    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
  });
});
