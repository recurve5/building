// Tests for project-scanner: SCN-001 through SCN-007
// Uses temp directories with synthetic project structures.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { scanProject } from '../../src/scanner/project-scanner.js';

// Suppress console.error timing logs during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'scanner-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// --- Helper: create a minimal task file ---
function taskFileContent(num: number, name: string): string {
  return `# Task ${String(num).padStart(3, '0')}: ${name}

**Track:** A
**Phase:** A1
**Status:** not started
**Depends on:** none
**Context:**
- Defaults: project CLAUDE.md
- Task-specific: none

## What to Build

Build the ${name} module.

## Files

- Create: \`src/${name.toLowerCase()}.ts\`

## Acceptance Criteria

1. It works.

## Tests

- [ ] T-001: Basic test
`;
}

function decisionsContent(): string {
  return `# Decisions

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Use TypeScript | Type safety | 2026-04-13 |
| 2 | [HARD KILL] No jQuery | Modern stack | 2026-04-13 |
`;
}

function sourceFileContent(): string {
  return `export function hello(name: string): string {
  return \`Hello, \${name}\`;
}
`;
}

describe('scanProject', () => {
  // SCN-001: Scanner assembles ProjectContext from valid project
  it('SCN-001: assembles ProjectContext from valid project', async () => {
    // Set up: tasks/, DECISIONS.md, source file
    await mkdir(join(tmpDir, 'tasks'), { recursive: true });
    await mkdir(join(tmpDir, 'src'), { recursive: true });
    await writeFile(join(tmpDir, 'tasks', '001-parser.md'), taskFileContent(1, 'Parser'));
    await writeFile(join(tmpDir, 'tasks', '002-scanner.md'), taskFileContent(2, 'Scanner'));
    await writeFile(join(tmpDir, 'DECISIONS.md'), decisionsContent());
    await writeFile(join(tmpDir, 'src', 'hello.ts'), sourceFileContent());
    await writeFile(join(tmpDir, 'package.json'), '{"name": "test"}');

    const ctx = await scanProject(tmpDir);

    expect(ctx.projectPath).toBe(tmpDir);
    expect(ctx.milestone).toBeNull();
    expect(ctx.taskFiles).toHaveLength(2);
    expect(ctx.taskFiles[0].taskNumber).toBe(1);
    expect(ctx.taskFiles[1].taskNumber).toBe(2);
    expect(ctx.parseErrors).toHaveLength(0);
    expect(ctx.decisions).toHaveLength(2);
    expect(ctx.decisions[1].tags).toContain('HARD KILL');

    // Source files analyzed
    const sourceEntries = Array.from(ctx.sourceFiles.entries());
    expect(sourceEntries.length).toBeGreaterThanOrEqual(1);
    // Should have the hello.ts file
    const helloEntry = ctx.sourceFiles.get('src/hello.ts');
    expect(helloEntry).toBeDefined();
    expect(helloEntry!.functions).toHaveLength(1);
    expect(helloEntry!.functions[0].name).toBe('hello');

    // Package.json current should be present
    expect(ctx.packageJsonHistory.current).toBe('{"name": "test"}');

    // Git log empty (not a git repo)
    expect(ctx.gitLog).toHaveLength(0);
    expect(ctx.fileToTaskMapping.size).toBe(0);
  });

  // SCN-002: Milestone scoping filters correctly
  it('SCN-002: milestone scoping filters task files to milestone directory', async () => {
    // Set up: m1-foo/tasks/ and m2-bar/tasks/
    await mkdir(join(tmpDir, 'm1-foo', 'tasks'), { recursive: true });
    await mkdir(join(tmpDir, 'm2-bar', 'tasks'), { recursive: true });
    await writeFile(join(tmpDir, 'm1-foo', 'tasks', '001-alpha.md'), taskFileContent(1, 'Alpha'));
    await writeFile(join(tmpDir, 'm2-bar', 'tasks', '002-beta.md'), taskFileContent(2, 'Beta'));

    // Scan with milestone filter
    const ctx = await scanProject(tmpDir, 'm1-foo');

    expect(ctx.milestone).toBe('m1-foo');
    expect(ctx.taskFiles).toHaveLength(1);
    expect(ctx.taskFiles[0].taskNumber).toBe(1);
    expect(ctx.taskFiles[0].shortName).toBe('Alpha');
  });

  // SCN-003: Parse errors collected, not fatal
  it('SCN-003: parse errors collected, scanner continues', async () => {
    await mkdir(join(tmpDir, 'tasks'), { recursive: true });
    await writeFile(join(tmpDir, 'tasks', '001-good.md'), taskFileContent(1, 'Good'));
    // Malformed task file: no h1
    await writeFile(join(tmpDir, 'tasks', '002-bad.md'), 'This is not a valid task file.\n\nNo heading here.');
    // Empty file
    await writeFile(join(tmpDir, 'tasks', '003-empty.md'), '');

    const ctx = await scanProject(tmpDir);

    expect(ctx.taskFiles).toHaveLength(1);
    expect(ctx.taskFiles[0].taskNumber).toBe(1);
    expect(ctx.parseErrors).toHaveLength(2);
    expect(ctx.parseErrors.some((e) => e.file.includes('002-bad.md'))).toBe(true);
    expect(ctx.parseErrors.some((e) => e.file.includes('003-empty.md'))).toBe(true);
  });

  // SCN-004: No task files -- task-dependent context empty
  it('SCN-004: no task files produces empty task-dependent context', async () => {
    // Project with no tasks/ directory at all
    await mkdir(join(tmpDir, 'src'), { recursive: true });
    await writeFile(join(tmpDir, 'src', 'index.ts'), sourceFileContent());

    const ctx = await scanProject(tmpDir);

    expect(ctx.taskFiles).toHaveLength(0);
    expect(ctx.parseErrors).toHaveLength(0);
    // Source files should still be analyzed
    expect(ctx.sourceFiles.size).toBeGreaterThanOrEqual(1);
  });

  // SCN-005: AST parsing runs once -- timing logged
  it('SCN-005: source files are analyzed and timing is logged', async () => {
    await mkdir(join(tmpDir, 'src'), { recursive: true });
    await writeFile(join(tmpDir, 'src', 'a.ts'), 'export const x = 1;\n');
    await writeFile(join(tmpDir, 'src', 'b.ts'), 'export function foo(): void {}\n');

    const ctx = await scanProject(tmpDir);

    expect(ctx.sourceFiles.size).toBe(2);
    const aFile = ctx.sourceFiles.get('src/a.ts');
    expect(aFile).toBeDefined();
    expect(aFile!.exports).toHaveLength(1);

    const bFile = ctx.sourceFiles.get('src/b.ts');
    expect(bFile).toBeDefined();
    expect(bFile!.functions).toHaveLength(1);

    // Timing was logged (console.error was called with timing info)
    expect(console.error).toHaveBeenCalled();
  });

  // SCN-006: Path validation rejects traversal attempts
  it('SCN-006: rejects milestone with path separators', async () => {
    await expect(scanProject(tmpDir, '../etc')).rejects.toThrow('path separators not allowed');
    await expect(scanProject(tmpDir, 'foo/bar')).rejects.toThrow('path separators not allowed');
    await expect(scanProject(tmpDir, 'foo\\bar')).rejects.toThrow('path separators not allowed');
  });

  it('SCN-006b: rejects milestone with dot-dot traversal', async () => {
    await expect(scanProject(tmpDir, '..')).rejects.toThrow('directory traversal not allowed');
    await expect(scanProject(tmpDir, 'foo..bar')).rejects.toThrow('directory traversal not allowed');
  });

  it('SCN-006c: rejects empty milestone name', async () => {
    await expect(scanProject(tmpDir, '')).rejects.toThrow('empty string');
    await expect(scanProject(tmpDir, '  ')).rejects.toThrow('empty string');
  });

  // SCN-007: Empty project directory
  it('SCN-007: empty project directory produces empty context', async () => {
    const ctx = await scanProject(tmpDir);

    expect(ctx.projectPath).toBe(tmpDir);
    expect(ctx.milestone).toBeNull();
    expect(ctx.taskFiles).toHaveLength(0);
    expect(ctx.parseErrors).toHaveLength(0);
    expect(ctx.gitLog).toHaveLength(0);
    expect(ctx.decisions).toHaveLength(0);
    expect(ctx.sourceFiles.size).toBe(0);
    expect(ctx.rawFiles.size).toBe(0);
    expect(ctx.packageJsonHistory.initial).toBeNull();
    expect(ctx.packageJsonHistory.current).toBeNull();
    expect(ctx.fileToTaskMapping.size).toBe(0);
    expect(ctx.testResultFiles).toHaveLength(0);
  });

  it('rejects non-existent project path', async () => {
    await expect(scanProject('/nonexistent/path/xyz123')).rejects.toThrow('not a directory');
  });

  it('reads DECISIONS.md from milestone directory when scoped', async () => {
    await mkdir(join(tmpDir, 'm1-foo', 'tasks'), { recursive: true });
    await writeFile(
      join(tmpDir, 'm1-foo', 'tasks', '001-alpha.md'),
      taskFileContent(1, 'Alpha'),
    );
    await writeFile(join(tmpDir, 'm1-foo', 'DECISIONS.md'), decisionsContent());

    const ctx = await scanProject(tmpDir, 'm1-foo');

    expect(ctx.decisions).toHaveLength(2);
  });

  it('collects raw files (markdown, json) alongside source files', async () => {
    await mkdir(join(tmpDir, 'docs'), { recursive: true });
    await writeFile(join(tmpDir, 'docs', 'readme.md'), '# Hello\n');
    await writeFile(join(tmpDir, 'config.json'), '{"key": "value"}');

    const ctx = await scanProject(tmpDir);

    expect(ctx.rawFiles.has('docs/readme.md')).toBe(true);
    expect(ctx.rawFiles.get('docs/readme.md')).toBe('# Hello\n');
    expect(ctx.rawFiles.has('config.json')).toBe(true);
  });

  it('discovers test result files in standard locations', async () => {
    await mkdir(join(tmpDir, 'test-results'), { recursive: true });
    await writeFile(join(tmpDir, 'test-results', 'results.xml'), '<testsuites/>');
    await writeFile(join(tmpDir, 'test-results', 'vitest-report.json'), '{}');

    const ctx = await scanProject(tmpDir);

    expect(ctx.testResultFiles).toHaveLength(2);
    expect(ctx.testResultFiles.some((f) => f.format === 'junit-xml')).toBe(true);
    expect(ctx.testResultFiles.some((f) => f.format === 'vitest-json')).toBe(true);
  });

  it('scans milestone subdirectory for source files when milestone is set', async () => {
    await mkdir(join(tmpDir, 'm1-foo', 'src'), { recursive: true });
    await mkdir(join(tmpDir, 'm2-bar', 'src'), { recursive: true });
    await writeFile(join(tmpDir, 'm1-foo', 'src', 'a.ts'), 'export const a = 1;\n');
    await writeFile(join(tmpDir, 'm2-bar', 'src', 'b.ts'), 'export const b = 2;\n');

    const ctx = await scanProject(tmpDir, 'm1-foo');

    // Should only analyze files within m1-foo
    const keys = Array.from(ctx.sourceFiles.keys());
    expect(keys.some((k) => k.includes('m1-foo'))).toBe(true);
    expect(keys.some((k) => k.includes('m2-bar'))).toBe(false);
  });
});
