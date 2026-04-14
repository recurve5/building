import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearRegistry } from '../../../src/checks/registry.js';
import { unoptimizedDefaults } from '../../../src/checks/layer1/unoptimized-defaults.js';
import { createProjectContext } from '../../factories/index.js';

beforeEach(() => {
  clearRegistry();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('unoptimized-defaults', () => {
  it('UD-001: database query without LIMIT or pagination -- warning', async () => {
    const rawFiles = new Map([
      ['src/db.ts', 'const rows = await db.query("SELECT id, name FROM users WHERE active = true");'],
    ]);

    const ctx = createProjectContext({ rawFiles });
    const result = await unoptimizedDefaults.run(ctx);

    const finding = result.findings.find((f) => f.description.includes('LIMIT'));
    expect(finding).toBeDefined();
  });

  it('UD-002: unsanitized input reaching query -- critical', async () => {
    const rawFiles = new Map([
      ['src/db.ts', 'const rows = await db.query(`SELECT * FROM users WHERE id = ${userId}`);'],
    ]);

    const ctx = createProjectContext({ rawFiles });
    const result = await unoptimizedDefaults.run(ctx);

    expect(result.severity).toBe('critical');
    const finding = result.findings.find((f) => f.description.includes('SQL query'));
    expect(finding).toBeDefined();
  });

  it('UD-003: unsanitized input reaching shell command -- critical', async () => {
    const rawFiles = new Map([
      ['src/run.ts', 'const result = exec(`ls -la ${userInput}`);'],
    ]);

    const ctx = createProjectContext({ rawFiles });
    const result = await unoptimizedDefaults.run(ctx);

    expect(result.severity).toBe('critical');
    const finding = result.findings.find((f) => f.description.includes('shell command'));
    expect(finding).toBeDefined();
  });

  it('UD-004: missing debounce on scroll/resize handler -- warning', async () => {
    const rawFiles = new Map([
      ['src/ui.ts', 'window.addEventListener("scroll", handleScroll);'],
    ]);

    const ctx = createProjectContext({ rawFiles });
    const result = await unoptimizedDefaults.run(ctx);

    const finding = result.findings.find((f) => f.description.includes('debounce'));
    expect(finding).toBeDefined();
  });

  it('UD-005: query with LIMIT present -- clean', async () => {
    const rawFiles = new Map([
      ['src/db.ts', 'const rows = await db.query("SELECT id FROM users WHERE active = true LIMIT 10");'],
    ]);

    const ctx = createProjectContext({ rawFiles });
    const result = await unoptimizedDefaults.run(ctx);

    const limitFinding = result.findings.find((f) => f.description.includes('LIMIT'));
    expect(limitFinding).toBeUndefined();
  });

  it('empty rawFiles produces clean', async () => {
    const ctx = createProjectContext({ rawFiles: new Map() });
    const result = await unoptimizedDefaults.run(ctx);

    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
  });

  it('scroll handler with debounce -- clean', async () => {
    const rawFiles = new Map([
      ['src/ui.ts', [
        'import { debounce } from "lodash";',
        'const handler = debounce(handleScroll, 200);',
        'window.addEventListener("scroll", handler);',
      ].join('\n')],
    ]);

    const ctx = createProjectContext({ rawFiles });
    const result = await unoptimizedDefaults.run(ctx);

    const debounceFinding = result.findings.find((f) => f.description.includes('debounce'));
    expect(debounceFinding).toBeUndefined();
  });
});
