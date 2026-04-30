import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearRegistry } from '../../../src/checks/registry.js';
import { deepHeresy } from '../../../src/checks/layer2/deep-heresy.js';
import { createProjectContext, createDecisionEntry, createAnalyzedFile } from '../../factories/index.js';
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

describe('deep-heresy', () => {
  it('DH-001: Killed behavior found by LLM -- critical finding', async () => {
    const decisions = [
      createDecisionEntry({
        number: 5,
        decision: 'Remove streak tracking gamification feature',
        rationale: 'The streak tracking gamification system was fundamentally flawed and created perverse incentives.',
        tags: ['HARD KILL'],
      }),
    ];

    // Create source file with enough keyword matches (3+)
    // Keywords from decision+rationale: "streak", "tracking", "gamification", "feature",
    // "system", "fundamentally", "flawed", "created", "perverse", "incentives"
    const sourceFiles = new Map([
      ['src/rewards.ts', createAnalyzedFile({
        filePath: 'src/rewards.ts',
        identifiers: ['consecutiveDays', 'streak', 'tracking', 'gamification', 'bonusPoints'],
      })],
    ]);

    const rawFiles = new Map([
      ['src/rewards.ts', 'function computeStreak() { return tracking(gamification(days)); }'],
    ]);

    const mockClient = createMockLLMClient(
      'Yes, this code implements the same behavior as the killed streak tracking. It actively violates the decision.',
    );

    const ctx = createProjectContext({ decisions, sourceFiles, rawFiles });
    const result = await deepHeresy.run(ctx, mockClient);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('critical');
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings[0].file).toBe('src/rewards.ts');
    expect(result.findings[0].description).toContain('Decision 5');
    expect(mockClient.query).toHaveBeenCalled();
    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage!.input).toBeGreaterThan(0);
    expect(result.tokenUsage!.output).toBeGreaterThan(0);
  });

  it('DH-002: No HARD KILL entries -- clean, LLM never called', async () => {
    const decisions = [
      createDecisionEntry({ number: 1, decision: 'Use TypeScript', tags: [] }),
      createDecisionEntry({ number: 2, decision: 'Defer mobile support', tags: ['DEFERRED'] }),
    ];

    const mockClient = createMockLLMClient('should not be called');

    const ctx = createProjectContext({ decisions, sourceFiles: new Map(), rawFiles: new Map() });
    const result = await deepHeresy.run(ctx, mockClient);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
    expect(mockClient.query).not.toHaveBeenCalled();
    expect(result.tokenUsage).toEqual({ input: 0, output: 0 });
  });

  it('DH-003: LLM uncertain -- warning finding', async () => {
    const decisions = [
      createDecisionEntry({
        number: 8,
        decision: 'Remove webhook notification dispatcher',
        rationale: 'Webhook notification dispatcher added unnecessary complexity and reliability issues.',
        tags: ['HARD KILL'],
      }),
    ];

    const sourceFiles = new Map([
      ['src/events.ts', createAnalyzedFile({
        filePath: 'src/events.ts',
        identifiers: ['webhook', 'notification', 'dispatcher', 'eventBus'],
      })],
    ]);

    const rawFiles = new Map([
      ['src/events.ts', 'class EventEmitter { webhook() {} notification() {} dispatcher() {} }'],
    ]);

    const mockClient = createMockLLMClient(
      'It is uncertain whether this code reimplements the killed behavior. It might be related but the purpose seems different.',
    );

    const ctx = createProjectContext({ decisions, sourceFiles, rawFiles });
    const result = await deepHeresy.run(ctx, mockClient);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('warning');
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings[0].description).toContain('uncertain');
    expect(mockClient.query).toHaveBeenCalled();
  });
});
