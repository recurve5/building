import { describe, it, expect, vi } from 'vitest';
import { performanceCriticalCheck } from '../../../src/checks/layer2/performance-critical.js';
import {
  createProjectContext,
  createAnalyzedFile,
} from '../../factories/index.js';
import type { LLMClient, LLMResponse, FunctionInfo } from '../../../src/types/index.js';

function createMockLLMClient(content: string): LLMClient {
  return {
    query: vi.fn().mockResolvedValue({
      content,
      usage: { input: 200, output: 80 },
    } satisfies LLMResponse),
  };
}

function createFunc(overrides: Partial<FunctionInfo> = {}): FunctionInfo {
  return {
    name: 'testFunc',
    params: [],
    returnType: null,
    startLine: 1,
    endLine: 10,
    isAsync: false,
    isGenerator: false,
    ...overrides,
  };
}

describe('performance-critical check', () => {
  // PCP-001: Deep async call chain with I/O -> evidence phase detects candidate
  it('PCP-001: deep async call chain with I/O is detected as candidate', async () => {
    const llm = createMockLLMClient('The latency is perceptible to the user.');

    // Build a chain: handleRequest -> processData -> fetchData -> queryDatabase -> execStatement (5 deep)
    const sourceFiles = new Map([
      ['src/api/handler.ts', createAnalyzedFile({
        filePath: 'src/api/handler.ts',
        functions: [
          createFunc({ name: 'handleRequest', isAsync: true, startLine: 1, endLine: 5 }),
        ],
        exports: [{ name: 'handleRequest', kind: 'function', line: 1 }],
      })],
      ['src/api/process.ts', createAnalyzedFile({
        filePath: 'src/api/process.ts',
        functions: [
          createFunc({ name: 'processData', isAsync: true, startLine: 1, endLine: 5 }),
        ],
        exports: [{ name: 'processData', kind: 'function', line: 1 }],
      })],
      ['src/api/data.ts', createAnalyzedFile({
        filePath: 'src/api/data.ts',
        functions: [
          createFunc({ name: 'fetchData', isAsync: true, startLine: 1, endLine: 5 }),
        ],
        exports: [{ name: 'fetchData', kind: 'function', line: 1 }],
      })],
      ['src/api/db.ts', createAnalyzedFile({
        filePath: 'src/api/db.ts',
        functions: [
          createFunc({ name: 'queryDatabase', isAsync: true, startLine: 1, endLine: 5 }),
        ],
        exports: [{ name: 'queryDatabase', kind: 'function', line: 1 }],
      })],
      ['src/api/sql.ts', createAnalyzedFile({
        filePath: 'src/api/sql.ts',
        functions: [
          createFunc({ name: 'execStatement', isAsync: true, startLine: 1, endLine: 5 }),
        ],
        exports: [{ name: 'execStatement', kind: 'function', line: 1 }],
      })],
    ]);

    // Raw files contain function calls that form the chain
    const rawFiles = new Map([
      ['src/api/handler.ts', [
        'export async function handleRequest(req) {',
        '  const data = await processData(req.body);',
        '  return data;',
        '}',
        '',
      ].join('\n')],
      ['src/api/process.ts', [
        'export async function processData(input) {',
        '  const result = await fetchData(input);',
        '  return result;',
        '}',
        '',
      ].join('\n')],
      ['src/api/data.ts', [
        'export async function fetchData(input) {',
        '  const result = await queryDatabase(input);',
        '  return result;',
        '}',
        '',
      ].join('\n')],
      ['src/api/db.ts', [
        'export async function queryDatabase(input) {',
        '  return await execStatement(input);',
        '}',
        '',
        '',
      ].join('\n')],
      ['src/api/sql.ts', [
        'export async function execStatement(sql) {',
        '  return db.run(sql);',
        '}',
        '',
        '',
      ].join('\n')],
    ]);

    const context = createProjectContext({ sourceFiles, rawFiles });
    const result = await performanceCriticalCheck.run(context, llm);

    expect(result.status).toBe('completed');
    // The chain should be: handleRequest -> processData -> fetchData -> queryDatabase -> execStatement (5 deep, >3)
    // and includes I/O indicators (fetchData, queryDatabase, execStatement)
    expect(llm.query).toHaveBeenCalled();
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings[0].description).toContain('handleRequest');
  });

  // PCP-002: LLM says perceptible latency -> warning
  it('PCP-002: LLM perceptible verdict produces warning severity', async () => {
    const llm = createMockLLMClient('This chain has perceptible latency due to sequential I/O.');

    const sourceFiles = new Map([
      ['src/controller.ts', createAnalyzedFile({
        filePath: 'src/controller.ts',
        functions: [
          createFunc({ name: 'routeAction', isAsync: true, startLine: 1, endLine: 6 }),
        ],
        exports: [{ name: 'routeAction', kind: 'function', line: 1 }],
      })],
      ['src/service.ts', createAnalyzedFile({
        filePath: 'src/service.ts',
        functions: [
          createFunc({ name: 'processRequest', isAsync: true, startLine: 1, endLine: 6 }),
        ],
        exports: [{ name: 'processRequest', kind: 'function', line: 1 }],
      })],
      ['src/io.ts', createAnalyzedFile({
        filePath: 'src/io.ts',
        functions: [
          createFunc({ name: 'readFile', isAsync: true, startLine: 1, endLine: 6 }),
        ],
        exports: [{ name: 'readFile', kind: 'function', line: 1 }],
      })],
      ['src/parser.ts', createAnalyzedFile({
        filePath: 'src/parser.ts',
        functions: [
          createFunc({ name: 'sendResponse', isAsync: true, startLine: 1, endLine: 6 }),
        ],
        exports: [{ name: 'sendResponse', kind: 'function', line: 1 }],
      })],
    ]);

    const rawFiles = new Map([
      ['src/controller.ts', [
        'export async function routeAction(req) {',
        '  const data = await processRequest(req);',
        '  return data;',
        '}',
        '', '',
      ].join('\n')],
      ['src/service.ts', [
        'export async function processRequest(req) {',
        '  const file = await readFile(req.path);',
        '  return file;',
        '}',
        '', '',
      ].join('\n')],
      ['src/io.ts', [
        'export async function readFile(path) {',
        '  const result = await sendResponse(path);',
        '  return result;',
        '}',
        '', '',
      ].join('\n')],
      ['src/parser.ts', [
        'export async function sendResponse(path) {',
        '  return fs.readFileSync(path);',
        '}',
        '', '', '',
      ].join('\n')],
    ]);

    const context = createProjectContext({ sourceFiles, rawFiles });
    const result = await performanceCriticalCheck.run(context, llm);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('warning');
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings[0].evidence?.['llmVerdict']).toBe('perceptible');
    expect(result.tokenUsage).toEqual({ input: 200, output: 80 });

    // Verify 16K token limit was passed
    const queryCall = (llm.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(queryCall[1]).toBe(16384);
  });

  // PCP-003: No flagged chains -> clean, LLM not called
  it('PCP-003: no flagged chains returns clean without calling LLM', async () => {
    const llm = createMockLLMClient('should not be called');

    // Simple functions, no deep chains, no I/O
    const sourceFiles = new Map([
      ['src/utils.ts', createAnalyzedFile({
        filePath: 'src/utils.ts',
        functions: [
          createFunc({ name: 'add', isAsync: false, startLine: 1, endLine: 3 }),
          createFunc({ name: 'subtract', isAsync: false, startLine: 4, endLine: 6 }),
        ],
        exports: [{ name: 'add', kind: 'function', line: 1 }],
      })],
    ]);

    const rawFiles = new Map([
      ['src/utils.ts', [
        'export function add(a, b) { return a + b; }',
        '',
        '',
        'export function subtract(a, b) { return a - b; }',
        '',
        '',
      ].join('\n')],
    ]);

    const context = createProjectContext({ sourceFiles, rawFiles });
    const result = await performanceCriticalCheck.run(context, llm);

    expect(result.status).toBe('completed');
    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
    expect(llm.query).not.toHaveBeenCalled();
  });
});
