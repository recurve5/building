import type { Check, CheckResult, Finding, ProjectContext, SecretLocation } from '../types.js';
import { registerCheck } from '../registry.js';

// ---------------------------------------------------------------------------
// Resource Drain Check
// ---------------------------------------------------------------------------
// Missing cleanup patterns, unbounded queries, hardcoded secrets.
// CRITICAL: Produces SecretLocation[] in finding.evidence.secretLocations
// for L2 redaction.

// --- Secret patterns -------------------------------------------------------

const SECRET_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'aws-key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'github-token', regex: /ghp_[a-zA-Z0-9]{36}/ },
  { name: 'generic-api-key', regex: /(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"`]([A-Za-z0-9+/=_-]{32,})['"`]/i },
];

// High-entropy: base64/hex strings 32+ chars in assignment context
const HIGH_ENTROPY_PATTERN = /(?:=\s*['"`])([A-Za-z0-9+/=_-]{32,})['"`]/;

function maskValue(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '...' + value.slice(-4);
}

// --- Cleanup patterns ------------------------------------------------------

const SET_INTERVAL_PATTERN = /\bsetInterval\s*\(/;
const CLEAR_INTERVAL_PATTERN = /\bclearInterval\s*\(/;
const SET_TIMEOUT_PATTERN = /\bsetTimeout\s*\(/;
const CLEAR_TIMEOUT_PATTERN = /\bclearTimeout\s*\(/;
const ADD_EVENT_LISTENER_PATTERN = /\baddEventListener\s*\(/;
const REMOVE_EVENT_LISTENER_PATTERN = /\bremoveEventListener\s*\(/;

// --- Query patterns --------------------------------------------------------

const QUERY_PATTERN = /\b(?:SELECT|DELETE|UPDATE)\b/i;
const LIMIT_PATTERN = /\bLIMIT\b/i;

const resourceDrain: Check = {
  name: 'resource-drain',
  layer: 1,

  async run(context: ProjectContext): Promise<CheckResult> {
    const { sourceFiles, rawFiles } = context;
    const findings: Finding[] = [];
    const allSecretLocations: SecretLocation[] = [];

    // Process all available content
    const allContent = new Map<string, string>();
    for (const [path, content] of rawFiles) {
      allContent.set(path, content);
    }

    // For source files, we need raw content from rawFiles or identifiers
    for (const [filePath, content] of allContent) {
      const lines = content.split('\n');

      // --- Secret detection -----------------------------------------------
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const pattern of SECRET_PATTERNS) {
          const match = pattern.regex.exec(line);
          if (match) {
            const secretValue = match[1] ?? match[0];
            const secretLoc: SecretLocation = {
              filePath,
              line: i + 1,
              endLine: i + 1,
              patternType: pattern.name,
              maskedValue: maskValue(secretValue),
            };
            allSecretLocations.push(secretLoc);

            findings.push({
              file: filePath,
              location: `line ${i + 1}`,
              description: `Hardcoded secret detected (${pattern.name}): ${maskValue(secretValue)}`,
              suggestion: `Move secret to environment variable or secrets manager.`,
              evidence: { patternType: pattern.name, secretLocations: [secretLoc] },
            });
          }
        }

        // High entropy check
        const entropyMatch = HIGH_ENTROPY_PATTERN.exec(line);
        if (entropyMatch && entropyMatch[1]) {
          // Skip if it's a well-known pattern (imports, URLs, file paths)
          const value = entropyMatch[1];
          if (!line.includes('import') && !line.includes('require') && !line.includes('://') && !line.includes('/')) {
            const secretLoc: SecretLocation = {
              filePath,
              line: i + 1,
              endLine: i + 1,
              patternType: 'high-entropy',
              maskedValue: maskValue(value),
            };
            allSecretLocations.push(secretLoc);

            findings.push({
              file: filePath,
              location: `line ${i + 1}`,
              description: `High-entropy string detected in assignment context: ${maskValue(value)}`,
              suggestion: `Verify this is not a secret. If it is, move to environment variable.`,
              evidence: { patternType: 'high-entropy', secretLocations: [secretLoc] },
            });
          }
        }
      }

      // --- Cleanup pattern detection --------------------------------------
      const hasSetInterval = SET_INTERVAL_PATTERN.test(content);
      const hasClearInterval = CLEAR_INTERVAL_PATTERN.test(content);
      if (hasSetInterval && !hasClearInterval) {
        findings.push({
          file: filePath,
          location: 'file-level',
          description: `setInterval used without corresponding clearInterval.`,
          suggestion: `Add cleanup to prevent memory leaks (e.g., clearInterval in useEffect cleanup or destructor).`,
          evidence: { pattern: 'missing-cleanup', api: 'setInterval' },
        });
      }

      const hasSetTimeout = SET_TIMEOUT_PATTERN.test(content);
      const hasClearTimeout = CLEAR_TIMEOUT_PATTERN.test(content);
      if (hasSetTimeout && !hasClearTimeout) {
        // setTimeout without clearTimeout is less concerning, but flag it
        findings.push({
          file: filePath,
          location: 'file-level',
          description: `setTimeout used without corresponding clearTimeout.`,
          suggestion: `Consider storing timeout ID for cleanup if the component/scope can be destroyed.`,
          evidence: { pattern: 'missing-cleanup', api: 'setTimeout' },
        });
      }

      const hasAddListener = ADD_EVENT_LISTENER_PATTERN.test(content);
      const hasRemoveListener = REMOVE_EVENT_LISTENER_PATTERN.test(content);
      if (hasAddListener && !hasRemoveListener) {
        findings.push({
          file: filePath,
          location: 'file-level',
          description: `addEventListener used without corresponding removeEventListener.`,
          suggestion: `Add cleanup to prevent memory leaks.`,
          evidence: { pattern: 'missing-cleanup', api: 'addEventListener' },
        });
      }

      // --- Unbounded query detection --------------------------------------
      const queryMatch = QUERY_PATTERN.exec(content);
      if (queryMatch && !LIMIT_PATTERN.test(content)) {
        findings.push({
          file: filePath,
          location: 'file-level',
          description: `Database query detected without LIMIT clause.`,
          suggestion: `Add LIMIT to prevent unbounded result sets.`,
          evidence: { pattern: 'unbounded-query' },
        });
      }
    }

    // Determine severity
    const hasCritical = findings.some(
      (f) => (f.evidence as Record<string, unknown>)?.['patternType'] !== undefined,
    );
    const hasWarning = findings.some(
      (f) => (f.evidence as Record<string, unknown>)?.['pattern'] !== undefined,
    );
    const severity: CheckResult['severity'] = hasCritical
      ? 'critical'
      : hasWarning
        ? 'warning'
        : 'clean';

    // Consolidate all secret locations into a single evidence entry if present
    if (allSecretLocations.length > 0) {
      // Add a summary finding with all secret locations for the runner to extract
      findings.push({
        file: 'project',
        location: 'summary',
        description: `Found ${allSecretLocations.length} potential secret(s) across the project. Full pattern library not available (no gitleaks).`,
        suggestion: `Review all detected secrets and move to environment variables or secrets manager.`,
        evidence: { secretLocations: allSecretLocations },
      });
    }

    return {
      name: 'resource-drain',
      layer: 1,
      status: 'completed',
      severity,
      findings,
      errorMessage: null,
    };
  },
};

registerCheck(resourceDrain);

export { resourceDrain };
