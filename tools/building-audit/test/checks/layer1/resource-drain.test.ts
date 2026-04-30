import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearRegistry } from '../../../src/checks/registry.js';
import { resourceDrain } from '../../../src/checks/layer1/resource-drain.js';
import { createProjectContext } from '../../factories/index.js';

beforeEach(() => {
  clearRegistry();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('resource-drain', () => {
  it('RD-001: setInterval without clearInterval -- warning', async () => {
    const rawFiles = new Map([
      ['src/timer.ts', 'const id = setInterval(() => poll(), 1000);'],
    ]);

    const ctx = createProjectContext({ rawFiles });
    const result = await resourceDrain.run(ctx);

    const finding = result.findings.find((f) => f.description.includes('setInterval'));
    expect(finding).toBeDefined();
    expect(finding!.description).toContain('clearInterval');
  });

  it('RD-002: addEventListener without removeEventListener -- warning', async () => {
    const rawFiles = new Map([
      ['src/ui.ts', 'window.addEventListener("click", handler);'],
    ]);

    const ctx = createProjectContext({ rawFiles });
    const result = await resourceDrain.run(ctx);

    const finding = result.findings.find((f) => f.description.includes('addEventListener'));
    expect(finding).toBeDefined();
  });

  it('RD-003: database query without LIMIT -- warning', async () => {
    const rawFiles = new Map([
      ['src/db.ts', 'const rows = await db.query("SELECT * FROM users WHERE active = true");'],
    ]);

    const ctx = createProjectContext({ rawFiles });
    const result = await resourceDrain.run(ctx);

    const finding = result.findings.find((f) => f.description.includes('LIMIT'));
    expect(finding).toBeDefined();
  });

  it('RD-004: hardcoded secret pattern -- critical', async () => {
    const rawFiles = new Map([
      ['src/config.ts', 'const key = "AKIAIOSFODNN7EXAMPLE1";'],
    ]);

    const ctx = createProjectContext({ rawFiles });
    const result = await resourceDrain.run(ctx);

    expect(result.severity).toBe('critical');
    const finding = result.findings.find((f) => f.description.includes('aws-key'));
    expect(finding).toBeDefined();
    expect(finding!.description).toContain('AKIA');
  });

  it('RD-005: proper cleanup present -- clean for that pattern', async () => {
    const rawFiles = new Map([
      ['src/timer.ts', [
        'const id = setInterval(() => poll(), 1000);',
        'return () => clearInterval(id);',
      ].join('\n')],
    ]);

    const ctx = createProjectContext({ rawFiles });
    const result = await resourceDrain.run(ctx);

    const finding = result.findings.find((f) => f.description.includes('setInterval'));
    expect(finding).toBeUndefined();
  });

  it('RD-006: built-in secret patterns cover high-value cases', async () => {
    const rawFiles = new Map([
      ['src/tokens.ts', [
        'const aws = "AKIAIOSFODNN7EXAMPLE2";',
        'const gh = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";',
      ].join('\n')],
    ]);

    const ctx = createProjectContext({ rawFiles });
    const result = await resourceDrain.run(ctx);

    expect(result.severity).toBe('critical');
    const awsFinding = result.findings.find((f) => f.description.includes('aws-key'));
    const ghFinding = result.findings.find((f) => f.description.includes('github-token'));
    expect(awsFinding).toBeDefined();
    expect(ghFinding).toBeDefined();
  });

  it('produces secretLocations in evidence for runner extraction', async () => {
    const rawFiles = new Map([
      ['src/config.ts', 'const key = "AKIAIOSFODNN7EXAMPLE3";'],
    ]);

    const ctx = createProjectContext({ rawFiles });
    const result = await resourceDrain.run(ctx);

    const summaryFinding = result.findings.find((f) => f.location === 'summary');
    expect(summaryFinding).toBeDefined();
    const locs = summaryFinding!.evidence?.['secretLocations'] as Array<{ patternType: string }>;
    expect(locs).toBeDefined();
    expect(locs.length).toBeGreaterThanOrEqual(1);
    expect(locs[0].patternType).toBe('aws-key');
  });

  it('empty rawFiles produces clean', async () => {
    const ctx = createProjectContext({ rawFiles: new Map() });
    const result = await resourceDrain.run(ctx);

    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
  });
});
