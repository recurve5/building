import type { AuditReport, CheckResult } from '../types/index.js';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '\x1b[31m',  // red
  warning: '\x1b[33m',   // yellow
  info: '\x1b[36m',      // cyan
  clean: '\x1b[32m',     // green
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

/**
 * Format a single check's progress as it completes.
 */
export function formatCheckProgress(checkName: string, result: CheckResult): string {
  const padded = checkName.padEnd(28);
  const color = SEVERITY_COLORS[result.severity] ?? '';

  if (result.status === 'skipped') {
    return `${DIM}  ${padded} skipped${RESET}`;
  }

  if (result.status === 'error') {
    return `${SEVERITY_COLORS.critical}  ${padded} error: ${result.errorMessage ?? 'unknown'}${RESET}`;
  }

  if (result.findings.length === 0) {
    return `${SEVERITY_COLORS.clean}  ${padded} clean${RESET}`;
  }

  const counts = summarizeFindingCounts(result);
  return `${color}  ${padded} ${result.findings.length} finding${result.findings.length === 1 ? '' : 's'} (${counts})${RESET}`;
}

/**
 * Format Layer 2 check progress for multi-phase display.
 */
export function formatLayer2Progress(
  checkName: string,
  phase: 'gathering' | 'reviewing' | 'complete',
  candidateCount?: number,
): string {
  const padded = checkName.padEnd(28);

  switch (phase) {
    case 'gathering': {
      const suffix = candidateCount !== undefined ? ` (${candidateCount} candidates)` : '';
      return `${DIM}  ${padded} Gathering evidence...${suffix}${RESET}`;
    }
    case 'reviewing':
      return `${DIM}  ${padded} LLM review...${RESET}`;
    case 'complete':
      return `${DIM}  ${padded} complete${RESET}`;
  }
}

/**
 * Format the full terminal output from a completed report.
 */
export function formatTerminalOutput(report: AuditReport, verbose: boolean): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(`${BOLD}building-audit${RESET} v${report.version}`);
  lines.push(`${DIM}${report.project}${report.milestone ? ` (${report.milestone})` : ''}${RESET}`);
  lines.push(`${DIM}Mode: ${report.mode}${RESET}`);
  lines.push('');

  // Parse errors
  if (report.parseErrors.length > 0) {
    lines.push(`${SEVERITY_COLORS.warning}Parse errors:${RESET}`);
    for (const err of report.parseErrors) {
      lines.push(`  ${err.file}: ${err.reason}`);
    }
    lines.push('');
  }

  // Check results
  lines.push(`${BOLD}Checks:${RESET}`);
  for (const check of report.checks) {
    lines.push(formatCheckProgress(check.name, check));
  }
  lines.push('');

  // Critical findings (always shown inline)
  const criticalFindings = collectFindingsBySeverity(report, 'critical');
  if (criticalFindings.length > 0) {
    lines.push(`${SEVERITY_COLORS.critical}${BOLD}Critical findings:${RESET}`);
    for (const { checkName, finding } of criticalFindings) {
      lines.push(`${SEVERITY_COLORS.critical}  ${finding.file} ${DIM}${finding.location}${RESET}`);
      lines.push(`${SEVERITY_COLORS.critical}    ${finding.description}${RESET}`);
      lines.push(`${DIM}    Suggestion: ${finding.suggestion}${RESET}`);
      lines.push('');
    }
  }

  // Verbose: show all warnings and info
  if (verbose) {
    const warnings = collectFindingsBySeverity(report, 'warning');
    if (warnings.length > 0) {
      lines.push(`${SEVERITY_COLORS.warning}${BOLD}Warnings:${RESET}`);
      for (const { checkName, finding } of warnings) {
        lines.push(`${SEVERITY_COLORS.warning}  ${finding.file} ${DIM}${finding.location}${RESET}`);
        lines.push(`${SEVERITY_COLORS.warning}    ${finding.description}${RESET}`);
        lines.push(`${DIM}    Suggestion: ${finding.suggestion}${RESET}`);
        lines.push('');
      }
    }

    const infos = collectFindingsBySeverity(report, 'info');
    if (infos.length > 0) {
      lines.push(`${SEVERITY_COLORS.info}${BOLD}Info:${RESET}`);
      for (const { checkName, finding } of infos) {
        lines.push(`${SEVERITY_COLORS.info}  ${finding.file} ${DIM}${finding.location}${RESET}`);
        lines.push(`${SEVERITY_COLORS.info}    ${finding.description}${RESET}`);
        lines.push(`${DIM}    Suggestion: ${finding.suggestion}${RESET}`);
        lines.push('');
      }
    }
  }

  // Summary line
  const s = report.summary;
  const parts: string[] = [];
  if (s.critical > 0) parts.push(`${SEVERITY_COLORS.critical}${s.critical} critical${RESET}`);
  if (s.warning > 0) parts.push(`${SEVERITY_COLORS.warning}${s.warning} warning${RESET}`);
  if (s.info > 0) parts.push(`${SEVERITY_COLORS.info}${s.info} info${RESET}`);
  if (s.clean > 0) parts.push(`${SEVERITY_COLORS.clean}${s.clean} clean${RESET}`);
  if (s.skipped > 0) parts.push(`${DIM}${s.skipped} skipped${RESET}`);

  lines.push(`${BOLD}Summary:${RESET} ${parts.join(', ')}`);

  // Refactoring assessment
  if (s.refactoringAssessment) {
    const assessColor =
      s.refactoringAssessment === 'red'
        ? SEVERITY_COLORS.critical
        : s.refactoringAssessment === 'yellow'
          ? SEVERITY_COLORS.warning
          : SEVERITY_COLORS.clean;
    lines.push(`${BOLD}Refactoring:${RESET} ${assessColor}${s.refactoringAssessment}${RESET}`);
  }

  // Token usage
  if (report.tokenUsage) {
    lines.push(
      `${DIM}Tokens: ${report.tokenUsage.totalInputTokens.toLocaleString()} in / ${report.tokenUsage.totalOutputTokens.toLocaleString()} out${RESET}`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function summarizeFindingCounts(result: CheckResult): string {
  // We don't have per-finding severity, but we have the check-level severity.
  // Simply report the count.
  return `${result.severity}`;
}

interface FindingEntry {
  checkName: string;
  finding: { file: string; location: string; description: string; suggestion: string };
}

function collectFindingsBySeverity(report: AuditReport, severity: string): FindingEntry[] {
  const entries: FindingEntry[] = [];
  for (const check of report.checks) {
    if (check.status !== 'completed' || check.severity !== severity) continue;
    for (const finding of check.findings) {
      entries.push({ checkName: check.name, finding });
    }
  }
  return entries;
}
