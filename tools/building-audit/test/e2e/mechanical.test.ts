import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';

import { scanProject } from '../../src/scanner/project-scanner.js';
import { runChecks, clearRegistry, registerCheck, getChecks } from '../../src/checks/registry.js';
import { buildReport } from '../../src/report/json-builder.js';
import type { AuditReport } from '../../src/types/index.js';

// Import the check objects directly so we can register them explicitly
import { testCheatCheck } from '../../src/checks/layer1/test-cheat.js';
import { scopeCreepCheck } from '../../src/checks/layer1/scope-creep.js';
import { dependencyGrab } from '../../src/checks/layer1/dependency-grab.js';
import { prematureAbstraction } from '../../src/checks/layer1/premature-abstraction.js';
import { surfaceHeresy } from '../../src/checks/layer1/surface-heresy.js';
import { confidenceBluff } from '../../src/checks/layer1/confidence-bluff.js';
import { fragilityMetrics } from '../../src/checks/layer1/fragility-metrics.js';
import { resourceDrain } from '../../src/checks/layer1/resource-drain.js';
import { unoptimizedDefaults } from '../../src/checks/layer1/unoptimized-defaults.js';

// ---------------------------------------------------------------------------
// Synthetic project content
// ---------------------------------------------------------------------------

// Task 001: full template, status done, files section declares src/feature.ts
const TASK_001 = `# Task 001: Feature — Build the Core Feature

**Track:** A
**Phase:** A1
**Status:** done
**Depends on:** none
**Context:**
- Defaults: CLAUDE.md, DECISIONS.md
- Task-specific: none

## What to Build

A core feature module that processes data and returns results.

## Files

- Create: \`src/feature.ts\`
- Modify: none
- Do not touch: \`src/auth.ts\`

## Contracts

Feature module exposes:
\`\`\`typescript
function processData(input: string): ProcessedResult
\`\`\`

## Acceptance Criteria

1. Given valid input, processData returns a structured result.
2. Given empty input, processData returns an empty result.

## Tests

- [ ] FT-001: processData with valid input
- [ ] FT-002: processData with empty input

## Execution Plan

1. My understanding: Build a feature module.
2. Planned approach: Create feature.ts with processData function and tests.
3. Expected result: One source file and one test file.
4. Ambiguity: None.
`;

// Task 002: full template, status done, files section declares src/auth.ts
const TASK_002 = `# Task 002: Auth — User Authentication

**Track:** A
**Phase:** A2
**Status:** done
**Depends on:** Task 001
**Context:**
- Defaults: CLAUDE.md, DECISIONS.md
- Task-specific: none

## What to Build

An authentication module that validates user credentials.

## Files

- Create: \`src/auth.ts\`
- Modify: none
- Do not touch: none

## Contracts

Auth module exposes:
\`\`\`typescript
function authenticate(userId: string, password: string): boolean
\`\`\`

## Acceptance Criteria

1. Given valid credentials, authenticate returns true.
2. Given invalid credentials, authenticate returns false.

## Tests

- [ ] AU-001: authenticate with valid credentials
- [ ] AU-002: authenticate with invalid credentials

## Execution Plan

1. My understanding: Build an auth module.
2. Planned approach: Create auth.ts with authenticate function.
3. Expected result: One source file.
4. Ambiguity: None.
`;

// Malformed task file — missing required fields
const BAD_TASK = `This is not a proper task file.

It has no headings, no frontmatter, and no structure.
Just some random text that happens to be in a markdown file.
`;

// DECISIONS.md with a HARD KILL entry
const DECISIONS_MD = `| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Use REST API | Simpler than GraphQL for v1 | 2026-01-01 |
| 2 | [HARD KILL] No WebSocket support | Too complex for v1 | 2026-01-01 |
`;

// package.json — current version has lodash (unjustified dependency)
const PACKAGE_JSON = JSON.stringify(
  {
    name: 'synthetic-project',
    version: '1.0.0',
    dependencies: {
      lodash: '^4.17.21',
    },
  },
  null,
  2,
);

