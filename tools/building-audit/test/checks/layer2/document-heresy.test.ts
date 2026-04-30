import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearRegistry } from '../../../src/checks/registry.js';
import { documentHeresy } from '../../../src/checks/layer2/document-heresy.js';
import { createProjectContext, createDecisionEntry } from '../../factories/index.js';
import type { LLMClient, LLMResponse } from '../../../src/types/index.js';

function createMockLLMClient(response: string): LLMClient {
  return {
    query: vi.fn().mockResolvedValue({
      content: response,
      usage: { input: 100, output: 50 },
    } satisfies LLMResponse),
  };
}

beforeEach(() => {
  clearRegistry();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('document-heresy', () => {
  it('DOH-001: Killed approach described as active in a doc -> warning', async () => {
    const decisions = [
      createDecisionEntry({
        number: 5,
        decision: 'Remove `StreakTracker` class and gamification scoring entirely [HARD KILL]',
        rationale: 'The StreakTracker gamification scoring approach was fundamentally flawed and unmaintainable.',
        tags: ['HARD KILL'],
      }),
    ];

    // Doc that contains 3+ term matches from the decision
    const rawFiles = new Map([
      [
        'docs/architecture.md',
        'The StreakTracker module handles gamification scoring. ' +
          'It provides streak tracking for users and integrates with the scoring engine. ' +
          'The gamification system is central to user engagement. ' +
          'StreakTracker was designed to be fundamentally extensible and unmaintainable patterns were avoided.',
      ],
    ]);

    const llmClient = createMockLLMClient(
      'The document describes as active the StreakTracker gamification system, which was killed.',
    );

    const ctx = createProjectContext({ decisions, rawFiles });
    const result = await documentHeresy.run(ctx, llmClient);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('warning');
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings[0].file).toBe('docs/architecture.md');
    expect(result.findings[0].description).toContain('Decision 5');
    expect(result.tokenUsage).toEqual({ input: 100, output: 50 });
    expect(llmClient.query).toHaveBeenCalledTimes(1);
  });

  it('DOH-002: No adjacent terminology found -> clean, LLM not called', async () => {
    const decisions = [
      createDecisionEntry({
        number: 3,
        decision: 'Kill the `StreakTracker` gamification feature [HARD KILL]',
        rationale: 'Gamification adds complexity without value.',
        tags: ['HARD KILL'],
      }),
    ];

    // Doc with no matching terminology
    const rawFiles = new Map([
      ['docs/api.md', 'The REST API exposes endpoints for user authentication and profile management.'],
    ]);

    const llmClient = createMockLLMClient('not related');

    const ctx = createProjectContext({ decisions, rawFiles });
    const result = await documentHeresy.run(ctx, llmClient);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
    // LLM should not have been called since no candidates passed the threshold
    expect(llmClient.query).not.toHaveBeenCalled();
  });
});
