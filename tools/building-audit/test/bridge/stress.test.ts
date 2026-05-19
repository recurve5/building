import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { createFixtureProject, buildMockContext } from './fixtures/fixture-factory.js';
import { generateRemediationTask } from '../../src/bridge/remediation-task.js';
import {
  tagMilestoneStart,
  tagMilestoneComplete,
  createRollbackBranch,
} from '../../src/bridge/git-checkpoint.js';
import { writeGitState } from '../../src/bridge/state-git.js';
import { appendDetection } from '../../src/bridge/detection-writer.js';
import { classifyFinding } from '../../src/bridge/policy.js';
import { getRemediationDepth } from '../../src/bridge/remediation-depth.js';
import type { Detection } from '../../src/bridge/types.js';
import type {
  CheckResult,
  Finding,
  ParsedTaskFile,
} from '../../src/types/index.js';

// Stress tests validate non-functional requirements from PRD Section 6.
describe('Stress Tests', { timeout: 60_000 }, () => {
  // ---------- helpers ----------

  function makeCheckResult(
    overrides: Partial<CheckResult> = {},
  ): CheckResult {
    return {
      name: overrides.name ?? 'test-cheat',
      layer: overrides.layer ?? 1,
      status: overrides.status ?? 'completed',
      severity: overrides.severity ?? 'warning',
      findings: overrides.findings ?? [],
      errorMessage: overrides.errorMessage ?? null,
    };
  }

  function makeFinding(overrides: Partial<Finding> = {}): Finding {
    return {
      file: overrides.file ?? 'src/utils.ts',
      location: overrides.location ?? 'line 10',
      description: overrides.description ?? 'Test finding',
      suggestion: overrides.suggestion ?? 'Fix it',
    };
  }

  function makeDetection(overrides: Partial<Detection> = {}): Detection {
    return {
      timestamp: overrides.timestamp ?? new Date().toISOString(),
      trigger: overrides.trigger ?? 'task-complete',
      taskId: 'taskId' in overrides ? overrides.taskId! : 1,
      layer: overrides.layer ?? 1,
      results: overrides.results ?? [makeCheckResult()],
      actions: overrides.actions ?? [],
    };
  }

  function makeTaskFile(
    num: number,
    reworkOf: string | null = null,
  ): ParsedTaskFile {
    return {
      filePath: `/tmp/tasks/${String(num).padStart(3, '0')}-task.md`,
      variant: reworkOf ? 'fix' : 'full',
      taskNumber: num,
      shortName: `task-${num}`,
      track: 'A',
      phase: 'A1',
      status: 'done',
      dependsOn: [],
      context: { defaults: [], taskSpecific: [] },
      reworkOf,
      whatToBuild: reworkOf ? null : 'Build something',
      whatToFix: reworkOf ? 'Fix something' : null,
      files: { create: [], modify: [], doNotTouch: [] },
      contracts: null,
      acceptanceCriteria: [],
      tests: [],
      deployment: null,
      executionPlan: null,
      notes: null,
      completed: null,
    };
  }

  // ---------- STR-001 ----------

  it('STR-001: Layer 1 audit performance under scale (< 10s for 30 tasks, 200 source files)', async () => {
    // Build source files for the fixture
    const sourceFiles = Array.from({ length: 200 }, (_, i) => ({
      path: `src/module-${i}/index.ts`,
      content: [
        `// Module ${i}`,
        `export function fn${i}(x: number): number { return x * ${i}; }`,
        `export const data${i} = { id: ${i}, name: 'item-${i}' };`,
        `export class Service${i} {`,
        `  private value = ${i};`,
        `  getValue() { return this.value; }`,
        `}`,
      ].join('\n'),
    }));

    // Create fixture with no tasks (we write parseable ones manually)
    const fixture = createFixtureProject({
      sourceFiles,
      initGit: true,
      milestone: 'm1-scale',
    });

    // Write 30 task files with correct format (needs **Track:** for parser)
    const tasksDir = join(fixture.path, 'm1-scale', 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    for (let i = 1; i <= 30; i++) {
      const padded = String(i).padStart(3, '0');
      writeFileSync(
        join(tasksDir, `${padded}-scale-task-${i}.md`),
        [
          `# Task ${padded}: Scale Task ${i}`,
          '',
          `**Track:** A`,
          `**Phase:** A1`,
          `**Status:** done`,
          '',
          '## What to Build',
          '',
          `Build feature ${i}.`,
          '',
          '## Files',
          '',
          `- Create: src/module-${i}/index.ts`,
          '',
          '## Acceptance Criteria',
          '',
          '1. It works.',
          '',
          '## Tests',
          '',
          '- [ ] T-001: Basic test',
        ].join('\n'),
      );
    }

    try {
      // Import scanner dynamically to avoid polluting other tests
      const { scanProject } = await import(
        '../../src/scanner/project-scanner.js'
      );

      const start = performance.now();
      const context = await scanProject(fixture.path, 'm1-scale');
      const elapsed = performance.now() - start;

      expect(context.taskFiles.length).toBeGreaterThanOrEqual(30);
      expect(elapsed).toBeLessThan(10_000); // < 10 seconds
    } finally {
      fixture.cleanup();
    }
  });

  // ---------- STR-002 ----------

  it('STR-002: Repeated audit runs do not leak memory (25 sequential runs, no monotonic growth)', async () => {
    // Run policy classification + detection writing 25 times. Track heap usage.
    const tmpDir = mkdtempSync(join(tmpdir(), 'str002-'));
    const statePath = join(tmpDir, 'state.json');

    try {
      const heapSamples: number[] = [];

      for (let run = 0; run < 25; run++) {
        // Reset state.json each run
        writeFileSync(statePath, JSON.stringify({ version: 2 }, null, 2));

        // Simulate a post-task classification cycle
        for (let task = 1; task <= 5; task++) {
          classifyFinding('test-cheat', 'warning', 0, 'task-complete');
          classifyFinding('scope-creep', 'clean', 0, 'task-complete');
          classifyFinding('clean-slate-bias', 'info', 0, 'task-complete');

          appendDetection(statePath, makeDetection({ taskId: task }));
        }

        // Force GC if available (Node --expose-gc), otherwise just sample
        if (typeof global.gc === 'function') {
          global.gc();
        }
        heapSamples.push(process.memoryUsage().heapUsed);
      }

      // Check for monotonic growth: count how many consecutive increases there are.
      // A memory leak shows as a long run of increasing samples.
      // Allow some variance — we fail only if the last 10 samples are ALL higher
      // than sample 5 (after warm-up) by more than 50%.
      const warmupSample = heapSamples[4];
      const tail = heapSamples.slice(15);
      const monotonicallyGrowing = tail.every((s) => s > warmupSample * 1.5);

      expect(monotonicallyGrowing).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ---------- STR-003 ----------

  it('STR-003: Large milestone with many remediation tasks (15 originals + 30 remediations)', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'str003-'));
    const milestone = 'm1-large';
    const milestonePath = join(tmpDir, milestone);
    const tasksDir = join(milestonePath, 'tasks');
    mkdirSync(tasksDir, { recursive: true });

    try {
      // Create 15 original tasks
      for (let i = 1; i <= 15; i++) {
        const padded = String(i).padStart(3, '0');
        writeFileSync(
          join(tasksDir, `${padded}-original-task-${i}.md`),
          [
            `# Task ${padded}: Original ${i}`,
            '',
            '**Status:** done',
            '',
            '## What to Build',
            '',
            `Build feature ${i}.`,
            '',
            '## Files',
            '',
            `- Create: src/feature-${i}.ts`,
            '',
            '## Acceptance Criteria',
            '',
            '1. It works.',
            '',
            '## Tests',
            '',
            '- [ ] T-001: Basic test',
          ].join('\n'),
        );
      }

      // Generate 30 remediation tasks (2 per original)
      const generatedNumbers: number[] = [];
      for (let orig = 1; orig <= 15; orig++) {
        for (let fix = 0; fix < 2; fix++) {
          const { taskNumber, filePath } = await generateRemediationTask(
            milestonePath,
            {
              originatingTaskNumber: orig,
              checkName: fix === 0 ? 'test-cheat' : 'scope-creep',
              severity: 'warning',
              finding: makeFinding({
                file: `src/feature-${orig}.ts`,
                location: `line ${10 + fix * 5}`,
              }),
              remediationDepth: 0,
            },
          );
          generatedNumbers.push(taskNumber);
          // Verify file was created
          const content = readFileSync(filePath, 'utf-8');
          expect(content).toContain('Rework of:');
        }
      }

      // Verify all 30 remediation tasks got unique sequential numbers
      expect(generatedNumbers).toHaveLength(30);
      const uniqueNumbers = new Set(generatedNumbers);
      expect(uniqueNumbers.size).toBe(30);

      // Verify numbering starts after the 15 originals
      expect(Math.min(...generatedNumbers)).toBe(16);
      expect(Math.max(...generatedNumbers)).toBe(45);

      // Verify remediation depth classification
      for (const num of generatedNumbers) {
        const task = makeTaskFile(num, '001');
        expect(getRemediationDepth(task)).toBe(1);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ---------- STR-004 ----------

  it('STR-004: Git operations under many tags and branches (100 tags, 50 branches, < 2s each)', () => {
    const fixture = createFixtureProject({ initGit: true });

    try {
      // Create 100 pre-existing tags
      for (let i = 0; i < 100; i++) {
        execSync(`git tag stress-tag-${i}`, {
          cwd: fixture.path,
          stdio: 'pipe',
        });
      }

      // Create 50 pre-existing branches
      for (let i = 0; i < 50; i++) {
        execSync(`git branch stress-branch-${i}`, {
          cwd: fixture.path,
          stdio: 'pipe',
        });
      }

      // Time tagMilestoneStart
      const startTime1 = performance.now();
      const startResult = tagMilestoneStart('str004', fixture.path);
      const elapsed1 = performance.now() - startTime1;
      expect(startResult.created).toBe(true);
      expect(elapsed1).toBeLessThan(2_000);

      // Time tagMilestoneComplete
      const startTime2 = performance.now();
      const completeResult = tagMilestoneComplete('str004', fixture.path);
      const elapsed2 = performance.now() - startTime2;
      expect(completeResult.created).toBe(true);
      expect(elapsed2).toBeLessThan(2_000);

      // Time createRollbackBranch
      const startTime3 = performance.now();
      const rollbackResult = createRollbackBranch(
        'str004',
        undefined,
        fixture.path,
      );
      const elapsed3 = performance.now() - startTime3;
      expect(rollbackResult.created).toBe(true);
      expect(elapsed3).toBeLessThan(2_000);
    } finally {
      fixture.cleanup();
    }
  });

  // ---------- STR-005 ----------

  it('STR-005: Layer 2 candidate dump with large codebase (30 tasks, 300 files, < 30s)', async () => {
    const sourceFiles = Array.from({ length: 300 }, (_, i) => ({
      path: `src/pkg-${Math.floor(i / 10)}/file-${i}.ts`,
      content: [
        `// File ${i}`,
        `export function helper${i}() { return ${i}; }`,
        `export const config${i} = { enabled: true, limit: ${i * 10} };`,
      ].join('\n'),
    }));

    const fixture = createFixtureProject({
      sourceFiles,
      initGit: true,
      milestone: 'm1-l2scale',
    });

    // Write 30 task files with correct format
    const tasksDir = join(fixture.path, 'm1-l2scale', 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    for (let i = 1; i <= 30; i++) {
      const padded = String(i).padStart(3, '0');
      writeFileSync(
        join(tasksDir, `${padded}-l2-task-${i}.md`),
        [
          `# Task ${padded}: L2 Task ${i}`,
          '',
          `**Track:** A`,
          `**Phase:** A1`,
          `**Status:** done`,
          '',
          '## What to Build',
          '',
          `Build feature ${i}.`,
          '',
          '## Files',
          '',
          `- Create: src/pkg-${Math.floor((i - 1) / 10)}/file-${i}.ts`,
          '',
          '## Acceptance Criteria',
          '',
          '1. It works.',
          '',
          '## Tests',
          '',
          '- [ ] T-001: Basic test',
        ].join('\n'),
      );
    }

    try {
      const { runMilestoneCloseAudit } = await import(
        '../../src/bridge/milestone-close-audit.js'
      );

      const start = performance.now();
      const { candidates, errors } = await runMilestoneCloseAudit(
        fixture.path,
        'm1-l2scale',
      );
      const elapsed = performance.now() - start;

      // Should return candidate dumps (some checks may not have candidates, that's fine)
      expect(candidates.size + errors.size).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(30_000);
    } finally {
      fixture.cleanup();
    }
  });

  // ---------- STR-006 ----------

  it('STR-006: Determinism of Layer 1 results (10 identical runs produce identical results)', () => {
    // Run policy classification 10 times with the same inputs
    // and verify identical output each time.
    const checks = [
      'test-cheat',
      'scope-creep',
      'dependency-grab',
      'premature-abstraction',
      'surface-heresy',
      'confidence-bluff',
      'fragility-metrics',
      'resource-drain',
      'unoptimized-defaults',
      'clean-slate-bias',
    ] as const;
    const severities: CheckResult['severity'][] = [
      'critical',
      'warning',
      'info',
      'clean',
    ];
    const triggers = ['task-complete', 'milestone-close'] as const;

    // Collect results from 10 runs
    const runs: string[] = [];
    for (let run = 0; run < 10; run++) {
      const results: Array<{ tier: number; action: string }> = [];
      for (const checkName of checks) {
        for (const sev of severities) {
          for (const trigger of triggers) {
            results.push(classifyFinding(checkName, sev, 0, trigger));
          }
        }
      }
      runs.push(JSON.stringify(results));
    }

    // All 10 runs should produce identical serialized output
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]).toBe(runs[0]);
    }

    // Also verify state.json writing determinism
    const tmpDir = mkdtempSync(join(tmpdir(), 'str006-'));
    try {
      const stateOutputs: string[] = [];
      for (let run = 0; run < 10; run++) {
        const statePath = join(tmpDir, `state-${run}.json`);
        writeFileSync(statePath, JSON.stringify({ version: 2 }, null, 2));

        writeGitState(statePath, 'startTag', {
          created: true,
          ref: 'abc123',
          error: null,
        });
        writeGitState(statePath, 'completeTag', {
          created: true,
          ref: 'def456',
          error: null,
        });
        appendDetection(statePath, makeDetection({ taskId: 1 }));

        stateOutputs.push(readFileSync(statePath, 'utf-8'));
      }

      // All 10 state files should have the same structure (timestamps differ,
      // so compare structure without timestamp)
      const structures = stateOutputs.map((s) => {
        const parsed = JSON.parse(s);
        // Zero out the timestamp for comparison
        if (parsed.detections?.[0]) {
          parsed.detections[0].timestamp = 'NORMALIZED';
        }
        return JSON.stringify(parsed);
      });

      for (let i = 1; i < structures.length; i++) {
        expect(structures[i]).toBe(structures[0]);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