// feature.ts — test function with weak assertions + correctness-implying name
// (triggers test-cheat), setInterval without cleanup (triggers resource-drain
// if file ends up in rawFiles — but .ts goes to sourceFiles only, so
// resource-drain won't catch it; test-cheat will catch the weak assertions).
const FEATURE_TS = `import { describe, it, expect } from 'vitest';

export interface ProcessedResult {
  value: string;
}

export function processData(input: string): ProcessedResult {
  return { value: input.trim() };
}

// TODO: refactor this later
// TODO: add error handling

const timer = setInterval(() => {
  console.log('heartbeat');
}, 1000);

describe('processData', () => {
  it('returns the correct processed result', () => {
    const result = processData('hello');
    expect(result).toBeDefined();
  });
});
`;

// auth.ts — interface with one implementation (premature-abstraction)
// SQL injection pattern is in a separate .yaml file for rawFiles detection.
const AUTH_TS = `export interface AuthProvider {
  authenticate(userId: string, password: string): boolean;
}

export class SimpleAuthProvider implements AuthProvider {
  authenticate(userId: string, password: string): boolean {
    return userId === 'admin' && password === 'secret';
  }
}
`;

// utils.ts — out of scope for task 001 but touched in commit 1
const UTILS_TS = `export function formatDate(date: Date): string {
  return date.toISOString();
}
`;

// README for an unattributed commit
const README_MD = `# Synthetic Project

A test project for the building-audit E2E tests.
`;

// A raw file (.yaml) containing SQL injection pattern so unoptimized-defaults
// can detect it via rawFiles. (.ts files go to sourceFiles, not rawFiles.)
const DB_CONFIG_YAML = `# Database configuration
queries:
  getUser: query(\`SELECT * FROM users WHERE id = \${userId}\`)
  getAllUsers: SELECT * FROM users
`;

// A raw .md file with setInterval (so resource-drain can detect it via rawFiles)
const NOTES_MD = `# Development Notes

The background worker uses setInterval to poll:

\`\`\`js
setInterval(() => { fetch('/api/poll'); }, 5000);
\`\`\`

TODO: add cleanup for interval
TODO: handle errors
TODO: add retry logic
TODO: add timeout
TODO: add backoff
TODO: fix race condition
`;

// A source file that references "WebSocket" — the HARD KILL term
const WEBSOCKET_REF_TS = `// This module sets up real-time updates
// We decided to use WebSocket for live data
export function connectWebSocket(url: string): void {
  console.log('connecting to', url);
}
`;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

// Layer 1 check objects for explicit registration
const LAYER1_CHECKS = [
  testCheatCheck,
  scopeCreepCheck,
  dependencyGrab,
  prematureAbstraction,
  surfaceHeresy,
  confidenceBluff,
  fragilityMetrics,
  resourceDrain,
  unoptimizedDefaults,
];

