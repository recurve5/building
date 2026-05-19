// Fixture factory for bridge tests.
// Creates temporary project directories and mock ProjectContext objects.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import type { ProjectContext } from '../../../src/types/index.js';

export interface FixtureOptions {
  tasks?: Array<{
    number: number;
    name: string;
    variant: 'full' | 'fix';
    reworkOf?: number;
  }>;
  sourceFiles?: Array<{ path: string; content: string }>;
  initGit?: boolean;
  existingTags?: string[];
  existingBranches?: string[];
  milestone?: string;
}

/**
 * Create a temporary project directory with the specified structure.
 * Returns the path and a cleanup function to remove it.
 */
export function createFixtureProject(
  options: FixtureOptions = {},
): { path: string; cleanup: () => void } {
  const projectDir = mkdtempSync(join(tmpdir(), 'building-audit-fixture-'));
  const milestone = options.milestone ?? 'm1-test';

  // Create milestone directory structure
  const milestoneDir = join(projectDir, milestone);
  const tasksDir = join(milestoneDir, 'tasks');
  mkdirSync(tasksDir, { recursive: true });

  // Create task files
  if (options.tasks) {
    for (const task of options.tasks) {
      const paddedNum = String(task.number).padStart(3, '0');
      const fileName = `${paddedNum}-${task.name}.md`;
      const content = buildTaskFileContent(task);
      writeFileSync(join(tasksDir, fileName), content);
    }
  }

  // Create source files
  if (options.sourceFiles) {
    for (const file of options.sourceFiles) {
      const filePath = join(projectDir, file.path);
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, file.content);
    }
  }

  // Initialize git if requested
  if (options.initGit) {
    execSync('git init', { cwd: projectDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', {
      cwd: projectDir,
      stdio: 'pipe',
    });
    execSync('git config user.name "Test"', {
      cwd: projectDir,
      stdio: 'pipe',
    });
    execSync('git add -A', { cwd: projectDir, stdio: 'pipe' });
    execSync('git commit -m "initial commit" --allow-empty', {
      cwd: projectDir,
      stdio: 'pipe',
    });

    if (options.existingTags) {
      for (const tag of options.existingTags) {
        execSync(`git tag ${tag}`, { cwd: projectDir, stdio: 'pipe' });
      }
    }

    if (options.existingBranches) {
      for (const branch of options.existingBranches) {
        execSync(`git branch ${branch}`, { cwd: projectDir, stdio: 'pipe' });
      }
    }
  }

  return {
    path: projectDir,
    cleanup: () => {
      rmSync(projectDir, { recursive: true, force: true });
    },
  };
}

function buildTaskFileContent(task: {
  number: number;
  name: string;
  variant: 'full' | 'fix';
  reworkOf?: number;
}): string {
  const paddedNum = String(task.number).padStart(3, '0');
  const header = `# Task ${paddedNum}: ${task.name}`;
  const lines = [header, ''];

  if (task.variant === 'fix') {
    lines.push(`**Variant:** fix`);
    if (task.reworkOf != null) {
      lines.push(`**Rework of:** ${String(task.reworkOf).padStart(3, '0')}`);
    }
  }

  lines.push(`**Status:** done`);
  lines.push('');
  lines.push(`## What to ${task.variant === 'fix' ? 'Fix' : 'Build'}`);
  lines.push('');
  lines.push(`Build task ${paddedNum}.`);
  lines.push('');
  lines.push('## Files');
  lines.push('');
  lines.push('- Create: none');
  lines.push('');
  lines.push('## Acceptance Criteria');
  lines.push('');
  lines.push('1. It works.');
  lines.push('');
  lines.push('## Tests');
  lines.push('');
  lines.push('- [ ] T-001: Basic test');

  return lines.join('\n');
}

/**
 * Build a mock ProjectContext with sensible defaults.
 * Overrides are shallow-merged.
 */
export function buildMockContext(
  overrides: Partial<ProjectContext> = {},
): ProjectContext {
  return {
    projectPath: overrides.projectPath ?? '/tmp/mock-project',
    milestone: overrides.milestone ?? 'm1-test',
    taskFiles: overrides.taskFiles ?? [],
    parseErrors: overrides.parseErrors ?? [],
    gitLog: overrides.gitLog ?? [],
    decisions: overrides.decisions ?? [],
    sourceFiles: overrides.sourceFiles ?? new Map(),
    rawFiles: overrides.rawFiles ?? new Map(),
    packageJsonHistory: overrides.packageJsonHistory ?? {
      initial: null,
      current: null,
    },
    fileToTaskMapping: overrides.fileToTaskMapping ?? new Map(),
    testResultFiles: overrides.testResultFiles ?? [],
  };
}
