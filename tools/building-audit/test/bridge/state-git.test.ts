import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeGitState } from '../../src/bridge/state-git.js';
import { createFixtureProject } from './fixtures/fixture-factory.js';
import { tagMilestoneStart, tagMilestoneComplete, createRollbackBranch } from '../../src/bridge/git-checkpoint.js';
import type { GitOpResult, StateGit } from '../../src/bridge/types.js';

/** Build a minimal GitOpResult for testing. */
function makeGitOpResult(overrides: Partial<GitOpResult> = {}): GitOpResult {
  return {
    created: overrides.created ?? true,
    ref: overrides.ref ?? 'abc123',
    error: overrides.error ?? null,
  };
}

describe('Git State Writer', () => {
  let tmpDir: string;
  let statePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'git-state-test-'));
    statePath = join(tmpDir, 'state.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // DET-005: Git state is written to top-level git field in state.json
  it('DET-005: writes startTag to top-level state.git', () => {
    writeFileSync(statePath, JSON.stringify({ version: 2 }, null, 2));

    const result = makeGitOpResult({ ref: 'sha-start-123' });
    writeGitState(statePath, 'startTag', result);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.git).toBeDefined();
    expect(state.git.startTag.created).toBe(true);
    expect(state.git.startTag.ref).toBe('sha-start-123');
    expect(state.git.startTag.error).toBeNull();
    // git is top-level (Decision 11), not nested inside stages
    expect(state.stages).toBeUndefined();
  });

  // DET-006: Git state persists completeTag and rollbackBranch
  it('DET-006: persists completeTag and rollbackBranch', () => {
    writeFileSync(statePath, JSON.stringify({ version: 2 }, null, 2));

    const startResult = makeGitOpResult({ ref: 'sha-start' });
    writeGitState(statePath, 'startTag', startResult);

    const completeResult = makeGitOpResult({ ref: 'sha-complete' });
    writeGitState(statePath, 'completeTag', completeResult);

    const rollbackResult = makeGitOpResult({ ref: 'sha-rollback' });
    writeGitState(statePath, 'rollbackBranch', rollbackResult);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.git.startTag.ref).toBe('sha-start');
    expect(state.git.completeTag.ref).toBe('sha-complete');
    expect(state.git.rollbackBranch.ref).toBe('sha-rollback');
  });

  // DET-007: State.json without git field does not break on read
  it('DET-007: creates git field when missing from state', () => {
    writeFileSync(
      statePath,
      JSON.stringify(
        { version: 2, pipeline: { stage: 'build' }, detections: [] },
        null,
        2,
      ),
    );

    const result = makeGitOpResult({ ref: 'sha-new' });
    writeGitState(statePath, 'startTag', result);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    // git field was created
    expect(state.git).toBeDefined();
    expect(state.git.startTag.ref).toBe('sha-new');
    // Other unset git fields get defaults
    expect(state.git.completeTag.created).toBe(false);
    expect(state.git.completeTag.ref).toBeNull();
    expect(state.git.rollbackBranch.created).toBe(false);
    expect(state.git.rollbackBranch.ref).toBeNull();
    // Other state fields preserved
    expect(state.version).toBe(2);
    expect(state.pipeline.stage).toBe('build');
    expect(state.detections).toEqual([]);
  });

  // AC5: Writing to git field does not corrupt detections or other state fields
  it('does not corrupt other fields in state.json', () => {
    const original = {
      version: 2,
      pipeline: { stage: 'build', currentTask: 5 },
      detections: [{ trigger: 'task-complete', taskId: 1 }],
      extraField: 'preserved',
    };
    writeFileSync(statePath, JSON.stringify(original, null, 2));

    writeGitState(statePath, 'startTag', makeGitOpResult({ ref: 'sha-abc' }));

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.version).toBe(2);
    expect(state.pipeline.stage).toBe('build');
    expect(state.pipeline.currentTask).toBe(5);
    expect(state.detections).toHaveLength(1);
    expect(state.detections[0].taskId).toBe(1);
    expect(state.extraField).toBe('preserved');
    expect(state.git.startTag.ref).toBe('sha-abc');
  });

  // AC6: startTag and completeTag can have different ref values
  it('startTag and completeTag hold independent ref values', () => {
    writeFileSync(statePath, JSON.stringify({ version: 2 }, null, 2));

    writeGitState(statePath, 'startTag', makeGitOpResult({ ref: 'sha-111' }));
    writeGitState(statePath, 'completeTag', makeGitOpResult({ ref: 'sha-222' }));

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.git.startTag.ref).toBe('sha-111');
    expect(state.git.completeTag.ref).toBe('sha-222');
    expect(state.git.startTag.ref).not.toBe(state.git.completeTag.ref);
  });

  // Overwrites a field value on second write
  it('overwrites a field on subsequent write', () => {
    writeFileSync(statePath, JSON.stringify({ version: 2 }, null, 2));

    writeGitState(statePath, 'startTag', makeGitOpResult({ ref: 'old-sha' }));
    writeGitState(statePath, 'startTag', makeGitOpResult({ ref: 'new-sha' }));

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.git.startTag.ref).toBe('new-sha');
  });

  // Preserves warning field from GitOpResult
  it('preserves warning field in GitOpResult', () => {
    writeFileSync(statePath, JSON.stringify({ version: 2 }, null, 2));

    const result: GitOpResult = {
      created: true,
      ref: 'sha-rb',
      error: null,
      warning: 'Fell back to start tag.',
    };
    writeGitState(statePath, 'rollbackBranch', result);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.git.rollbackBranch.warning).toBe('Fell back to start tag.');
  });

  // Error case: file not found
  it('throws when state.json does not exist', () => {
    const missingPath = join(tmpDir, 'nonexistent.json');
    expect(() =>
      writeGitState(missingPath, 'startTag', makeGitOpResult()),
    ).toThrow();
  });

  // Handles existing git field that already has partial data
  it('preserves existing git field values when writing a different field', () => {
    const initial = {
      version: 2,
      git: {
        startTag: { created: true, ref: 'existing-start', error: null },
        completeTag: { created: false, ref: null, error: null },
        rollbackBranch: { created: false, ref: null, error: null },
      },
    };
    writeFileSync(statePath, JSON.stringify(initial, null, 2));

    writeGitState(
      statePath,
      'completeTag',
      makeGitOpResult({ ref: 'new-complete' }),
    );

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    // startTag untouched
    expect(state.git.startTag.ref).toBe('existing-start');
    // completeTag updated
    expect(state.git.completeTag.ref).toBe('new-complete');
  });
});

