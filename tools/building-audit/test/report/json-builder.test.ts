import { describe, it, expect } from 'vitest';
import { buildReport, redactSecrets } from '../../src/report/json-builder.js';
import { createCheckResult, createFinding } from '../factories/index.js';
import type { CheckResult, SecretLocation, ParseError } from '../../src/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSecretLocation(overrides: Partial<SecretLocation> = {}): SecretLocation {
  return {
    filePath: 'config.ts',
    line: 5,
    endLine: 5,
    patternType: 'aws-key',
    maskedValue: 'AKIA...xyzw',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RPT-001: JSON report matches schema
// ---------------------------------------------------------------------------

describe('RPT-001: JSON report matches schema', () => {
  it('produces a report with all required fields', () => {
    const results: CheckResult[] = [
      createCheckResult({ name: 'test-cheat', layer: 1, severity: 'clean' }),
    ];

    const report = buildReport(results, [], 'mechanical', '/tmp/project', null, []);

    expect(report.version).toBe('1.0.0');
    expect(typeof report.timestamp).toBe('string');
    expect(report.project).toBe('/tmp/project');
    expect(report.mode).toBe('mechanical');
    expect(report.milestone).toBeNull();
    expect(Array.isArray(report.checks)).toBe(true);
    expect(Array.isArray(report.parseErrors)).toBe(true);
    expect(report.summary).toBeDefined();
    expect(typeof report.summary.critical).toBe('number');
    expect(typeof report.summary.warning).toBe('number');
    expect(typeof report.summary.info).toBe('number');
    expect(typeof report.summary.clean).toBe('number');
    expect(typeof report.summary.skipped).toBe('number');
    expect(Array.isArray(report.summary.top3)).toBe(true);
  });

  it('includes milestone when provided', () => {
    const report = buildReport([], [], 'mechanical', '/tmp/project', 'm1-nacre', []);
    expect(report.milestone).toBe('m1-nacre');
  });

  it('includes parse errors in report', () => {
    const errors: ParseError[] = [
      { file: 'task-bad.md', reason: 'missing frontmatter' },
    ];
    const report = buildReport([], errors, 'mechanical', '/tmp/project', null, []);
    expect(report.parseErrors).toEqual(errors);
  });
});

// ---------------------------------------------------------------------------
// RPT-002: Summary severity counts correct
// ---------------------------------------------------------------------------

describe('RPT-002: Summary severity counts correct', () => {
  it('counts each severity category correctly', () => {
    const results: CheckResult[] = [
      createCheckResult({ name: 'c1', severity: 'critical', findings: [createFinding()] }),
      createCheckResult({ name: 'c2', severity: 'critical', findings: [createFinding()] }),
      createCheckResult({ name: 'c3', severity: 'warning', findings: [createFinding()] }),
      createCheckResult({ name: 'c4', severity: 'info', findings: [createFinding()] }),
      createCheckResult({ name: 'c5', severity: 'clean' }),
      createCheckResult({ name: 'c6', status: 'skipped' }),
    ];

    const report = buildReport(results, [], 'mechanical', '/tmp/project', null, []);

    expect(report.summary.critical).toBe(2);
    expect(report.summary.warning).toBe(1);
    expect(report.summary.info).toBe(1);
    expect(report.summary.clean).toBe(1);
    expect(report.summary.skipped).toBe(1);
  });

  it('does not count error checks in severity tallies', () => {
    const results: CheckResult[] = [
      createCheckResult({ name: 'c1', severity: 'critical', findings: [createFinding()] }),
      createCheckResult({ name: 'c2', status: 'error', errorMessage: 'boom' }),
    ];

    const report = buildReport(results, [], 'mechanical', '/tmp/project', null, []);

    expect(report.summary.critical).toBe(1);
    expect(report.summary.warning).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// RPT-003: Top 3 selection -- highest severity first
// ---------------------------------------------------------------------------

describe('RPT-003: Top 3 selection -- highest severity first', () => {
  it('selects the 3 highest-severity findings', () => {
    const results: CheckResult[] = [
      createCheckResult({
        name: 'check-a',
        severity: 'info',
        findings: [createFinding({ file: 'a.ts', description: 'info finding' })],
      }),
      createCheckResult({
        name: 'check-b',
        severity: 'critical',
        findings: [createFinding({ file: 'b.ts', description: 'critical finding' })],
      }),
      createCheckResult({
        name: 'check-c',
        severity: 'warning',
        findings: [
          createFinding({ file: 'c1.ts', description: 'warning finding 1' }),
          createFinding({ file: 'c2.ts', description: 'warning finding 2' }),
        ],
      }),
    ];

    const report = buildReport(results, [], 'mechanical', '/tmp/project', null, []);

    expect(report.summary.top3).toHaveLength(3);
    expect(report.summary.top3[0].check).toBe('check-b');
    expect(report.summary.top3[1].check).toBe('check-c');
    expect(report.summary.top3[2].check).toBe('check-c');
  });

  it('includes correlations when multiple checks have findings at the same file', () => {
    const results: CheckResult[] = [
      createCheckResult({
        name: 'test-cheat',
        severity: 'critical',
        findings: [createFinding({ file: 'shared.ts', description: 'test cheat' })],
      }),
      createCheckResult({
        name: 'confidence-bluff',
        severity: 'warning',
        findings: [createFinding({ file: 'shared.ts', description: 'bluff' })],
      }),
    ];

    const report = buildReport(results, [], 'mechanical', '/tmp/project', null, []);

    const top = report.summary.top3[0];
    expect(top.check).toBe('test-cheat');
    expect(top.correlations).toContain('confidence-bluff');
  });
});

// ---------------------------------------------------------------------------
// RPT-004: Top 3 with fewer than 3 findings
// ---------------------------------------------------------------------------

describe('RPT-004: Top 3 with fewer than 3 findings', () => {
  it('returns all findings when fewer than 3 exist', () => {
    const results: CheckResult[] = [
      createCheckResult({
        name: 'only-one',
        severity: 'warning',
        findings: [createFinding({ file: 'a.ts' })],
      }),
    ];

    const report = buildReport(results, [], 'mechanical', '/tmp/project', null, []);

    expect(report.summary.top3).toHaveLength(1);
    expect(report.summary.top3[0].check).toBe('only-one');
  });

  it('returns empty top3 when no findings', () => {
    const results: CheckResult[] = [
      createCheckResult({ name: 'all-clean', severity: 'clean' }),
    ];

    const report = buildReport(results, [], 'mechanical', '/tmp/project', null, []);
    expect(report.summary.top3).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// RPT-005: Refactoring assessment null in mechanical mode
// ---------------------------------------------------------------------------

describe('RPT-005: Refactoring assessment null in mechanical mode', () => {
  it('returns null refactoringAssessment in mechanical mode', () => {
    const results: CheckResult[] = [
      createCheckResult({ name: 'refactoring-signals', layer: 2, severity: 'critical' }),
    ];

    const report = buildReport(results, [], 'mechanical', '/tmp/project', null, []);

    expect(report.summary.refactoringAssessment).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RPT-006: Refactoring assessment populated in full mode
// ---------------------------------------------------------------------------

describe('RPT-006: Refactoring assessment populated in full mode', () => {
  it('maps critical severity to red', () => {
    const results: CheckResult[] = [
      createCheckResult({
        name: 'refactoring-signals',
        layer: 2,
        severity: 'critical',
        findings: [createFinding()],
      }),
    ];

    const report = buildReport(results, [], 'full', '/tmp/project', null, []);
    expect(report.summary.refactoringAssessment).toBe('red');
  });

  it('maps warning severity to yellow', () => {
    const results: CheckResult[] = [
      createCheckResult({
        name: 'refactoring-signals',
        layer: 2,
        severity: 'warning',
        findings: [createFinding()],
      }),
    ];

    const report = buildReport(results, [], 'full', '/tmp/project', null, []);
    expect(report.summary.refactoringAssessment).toBe('yellow');
  });

  it('maps clean severity to green', () => {
    const results: CheckResult[] = [
      createCheckResult({ name: 'refactoring-signals', layer: 2, severity: 'clean' }),
    ];

    const report = buildReport(results, [], 'full', '/tmp/project', null, []);
    expect(report.summary.refactoringAssessment).toBe('green');
  });

  it('returns null when refactoring-signals check is absent', () => {
    const results: CheckResult[] = [
      createCheckResult({ name: 'other-check', layer: 2, severity: 'clean' }),
    ];

    const report = buildReport(results, [], 'full', '/tmp/project', null, []);
    expect(report.summary.refactoringAssessment).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RPT-007: Token usage present only in full mode
// ---------------------------------------------------------------------------

describe('RPT-007: Token usage present only in full mode', () => {
  it('includes tokenUsage in full mode', () => {
    const results: CheckResult[] = [
      createCheckResult({
        name: 'ghost-refactor',
        layer: 2,
        severity: 'clean',
        tokenUsage: { input: 1000, output: 200 },
      }),
      createCheckResult({
        name: 'deep-heresy',
        layer: 2,
        severity: 'warning',
        findings: [createFinding()],
        tokenUsage: { input: 2000, output: 400 },
      }),
    ];

    const report = buildReport(results, [], 'full', '/tmp/project', null, []);

    expect(report.tokenUsage).toBeDefined();
    expect(report.tokenUsage!.totalInputTokens).toBe(3000);
    expect(report.tokenUsage!.totalOutputTokens).toBe(600);
    expect(report.tokenUsage!.checks['ghost-refactor']).toEqual({ input: 1000, output: 200 });
    expect(report.tokenUsage!.checks['deep-heresy']).toEqual({ input: 2000, output: 400 });
  });
});

// ---------------------------------------------------------------------------
// RPT-008: Token usage absent in mechanical mode
// ---------------------------------------------------------------------------

describe('RPT-008: Token usage absent in mechanical mode', () => {
  it('does not include tokenUsage in mechanical mode', () => {
    const results: CheckResult[] = [
      createCheckResult({ name: 'test-cheat', layer: 1, severity: 'clean' }),
    ];

    const report = buildReport(results, [], 'mechanical', '/tmp/project', null, []);

    expect(report.tokenUsage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// RPT-009: Check severity is highest among findings
// ---------------------------------------------------------------------------

describe('RPT-009: Check severity is highest among findings', () => {
  it('preserves the original check severity in the report', () => {
    const results: CheckResult[] = [
      createCheckResult({
        name: 'check-mixed',
        severity: 'critical',
        findings: [
          createFinding({ file: 'a.ts', description: 'critical issue' }),
          createFinding({ file: 'b.ts', description: 'another issue' }),
        ],
      }),
    ];

    const report = buildReport(results, [], 'mechanical', '/tmp/project', null, []);

    const check = report.checks.find((c) => c.name === 'check-mixed')!;
    expect(check.severity).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// RPT-010: Secret values masked in report evidence
// ---------------------------------------------------------------------------

describe('RPT-010: Secret values masked in report evidence', () => {
  it('masks secret values in finding descriptions', () => {
    const secrets: SecretLocation[] = [
      makeSecretLocation({ maskedValue: 'AKIA1234ABCDWXYZ5678' }),
    ];

    const results: CheckResult[] = [
      createCheckResult({
        name: 'resource-drain',
        severity: 'warning',
        findings: [
          createFinding({
            description: 'Found AWS key AKIA1234ABCDWXYZ5678 in config',
          }),
        ],
      }),
    ];

    const report = buildReport(results, [], 'mechanical', '/tmp/project', null, secrets);

    const finding = report.checks[0].findings[0];
    expect(finding.description).not.toContain('AKIA1234ABCDWXYZ5678');
    expect(finding.description).toContain('[REDACTED:aws-key]');
  });

  it('masks secret values in evidence fields', () => {
    const secrets: SecretLocation[] = [
      makeSecretLocation({ maskedValue: 'secret-token-value', patternType: 'github-token' }),
    ];

    const results: CheckResult[] = [
      createCheckResult({
        name: 'resource-drain',
        severity: 'warning',
        findings: [
          createFinding({
            evidence: {
              rawContent: 'const token = "secret-token-value";',
              nested: { value: 'secret-token-value' },
            },
          }),
        ],
      }),
    ];

    const report = buildReport(results, [], 'mechanical', '/tmp/project', null, secrets);

    const evidence = report.checks[0].findings[0].evidence!;
    expect(evidence.rawContent).not.toContain('secret-token-value');
    expect(evidence.rawContent).toContain('[REDACTED:github-token]');
    expect((evidence.nested as Record<string, unknown>).value).toContain('[REDACTED:github-token]');
  });

  it('applies defense-in-depth regex for AWS keys', () => {
    const results: CheckResult[] = [
      createCheckResult({
        name: 'resource-drain',
        severity: 'warning',
        findings: [
          createFinding({
            description: 'Found AKIAIOSFODNN7EXAMPLE in source',
          }),
        ],
      }),
    ];

    const report = buildReport(results, [], 'mechanical', '/tmp/project', null, []);

    const finding = report.checks[0].findings[0];
    expect(finding.description).toContain('[REDACTED:aws-key]');
  });
});

// ---------------------------------------------------------------------------
// Deduplication (DAY-ZERO Section 15)
// ---------------------------------------------------------------------------

describe('Deduplication', () => {
  it('removes Layer 1 finding when Layer 2 has same file+location', () => {
    const results: CheckResult[] = [
      createCheckResult({
        name: 'unoptimized-defaults',
        layer: 1,
        severity: 'warning',
        findings: [
          createFinding({ file: 'app.tsx', location: 'line 42', description: 'L1 finding' }),
          createFinding({ file: 'other.ts', location: 'line 10', description: 'unique L1' }),
        ],
      }),
      createCheckResult({
        name: 'react-fluidity',
        layer: 2,
        severity: 'warning',
        findings: [
          createFinding({ file: 'app.tsx', location: 'line 42', description: 'L2 finding' }),
        ],
      }),
    ];

    const report = buildReport(results, [], 'full', '/tmp/project', null, []);

    // The L1 check should have the duplicate removed
    const l1 = report.checks.find((c) => c.name === 'unoptimized-defaults')!;
    expect(l1.findings).toHaveLength(1);
    expect(l1.findings[0].description).toBe('unique L1');

    // The L2 check keeps its finding
    const l2 = report.checks.find((c) => c.name === 'react-fluidity')!;
    expect(l2.findings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// redactSecrets utility
// ---------------------------------------------------------------------------

describe('redactSecrets', () => {
  it('replaces masked values with redaction markers', () => {
    const secrets: SecretLocation[] = [
      makeSecretLocation({ maskedValue: 'my-secret', patternType: 'api-key' }),
    ];

    const result = redactSecrets('The key is my-secret here', secrets);
    expect(result).toBe('The key is [REDACTED:api-key] here');
  });
});
