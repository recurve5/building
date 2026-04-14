import type { Check, CheckResult, Finding, ProjectContext } from '../types.js';
import { registerCheck } from '../registry.js';

// ---------------------------------------------------------------------------
// Unoptimized Defaults Check
// ---------------------------------------------------------------------------
// Missing LIMIT, unsanitized input, missing debounce.
// Per DAY-ZERO Section 15: findings include file+location for deduplication
// with Layer 2 checks.

// SQL injection: template literal interpolation in query strings
const SQL_INTERP_PATTERN = /(?:query|execute|exec|run)\s*\(\s*`[^`]*\$\{/;
// Shell injection: exec/execSync/spawn with template literal
const SHELL_INTERP_PATTERN = /(?:exec|execSync|spawn|spawnSync)\s*\(\s*`[^`]*\$\{/;
// SQL query without LIMIT
const SQL_QUERY_PATTERN = /\b(SELECT|DELETE|UPDATE)\b[^;]*?(?:FROM|SET)\b/i;
const SQL_LIMIT_PATTERN = /\bLIMIT\b/i;
const SQL_PAGINATION_PATTERN = /\b(OFFSET|FETCH\s+NEXT|ROW_NUMBER|SKIP|TAKE)\b/i;
// Missing debounce on scroll/resize
const SCROLL_RESIZE_PATTERN = /addEventListener\s*\(\s*['"`](scroll|resize)['"`]/;
const DEBOUNCE_PATTERN = /\b(debounce|throttle|requestAnimationFrame)\b/;

const unoptimizedDefaults: Check = {
  name: 'unoptimized-defaults',
  layer: 1,

  async run(context: ProjectContext): Promise<CheckResult> {
    const { rawFiles } = context;
    const findings: Finding[] = [];

    for (const [filePath, content] of rawFiles) {
      const lines = content.split('\n');

      // --- SQL injection detection ----------------------------------------
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (SQL_INTERP_PATTERN.test(line)) {
          findings.push({
            file: filePath,
            location: `line ${i + 1}`,
            description: `Unsanitized input in SQL query: template literal interpolation in query call.`,
            suggestion: `Use parameterized queries instead of string interpolation.`,
            evidence: { pattern: 'sql-injection', severity: 'critical' },
          });
        }

        if (SHELL_INTERP_PATTERN.test(line)) {
          findings.push({
            file: filePath,
            location: `line ${i + 1}`,
            description: `Unsanitized input in shell command: template literal interpolation in exec call.`,
            suggestion: `Use parameterized arguments or escape shell input.`,
            evidence: { pattern: 'shell-injection', severity: 'critical' },
          });
        }
      }

      // --- Missing LIMIT on queries ----------------------------------------
      if (SQL_QUERY_PATTERN.test(content) && !SQL_LIMIT_PATTERN.test(content) && !SQL_PAGINATION_PATTERN.test(content)) {
        findings.push({
          file: filePath,
          location: 'file-level',
          description: `Database query without LIMIT or pagination detected.`,
          suggestion: `Add LIMIT clause or pagination to prevent unbounded result sets.`,
          evidence: { pattern: 'missing-limit', severity: 'warning' },
        });
      }

      // --- Missing debounce on scroll/resize --------------------------------
      if (SCROLL_RESIZE_PATTERN.test(content) && !DEBOUNCE_PATTERN.test(content)) {
        findings.push({
          file: filePath,
          location: 'file-level',
          description: `Scroll/resize event handler without debounce or throttle.`,
          suggestion: `Add debounce/throttle or requestAnimationFrame to reduce performance impact.`,
          evidence: { pattern: 'missing-debounce', severity: 'warning' },
        });
      }
    }

    // Determine severity
    const hasCritical = findings.some(
      (f) => (f.evidence as Record<string, unknown>)?.['severity'] === 'critical',
    );
    const hasWarning = findings.some(
      (f) => (f.evidence as Record<string, unknown>)?.['severity'] === 'warning',
    );
    const severity: CheckResult['severity'] = hasCritical
      ? 'critical'
      : hasWarning
        ? 'warning'
        : 'clean';

    return {
      name: 'unoptimized-defaults',
      layer: 1,
      status: 'completed',
      severity,
      findings,
      errorMessage: null,
    };
  },
};

registerCheck(unoptimizedDefaults);

export { unoptimizedDefaults };
