import { describe, it, expect, beforeEach } from 'vitest';
import { scopeCreepCheck } from '../../../src/checks/layer1/scope-creep.js';
import {
  createProjectContext,
  createTaskFile,
  createGitCommit,
} from '../../factories/index.js';

describe('scope-creep check', () => {
  // SC-001: File modified outside declared scope -- warning
  it('SC-001: produces warning when file modified outside declared scope', async () => {
    const context = createProjectContext({
      taskFiles: [
        createTaskFile({
          taskNumber: 3,
          files: {
            create: ['src/new-file.ts'],
            modify: ['src/existing.ts'],
            doNotTouch: [],
          },
        }),
      ],
      gitLog: [
        createGitCommit({
          hash: 'aaa1111',
          message: '[003] add feature',
          taskId: 3,
          filesChanged: ['src/new-file.ts', 'src/existing.ts', 'src/unrelated.ts'],
        }),
      ],
    });

    const result = await scopeCreepCheck.run(context);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('warning');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].file).toBe('src/unrelated.ts');
    expect(result.findings[0].description).toContain('not listed in create or modify');
    expect(result.findings[0].description).toContain('task 3');
  });

  // SC-002: File in doNotTouch was modified -- critical
  it('SC-002: produces critical when file in doNotTouch was modified', async () => {
    const context = createProjectContext({
      taskFiles: [
        createTaskFile({
          taskNumber: 5,
          files: {
            create: ['src/feature.ts'],
            modify: [],
            doNotTouch: ['src/models/'],
          },
        }),
      ],
      gitLog: [
        createGitCommit({
          hash: 'bbb2222',
          message: '[005] add feature',
          taskId: 5,
          filesChanged: ['src/feature.ts', 'src/models/user.ts'],
        }),
      ],
    });

    const result = await scopeCreepCheck.run(context);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('critical');
    const doNotTouchFinding = result.findings.find(
      (f) => f.file === 'src/models/user.ts',
    );
    expect(doNotTouchFinding).toBeDefined();
    expect(doNotTouchFinding!.description).toContain('doNotTouch');
    expect(doNotTouchFinding!.description).toContain('task 5');
  });

  // SC-003: Commit without task ID prefix -- warning
  it('SC-003: produces warning when commit lacks [TASK_ID] prefix', async () => {
    const context = createProjectContext({
      taskFiles: [
        createTaskFile({ taskNumber: 1 }),
      ],
      gitLog: [
        createGitCommit({
          hash: 'ccc3333',
          message: '[001] proper commit',
          taskId: 1,
          filesChanged: [],
        }),
        createGitCommit({
          hash: 'ddd4444',
          message: 'fix typo without prefix',
          taskId: null,
          filesChanged: [],
        }),
      ],
    });

    const result = await scopeCreepCheck.run(context);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('warning');
    const prefixFinding = result.findings.find(
      (f) => f.location === 'commit ddd4444',
    );
    expect(prefixFinding).toBeDefined();
    expect(prefixFinding!.description).toContain('lacks [TASK_ID] prefix');
  });

  // SC-004: All files within declared scope -- clean
  it('SC-004: produces no findings when all files within declared scope', async () => {
    const context = createProjectContext({
      taskFiles: [
        createTaskFile({
          taskNumber: 2,
          files: {
            create: ['src/new.ts'],
            modify: ['src/old.ts'],
            doNotTouch: [],
          },
        }),
      ],
      gitLog: [
        createGitCommit({
          hash: 'eee5555',
          message: '[002] implement feature',
          taskId: 2,
          filesChanged: ['src/new.ts', 'src/old.ts'],
        }),
      ],
    });

    const result = await scopeCreepCheck.run(context);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
  });

  // SC-005: Legacy project -- auto-detect missing convention
  it('SC-005: produces single info note for legacy project (>90% commits lack prefix)', async () => {
    const commitsWithoutPrefix = Array.from({ length: 19 }, (_, i) =>
      createGitCommit({
        hash: `legacy${i}`,
        message: `old commit ${i}`,
        taskId: null,
        filesChanged: [],
      }),
    );
    const commitWithPrefix = createGitCommit({
      hash: 'modern1',
      message: '[001] first tagged commit',
      taskId: 1,
      filesChanged: [],
    });

    const context = createProjectContext({
      taskFiles: [createTaskFile({ taskNumber: 1 })],
      gitLog: [...commitsWithoutPrefix, commitWithPrefix],
    });

    const result = await scopeCreepCheck.run(context);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('info');
    // Single info note, not 19 individual warnings
    const legacyFindings = result.findings.filter(
      (f) => f.location === 'project-wide',
    );
    expect(legacyFindings).toHaveLength(1);
    expect(legacyFindings[0].description).toContain('Legacy project detected');
    expect(legacyFindings[0].description).toContain('19/20');
    // No per-commit warnings
    const commitWarnings = result.findings.filter((f) =>
      f.location.startsWith('commit '),
    );
    expect(commitWarnings).toHaveLength(0);
  });

  // SC-006: No task files found -- check skipped
  it('SC-006: skips check when no task files found', async () => {
    const context = createProjectContext({
      taskFiles: [],
      gitLog: [
        createGitCommit({
          hash: 'fff6666',
          message: 'some commit',
          taskId: null,
          filesChanged: ['src/file.ts'],
        }),
      ],
    });

    const result = await scopeCreepCheck.run(context);

    expect(result.status).toBe('skipped');
    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
    expect(result.errorMessage).toContain('No task files found');
  });
});
