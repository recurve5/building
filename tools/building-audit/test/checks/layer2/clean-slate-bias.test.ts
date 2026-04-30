import { describe, it, expect, vi } from 'vitest';
import { createProjectContext, createAnalyzedFile } from '../../factories/index.js';
import type { LLMClient, LLMResponse } from '../../../src/types/index.js';

// Import the check (side-effect: registers it)
import { cleanSlateBias } from '../../../src/checks/layer2/clean-slate-bias.js';

function createMockLLMClient(response: string): LLMClient {
  return {
    query: vi.fn().mockResolvedValue({
      content: response,
      usage: { input: 100, output: 50 },
    } satisfies LLMResponse),
  };
}

describe('clean-slate-bias', () => {
  it('CSB-001: detects candidate pairs when similar function names exist across files', async () => {
    const sourceFiles = new Map([
      [
        'src/utils/format.ts',
        createAnalyzedFile({
          filePath: 'src/utils/format.ts',
          functions: [
            { name: 'formatDate', params: [{ name: 'date', type: 'Date' }], returnType: 'string', startLine: 1, endLine: 5, isAsync: false, isGenerator: false },
          ],
        }),
      ],
      [
        'src/helpers/date.ts',
        createAnalyzedFile({
          filePath: 'src/helpers/date.ts',
          functions: [
            { name: 'formatDate', params: [{ name: 'd', type: 'Date' }], returnType: 'string', startLine: 1, endLine: 8, isAsync: false, isGenerator: false },
          ],
        }),
      ],
    ]);

    const context = createProjectContext({ sourceFiles });
    const mockClient = createMockLLMClient('These are duplicate implementations that serve the same purpose.');

    const result = await cleanSlateBias.run(context, mockClient);

    expect(result.status).toBe('completed');
    expect(result.findings.length).toBeGreaterThan(0);
    // LLM was called with the candidate pair
    expect(mockClient.query).toHaveBeenCalledTimes(1);
    const prompt = (mockClient.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain('formatDate');
    expect(prompt).toContain('src/utils/format.ts');
    expect(prompt).toContain('src/helpers/date.ts');
  });

  it('CSB-002: LLM confirms duplication -> warning severity', async () => {
    const sourceFiles = new Map([
      [
        'src/a.ts',
        createAnalyzedFile({
          filePath: 'src/a.ts',
          functions: [
            { name: 'calculateTotal', params: [{ name: 'items', type: 'Item[]' }], returnType: 'number', startLine: 1, endLine: 10, isAsync: false, isGenerator: false },
          ],
        }),
      ],
      [
        'src/b.ts',
        createAnalyzedFile({
          filePath: 'src/b.ts',
          functions: [
            { name: 'calculateTotal', params: [{ name: 'list', type: 'Item[]' }], returnType: 'number', startLine: 1, endLine: 12, isAsync: false, isGenerator: false },
          ],
        }),
      ],
    ]);

    const context = createProjectContext({ sourceFiles });
    const mockClient = createMockLLMClient('These are duplicate implementations. You could eliminate one by reusing the other.');

    const result = await cleanSlateBias.run(context, mockClient);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('warning');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].description).toContain('Duplicate implementation');
    expect(result.findings[0].evidence).toMatchObject({ llmVerdict: 'warning' });
    expect(result.tokenUsage).toEqual({ input: 100, output: 50 });
  });

  it('CSB-003: LLM says related but distinct -> info severity', async () => {
    const sourceFiles = new Map([
      [
        'src/api/validate.ts',
        createAnalyzedFile({
          filePath: 'src/api/validate.ts',
          functions: [
            { name: 'validate', params: [{ name: 'input', type: 'ApiRequest' }], returnType: 'boolean', startLine: 1, endLine: 15, isAsync: false, isGenerator: false },
          ],
        }),
      ],
      [
        'src/forms/validate.ts',
        createAnalyzedFile({
          filePath: 'src/forms/validate.ts',
          functions: [
            { name: 'validate', params: [{ name: 'data', type: 'FormData' }], returnType: 'boolean', startLine: 1, endLine: 20, isAsync: false, isGenerator: false },
          ],
        }),
      ],
    ]);

    const context = createProjectContext({ sourceFiles });
    const mockClient = createMockLLMClient('These are distinct implementations. One validates API requests while the other validates form data. They serve separate concerns.');

    const result = await cleanSlateBias.run(context, mockClient);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('info');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].description).toContain('distinct purposes');
    expect(result.findings[0].evidence).toMatchObject({ llmVerdict: 'info' });
    expect(result.tokenUsage).toEqual({ input: 100, output: 50 });
  });

  it('CSB-004: no similar identifiers -> clean, LLM never called', async () => {
    const sourceFiles = new Map([
      [
        'src/foo.ts',
        createAnalyzedFile({
          filePath: 'src/foo.ts',
          functions: [
            { name: 'doFoo', params: [], returnType: 'void', startLine: 1, endLine: 3, isAsync: false, isGenerator: false },
          ],
        }),
      ],
      [
        'src/bar.ts',
        createAnalyzedFile({
          filePath: 'src/bar.ts',
          functions: [
            { name: 'doBar', params: [], returnType: 'void', startLine: 1, endLine: 3, isAsync: false, isGenerator: false },
          ],
        }),
      ],
    ]);

    const context = createProjectContext({ sourceFiles });
    const mockClient = createMockLLMClient('should not be called');

    const result = await cleanSlateBias.run(context, mockClient);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
    expect(result.tokenUsage).toBeUndefined();
    expect(mockClient.query).not.toHaveBeenCalled();
  });
});
