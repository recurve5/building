import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearRegistry } from '../../../src/checks/registry.js';
import { surfaceHeresy } from '../../../src/checks/layer1/surface-heresy.js';
import { createProjectContext, createDecisionEntry, createAnalyzedFile } from '../../factories/index.js';

beforeEach(() => {
  clearRegistry();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('surface-heresy', () => {
  it('SH-001: Hard Kill terminology found in source code -- critical', async () => {
    const decisions = [
      createDecisionEntry({
        number: 5,
        decision: 'Remove `StreakTracker` class entirely [HARD KILL]',
        rationale: 'The StreakTracker approach was fundamentally flawed.',
        tags: ['HARD KILL'],
      }),
    ];

    const sourceFiles = new Map([
      ['src/app.ts', createAnalyzedFile({
        filePath: 'src/app.ts',
        identifiers: ['StreakTracker', 'initApp', 'config'],
      })],
    ]);

    const ctx = createProjectContext({ decisions, sourceFiles, rawFiles: new Map() });
    const result = await surfaceHeresy.run(ctx);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('critical');
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings[0].description).toContain('StreakTracker');
  });

  it('SH-002: Hard Kill terminology found in documentation -- warning', async () => {
    const decisions = [
      createDecisionEntry({
        number: 3,
        decision: 'Kill the "gamification" feature [HARD KILL]',
        rationale: 'Gamification adds complexity without value.',
        tags: ['HARD KILL'],
      }),
    ];

    const rawFiles = new Map([
      ['docs/design.md', 'The gamification module was originally planned for v2.'],
    ]);

    const ctx = createProjectContext({ decisions, sourceFiles: new Map(), rawFiles });
    const result = await surfaceHeresy.run(ctx);

    expect(result.severity).toBe('warning');
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings[0].description).toContain('gamification');
  });

  it('SH-003: terminology only in DECISIONS.md kill entry -- clean', async () => {
    const decisions = [
      createDecisionEntry({
        number: 5,
        decision: 'Remove `StreakTracker` class entirely [HARD KILL]',
        rationale: 'Flawed approach.',
        tags: ['HARD KILL'],
      }),
    ];

    const rawFiles = new Map([
      ['DECISIONS.md', 'Decision 5: Remove StreakTracker class entirely [HARD KILL]'],
    ]);

    const ctx = createProjectContext({ decisions, sourceFiles: new Map(), rawFiles });
    const result = await surfaceHeresy.run(ctx);

    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
  });

  it('SH-004: no Hard Kill entries in DECISIONS.md -- clean', async () => {
    const decisions = [
      createDecisionEntry({ number: 1, decision: 'Use TypeScript', tags: [] }),
    ];

    const ctx = createProjectContext({ decisions, sourceFiles: new Map(), rawFiles: new Map() });
    const result = await surfaceHeresy.run(ctx);

    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
  });

  it('SH-005: no decisions at all -- clean', async () => {
    const ctx = createProjectContext({ decisions: [], sourceFiles: new Map(), rawFiles: new Map() });
    const result = await surfaceHeresy.run(ctx);

    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
  });
});
