import { describe, it, expect, vi } from 'vitest';
import {
  refactoringSignals,
  computeMetrics,
  parseAssessment,
} from '../../../src/checks/layer2/refactoring-signals.js';
import {
  createProjectContext,
  createAnalyzedFile,
  createTaskFile,
} from '../../factories/index.js';
import type { LLMClient, LLMResponse } from '../../../src/types/index.js';

function createMockLLMClient(content: string): LLMClient {
  return {
    query: vi.fn().mockResolvedValue({
      content,
      usage: { input: 200, output: 100 },
    } satisfies LLMResponse),
  };
}

describe('refactoring-signals check', () => {
  // RS-001: Metrics and concerns assembled correctly (evidence phase)
  it('RS-001: metrics and concerns assembled correctly', () => {
    const context = createProjectContext({
      fileToTaskMapping: new Map([
        ['src/core.ts', [1, 2, 3, 4]],
        ['src/utils.ts', [1, 2]],
        ['src/api.ts', [3, 5, 6]],
      ]),
      sourceFiles: new Map([
        [
          'src/core.ts',
          createAnalyzedFile({
            filePath: 'src/core.ts',
            functions: [
              { name: 'init', params: [], returnType: null, startLine: 1, endLine: 30, isAsync: false, isGenerator: false },
              { name: 'process', params: [], returnType: null, startLine: 32, endLine: 51, isAsync: false, isGenerator: false },
            ],
          }),
        ],
        [
          'src/utils.ts',
          createAnalyzedFile({
            filePath: 'src/utils.ts',
            functions: [
              { name: 'helper', params: [], returnType: null, startLine: 1, endLine: 10, isAsync: false, isGenerator: false },
            ],
          }),
        ],
      ]),
      taskFiles: [
        createTaskFile({
          taskNumber: 3,
          completed: {
            date: '2026-04-10',
            deviations: null,
            insightImplication: 'The coupling between modules is becoming fragile.',
            decisions: null,
          },
        }),
        createTaskFile({
          taskNumber: 5,
          completed: {
            date: '2026-04-11',
            deviations: null,
            insightImplication: 'Added new endpoint with no structural issues.',
            decisions: null,
          },
        }),
        createTaskFile({
          taskNumber: 7,
          completed: {
            date: '2026-04-12',
            deviations: null,
            insightImplication: 'Growing complexity in the data layer suggests we need to refactor.',
            decisions: null,
          },
        }),
      ],
    });

    const metrics = computeMetrics(context);

    // Coupling hotspots: core.ts (4 tasks) and api.ts (3 tasks), utils.ts excluded (2 tasks)
    expect(metrics.couplingHotspots).toHaveLength(2);
    expect(metrics.couplingHotspots[0].file).toBe('src/core.ts');
    expect(metrics.couplingHotspots[0].taskCount).toBe(4);
    expect(metrics.couplingHotspots[1].file).toBe('src/api.ts');
    expect(metrics.couplingHotspots[1].taskCount).toBe(3);

    // Average function length: (30 + 20 + 10) / 3 = 20
    expect(metrics.totalFunctions).toBe(3);
    expect(metrics.averageFunctionLength).toBe(20);

    // Structural concerns: tasks 3 and 7 mention concern keywords, task 5 does not
    expect(metrics.structuralConcerns).toHaveLength(2);
    expect(metrics.structuralConcerns[0].taskNumber).toBe(3);
    expect(metrics.structuralConcerns[1].taskNumber).toBe(7);
  });

  // RS-002: LLM assesses yellow → warning severity, assessment = yellow
  it('RS-002: LLM yellow assessment produces warning severity', async () => {
    const llm = createMockLLMClient(
      'There are some concerns with the coupling hotspots. I recommend targeted refactoring before the next milestone.',
    );
    const context = createProjectContext({
      fileToTaskMapping: new Map([['src/core.ts', [1, 2, 3]]]),
      sourceFiles: new Map([
        [
          'src/core.ts',
          createAnalyzedFile({
            filePath: 'src/core.ts',
            functions: [
              { name: 'fn', params: [], returnType: null, startLine: 1, endLine: 20, isAsync: false, isGenerator: false },
            ],
          }),
        ],
      ]),
    });

    const result = await refactoringSignals.run(context, llm);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('warning');
    expect(result.findings).toHaveLength(1);
    expect(
      (result.findings[0].evidence as Record<string, unknown>).refactoringAssessment,
    ).toBe('yellow');
    expect(llm.query).toHaveBeenCalledWith(expect.any(String), 16384);
  });

  // RS-003: LLM assesses green → clean severity, assessment = green
  it('RS-003: LLM green assessment produces clean severity', async () => {
    const llm = createMockLLMClient(
      'The codebase looks healthy. I recommend you proceed as planned with the next milestone.',
    );
    const context = createProjectContext({
      sourceFiles: new Map([
        [
          'src/app.ts',
          createAnalyzedFile({
            filePath: 'src/app.ts',
            functions: [
              { name: 'main', params: [], returnType: null, startLine: 1, endLine: 15, isAsync: false, isGenerator: false },
            ],
          }),
        ],
      ]),
    });

    const result = await refactoringSignals.run(context, llm);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(1);
    expect(
      (result.findings[0].evidence as Record<string, unknown>).refactoringAssessment,
    ).toBe('green');
  });

  // RS-004: LLM assesses red → critical severity, assessment = red
  it('RS-004: LLM red assessment produces critical severity', async () => {
    const llm = createMockLLMClient(
      'The codebase has severe structural issues. I recommend you halt for structural rework before continuing.',
    );
    const context = createProjectContext({
      fileToTaskMapping: new Map([
        ['src/core.ts', [1, 2, 3, 4, 5]],
        ['src/db.ts', [2, 3, 4, 5, 6]],
      ]),
      sourceFiles: new Map([
        [
          'src/core.ts',
          createAnalyzedFile({
            filePath: 'src/core.ts',
            functions: [
              { name: 'bigFn', params: [], returnType: null, startLine: 1, endLine: 100, isAsync: false, isGenerator: false },
            ],
          }),
        ],
      ]),
      taskFiles: [
        createTaskFile({
          taskNumber: 4,
          completed: {
            date: '2026-04-12',
            deviations: null,
            insightImplication: 'Technical debt is accumulating rapidly.',
            decisions: null,
          },
        }),
      ],
    });

    const result = await refactoringSignals.run(context, llm);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('critical');
    expect(result.findings).toHaveLength(1);
    expect(
      (result.findings[0].evidence as Record<string, unknown>).refactoringAssessment,
    ).toBe('red');
  });
});
