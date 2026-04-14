import { describe, it, expect, beforeEach } from 'vitest';
import { testCheatCheck, impliesCorrectness } from '../../../src/checks/layer1/test-cheat.js';
import { createProjectContext, createAnalyzedFile } from '../../factories/index.js';
import type { TestFunctionInfo, AssertionInfo } from '../../../src/types/index.js';

function makeAssertion(method: string, strength: 'strong' | 'weak' | 'absent', line: number): AssertionInfo {
  return { method, strength, line };
}

function makeTestFn(
  name: string,
  startLine: number,
  assertions: AssertionInfo[],
): TestFunctionInfo {
  return { name, startLine, endLine: startLine + 10, assertions };
}

describe('test-cheat check', () => {
  // TC-001: All-weak assertions with correctness-implying name -- critical
  it('TC-001: produces critical finding when correctness-implying name has all weak assertions', async () => {
    const testFn = makeTestFn('calculates streak correctly', 42, [
      makeAssertion('toBeDefined', 'weak', 45),
      makeAssertion('toBeDefined', 'weak', 46),
      makeAssertion('toBeDefined', 'weak', 47),
    ]);

    const file = createAnalyzedFile({
      filePath: 'src/services/__tests__/streak.test.ts',
      testFunctions: [testFn],
    });

    const ctx = createProjectContext({
      sourceFiles: new Map([['src/services/__tests__/streak.test.ts', file]]),
    });

    const result = await testCheatCheck.run(ctx);

    expect(result.severity).toBe('critical');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].file).toBe('src/services/__tests__/streak.test.ts');
    expect(result.findings[0].location).toBe('line 42');
    expect(result.findings[0].description).toContain('calculates streak correctly');
    expect(result.findings[0].description).toContain('toBeDefined');
    expect(result.findings[0].suggestion).toMatch(/assert|specific/i);
  });

  // TC-002: All-weak assertions with non-correctness name -- warning
  it('TC-002: produces warning finding when non-correctness name has all weak assertions', async () => {
    const testFn = makeTestFn('renders component', 10, [
      makeAssertion('toBeDefined', 'weak', 12),
      makeAssertion('toBeTruthy', 'weak', 13),
    ]);

    const file = createAnalyzedFile({
      filePath: 'src/components/__tests__/button.test.ts',
      testFunctions: [testFn],
    });

    const ctx = createProjectContext({
      sourceFiles: new Map([['src/components/__tests__/button.test.ts', file]]),
    });

    const result = await testCheatCheck.run(ctx);

    expect(result.severity).toBe('warning');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].evidence?.['severity']).toBe('warning');
  });

  // TC-003: Mixed strong and weak assertions -- no finding
  it('TC-003: produces no finding when assertions include at least one strong', async () => {
    const testFn = makeTestFn('calculates total', 20, [
      makeAssertion('toBeDefined', 'weak', 22),
      makeAssertion('toEqual', 'strong', 23),
    ]);

    const file = createAnalyzedFile({
      filePath: 'src/utils/__tests__/math.test.ts',
      testFunctions: [testFn],
    });

    const ctx = createProjectContext({
      sourceFiles: new Map([['src/utils/__tests__/math.test.ts', file]]),
    });

    const result = await testCheatCheck.run(ctx);

    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
  });

  // TC-004: No assertions in test body -- finding
  it('TC-004: produces finding when test has no assertions', async () => {
    const testFn = makeTestFn('should handle edge case', 5, []);

    const file = createAnalyzedFile({
      filePath: 'src/__tests__/edge.test.ts',
      testFunctions: [testFn],
    });

    const ctx = createProjectContext({
      sourceFiles: new Map([['src/__tests__/edge.test.ts', file]]),
    });

    const result = await testCheatCheck.run(ctx);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].description).toContain('no assertions');
    expect(result.findings[0].location).toBe('line 5');
  });

  // TC-005: Strong assertions only -- clean
  it('TC-005: reports clean when all assertions are strong', async () => {
    const testFn = makeTestFn('returns correct value', 30, [
      makeAssertion('toEqual', 'strong', 32),
      makeAssertion('toBe', 'strong', 33),
      makeAssertion('toStrictEqual', 'strong', 34),
    ]);

    const file = createAnalyzedFile({
      filePath: 'src/__tests__/solid.test.ts',
      testFunctions: [testFn],
    });

    const ctx = createProjectContext({
      sourceFiles: new Map([['src/__tests__/solid.test.ts', file]]),
    });

    const result = await testCheatCheck.run(ctx);

    expect(result.severity).toBe('clean');
    expect(result.findings).toHaveLength(0);
  });

  // TC-006: Correctness-implying name patterns
  it('TC-006: recognizes all correctness-implying name patterns', () => {
    expect(impliesCorrectness('calculates total')).toBe(true);
    expect(impliesCorrectness('returns the result')).toBe(true);
    expect(impliesCorrectness('produces output')).toBe(true);
    expect(impliesCorrectness('computes hash')).toBe(true);
    expect(impliesCorrectness('generates report')).toBe(true);
    // Case insensitive
    expect(impliesCorrectness('CALCULATES something')).toBe(true);
    expect(impliesCorrectness('Returns value')).toBe(true);
    // Non-matching
    expect(impliesCorrectness('renders component')).toBe(false);
    expect(impliesCorrectness('should handle click')).toBe(false);
    expect(impliesCorrectness('displays error message')).toBe(false);
  });

  // TC-007: Multiple test functions in one file -- findings per function
  it('TC-007: produces individual findings for each failing test function in a file', async () => {
    const testFn1 = makeTestFn('calculates sum', 10, [
      makeAssertion('toBeDefined', 'weak', 12),
    ]);
    const testFn2 = makeTestFn('renders header', 25, [
      makeAssertion('toBeTruthy', 'weak', 27),
    ]);
    const testFn3 = makeTestFn('returns formatted date', 40, [
      makeAssertion('toEqual', 'strong', 42),
    ]);

    const file = createAnalyzedFile({
      filePath: 'src/__tests__/multi.test.ts',
      testFunctions: [testFn1, testFn2, testFn3],
    });

    const ctx = createProjectContext({
      sourceFiles: new Map([['src/__tests__/multi.test.ts', file]]),
    });

    const result = await testCheatCheck.run(ctx);

    // testFn1 (correctness + weak) = critical, testFn2 (non-correctness + weak) = warning, testFn3 (strong) = no finding
    expect(result.findings).toHaveLength(2);
    expect(result.severity).toBe('critical');

    const finding1 = result.findings.find((f) => f.description.includes('calculates sum'));
    const finding2 = result.findings.find((f) => f.description.includes('renders header'));

    expect(finding1).toBeDefined();
    expect(finding1!.evidence?.['severity']).toBe('critical');
    expect(finding1!.location).toBe('line 10');

    expect(finding2).toBeDefined();
    expect(finding2!.evidence?.['severity']).toBe('warning');
    expect(finding2!.location).toBe('line 25');
  });
});
