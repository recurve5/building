import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { simpleGit } from 'simple-git';
import { existsSync } from 'node:fs';

import { run } from '../../src/cli/index.js';

// Helper: create a minimal valid project with one task and one source file.
async function createMinimalProject(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dump-candidates-'));
  const git = simpleGit(path);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test');

  await mkdir(join(path, 'tasks'), { recursive: true });
  await writeFile(
    join(path, 'tasks', '001-example.md'),
    `# Task 001 — example

## What to Build
A trivial example.

## Files
- src/example.ts

## Tests
- one assertion exists
`,
  );

  await mkdir(join(path, 'src'), { recursive: true });
  await writeFile(
    join(path, 'src', 'example.ts'),
    `export function greet(name: string): string {
  return 'hello ' + name;
}
`,
  );

  await writeFile(
    join(path, 'DECISIONS.md'),
    `# Decisions

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Use TypeScript | Strong typing matters. | 2026-04-29 |
`,
  );

  await git.add('.');
  await git.commit('[001] initial example');

  return path;
}

describe('--dump-candidates', () => {
  let projectPath: string;
  let originalCwd: string;
  let exitSpy: any;

  beforeEach(async () => {
    projectPath = await createMinimalProject();
    originalCwd = process.cwd();
    process.chdir(projectPath);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => {
      throw new Error('EXIT');
    }) as never);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    exitSpy.mockRestore();
    await rm(projectPath, { recursive: true, force: true });
  });

  it('writes one JSON per Layer 2 check plus _meta.json to default dir', async () => {
    try {
      await run(['node', 'cli', '--dump-candidates']);
    } catch {
      /* exit thrown */
    }

    const dir = join(projectPath, '.building-audit', 'candidates');
    expect(existsSync(dir)).toBe(true);

    const expected = [
      'ghost-refactor.json',
      'clean-slate-bias.json',
      'deep-heresy.json',
      'document-heresy.json',
      'performance-critical.json',
      'react-fluidity.json',
      'refactoring-signals.json',
      '_meta.json',
    ];
    for (const name of expected) {
      expect(existsSync(join(dir, name))).toBe(true);
    }
  });

  it('every candidate file has the expected shape (check, count, candidates)', async () => {
    try {
      await run(['node', 'cli', '--dump-candidates']);
    } catch {
      /* exit thrown */
    }

    const dir = join(projectPath, '.building-audit', 'candidates');
    const checks = [
      'ghost-refactor',
      'clean-slate-bias',
      'deep-heresy',
      'document-heresy',
      'performance-critical',
      'react-fluidity',
      'refactoring-signals',
    ];
    for (const name of checks) {
      const raw = await readFile(join(dir, `${name}.json`), 'utf8');
      const parsed = JSON.parse(raw);
      expect(parsed.check).toBe(name);
      expect(typeof parsed.count).toBe('number');
      expect(Array.isArray(parsed.candidates)).toBe(true);
      expect(parsed.candidates.length).toBe(parsed.count);
    }
  });

  it('honors a custom directory argument', async () => {
    const customDir = 'custom-out';
    try {
      await run(['node', 'cli', '--dump-candidates', customDir]);
    } catch {
      /* exit thrown */
    }

    const dir = join(projectPath, customDir);
    expect(existsSync(dir)).toBe(true);
    expect(existsSync(join(dir, '_meta.json'))).toBe(true);
  });

  it('_meta.json reports per-check counts that match the candidate files', async () => {
    try {
      await run(['node', 'cli', '--dump-candidates']);
    } catch {
      /* exit thrown */
    }

    const dir = join(projectPath, '.building-audit', 'candidates');
    const meta = JSON.parse(await readFile(join(dir, '_meta.json'), 'utf8'));
    expect(meta.checks).toHaveLength(7);

    for (const entry of meta.checks) {
      const file = JSON.parse(await readFile(join(dir, entry.file), 'utf8'));
      expect(file.count).toBe(entry.count);
    }
  });
});

import { vi } from 'vitest';
