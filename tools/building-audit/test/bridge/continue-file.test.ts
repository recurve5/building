import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeHandoff, removeContinueFile } from '../../src/bridge/handoff-writer.js';
import type { HandoffPayload } from '../../src/bridge/types.js';

function makePayload(overrides: Partial<HandoffPayload> = {}): HandoffPayload {
  return {
    runId: 'run-cf-test',
    project: 'trellis',
    milestone: 'm3-bridge',
    projectDir: '/home/user/trellis',
    stateDir: '/home/user/trellis/.build-state',
    stage: 4,
    stageName: 'Build',
    halted: false,
    haltReason: null,
    stageOverrides: [],
    completedTasks: [],
    currentTask: null,
    remainingTasks: [],
    remediationTasks: [],
    decisions: [],
    openItems: [],
    auditSummary: null,
    gitCheckpoints: [],
    artifactPaths: [],
    nextStep: 'Continue build',
    ...overrides,
  };
}

describe('continue file lifecycle', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cf-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('CF-001: writeHandoff creates continue file alongside handoff.md', () => {
    writeHandoff(tmpDir, makePayload());

    expect(existsSync(join(tmpDir, 'handoff.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'continue'))).toBe(true);
  });

  it('CF-002: continue file contains the resume command string', () => {
    writeHandoff(tmpDir, makePayload());

    const contents = readFileSync(join(tmpDir, 'continue'), 'utf-8');
    expect(contents).toBe('/build --resume');
  });

  it('CF-003: removeContinueFile deletes the continue file', () => {
    writeHandoff(tmpDir, makePayload());
    expect(existsSync(join(tmpDir, 'continue'))).toBe(true);

    removeContinueFile(tmpDir);
    expect(existsSync(join(tmpDir, 'continue'))).toBe(false);
  });

  it('CF-004: removeContinueFile is idempotent when file is absent', () => {
    expect(existsSync(join(tmpDir, 'continue'))).toBe(false);
    expect(() => removeContinueFile(tmpDir)).not.toThrow();
  });
});
