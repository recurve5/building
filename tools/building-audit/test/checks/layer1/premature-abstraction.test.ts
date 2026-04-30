import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearRegistry } from '../../../src/checks/registry.js';
import { prematureAbstraction } from '../../../src/checks/layer1/premature-abstraction.js';
import { createProjectContext, createAnalyzedFile } from '../../factories/index.js';

beforeEach(() => {
  clearRegistry();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('premature-abstraction', () => {
  it('PA-001: interface with single implementation -- info finding', async () => {
    const sourceFiles = new Map([
      ['src/types.ts', createAnalyzedFile({
        filePath: 'src/types.ts',
        interfaces: [{ name: 'Logger', extends: [], methods: [], startLine: 1, endLine: 5 }],
      })],
      ['src/console-logger.ts', createAnalyzedFile({
        filePath: 'src/console-logger.ts',
        classes: [{
          name: 'ConsoleLogger',
          implements: ['Logger'],
          extends: null,
          methods: [{ name: 'log', params: [], returnType: null, startLine: 3, endLine: 10, isAsync: false, isGenerator: false }],
          startLine: 1,
          endLine: 12,
        }],
      })],
    ]);

    const ctx = createProjectContext({ sourceFiles });
    const result = await prematureAbstraction.run(ctx);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('info');
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    const ifaceFinding = result.findings.find((f) => f.description.includes('Logger'));
    expect(ifaceFinding).toBeDefined();
    expect(ifaceFinding!.description).toContain('ConsoleLogger');
  });

  it('PA-002: interface with multiple implementations -- clean', async () => {
    const sourceFiles = new Map([
      ['src/types.ts', createAnalyzedFile({
        filePath: 'src/types.ts',
        interfaces: [{ name: 'Logger', extends: [], methods: [], startLine: 1, endLine: 5 }],
      })],
      ['src/console-logger.ts', createAnalyzedFile({
        filePath: 'src/console-logger.ts',
        classes: [{
          name: 'ConsoleLogger', implements: ['Logger'], extends: null,
          methods: [], startLine: 1, endLine: 5,
        }],
      })],
      ['src/file-logger.ts', createAnalyzedFile({
        filePath: 'src/file-logger.ts',
        classes: [{
          name: 'FileLogger', implements: ['Logger'], extends: null,
          methods: [], startLine: 1, endLine: 5,
        }],
      })],
    ]);

    const ctx = createProjectContext({ sourceFiles });
    const result = await prematureAbstraction.run(ctx);

    const ifaceFinding = result.findings.find((f) => f.description.includes('Logger'));
    expect(ifaceFinding).toBeUndefined();
  });

  it('PA-003: empty source files -- clean', async () => {
    const ctx = createProjectContext({ sourceFiles: new Map() });
    const result = await prematureAbstraction.run(ctx);

    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
  });

  it('PA-004: passthrough wrapper -- info', async () => {
    const sourceFiles = new Map([
      ['src/wrapper.ts', createAnalyzedFile({
        filePath: 'src/wrapper.ts',
        classes: [{
          name: 'ApiWrapper',
          implements: [],
          extends: null,
          methods: [
            { name: 'get', params: [], returnType: null, startLine: 3, endLine: 5, isAsync: false, isGenerator: false },
            { name: 'post', params: [], returnType: null, startLine: 7, endLine: 9, isAsync: false, isGenerator: false },
            { name: 'delete', params: [], returnType: null, startLine: 11, endLine: 13, isAsync: false, isGenerator: false },
          ],
          startLine: 1,
          endLine: 15,
        }],
      })],
    ]);

    const ctx = createProjectContext({ sourceFiles });
    const result = await prematureAbstraction.run(ctx);

    expect(result.severity).toBe('info');
    const wrapperFinding = result.findings.find((f) => f.description.includes('ApiWrapper'));
    expect(wrapperFinding).toBeDefined();
    expect(wrapperFinding!.description).toContain('passthrough wrapper');
  });
});
