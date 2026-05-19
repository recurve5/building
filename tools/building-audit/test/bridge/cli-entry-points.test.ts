import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { HandoffPayload } from '../../src/bridge/types.js';

const BIN_DIR = join(process.cwd(), 'dist', 'bin', 'bridge');

function runScript(script: string, input: unknown): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [join(BIN_DIR, script)], {
      input: JSON.stringify(input),
      encoding: 'utf-8',
      timeout: 10_000,
    });
    return { stdout, exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? '', exitCode: err.status ?? 1 };
  }
}

function makePayload(overrides: Partial<HandoffPayload> = {}): HandoffPayload {
  return {
    runId: 'run-cli-test',
    project: 'trellis',
    milestone: 'm1-test',
    projectDir: '/tmp/trellis',
    stateDir: '/tmp/.building/projects/trellis',
    stage: 4,
    stageName: 'Build',
    halted: false,
    haltReason: null,
    stageOverrides: [],
    completedTasks: [{ number: 1, shortName: 'setup', status: 'done' }],
    currentTask: { number: 2, shortName: 'api', status: 'in progress' },
    remainingTasks: [{ number: 3, shortName: 'tests', status: 'not started' }],
    remediationTasks: [],
    decisions: [],
    openItems: [],
    auditSummary: null,
    gitCheckpoints: [],
    artifactPaths: [],
    nextStep: 'Continue task 2',
    ...overrides,
  };
}

describe('CLI entry points', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cli-bridge-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // SF-003: Handoff write then read round-trip
  it('SF-003: handoff write then read round-trip via subprocess', () => {
    const payload = makePayload();
    const writeResult = runScript('handoff-write.js', { runDir: tmpDir, payload });
    expect(writeResult.exitCode).toBe(0);
    expect(existsSync(join(tmpDir, 'handoff.md'))).toBe(true);

    const readResult = runScript('handoff-read.js', { runDir: tmpDir });
    expect(readResult.exitCode).toBe(0);

    const header = JSON.parse(readResult.stdout);
    expect(header.runId).toBe('run-cli-test');
    expect(header.stage).toBe(4);
    expect(header.stageName).toBe('Build');
    expect(header.completedTaskCount).toBe(1);
  });

  // SF-004: Invalid JSON returns exit code 1
  it('SF-004: invalid input exits with code 1', () => {
    try {
      execFileSync('node', [join(BIN_DIR, 'handoff-write.js')], {
        input: '"not valid json object"',
        encoding: 'utf-8',
        timeout: 10_000,
      });
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.status).toBe(1);
    }
  });

  // Write-event round-trip
  it('write-event creates event file via subprocess', () => {
    const result = runScript('write-event.js', {
      runDir: tmpDir,
      eventType: 'test_event',
      payload: { data: 42 },
    });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tmpDir, 'events'))).toBe(true);
  });
});
