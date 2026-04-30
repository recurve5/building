import { describe, it, expect, vi } from 'vitest';
import { ghostRefactorCheck } from '../../../src/checks/layer2/ghost-refactor.js';
import {
  createProjectContext,
  createGitCommit,
  createTaskFile,
} from '../../factories/index.js';
import type { LLMClient, LLMResponse } from '../../../src/types/index.js';

function createMockLLMClient(content: string): LLMClient {
  return {
    query: vi.fn().mockResolvedValue({
      content,
      usage: { input: 100, output: 50 },
    } satisfies LLMResponse),
  };
}

describe('ghost-refactor check', () => {
  // GR-001: Large diff (>200 lines) on non-refactor task produces candidate
  it('GR-001: large diff on non-refactor task produces candidate', async () => {
    const llm = createMockLLMClient('This rewrite is unnecessary and stylistic.');
    const context = createProjectContext({
      taskFiles: [
        createTaskFile({
          taskNumber: 5,
          shortName: 'add-login',
          whatToBuild: 'Add login page with form validation',
        }),
      ],
      gitLog: [
        createGitCommit({
          hash: 'big1111',
          message: '[005] add login page',
          taskId: 5,
          insertions: 150,
          deletions: 80,
        }),
      ],
    });

    const result = await ghostRefactorCheck.run(context, llm);

    expect(result.status).toBe('completed');
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings[0].file).toContain('big1111');
    expect(result.findings[0].location).toContain('task 5');
  });

  // GR-002: Prompt sent to LLM includes task goal and commit message
  it('GR-002: prompt includes task goal and commit message', async () => {
    const llm = createMockLLMClient('This rewrite is necessary.');
    const context = createProjectContext({
      taskFiles: [
        createTaskFile({
          taskNumber: 7,
          shortName: 'build-dashboard',
          whatToBuild: 'Build analytics dashboard with charts',
        }),
      ],
      gitLog: [
        createGitCommit({
          hash: 'dash222',
          message: '[007] build dashboard',
          taskId: 7,
          insertions: 180,
          deletions: 30,
        }),
      ],
    });

    await ghostRefactorCheck.run(context, llm);

    expect(llm.query).toHaveBeenCalledTimes(1);
    const prompt = (llm.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain('Build analytics dashboard with charts');
    expect(prompt).toContain('[007] build dashboard');
  });

  // GR-003: LLM rules "unnecessary" -> warning finding
  it('GR-003: LLM ruling unnecessary produces warning', async () => {
    const llm = createMockLLMClient('This is an unnecessary stylistic rewrite of working code.');
    const context = createProjectContext({
      taskFiles: [
        createTaskFile({
          taskNumber: 3,
          shortName: 'add-footer',
          whatToBuild: 'Add footer component',
        }),
      ],
      gitLog: [
        createGitCommit({
          hash: 'foot333',
          message: '[003] add footer',
          taskId: 3,
          insertions: 200,
          deletions: 10,
        }),
      ],
    });

    const result = await ghostRefactorCheck.run(context, llm);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('warning');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].evidence?.['llmVerdict']).toBe('unnecessary');
    expect(result.tokenUsage).toEqual({ input: 100, output: 50 });
  });

  // GR-004: LLM rules "necessary" -> clean (no finding)
  it('GR-004: LLM ruling necessary produces clean result', async () => {
    const llm = createMockLLMClient('This rewrite was necessary to support the new API contract.');
    const context = createProjectContext({
      taskFiles: [
        createTaskFile({
          taskNumber: 9,
          shortName: 'migrate-api',
          whatToBuild: 'Migrate to v2 API',
        }),
      ],
      gitLog: [
        createGitCommit({
          hash: 'api4444',
          message: '[009] migrate api',
          taskId: 9,
          insertions: 300,
          deletions: 250,
        }),
      ],
    });

    const result = await ghostRefactorCheck.run(context, llm);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
    expect(result.tokenUsage).toEqual({ input: 100, output: 50 });
  });

  // GR-005: Zero candidates -> LLM never called, clean result
  it('GR-005: zero candidates skips LLM call and returns clean', async () => {
    const llm = createMockLLMClient('should not be called');
    const context = createProjectContext({
      taskFiles: [
        createTaskFile({
          taskNumber: 2,
          shortName: 'refactor-auth',
          whatToBuild: 'Refactor authentication module',
        }),
      ],
      gitLog: [
        createGitCommit({
          hash: 'ref5555',
          message: '[002] refactor auth',
          taskId: 2,
          insertions: 300,
          deletions: 200,
        }),
      ],
    });

    const result = await ghostRefactorCheck.run(context, llm);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
    expect(llm.query).not.toHaveBeenCalled();
  });
});
