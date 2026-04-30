import { describe, it, expect, vi } from 'vitest';
import { reactFluidityCheck } from '../../../src/checks/layer2/react-fluidity.js';
import { createProjectContext, createAnalyzedFile } from '../../factories/index.js';
import type { LLMClient, LLMResponse } from '../../../src/types/index.js';

function createMockLLMClient(content: string): LLMClient {
  return {
    query: vi.fn().mockResolvedValue({
      content,
      usage: { input: 100, output: 50 },
    } satisfies LLMResponse),
  };
}

describe('react-fluidity check', () => {
  // RF-001: Non-React project → skipped
  it('RF-001: non-React project returns skipped', async () => {
    const llm = createMockLLMClient('should not be called');
    const sourceFiles = new Map([
      [
        'src/utils.ts',
        createAnalyzedFile({
          filePath: 'src/utils.ts',
          language: 'typescript',
          imports: [{ source: 'lodash', specifiers: ['debounce'], line: 1 }],
        }),
      ],
    ]);
    const rawFiles = new Map([['src/utils.ts', 'export function add(a, b) { return a + b; }']]);

    const context = createProjectContext({ sourceFiles, rawFiles });
    const result = await reactFluidityCheck.run(context, llm);

    expect(result.status).toBe('skipped');
    expect(result.severity).toBe('clean');
    expect(result.errorMessage).toBe('No React patterns detected in project');
    expect(llm.query).not.toHaveBeenCalled();
  });

  // RF-002: setState in loop → candidate found
  it('RF-002: setState in loop produces candidate', async () => {
    const llm = createMockLLMClient('This is fine and acceptable for this use case.');
    const sourceFiles = new Map([
      [
        'src/App.tsx',
        createAnalyzedFile({
          filePath: 'src/App.tsx',
          language: 'typescript',
          imports: [{ source: 'react', specifiers: ['useState'], line: 1 }],
        }),
      ],
    ]);
    const rawFiles = new Map([
      [
        'src/App.tsx',
        [
          'import { useState } from "react";',
          'function App() {',
          '  const [items, setItems] = useState([]);',
          '  const data = [1, 2, 3, 4, 5];',
          '  data.forEach((item) => {',
          '    setState({ count: item });',
          '  });',
          '  return <div>hello</div>;',
          '}',
        ].join('\n'),
      ],
    ]);

    const context = createProjectContext({ sourceFiles, rawFiles });
    const result = await reactFluidityCheck.run(context, llm);

    expect(result.status).toBe('completed');
    // LLM was called — candidate was found
    expect(llm.query).toHaveBeenCalled();
    const prompt = (llm.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain('setState-in-loop');
  });

  // RF-003: LLM says user-perceptible → warning
  it('RF-003: LLM perceptible verdict produces warning', async () => {
    const llm = createMockLLMClient(
      'Yes, this would be perceptible to the user. The repeated setState calls inside the loop will cause multiple re-renders and visible jank.',
    );
    const sourceFiles = new Map([
      [
        'src/Dashboard.tsx',
        createAnalyzedFile({
          filePath: 'src/Dashboard.tsx',
          language: 'typescript',
          imports: [{ source: 'react', specifiers: ['useState', 'useEffect'], line: 1 }],
        }),
      ],
    ]);
    const rawFiles = new Map([
      [
        'src/Dashboard.tsx',
        [
          'import { useState, useEffect } from "react";',
          'function Dashboard() {',
          '  const [counts, setCounts] = useState({});',
          '  useEffect(() => {',
          '    bigArray.forEach((item) => {',
          '      setState({ [item.id]: item.count });',
          '    });',
          '  }, []);',
          '  return <div>dashboard</div>;',
          '}',
        ].join('\n'),
      ],
    ]);

    const context = createProjectContext({ sourceFiles, rawFiles });
    const result = await reactFluidityCheck.run(context, llm);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('warning');
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings[0].evidence?.['llmVerdict']).toBe('perceptible');
    expect(result.tokenUsage).toEqual({ input: 100, output: 50 });
  });
});
