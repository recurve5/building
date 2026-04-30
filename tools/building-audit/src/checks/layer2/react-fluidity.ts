import type { Check, CheckResult, Finding, ProjectContext, LLMClient } from '../types.js';
import { registerCheck } from '../registry.js';

// ---------------------------------------------------------------------------
// React Fluidity Check (Layer 2)
// ---------------------------------------------------------------------------
// Identifies React-specific performance issues that could cause user-visible
// jank: setState in loops, large array maps to JSX, and unthrottled
// scroll/resize handlers. Candidates are validated by LLM for perceptibility.

interface Candidate {
  file: string;
  line: number;
  pattern: 'setState-in-loop' | 'large-array-map' | 'unthrottled-event';
  snippet: string;
  componentContext: string;
}

// ---------------------------------------------------------------------------
// React detection
// ---------------------------------------------------------------------------

function isReactProject(context: ProjectContext): boolean {
  for (const [filePath] of context.sourceFiles) {
    if (/\.tsx$/.test(filePath) || /\.jsx$/.test(filePath)) return true;
  }
  for (const [, analyzed] of context.sourceFiles) {
    for (const imp of analyzed.imports) {
      if (imp.source === 'react') return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Candidate detection
// ---------------------------------------------------------------------------

const SET_STATE_IN_LOOP =
  /(?:\.forEach\s*\(|\.map\s*\(|for\s*\(|for\s+of|for\s+in|while\s*\()[\s\S]{0,300}setState\s*\(/;

const LARGE_ARRAY_MAP = /\.map\s*\(/;

const UNTHROTTLED_EVENT =
  /addEventListener\s*\(\s*['"](?:scroll|resize)['"]/;

function hasReactImports(content: string): boolean {
  return /(?:from\s+['"]react['"]|require\s*\(\s*['"]react['"]\s*\))/.test(content);
}

function extractSnippet(content: string, matchIndex: number): { snippet: string; line: number } {
  const before = content.slice(0, matchIndex);
  const line = (before.match(/\n/g) || []).length + 1;

  const lineStart = Math.max(0, matchIndex - 200);
  const lineEnd = Math.min(content.length, matchIndex + 200);
  const snippet = content.slice(lineStart, lineEnd);

  return { snippet, line };
}

function findCandidates(context: ProjectContext): Candidate[] {
  const candidates: Candidate[] = [];

  for (const [filePath, content] of context.rawFiles) {
    const isReactFile =
      /\.tsx$/.test(filePath) ||
      /\.jsx$/.test(filePath) ||
      hasReactImports(content);

    if (!isReactFile) continue;

    // setState in loops
    const setStateMatch = SET_STATE_IN_LOOP.exec(content);
    if (setStateMatch) {
      const { snippet, line } = extractSnippet(content, setStateMatch.index);
      candidates.push({
        file: filePath,
        line,
        pattern: 'setState-in-loop',
        snippet,
        componentContext: filePath,
      });
    }

    // Large array .map() returning JSX (heuristic: .map( in file with JSX)
    if (LARGE_ARRAY_MAP.test(content) && /<\w/.test(content)) {
      const mapMatch = LARGE_ARRAY_MAP.exec(content);
      if (mapMatch) {
        const { snippet, line } = extractSnippet(content, mapMatch.index);
        candidates.push({
          file: filePath,
          line,
          pattern: 'large-array-map',
          snippet,
          componentContext: filePath,
        });
      }
    }

    // Unthrottled scroll/resize
    const eventMatch = UNTHROTTLED_EVENT.exec(content);
    if (eventMatch) {
      // Check if debounce/throttle is NOT nearby
      const surroundingStart = Math.max(0, eventMatch.index - 500);
      const surroundingEnd = Math.min(content.length, eventMatch.index + 500);
      const surrounding = content.slice(surroundingStart, surroundingEnd);
      if (!/debounce|throttle/i.test(surrounding)) {
        const { snippet, line } = extractSnippet(content, eventMatch.index);
        candidates.push({
          file: filePath,
          line,
          pattern: 'unthrottled-event',
          snippet,
          componentContext: filePath,
        });
      }
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// LLM interaction
// ---------------------------------------------------------------------------

function buildPrompt(candidate: Candidate): string {
  return [
    'Would a user feel this performance issue during normal use?',
    '',
    `Pattern detected: ${candidate.pattern}`,
    `File: ${candidate.file}`,
    `Line: ${candidate.line}`,
    '',
    'Code context:',
    '```',
    candidate.snippet,
    '```',
    '',
    'Component: ' + candidate.componentContext,
    '',
    'Answer briefly whether this would be perceptible to a user during normal interaction.',
  ].join('\n');
}

function isPerceptible(response: string): boolean {
  const lower = response.toLowerCase();
  return /\b(perceptible|noticeable|jank|slow)\b/.test(lower);
}

function isAcceptable(response: string): boolean {
  const lower = response.toLowerCase();
  return /\b(fine|acceptable|no issue)\b/.test(lower);
}

// ---------------------------------------------------------------------------
// Check implementation
// ---------------------------------------------------------------------------

export const reactFluidityCheck: Check = {
  name: 'react-fluidity',
  layer: 2,

  async run(context: ProjectContext, llmClient?: LLMClient): Promise<CheckResult> {
    // React detection gate
    if (!isReactProject(context)) {
      return {
        name: 'react-fluidity',
        layer: 2,
        status: 'skipped',
        severity: 'clean',
        findings: [],
        errorMessage: 'No React patterns detected in project',
      };
    }

    if (!llmClient) {
      return {
        name: 'react-fluidity',
        layer: 2,
        status: 'skipped',
        severity: 'clean',
        findings: [],
        errorMessage: 'No LLM client provided',
      };
    }

    const candidates = findCandidates(context);

    // Decision 7: no candidates but React present → clean, no LLM call.
    if (candidates.length === 0) {
      return {
        name: 'react-fluidity',
        layer: 2,
        status: 'completed',
        severity: 'clean',
        findings: [],
        errorMessage: null,
      };
    }

    const findings: Finding[] = [];
    let totalInput = 0;
    let totalOutput = 0;

    for (const candidate of candidates) {
      const prompt = buildPrompt(candidate);
      const response = await llmClient.query(prompt);
      totalInput += response.usage.input;
      totalOutput += response.usage.output;

      if (isPerceptible(response.content) && !isAcceptable(response.content)) {
        findings.push({
          file: candidate.file,
          location: `line ${candidate.line}`,
          description: `${candidate.pattern}: potential user-perceptible performance issue`,
          suggestion: 'Consider optimizing this pattern to avoid UI jank',
          evidence: {
            pattern: candidate.pattern,
            llmVerdict: 'perceptible',
            snippet: candidate.snippet.slice(0, 200),
          },
        });
      }
    }

    const severity = findings.length > 0 ? 'warning' : 'clean';

    return {
      name: 'react-fluidity',
      layer: 2,
      status: 'completed',
      severity,
      findings,
      errorMessage: null,
      tokenUsage: { input: totalInput, output: totalOutput },
    };
  },
};

registerCheck(reactFluidityCheck);
