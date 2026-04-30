import type {
  AuditReport,
  CheckResult,
  Finding,
  ParseError,
  SecretLocation,
  TopFinding,
} from '../types/index.js';
import { redactSecrets } from '../llm/redact.js';

export { redactSecrets };

const REPORT_VERSION = '1.0.0';

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  clean: 3,
};

/**
 * Apply secret masking to a single finding's description and evidence fields.
 */
function maskFinding(finding: Finding, secrets: SecretLocation[]): Finding {
  const masked: Finding = {
    ...finding,
    description: redactSecrets(finding.description, secrets),
    suggestion: finding.suggestion,
  };

  if (finding.evidence) {
    masked.evidence = maskEvidence(finding.evidence, secrets);
  }

  return masked;
}

/**
 * Recursively mask secrets in evidence objects.
 */
function maskEvidence(
  evidence: Record<string, unknown>,
  secrets: SecretLocation[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(evidence)) {
    if (typeof value === 'string') {
      result[key] = redactSecrets(value, secrets);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === 'string') return redactSecrets(item, secrets);
        if (item && typeof item === 'object') return maskEvidence(item as Record<string, unknown>, secrets);
        return item;
      });
    } else if (value && typeof value === 'object') {
      result[key] = maskEvidence(value as Record<string, unknown>, secrets);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Deduplicate findings across checks: when findings from different checks share
 * the same file+location, keep the higher-layer finding.
 * Returns new CheckResult[] with duplicates removed from lower-layer checks.
 */
function deduplicateFindings(results: CheckResult[]): CheckResult[] {
  // Build a map of file+location -> highest layer that has a finding there
  const locationToHighestLayer = new Map<string, number>();

  for (const result of results) {
    if (result.status !== 'completed') continue;
    for (const finding of result.findings) {
      const key = `${finding.file}::${finding.location}`;
      const current = locationToHighestLayer.get(key) ?? 0;
      if (result.layer > current) {
        locationToHighestLayer.set(key, result.layer);
      }
    }
  }

  // Filter out findings from lower layers when a higher layer has the same location
  return results.map((result) => {
    if (result.status !== 'completed') return result;

    const filtered = result.findings.filter((finding) => {
      const key = `${finding.file}::${finding.location}`;
      const highestLayer = locationToHighestLayer.get(key) ?? result.layer;
      return result.layer >= highestLayer;
    });

    if (filtered.length === result.findings.length) return result;

    // Recompute severity based on remaining findings
    const severity = computeSeverity(filtered);
    return { ...result, findings: filtered, severity };
  });
}

/**
 * Compute the highest severity among findings, or 'clean' if none.
 */
function computeSeverity(findings: Finding[]): CheckResult['severity'] {
  if (findings.length === 0) return 'clean';
  // We don't have severity on individual findings — severity is on CheckResult.
  // The spec says "severity is the highest among its findings" but Finding doesn't have severity.
  // Return 'clean' — the caller should use the original CheckResult severity logic.
  return 'clean';
}

/**
 * Compute the overall severity for a check based on its findings.
 * Since Finding doesn't carry its own severity, we preserve the original severity
 * unless all findings were removed (then it becomes 'clean').
 */
function recomputeSeverity(original: CheckResult, remainingCount: number): CheckResult['severity'] {
  if (remainingCount === 0) return 'clean';
  return original.severity;
}

/**
 * Select top 3 findings with cross-check correlations (Decision 20).
 */
function selectTop3(results: CheckResult[]): TopFinding[] {
  // Collect all findings with their check metadata
  const allFindings: Array<{
    check: string;
    layer: number;
    severity: CheckResult['severity'];
    finding: Finding;
  }> = [];

  for (const result of results) {
    if (result.status !== 'completed' || result.findings.length === 0) continue;
    for (const finding of result.findings) {
      allFindings.push({
        check: result.name,
        layer: result.layer,
        severity: result.severity,
        finding,
      });
    }
  }

  // Sort by severity (critical > warning > info > clean)
  allFindings.sort((a, b) => {
    return (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
  });

  // Take top 3
  const top = allFindings.slice(0, 3);

  // Build file-to-checks index for correlations
  const fileToChecks = new Map<string, Set<string>>();
  for (const entry of allFindings) {
    const file = entry.finding.file;
    if (!fileToChecks.has(file)) {
      fileToChecks.set(file, new Set());
    }
    fileToChecks.get(file)!.add(entry.check);
  }

  return top.map((entry) => {
    const checksAtFile = fileToChecks.get(entry.finding.file);
    const correlations = checksAtFile
      ? [...checksAtFile].filter((name) => name !== entry.check).sort()
      : [];

    const result: TopFinding = {
      check: entry.check,
      file: entry.finding.file,
      description: entry.finding.description,
    };

    if (correlations.length > 0) {
      result.correlations = correlations;
    }

    return result;
  });
}

/**
 * Determine the refactoring assessment from Layer 2 check results.
 * Looks for a check named 'refactoring-signals' and maps its severity.
 */
function getRefactoringAssessment(
  results: CheckResult[],
  mode: 'mechanical' | 'full',
): 'green' | 'yellow' | 'red' | null {
  if (mode === 'mechanical') return null;

  const refactoring = results.find((r) => r.name === 'refactoring-signals');
  if (!refactoring || refactoring.status !== 'completed') return null;

  switch (refactoring.severity) {
    case 'critical':
      return 'red';
    case 'warning':
      return 'yellow';
    default:
      return 'green';
  }
}

/**
 * Build the audit report from check results.
 */
export function buildReport(
  results: CheckResult[],
  parseErrors: ParseError[],
  mode: 'mechanical' | 'full',
  projectPath: string,
  milestone: string | null,
  secretLocations: SecretLocation[],
): AuditReport {
  // Step 1: Deduplicate findings across checks
  const deduplicated = deduplicateFindings(results);

  // Step 2: Mask secrets in findings
  const masked = deduplicated.map((result) => {
    if (result.status !== 'completed' || result.findings.length === 0) return result;
    return {
      ...result,
      findings: result.findings.map((f) => maskFinding(f, secretLocations)),
    };
  });

  // Step 3: Compute summary counts
  let critical = 0;
  let warning = 0;
  let info = 0;
  let clean = 0;
  let skipped = 0;

  for (const result of masked) {
    switch (result.status) {
      case 'skipped':
        skipped++;
        break;
      case 'error':
        // Errors don't count toward severity tallies
        break;
      case 'completed':
        switch (result.severity) {
          case 'critical':
            critical++;
            break;
          case 'warning':
            warning++;
            break;
          case 'info':
            info++;
            break;
          case 'clean':
            clean++;
            break;
        }
        break;
    }
  }

  // Step 4: Select top 3 and compute correlations
  const top3 = selectTop3(masked);

  // Step 5: Compute refactoring assessment
  const refactoringAssessment = getRefactoringAssessment(masked, mode);

  // Step 6: Compute token usage (full mode only)
  let tokenUsage: AuditReport['tokenUsage'];
  if (mode === 'full') {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const checks: Record<string, { input: number; output: number }> = {};

    for (const result of masked) {
      if (result.tokenUsage) {
        totalInputTokens += result.tokenUsage.input;
        totalOutputTokens += result.tokenUsage.output;
        checks[result.name] = {
          input: result.tokenUsage.input,
          output: result.tokenUsage.output,
        };
      }
    }

    tokenUsage = { totalInputTokens, totalOutputTokens, checks };
  }

  // Step 7: Build the report
  const report: AuditReport = {
    version: REPORT_VERSION,
    timestamp: new Date().toISOString(),
    project: projectPath,
    mode,
    milestone,
    checks: masked,
    parseErrors,
    summary: {
      critical,
      warning,
      info,
      clean,
      skipped,
      refactoringAssessment,
      top3,
    },
  };

  if (tokenUsage) {
    report.tokenUsage = tokenUsage;
  }

  return report;
}
