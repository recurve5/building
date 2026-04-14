import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearRegistry } from '../../../src/checks/registry.js';
import { dependencyGrab } from '../../../src/checks/layer1/dependency-grab.js';
import { createProjectContext, createTaskFile } from '../../factories/index.js';

beforeEach(() => {
  clearRegistry();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('dependency-grab', () => {
  it('DG-001: new runtime dependency not in any task contracts -- warning', async () => {
    const ctx = createProjectContext({
      packageJsonHistory: {
        initial: JSON.stringify({ dependencies: {} }),
        current: JSON.stringify({ dependencies: { lodash: '^4.0.0' } }),
      },
      taskFiles: [createTaskFile({ contracts: 'Uses built-in Node APIs.' })],
    });

    const result = await dependencyGrab.run(ctx);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('warning');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].description).toContain('lodash');
    expect(result.findings[0].description).toContain('Runtime');
  });

  it('DG-002: new devDependency not in contracts -- info', async () => {
    const ctx = createProjectContext({
      packageJsonHistory: {
        initial: JSON.stringify({ devDependencies: {} }),
        current: JSON.stringify({ devDependencies: { prettier: '^3.0.0' } }),
      },
      taskFiles: [createTaskFile({ contracts: 'No special dependencies.' })],
    });

    const result = await dependencyGrab.run(ctx);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('info');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].description).toContain('prettier');
    expect(result.findings[0].description).toContain('Dev');
  });

  it('DG-003: dependency justified in task contracts -- clean', async () => {
    const ctx = createProjectContext({
      packageJsonHistory: {
        initial: JSON.stringify({ dependencies: {} }),
        current: JSON.stringify({ dependencies: { lodash: '^4.0.0' } }),
      },
      taskFiles: [createTaskFile({ contracts: 'Uses lodash for deep cloning.' })],
    });

    const result = await dependencyGrab.run(ctx);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
  });

  it('DG-004: no package.json changes -- clean', async () => {
    const pkg = JSON.stringify({ dependencies: { react: '^18.0.0' } });
    const ctx = createProjectContext({
      packageJsonHistory: { initial: pkg, current: pkg },
      taskFiles: [createTaskFile()],
    });

    const result = await dependencyGrab.run(ctx);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
  });

  it('missing initial package.json treats all current deps as added', async () => {
    const ctx = createProjectContext({
      packageJsonHistory: {
        initial: null,
        current: JSON.stringify({ dependencies: { express: '^4.0.0' } }),
      },
      taskFiles: [createTaskFile({ contracts: null })],
    });

    const result = await dependencyGrab.run(ctx);

    expect(result.severity).toBe('warning');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].description).toContain('express');
  });

  it('both null package.json produces clean', async () => {
    const ctx = createProjectContext({
      packageJsonHistory: { initial: null, current: null },
      taskFiles: [],
    });

    const result = await dependencyGrab.run(ctx);

    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
  });
});
