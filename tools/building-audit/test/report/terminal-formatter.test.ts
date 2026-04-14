import { describe, it, expect } from 'vitest';
import {
  formatCheckProgress,
  formatTerminalOutput,
  formatLayer2Progress,
} from '../../src/report/terminal-formatter.js';
import { buildReport } from '../../src/report/json-builder.js';
import { createCheckResult, createFinding } from '../factories/index.js';
import type { CheckResult, AuditReport } from '../../src/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip ANSI codes for assertion readability. */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function buildTestReport(results: CheckResult[], mode: 'mechanical' | 'full' = 'mechanical'): AuditReport {
  return buildReport(results, [], mode, '/tmp/project', null, []);
}

// ---------------------------------------------------------------------------
// RPT-011: Terminal shows critical findings inline
// ---------------------------------------------------------------------------

describe('RPT-011: Terminal shows critical findings inline', () => {
  it('displays critical findings with file, location, description, suggestion', () => {
    const results: CheckResult[] = [
      createCheckResult({
        name: 'test-cheat',
        severity: 'critical',
        findings: [
          createFinding({
            file: 'src/utils.ts',
            location: 'line 42',
            description: 'Empty test body',
            suggestion: 'Add meaningful assertions',
          }),
        ],
      }),
    ];

    const report = buildTestReport(results);
    const output = formatTerminalOutput(report, false);
    const plain = stripAnsi(output);

    expect(plain).toContain('Critical findings:');
    expect(plain).toContain('src/utils.ts');
    expect(plain).toContain('line 42');
    expect(plain).toContain('Empty test body');
    expect(plain).toContain('Add meaningful assertions');
  });

  it('does not show warnings in non-verbose mode', () => {
    const results: CheckResult[] = [
      createCheckResult({
        name: 'scope-creep',
        severity: 'warning',
        findings: [
          createFinding({ description: 'Files changed outside scope' }),
        ],
      }),
    ];

    const report = buildTestReport(results);
    const output = formatTerminalOutput(report, false);
    const plain = stripAnsi(output);

    expect(plain).not.toContain('Warnings:');
    expect(plain).not.toContain('Files changed outside scope');
  });

  it('does not show info in non-verbose mode', () => {
    const results: CheckResult[] = [
      createCheckResult({
        name: 'fragility',
        severity: 'info',
        findings: [
          createFinding({ description: 'High coupling detected' }),
        ],
      }),
    ];

    const report = buildTestReport(results);
    const output = formatTerminalOutput(report, false);
    const plain = stripAnsi(output);

    expect(plain).not.toContain('Info:');
  });
});

// ---------------------------------------------------------------------------
// RPT-012: Terminal --verbose shows all findings
// ---------------------------------------------------------------------------

describe('RPT-012: Terminal --verbose shows all findings', () => {
  it('shows critical, warning, and info findings in verbose mode', () => {
    const results: CheckResult[] = [
      createCheckResult({
        name: 'test-cheat',
        severity: 'critical',
        findings: [createFinding({ file: 'a.ts', description: 'critical issue' })],
      }),
      createCheckResult({
        name: 'scope-creep',
        severity: 'warning',
        findings: [createFinding({ file: 'b.ts', description: 'warning issue' })],
      }),
      createCheckResult({
        name: 'fragility',
        severity: 'info',
        findings: [createFinding({ file: 'c.ts', description: 'info issue' })],
      }),
    ];

    const report = buildTestReport(results);
    const output = formatTerminalOutput(report, true);
    const plain = stripAnsi(output);

    expect(plain).toContain('Critical findings:');
    expect(plain).toContain('critical issue');
    expect(plain).toContain('Warnings:');
    expect(plain).toContain('warning issue');
    expect(plain).toContain('Info:');
    expect(plain).toContain('info issue');
  });
});

// ---------------------------------------------------------------------------
// RPT-013: Terminal progress display during check execution
// ---------------------------------------------------------------------------

describe('RPT-013: Terminal progress display during check execution', () => {
  it('formats clean check progress', () => {
    const result = createCheckResult({ name: 'test-cheat', severity: 'clean' });
    const output = formatCheckProgress('test-cheat', result);
    const plain = stripAnsi(output);

    expect(plain).toContain('test-cheat');
    expect(plain).toContain('clean');
  });

  it('formats check with findings', () => {
    const result = createCheckResult({
      name: 'scope-creep',
      severity: 'warning',
      findings: [createFinding(), createFinding(), createFinding()],
    });
    const output = formatCheckProgress('scope-creep', result);
    const plain = stripAnsi(output);

    expect(plain).toContain('scope-creep');
    expect(plain).toContain('3 findings');
  });

  it('formats skipped check', () => {
    const result = createCheckResult({ name: 'ghost-refactor', status: 'skipped' });
    const output = formatCheckProgress('ghost-refactor', result);
    const plain = stripAnsi(output);

    expect(plain).toContain('ghost-refactor');
    expect(plain).toContain('skipped');
  });

  it('formats error check', () => {
    const result = createCheckResult({
      name: 'deep-heresy',
      status: 'error',
      errorMessage: 'API timeout',
    });
    const output = formatCheckProgress('deep-heresy', result);
    const plain = stripAnsi(output);

    expect(plain).toContain('deep-heresy');
    expect(plain).toContain('error');
    expect(plain).toContain('API timeout');
  });

  it('formats singular finding correctly', () => {
    const result = createCheckResult({
      name: 'test-cheat',
      severity: 'critical',
      findings: [createFinding()],
    });
    const output = formatCheckProgress('test-cheat', result);
    const plain = stripAnsi(output);

    expect(plain).toContain('1 finding');
    expect(plain).not.toContain('1 findings');
  });
});

// ---------------------------------------------------------------------------
// Layer 2 progress
// ---------------------------------------------------------------------------

describe('Layer 2 progress display', () => {
  it('shows gathering phase', () => {
    const output = formatLayer2Progress('ghost-refactor', 'gathering', 12);
    const plain = stripAnsi(output);

    expect(plain).toContain('ghost-refactor');
    expect(plain).toContain('Gathering evidence...');
    expect(plain).toContain('12 candidates');
  });

  it('shows reviewing phase', () => {
    const output = formatLayer2Progress('deep-heresy', 'reviewing');
    const plain = stripAnsi(output);

    expect(plain).toContain('deep-heresy');
    expect(plain).toContain('LLM review...');
  });

  it('shows complete phase', () => {
    const output = formatLayer2Progress('clean-slate-bias', 'complete');
    const plain = stripAnsi(output);

    expect(plain).toContain('clean-slate-bias');
    expect(plain).toContain('complete');
  });
});

// ---------------------------------------------------------------------------
// Summary line
// ---------------------------------------------------------------------------

describe('Summary line', () => {
  it('includes severity counts', () => {
    const results: CheckResult[] = [
      createCheckResult({ name: 'c1', severity: 'critical', findings: [createFinding()] }),
      createCheckResult({ name: 'c2', severity: 'warning', findings: [createFinding()] }),
      createCheckResult({ name: 'c3', severity: 'info', findings: [createFinding()] }),
      createCheckResult({ name: 'c4', severity: 'clean' }),
      createCheckResult({ name: 'c5', status: 'skipped' }),
    ];

    const report = buildTestReport(results);
    const output = formatTerminalOutput(report, false);
    const plain = stripAnsi(output);

    expect(plain).toContain('Summary:');
    expect(plain).toContain('1 critical');
    expect(plain).toContain('1 warning');
    expect(plain).toContain('1 info');
    expect(plain).toContain('1 clean');
    expect(plain).toContain('1 skipped');
  });
});
