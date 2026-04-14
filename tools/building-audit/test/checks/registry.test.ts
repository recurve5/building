import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerCheck,
  getChecks,
  clearRegistry,
  runChecks,
} from '../../src/checks/registry.js';
import { createProjectContext } from '../factories/index.js';
import type { Check, CheckResult, LLMClient, ProjectContext } from '../../src/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCheck(name: string, layer: 1 | 2, run?: Check['run']): Check {
  return {
    name,
    layer,
    run: run ?? (async () => ({
      name,
      layer,
      status: 'completed' as const,
      severity: 'clean' as const,
      findings: [],
      errorMessage: null,
    })),
  };
}

function makeLLMClient(): LLMClient {
  return {
    query: async () => ({ content: 'ok', usage: { input: 10, output: 5 } }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearRegistry();
  // Suppress console output during tests.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('Registry', () => {
  it('returns all registered checks', () => {
    registerCheck(makeCheck('a', 1));
    registerCheck(makeCheck('b', 2));
    expect(getChecks()).toHaveLength(2);
  });

  it('filters checks by layer', () => {
    registerCheck(makeCheck('a', 1));
    registerCheck(makeCheck('b', 2));
    registerCheck(makeCheck('c', 1));

    expect(getChecks(1).map((c) => c.name)).toEqual(['a', 'c']);
    expect(getChecks(2).map((c) => c.name)).toEqual(['b']);
  });

  it('clearRegistry empties the registry', () => {
    registerCheck(makeCheck('a', 1));
    clearRegistry();
    expect(getChecks()).toHaveLength(0);
  });
});

describe('runChecks', () => {
  it('mechanical mode runs only Layer 1 checks', async () => {
    const order: string[] = [];
    registerCheck(makeCheck('l1-a', 1, async () => {
      order.push('l1-a');
      return { name: 'l1-a', layer: 1, status: 'completed', severity: 'clean', findings: [], errorMessage: null };
    }));
    registerCheck(makeCheck('l2-a', 2, async () => {
      order.push('l2-a');
      return { name: 'l2-a', layer: 2, status: 'completed', severity: 'clean', findings: [], errorMessage: null };
    }));

    const ctx = createProjectContext();
    const { results } = await runChecks(ctx, 'mechanical');

    expect(order).toEqual(['l1-a']);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.name === 'l2-a')?.status).toBe('skipped');
  });

  it('full mode runs Layer 1 first, then Layer 2', async () => {
    const order: string[] = [];
    registerCheck(makeCheck('l1-a', 1, async () => {
      order.push('l1-a');
      return { name: 'l1-a', layer: 1, status: 'completed', severity: 'clean', findings: [], errorMessage: null };
    }));
    registerCheck(makeCheck('l2-a', 2, async () => {
      order.push('l2-a');
      return { name: 'l2-a', layer: 2, status: 'completed', severity: 'clean', findings: [], errorMessage: null };
    }));
    registerCheck(makeCheck('l1-b', 1, async () => {
      order.push('l1-b');
      return { name: 'l1-b', layer: 1, status: 'completed', severity: 'clean', findings: [], errorMessage: null };
    }));
    registerCheck(makeCheck('l2-b', 2, async () => {
      order.push('l2-b');
      return { name: 'l2-b', layer: 2, status: 'completed', severity: 'clean', findings: [], errorMessage: null };
    }));

    const ctx = createProjectContext();
    const { results } = await runChecks(ctx, 'full', makeLLMClient());

    // All L1 before any L2
    const l1End = Math.max(order.indexOf('l1-a'), order.indexOf('l1-b'));
    const l2Start = Math.min(order.indexOf('l2-a'), order.indexOf('l2-b'));
    expect(l1End).toBeLessThan(l2Start);

    // All checks produced results
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.status === 'completed')).toBe(true);
  });

  it('a throwing check produces error status, other checks continue', async () => {
    registerCheck(makeCheck('good', 1));
    registerCheck(makeCheck('bad', 1, async () => {
      throw new Error('API unreachable');
    }));
    registerCheck(makeCheck('also-good', 1));

    const ctx = createProjectContext();
    const { results } = await runChecks(ctx, 'mechanical');

    expect(results).toHaveLength(3);

    const bad = results.find((r) => r.name === 'bad')!;
    expect(bad.status).toBe('error');
    expect(bad.errorMessage).toBe('API unreachable');

    // Other checks completed
    expect(results.find((r) => r.name === 'good')?.status).toBe('completed');
    expect(results.find((r) => r.name === 'also-good')?.status).toBe('completed');
  });

  it('logs timing per check', async () => {
    registerCheck(makeCheck('timed', 1));

    const ctx = createProjectContext();
    await runChecks(ctx, 'mechanical');

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[check-runner] timed completed in'),
    );
  });

  it('warns when a check exceeds 10 seconds', async () => {
    // Fake a slow check by mocking performance.now
    let callCount = 0;
    const original = performance.now;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      callCount++;
      // First call (start) returns 0, second call (end) returns 11000
      return callCount % 2 === 1 ? 0 : 11_000;
    });

    registerCheck(makeCheck('slow-check', 1));

    const ctx = createProjectContext();
    await runChecks(ctx, 'mechanical');

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('WARNING: slow-check took'),
    );

    vi.restoreAllMocks();
  });

  it('skips Layer 2 checks when no LLM client provided in full mode', async () => {
    registerCheck(makeCheck('l1', 1));
    registerCheck(makeCheck('l2', 2));

    const ctx = createProjectContext();
    const { results } = await runChecks(ctx, 'full'); // no llmClient

    const l2Result = results.find((r) => r.name === 'l2')!;
    expect(l2Result.status).toBe('skipped');
    expect(l2Result.layer).toBe(2);
  });

  it('extracts secret locations from Resource Drain result', async () => {
    const secretLocs = [
      { filePath: 'config.ts', line: 5, endLine: 5, patternType: 'aws-key', maskedValue: 'AKIA...xyzw' },
    ];

    registerCheck(makeCheck('resource-drain', 1, async () => ({
      name: 'resource-drain',
      layer: 1,
      status: 'completed',
      severity: 'warning',
      findings: [
        {
          file: 'config.ts',
          location: 'line 5',
          description: 'AWS key detected',
          suggestion: 'Move to environment variable',
          evidence: { secretLocations: secretLocs },
        },
      ],
      errorMessage: null,
    })));

    const ctx = createProjectContext();
    const { secretLocations } = await runChecks(ctx, 'mechanical');

    expect(secretLocations).toHaveLength(1);
    expect(secretLocations[0].patternType).toBe('aws-key');
  });

  it('returns empty secret locations when resource-drain is absent', async () => {
    registerCheck(makeCheck('other-check', 1));

    const ctx = createProjectContext();
    const { secretLocations } = await runChecks(ctx, 'mechanical');

    expect(secretLocations).toEqual([]);
  });

  it('returns empty secret locations when resource-drain errors', async () => {
    registerCheck(makeCheck('resource-drain', 1, async () => {
      throw new Error('scan failed');
    }));

    const ctx = createProjectContext();
    const { secretLocations } = await runChecks(ctx, 'mechanical');

    expect(secretLocations).toEqual([]);
  });
});
