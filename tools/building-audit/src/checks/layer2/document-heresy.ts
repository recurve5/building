import type { Check, CheckResult, Finding, ProjectContext, LLMClient } from '../types.js';
import { registerCheck } from '../registry.js';
import { extractTerms, isDecisionsFile } from '../heresy-shared.js';

// ---------------------------------------------------------------------------
// Document Heresy Check (Layer 2)
// ---------------------------------------------------------------------------
// Uses LLM to detect documentation that still describes killed approaches
// as active. Two phases:
//   1. Code phase: extract HARD KILL decisions, find doc files with 3+ term
//      matches (excluding DECISIONS.md).
//   2. LLM phase: ask whether the matched section describes the killed
//      approach as if it were still active.

function isMarkdownFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.md');
}

/**
 * Count how many distinct terms appear in the content (case-insensitive).
 */
function countTermMatches(content: string, terms: string[]): number {
  const lowerContent = content.toLowerCase();
  let count = 0;
  for (const term of terms) {
    if (lowerContent.includes(term.toLowerCase())) {
      count++;
    }
  }
  return count;
}

/**
 * Parse LLM response to determine severity.
 * Returns 'warning' | 'info' | null (no finding).
 */
function parseLLMVerdict(response: string): 'warning' | 'info' | null {
  const lower = response.toLowerCase();

  // Warning indicators
  if (
    lower.includes('describes as active') ||
    lower.includes('still references') ||
    lower.includes('outdated')
  ) {
    return 'warning';
  }

  // Info indicators
  if (lower.includes('ambiguous') || lower.includes('unclear')) {
    return 'info';
  }

  // No finding indicators
  if (lower.includes('not related') || lower.includes('different')) {
    return null;
  }

  // Default: if none of the known patterns matched, treat as info
  // to avoid silent misses.
  return 'info';
}

interface CandidateMatch {
  filePath: string;
  content: string;
  matchCount: number;
}

const TERM_MATCH_THRESHOLD = 3;

const documentHeresy: Check = {
  name: 'document-heresy',
  layer: 2,

  async run(context: ProjectContext, llmClient?: LLMClient): Promise<CheckResult> {
    const { decisions, rawFiles } = context;
    const findings: Finding[] = [];
    let totalInput = 0;
    let totalOutput = 0;

    // Phase 1: Find HARD KILL decisions
    const hardKills = decisions.filter((d) => d.tags.includes('HARD KILL'));
    if (hardKills.length === 0) {
      return {
        name: 'document-heresy',
        layer: 2,
        status: 'completed',
        severity: 'clean',
        findings: [],
        errorMessage: null,
      };
    }

    // For each kill, find candidate doc sections
    const candidates: Array<{ kill: typeof hardKills[0]; match: CandidateMatch }> = [];

    for (const kill of hardKills) {
      const terms = extractTerms(`${kill.decision} ${kill.rationale}`);
      if (terms.length === 0) continue;

      for (const [filePath, content] of rawFiles) {
        if (isDecisionsFile(filePath)) continue;
        if (!isMarkdownFile(filePath)) continue;

        const matchCount = countTermMatches(content, terms);
        if (matchCount >= TERM_MATCH_THRESHOLD) {
          candidates.push({ kill, match: { filePath, content, matchCount } });
        }
      }
    }

    // No candidates found -> clean, no LLM call
    if (candidates.length === 0) {
      return {
        name: 'document-heresy',
        layer: 2,
        status: 'completed',
        severity: 'clean',
        findings: [],
        errorMessage: null,
      };
    }

    // Phase 2: LLM verification
    if (!llmClient) {
      return {
        name: 'document-heresy',
        layer: 2,
        status: 'skipped',
        severity: 'clean',
        findings: [],
        errorMessage: null,
      };
    }

    for (const { kill, match } of candidates) {
      // Truncate content to a reasonable section size for the LLM
      const section = match.content.length > 2000
        ? match.content.slice(0, 2000) + '\n[...truncated]'
        : match.content;

      const prompt = [
        'This decision was killed:',
        `Decision ${kill.number}: ${kill.decision}`,
        `Rationale: ${kill.rationale}`,
        '',
        'Does the following document section describe the killed approach as if it were active?',
        '',
        `File: ${match.filePath}`,
        '---',
        section,
        '---',
        '',
        'Answer with one of: "describes as active", "still references", "outdated", "ambiguous", "unclear", "not related", or "different". Then briefly explain why.',
      ].join('\n');

      const response = await llmClient.query(prompt);
      totalInput += response.usage.input;
      totalOutput += response.usage.output;

      const verdict = parseLLMVerdict(response.content);
      if (verdict) {
        findings.push({
          file: match.filePath,
          location: 'document',
          description:
            verdict === 'warning'
              ? `Document still describes killed approach (Decision ${kill.number}: ${kill.decision}) as active.`
              : `Document may reference killed approach (Decision ${kill.number}: ${kill.decision}) — LLM assessment was ambiguous.`,
          suggestion: `Review and update ${match.filePath} to remove or clarify references to the killed approach from Decision ${kill.number}.`,
          evidence: {
            decisionNumber: kill.number,
            decisionText: kill.decision,
            termMatches: match.matchCount,
            llmVerdict: response.content,
          },
        });
      }
    }

    // Determine overall severity
    const hasWarning = findings.some(
      (f) => f.description.includes('still describes killed approach'),
    );
    const severity =
      findings.length === 0 ? 'clean' : hasWarning ? 'warning' : 'info';

    return {
      name: 'document-heresy',
      layer: 2,
      status: 'completed',
      severity,
      findings,
      errorMessage: null,
      tokenUsage: { input: totalInput, output: totalOutput },
    };
  },
};

registerCheck(documentHeresy);

export { documentHeresy, extractTerms, countTermMatches, parseLLMVerdict };
