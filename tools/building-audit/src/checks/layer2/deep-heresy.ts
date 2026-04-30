import type { Check, CheckResult, Finding, ProjectContext, LLMClient } from '../types.js';
import { registerCheck } from '../registry.js';

// ---------------------------------------------------------------------------
// Deep Heresy Check (Layer 2)
// ---------------------------------------------------------------------------
// Uses LLM to detect code that reimplements HARD KILL decision behavior
// under a different name. Phase 1 narrows candidates via keyword clustering,
// Phase 2 asks the LLM to confirm.

const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'been',
  'was', 'were', 'will', 'would', 'could', 'should', 'into', 'about',
  'than', 'them', 'then', 'they', 'their', 'there', 'what', 'when',
  'where', 'which', 'while', 'does', 'done', 'each', 'just', 'more',
  'most', 'much', 'must', 'also', 'back', 'only', 'over', 'such',
  'take', 'very', 'some', 'after', 'before', 'other', 'being', 'because',
  'between', 'both', 'came', 'come', 'make', 'like', 'long', 'look',
  'many', 'next', 'right', 'show', 'small', 'still', 'every', 'found',
  'here', 'know', 'large', 'often', 'part', 'place', 'same', 'since',
  'think', 'under', 'used', 'work', 'hard', 'kill', 'approach',
  'decision', 'removed', 'remove', 'entirely', 'class',
]);

const KEYWORD_CLUSTER_THRESHOLD = 3;

/**
 * Extract keywords from text: split on whitespace, strip punctuation,
 * filter stopwords, keep words longer than 3 characters.
 */
function extractKeywords(text: string): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  const words = text.split(/\s+/);
  for (const raw of words) {
    const word = raw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (word.length <= 3) continue;
    if (STOPWORDS.has(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    keywords.push(word);
  }

  return keywords;
}

/**
 * Count how many keywords appear in a body of text (case-insensitive).
 */
function countKeywordMatches(keywords: string[], text: string): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) {
      count++;
    }
  }
  return count;
}

/**
 * Parse LLM response to determine severity.
 * Returns 'critical', 'warning', or null (no finding).
 */
function parseLLMResponse(content: string): 'critical' | 'warning' | null {
  const lower = content.toLowerCase();

  const criticalTerms = ['implements', 'active', 'violates', 'same behavior'];
  const warningTerms = ['uncertain', 'unclear', 'might', 'possibly'];
  const cleanTerms = ['different', 'unrelated'];

  let hasCritical = false;
  let hasWarning = false;
  let hasClean = false;

  for (const term of criticalTerms) {
    if (lower.includes(term)) hasCritical = true;
  }

  for (const term of warningTerms) {
    if (lower.includes(term)) hasWarning = true;
  }

  for (const term of cleanTerms) {
    if (lower.includes(term)) hasClean = true;
  }

  // Warning signals override critical — uncertainty takes precedence
  if (hasWarning) return 'warning';
  if (hasCritical) return 'critical';
  if (hasClean) return null;

  // Default: no finding
  return null;
}

const deepHeresy: Check = {
  name: 'deep-heresy',
  layer: 2,

  async run(context: ProjectContext, llmClient?: LLMClient): Promise<CheckResult> {
    const { decisions, sourceFiles, rawFiles } = context;
    const findings: Finding[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Find Hard Kill decisions
    const hardKills = decisions.filter((d) => d.tags.includes('HARD KILL'));

    // Decision 7: No HARD KILL entries → don't call LLM, return clean.
    if (hardKills.length === 0) {
      return {
        name: 'deep-heresy',
        layer: 2,
        status: 'completed',
        severity: 'clean',
        findings: [],
        errorMessage: null,
        tokenUsage: { input: 0, output: 0 },
      };
    }

    if (!llmClient) {
      return {
        name: 'deep-heresy',
        layer: 2,
        status: 'skipped',
        severity: 'clean',
        findings: [],
        errorMessage: 'No LLM client provided',
        tokenUsage: { input: 0, output: 0 },
      };
    }

    for (const kill of hardKills) {
      const keywords = extractKeywords(`${kill.decision} ${kill.rationale}`);
      if (keywords.length === 0) continue;

      // Phase 1: Find candidate files via keyword clustering
      const candidates: { filePath: string; content: string }[] = [];

      // Check sourceFiles identifiers
      for (const [filePath, analyzed] of sourceFiles) {
        const identifierText = analyzed.identifiers.join(' ');
        const matchCount = countKeywordMatches(keywords, identifierText);
        if (matchCount >= KEYWORD_CLUSTER_THRESHOLD) {
          // Get raw content if available, otherwise use identifiers
          const content = rawFiles.get(filePath) ?? identifierText;
          candidates.push({ filePath, content });
        }
      }

      // Check rawFiles content for files not already in sourceFiles
      for (const [filePath, content] of rawFiles) {
        if (sourceFiles.has(filePath)) continue;
        const matchCount = countKeywordMatches(keywords, content);
        if (matchCount >= KEYWORD_CLUSTER_THRESHOLD) {
          candidates.push({ filePath, content });
        }
      }

      // Phase 2: Ask LLM about each candidate
      for (const candidate of candidates) {
        const prompt =
          `This decision killed [${kill.decision}]: ${kill.rationale}\n\n` +
          `Does the following code implement this behavior under a different name?\n\n` +
          `File: ${candidate.filePath}\n` +
          `\`\`\`\n${candidate.content}\n\`\`\``;

        const response = await llmClient.query(prompt);
        totalInputTokens += response.usage.input;
        totalOutputTokens += response.usage.output;

        const severity = parseLLMResponse(response.content);
        if (severity) {
          findings.push({
            file: candidate.filePath,
            location: 'file',
            description:
              severity === 'critical'
                ? `Code appears to reimplement killed behavior from Decision ${kill.number}: "${kill.decision}"`
                : `Code may reimplement killed behavior from Decision ${kill.number}: "${kill.decision}" (uncertain)`,
            suggestion: `Review this file for reimplementation of killed approach. LLM assessment: ${response.content}`,
            evidence: {
              decisionNumber: kill.number,
              decisionText: kill.decision,
              llmResponse: response.content,
              severity,
            },
          });
        }
      }
    }

    // Determine overall severity
    const hasCritical = findings.some(
      (f) => (f.evidence as Record<string, unknown>)?.severity === 'critical',
    );
    const hasWarning = findings.some(
      (f) => (f.evidence as Record<string, unknown>)?.severity === 'warning',
    );
    const severity = hasCritical ? 'critical' : hasWarning ? 'warning' : 'clean';

    return {
      name: 'deep-heresy',
      layer: 2,
      status: 'completed',
      severity,
      findings,
      errorMessage: null,
      tokenUsage: { input: totalInputTokens, output: totalOutputTokens },
    };
  },
};

registerCheck(deepHeresy);

export { deepHeresy, extractKeywords, countKeywordMatches, parseLLMResponse };