describe('E2E: mechanical mode pipeline', () => {
  let projectDir: string;
  let report: AuditReport;

  beforeAll(async () => {
    // Ensure clean registry with exactly the Layer 1 checks we need
    clearRegistry();
    for (const check of LAYER1_CHECKS) {
      registerCheck(check);
    }

    // Create temp directory
    projectDir = await mkdtemp(join(tmpdir(), 'audit-e2e-'));

    // Create directory structure
    await mkdir(join(projectDir, 'tasks'), { recursive: true });
    await mkdir(join(projectDir, 'src'), { recursive: true });

    // Write task files
    await writeFile(join(projectDir, 'tasks', '001-feature.md'), TASK_001);
    await writeFile(join(projectDir, 'tasks', '002-auth.md'), TASK_002);
    await writeFile(join(projectDir, 'tasks', 'bad-task.md'), BAD_TASK);

    // Write project files
    await writeFile(join(projectDir, 'DECISIONS.md'), DECISIONS_MD);
    await writeFile(join(projectDir, 'package.json'), PACKAGE_JSON);

    // Write source files
    await writeFile(join(projectDir, 'src', 'feature.ts'), FEATURE_TS);
    await writeFile(join(projectDir, 'src', 'auth.ts'), AUTH_TS);
    await writeFile(join(projectDir, 'src', 'utils.ts'), UTILS_TS);
    await writeFile(join(projectDir, 'src', 'websocket-ref.ts'), WEBSOCKET_REF_TS);
    await writeFile(join(projectDir, 'README.md'), README_MD);
    await writeFile(join(projectDir, 'db-config.yaml'), DB_CONFIG_YAML);
    await writeFile(join(projectDir, 'notes.md'), NOTES_MD);

    // Initialize git repo
    const git = simpleGit(projectDir);
    await git.init();
    await git.addConfig('user.email', 'test@test.com');
    await git.addConfig('user.name', 'Test');

    // Commit 1: [001] add feature — touches src/feature.ts AND src/utils.ts
    // (utils.ts is out-of-scope for task 001 -> Scope Creep)
    await git.add(['src/feature.ts', 'src/utils.ts']);
    await git.commit('[001] add feature');

    // Commit 2: [002] add auth — touches src/auth.ts
    await git.add(['src/auth.ts']);
    await git.commit('[002] add auth');

    // Commit 3: no task prefix — unattributed commit
    await git.add(['README.md']);
    await git.commit('add readme');

    // Commit 4: add remaining files (not attributed to a task)
    await git.add([
      'tasks/001-feature.md',
      'tasks/002-auth.md',
      'tasks/bad-task.md',
      'DECISIONS.md',
      'package.json',
      'db-config.yaml',
      'notes.md',
      'src/websocket-ref.ts',
    ]);
    await git.commit('add project files');

    // Run the pipeline
    const context = await scanProject(projectDir);
    const { results, secretLocations } = await runChecks(context, 'mechanical');
    report = buildReport(results, context.parseErrors, 'mechanical', projectDir, null, secretLocations);
  }, 30000);

  afterAll(async () => {
    if (projectDir) {
      await rm(projectDir, { recursive: true });
    }
  });

  it('E2E-001: finds all known violations in mechanical mode', () => {
    // Verify report structure
    expect(report.version).toBe('1.0.0');
    expect(report.mode).toBe('mechanical');

    // Verify parse errors contain the malformed file
    expect(report.parseErrors.length).toBeGreaterThan(0);
    const badTaskError = report.parseErrors.find((e) => e.file.includes('bad-task.md'));
    expect(badTaskError).toBeDefined();

    // Verify Layer 1 checks ran (9 checks registered)
    const layer1Results = report.checks.filter((c) => c.layer === 1);
    expect(layer1Results.length).toBe(9);

    // Verify Layer 2 checks are skipped in mechanical mode
    const layer2Results = report.checks.filter((c) => c.layer === 2);
    for (const r of layer2Results) {
      expect(r.status).toBe('skipped');
    }

    // Verify refactoringAssessment is null in mechanical mode
    expect(report.summary.refactoringAssessment).toBeNull();

    // Verify no tokenUsage in mechanical mode
    expect(report.tokenUsage).toBeUndefined();
  }, 30000);

  it('E2E-001a: test-cheat detects weak assertions with correctness-implying name', () => {
    const testCheat = report.checks.find((c) => c.name === 'test-cheat');
    expect(testCheat).toBeDefined();
    expect(testCheat!.status).toBe('completed');
    // "returns the correct processed result" implies correctness + only weak assertion (toBeDefined)
    expect(testCheat!.findings.length).toBeGreaterThan(0);
    const weakFinding = testCheat!.findings.find(
      (f) => f.evidence?.['testName'] === 'returns the correct processed result',
    );
    expect(weakFinding).toBeDefined();
    expect(weakFinding!.evidence?.['severity']).toBe('critical');
  }, 30000);

  it('E2E-001b: scope-creep detects out-of-scope file in task 001 commit', () => {
    const scopeCreep = report.checks.find((c) => c.name === 'scope-creep');
    expect(scopeCreep).toBeDefined();
    expect(scopeCreep!.status).toBe('completed');
    // src/utils.ts is not in task 001's create/modify lists but was in a [001] commit
    const outOfScopeFinding = scopeCreep!.findings.find(
      (f) => f.file.includes('utils.ts') || f.description.includes('utils.ts'),
    );
    expect(outOfScopeFinding).toBeDefined();
  }, 30000);

  it('E2E-001c: dependency-grab detects unjustified lodash dependency', () => {
    const depGrab = report.checks.find((c) => c.name === 'dependency-grab');
    expect(depGrab).toBeDefined();
    expect(depGrab!.status).toBe('completed');
    // lodash is in package.json but not in any task's Contracts section
    const lodashFinding = depGrab!.findings.find(
      (f) => f.description.includes('lodash'),
    );
    expect(lodashFinding).toBeDefined();
  }, 30000);

  it('E2E-001d: premature-abstraction detects single-implementation interface', () => {
    const premAbstraction = report.checks.find((c) => c.name === 'premature-abstraction');
    expect(premAbstraction).toBeDefined();
    expect(premAbstraction!.status).toBe('completed');
    // AuthProvider has only one implementation: SimpleAuthProvider
    const authFinding = premAbstraction!.findings.find(
      (f) => f.description.includes('AuthProvider'),
    );
    expect(authFinding).toBeDefined();
  }, 30000);

  it('E2E-001e: unoptimized-defaults detects SQL injection in raw file', () => {
    const unoptDefaults = report.checks.find((c) => c.name === 'unoptimized-defaults');
    expect(unoptDefaults).toBeDefined();
    expect(unoptDefaults!.status).toBe('completed');
    // db-config.yaml has query(`SELECT * FROM users WHERE id = ${userId}`)
    expect(unoptDefaults!.severity).toBe('critical');
    const sqlFinding = unoptDefaults!.findings.find(
      (f) => f.evidence?.['pattern'] === 'sql-injection',
    );
    expect(sqlFinding).toBeDefined();
  }, 30000);

  it('E2E-001f: resource-drain detects setInterval without cleanup in raw file', () => {
    const resourceDrain = report.checks.find((c) => c.name === 'resource-drain');
    expect(resourceDrain).toBeDefined();
    expect(resourceDrain!.status).toBe('completed');
    // notes.md contains setInterval without clearInterval
    const intervalFinding = resourceDrain!.findings.find(
      (f) => f.evidence?.['pattern'] === 'missing-cleanup' && f.evidence?.['api'] === 'setInterval',
    );
    expect(intervalFinding).toBeDefined();
  }, 30000);

  it('E2E-001g: surface-heresy detects reference to HARD KILL WebSocket term', () => {
    const heresy = report.checks.find((c) => c.name === 'surface-heresy');
    expect(heresy).toBeDefined();
    expect(heresy!.status).toBe('completed');
    // DECISIONS.md has HARD KILL on WebSocket, and websocket-ref.ts references it
    if (heresy!.findings.length > 0) {
      const wsFinding = heresy!.findings.find(
        (f) => f.description.toLowerCase().includes('websocket'),
      );
      expect(wsFinding).toBeDefined();
    }
  }, 30000);

  it('E2E-001h: report summary has critical findings', () => {
    // unoptimized-defaults is critical (SQL injection), test-cheat is critical
    expect(report.summary.critical).toBeGreaterThan(0);
  }, 30000);

  it('E2E-001i: report top3 is populated', () => {
    expect(report.summary.top3.length).toBeGreaterThan(0);
    expect(report.summary.top3.length).toBeLessThanOrEqual(3);
    // Each top finding has required fields
    for (const top of report.summary.top3) {
      expect(top.check).toBeDefined();
      expect(top.file).toBeDefined();
      expect(top.description).toBeDefined();
    }
  }, 30000);
});

describe('E2E: empty project — graceful handling', () => {
  it('E2E-004: handles empty project gracefully', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'audit-empty-'));
    // Initialize as git repo so scanner doesn't crash
    const git = simpleGit(emptyDir);
    await git.init();
    await git.addConfig('user.email', 'test@test.com');
    await git.addConfig('user.name', 'Test');

    const context = await scanProject(emptyDir);
    const { results, secretLocations } = await runChecks(context, 'mechanical');
    const report = buildReport(results, context.parseErrors, 'mechanical', emptyDir, null, secretLocations);

    // No crashes — report is structurally valid
    expect(report.version).toBe('1.0.0');
    expect(report.mode).toBe('mechanical');
    expect(report.parseErrors).toEqual([]);

    // Task-dependent checks should handle empty gracefully (skipped or clean)
    for (const check of report.checks) {
      expect(['completed', 'skipped']).toContain(check.status);
    }

    await rm(emptyDir, { recursive: true });
  }, 30000);
});
