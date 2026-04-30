import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Check, CheckResult, Finding, ProjectContext } from '../types.js';
import { registerCheck } from '../registry.js';

// ---------------------------------------------------------------------------
// Assertion pattern config
// ---------------------------------------------------------------------------

interface AssertionPatterns {
  strong: string[];
  weak: string[];
}

const DEFAULT_PATTERNS: AssertionPatterns = {
  strong: [
    'toEqual',
    'toBe',
    'toStrictEqual',
    'toMatchObject',
    'toMatchSnapshot',
    'toThrow',
    'toHaveBeenCalledWith',
  ],
  weak: [
    'toBeDefined',
    'toBeTruthy',
    'toBeFalsy',
    'toBeInstanceOf',
    'not.toBeNull',
    'not.toBeUndefined',
    'toHaveLength',
    'toBeGreaterThan',
    'toBeLessThan',
  ],
};

function loadAssertionPatterns(): AssertionPatterns {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const configPath = resolve(__dirname, 'assertion-patterns.json');
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as AssertionPatterns;
    if (Array.isArray(parsed.strong) && Array.isArray(parsed.weak)) {
      return parsed;
    }
    return DEFAULT_PATTERNS;
  } catch {
    return DEFAULT_PATTERNS;
  }
}

// ---------------------------------------------------------------------------
// Correctness-implying name detection
// ---------------------------------------------------------------------------

const CORRECTNESS_PATTERN = /calculates|returns|produces|computes|generates/i;

function impliesCorrectness(testName: string): boolean {
  return CORRECTNESS_PATTERN.test(testName);
}

// ---------------------------------------------------------------------------
// Check implementation
// ---------------------------------------------------------------------------

const testCheatCheck: Check = {
  name: 'test-cheat',
  layer: 1,

  async run(context: ProjectContext): Promise<CheckResult> {
    const patterns = loadAssertionPatterns();
    const strongSet = new Set(patterns.strong);

    const findings: Finding[] = [];

    for (const [, analyzedFile] of context.sourceFiles) {
      if (analyzedFile.testFunctions.length === 0) continue;

      for (const testFn of analyzedFile.testFunctions) {
        // No assertions = finding (absent)
        if (testFn.assertions.length === 0) {
          const severity = impliesCorrectness(testFn.name) ? 'critical' : 'warning';
          findings.push({
            file: analyzedFile.filePath,
            location: `line ${testFn.startLine}`,
            description: `Test '${testFn.name}' has no assertions.`,
            suggestion: 'Add assertions that verify specific expected values.',
            evidence: {
              testName: testFn.name,
              assertionCount: 0,
              severity,
            },
          });
          continue;
        }

        // Check if all assertions are weak (none strong)
        const hasStrong = testFn.assertions.some((a) => strongSet.has(a.method));

        if (!hasStrong) {
          const weakMethods = testFn.assertions.map((a) => a.method);
          const uniqueWeak = [...new Set(weakMethods)];
          const isCorrectness = impliesCorrectness(testFn.name);
          const severity = isCorrectness ? 'critical' : 'warning';

          findings.push({
            file: analyzedFile.filePath,
            location: `line ${testFn.startLine}`,
            description: `Test '${testFn.name}' has ${testFn.assertions.length} assertion${testFn.assertions.length === 1 ? '' : 's'}, all ${uniqueWeak.join(', ')}.`,
            suggestion: 'Assert specific expected values instead of existence checks.',
            evidence: {
              testName: testFn.name,
              assertionCount: testFn.assertions.length,
              weakAssertions: uniqueWeak,
              severity,
            },
          });
        }
        // Mixed or all-strong: no finding
      }
    }

    // Determine highest severity
    let severity: CheckResult['severity'] = 'clean';
    if (findings.length > 0) {
      const hasCritical = findings.some(
        (f) => f.evidence && f.evidence['severity'] === 'critical',
      );
      severity = hasCritical ? 'critical' : 'warning';
    }

    return {
      name: 'test-cheat',
      layer: 1,
      status: 'completed',
      severity,
      findings,
      errorMessage: null,
    };
  },
};

registerCheck(testCheatCheck);

export { testCheatCheck, loadAssertionPatterns, impliesCorrectness };
