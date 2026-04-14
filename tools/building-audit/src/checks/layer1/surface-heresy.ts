import type { Check, CheckResult, Finding, ProjectContext } from '../types.js';
import { registerCheck } from '../registry.js';

// ---------------------------------------------------------------------------
// Surface Heresy Check
// ---------------------------------------------------------------------------
// Parses DECISIONS.md for [HARD KILL] entries, extracts killed terminology,
// and searches the codebase for references to killed concepts.
// Source code matches = critical, documentation matches = warning.

/**
 * Extract searchable terms from a Hard Kill decision text.
 * Extracts: backtick-wrapped identifiers, quoted strings, and PascalCase/camelCase words.
 */
function extractTerms(decisionText: string): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();

  const add = (term: string) => {
    const trimmed = term.trim();
    // Skip very short terms (likely noise) and common stop words.
    if (trimmed.length < 3) return;
    if (seen.has(trimmed.toLowerCase())) return;
    seen.add(trimmed.toLowerCase());
    terms.push(trimmed);
  };

  // Backtick-wrapped identifiers
  const backtickMatches = decisionText.matchAll(/`([^`]+)`/g);
  for (const m of backtickMatches) {
    add(m[1]);
  }

  // Quoted strings (single and double)
  const quoteMatches = decisionText.matchAll(/["']([^"']+)["']/g);
  for (const m of quoteMatches) {
    add(m[1]);
  }

  // PascalCase and camelCase identifiers (at least two segments)
  const identMatches = decisionText.matchAll(/\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g);
  for (const m of identMatches) {
    add(m[1]);
  }
  const camelMatches = decisionText.matchAll(/\b([a-z]+(?:[A-Z][a-z]+)+)\b/g);
  for (const m of camelMatches) {
    add(m[1]);
  }

  return terms;
}

function isDecisionsFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith('decisions.md') || lower.includes('/decisions.md');
}

const surfaceHeresy: Check = {
  name: 'surface-heresy',
  layer: 1,

  async run(context: ProjectContext): Promise<CheckResult> {
    const { decisions, sourceFiles, rawFiles } = context;
    const findings: Finding[] = [];

    // Find Hard Kill decisions
    const hardKills = decisions.filter((d) => d.tags.includes('HARD KILL'));
    if (hardKills.length === 0) {
      return {
        name: 'surface-heresy',
        layer: 1,
        status: 'completed',
        severity: 'clean',
        findings: [],
        errorMessage: null,
      };
    }

    for (const kill of hardKills) {
      const terms = extractTerms(`${kill.decision} ${kill.rationale}`);
      if (terms.length === 0) continue;

      // Search source files
      for (const [filePath, analyzed] of sourceFiles) {
        if (isDecisionsFile(filePath)) continue;
        // Build content from identifiers for fast search
        const content = analyzed.identifiers.join(' ');
        for (const term of terms) {
          if (content.includes(term)) {
            findings.push({
              file: filePath,
              location: 'source file',
              description: `Killed terminology "${term}" from Decision ${kill.number} found in source code.`,
              suggestion: `Remove or rename references to "${term}" -- it was marked [HARD KILL] in Decision ${kill.number}.`,
              evidence: { term, decisionNumber: kill.number, decisionText: kill.decision },
            });
          }
        }
      }

      // Search raw files (documentation)
      for (const [filePath, content] of rawFiles) {
        if (isDecisionsFile(filePath)) continue;
        for (const term of terms) {
          // Case-insensitive for documentation
          if (content.toLowerCase().includes(term.toLowerCase())) {
            findings.push({
              file: filePath,
              location: 'document',
              description: `Killed terminology "${term}" from Decision ${kill.number} found in documentation.`,
              suggestion: `Update documentation to remove references to "${term}" -- it was marked [HARD KILL] in Decision ${kill.number}.`,
              evidence: { term, decisionNumber: kill.number, decisionText: kill.decision },
            });
          }
        }
      }
    }

    // Determine severity
    const hasCritical = findings.some((f) => f.location === 'source file');
    const severity = findings.length === 0 ? 'clean' : hasCritical ? 'critical' : 'warning';

    return {
      name: 'surface-heresy',
      layer: 1,
      status: 'completed',
      severity,
      findings,
      errorMessage: null,
    };
  },
};

registerCheck(surfaceHeresy);

export { surfaceHeresy };
