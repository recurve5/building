import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { readHandoffHeader } from '../../src/bridge/handoff-reader.js';

function writeTestHandoff(dir: string, headerOverrides: Record<string, string> = {}): void {
  const defaults: Record<string, string> = {
    run_id: '20260519T0450Z-a66c014',
    project: 'test-project',
    milestone: 'm3-context-management',
    stage: '5',
    stage_name: 'Peer Review',
    halted: 'false',
    halt_reason: 'none',
    completed_tasks: '3',
    remaining_tasks: '6',
    current_task: 'none',
    next_step: 'Begin Stage 6',
  };
  const merged = { ...defaults, ...headerOverrides };
  const headerLines = Object.entries(merged).map(([k, v]) => `${k}: ${v}`).join('\n');
  const content = `\`\`\`handoff-header\n${headerLines}\n\`\`\`\n\n## 1. Run Identity\n\nTest content.\n`;
  writeFileSync(join(dir, 'handoff.md'), content, 'utf-8');
}

describe('readHandoffHeader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'handoff-reader-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // HR-001: extracts valid header from well-formed handoff.md
  it('HR-001: extracts valid header from well-formed handoff.md', () => {
    writeTestHandoff(tmpDir);
    const result = readHandoffHeader(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.runId).toBe('20260519T0450Z-a66c014');
    expect(result!.project).toBe('test-project');
    expect(result!.milestone).toBe('m3-context-management');
    expect(result!.stage).toBe(5);
    expect(result!.stageName).toBe('Peer Review');
    expect(result!.halted).toBe(false);
    expect(result!.haltReason).toBeNull();
    expect(result!.completedTaskCount).toBe(3);
    expect(result!.remainingTaskCount).toBe(6);
    expect(result!.currentTaskNumber).toBeNull();
    expect(result!.nextStep).toBe('Begin Stage 6');
  });

  // HR-002: returns null for missing file
  it('HR-002: returns null for missing file', () => {
    const result = readHandoffHeader(tmpDir);
    expect(result).toBeNull();
  });

  // HR-003: returns null for file without header block
  it('HR-003: returns null for file without header block', () => {
    writeFileSync(join(tmpDir, 'handoff.md'), '# Handoff\n\nNo header block here.\n', 'utf-8');
    const result = readHandoffHeader(tmpDir);
    expect(result).toBeNull();
  });

  // HR-004: returns null for file with empty header block
  it('HR-004: returns null for file with empty header block', () => {
    writeFileSync(join(tmpDir, 'handoff.md'), '```handoff-header\n```\n\nBody.\n', 'utf-8');
    const result = readHandoffHeader(tmpDir);
    expect(result).toBeNull();
  });

  // HR-005: parses numeric fields correctly
  it('HR-005: parses numeric fields correctly (stage, task counts)', () => {
    writeTestHandoff(tmpDir, {
      stage: '12',
      completed_tasks: '47',
      remaining_tasks: '0',
    });
    const result = readHandoffHeader(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.stage).toBe(12);
    expect(result!.completedTaskCount).toBe(47);
    expect(result!.remainingTaskCount).toBe(0);
  });

  // HR-006: handles halted=true with halt_reason
  it('HR-006: handles halted=true with halt_reason', () => {
    writeTestHandoff(tmpDir, {
      halted: 'true',
      halt_reason: 'Refactoring debt exceeds threshold',
    });
    const result = readHandoffHeader(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.halted).toBe(true);
    expect(result!.haltReason).toBe('Refactoring debt exceeds threshold');
  });

  // HR-007: handles current_task: none as null
  it('HR-007: handles current_task: none as null', () => {
    writeTestHandoff(tmpDir, { current_task: 'none' });
    const result = readHandoffHeader(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.currentTaskNumber).toBeNull();
  });

  // HR-008: ignores body content (only reads header)
  it('HR-008: ignores body content (only reads header)', () => {
    const content = [
      '```handoff-header',
      'run_id: abc-123',
      'project: body-test',
      'milestone: m1-test',
      'stage: 3',
      'stage_name: Build',
      'halted: false',
      'halt_reason: none',
      'completed_tasks: 1',
      'remaining_tasks: 2',
      'current_task: 4',
      'next_step: Continue building',
      '```',
      '',
      '## Body Section',
      '',
      '```handoff-header',
      'run_id: SHOULD_NOT_BE_READ',
      '```',
      '',
      'stage: 999',
      'This line looks like a key-value but is in the body.',
    ].join('\n');
    writeFileSync(join(tmpDir, 'handoff.md'), content, 'utf-8');
    const result = readHandoffHeader(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.runId).toBe('abc-123');
    expect(result!.project).toBe('body-test');
    expect(result!.stage).toBe(3);
    expect(result!.currentTaskNumber).toBe(4);
  });

  // HR-009: returns null for malformed key-value lines
  it('HR-009: returns null for malformed key-value lines', () => {
    const content = [
      '```handoff-header',
      'run_id: abc-123',
      'this line has no colon',
      'project: test',
      '```',
    ].join('\n');
    writeFileSync(join(tmpDir, 'handoff.md'), content, 'utf-8');
    const result = readHandoffHeader(tmpDir);
    expect(result).toBeNull();
  });
});