// INT-005: Git checkpoint state integration (end-to-end)
describe('INT-005: Git checkpoint state integration', () => {
  let fixture: { path: string; cleanup: () => void };
  let statePath: string;

  beforeEach(() => {
    fixture = createFixtureProject({ initGit: true, milestone: 'm1-test' });
    statePath = join(fixture.path, 'state.json');
    writeFileSync(statePath, JSON.stringify({ version: 2 }, null, 2));
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('end-to-end: tag start, tag complete, create rollback, verify state', () => {
    // Step 1: Tag milestone start
    const startResult = tagMilestoneStart('m1-test', fixture.path);
    expect(startResult.created).toBe(true);
    writeGitState(statePath, 'startTag', startResult);

    // Step 2: Tag milestone complete
    const completeResult = tagMilestoneComplete('m1-test', fixture.path);
    expect(completeResult.created).toBe(true);
    writeGitState(statePath, 'completeTag', completeResult);

    // Step 3: Create rollback branch (from start tag since no prior milestone)
    const rollbackResult = createRollbackBranch('m1-test', undefined, fixture.path);
    expect(rollbackResult.created).toBe(true);
    writeGitState(statePath, 'rollbackBranch', rollbackResult);

    // Step 4: Verify state.json
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.git.startTag.created).toBe(true);
    expect(state.git.startTag.ref).toBeTruthy();
    expect(state.git.completeTag.created).toBe(true);
    expect(state.git.completeTag.ref).toBeTruthy();
    expect(state.git.rollbackBranch.created).toBe(true);
    expect(state.git.rollbackBranch.ref).toBeTruthy();

    // Start and complete tags can have different refs (AC6)
    // (They point to the same commit in this test since no commits between them,
    //  but the refs are stored independently.)
    expect(state.git.startTag.ref).toBe(state.git.completeTag.ref);

    // Version preserved
    expect(state.version).toBe(2);
  });
});
