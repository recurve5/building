import type { Check, CheckResult, Finding, ProjectContext, LLMClient, CandidateDump } from '../types.js';
import { registerCheck } from '../registry.js';

// ---------------------------------------------------------------------------
// Performance Critical Path Check (Layer 2)
// ---------------------------------------------------------------------------
// Identifies entry-point functions with deep call chains that include I/O
// operations, then asks the LLM whether users would perceive latency.

const ENTRY_POINT_PATTERNS = [
  /^handle/i,
  /^route/i,
  /Handler$/,
  /Controller$/,
  /^main$/,
];

const IO_INDICATORS = [
  'read', 'write', 'fetch', 'query', 'request',
  'connect', 'open', 'send', 'exec',
];

const MIN_CHAIN_DEPTH = 3;
const MAX_INPUT_TOKENS = 16384;

interface CallChain {
  entryPoint: string;
  filePath: string;
  chain: string[];
  ioOperations: string[];
  depth: number;
}

function isEntryPoint(
  funcName: string,
  isAsync: boolean,
  isExported: boolean,
): boolean {
  if (ENTRY_POINT_PATTERNS.some((p) => p.test(funcName))) return true;
  if (isAsync && isExported) return true;
  return false;
}

function hasIOIndicator(name: string): boolean {
  const lower = name.toLowerCase();
  return IO_INDICATORS.some((io) => lower.includes(io));
}

/**
 * Build a map of function name -> FunctionInfo across all source files,
 * and track which functions are exported.
 */
function buildFunctionIndex(context: ProjectContext): {
  exportedNames: Set<string>;
  allFunctionNames: Set<string>;
} {
  const exportedNames = new Set<string>();
  const allFunctionNames = new Set<string>();

  for (const [, file] of context.sourceFiles) {
    const exportNames = new Set(file.exports.map((e) => e.name));
    for (const func of file.functions) {
      allFunctionNames.add(func.name);
      if (exportNames.has(func.name)) {
        exportedNames.add(func.name);
      }
    }
  }

  return { exportedNames, allFunctionNames };
}

/**
 * Extract function calls from raw file content for a given function's line range.
 */
function extractCallsFromBody(
  rawContent: string,
  startLine: number,
  endLine: number,
  knownFunctions: Set<string>,
): string[] {
  const lines = rawContent.split('\n').slice(startLine - 1, endLine);
  const body = lines.join('\n');
  const calls: string[] = [];

  // Match function call patterns: identifier followed by (
  const callPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = callPattern.exec(body)) !== null) {
    const name = match[1];
    // Only include calls to known project functions
    if (knownFunctions.has(name)) {
      if (!calls.includes(name)) {
        calls.push(name);
      }
    }
  }

  return calls;
}

/**
 * Trace the deepest call chain from an entry point using DFS.
 * Returns the longest chain of function names reachable.
 */
function traceCallChain(
  entryFunc: string,
  rawFiles: Map<string, string>,
  context: ProjectContext,
  knownFunctions: Set<string>,
  maxDepth: number = 8,
): string[] {
  // Build a lookup: function name -> { filePath, startLine, endLine }
  const funcLocations = new Map<string, { filePath: string; startLine: number; endLine: number }>();
  for (const [filePath, file] of context.sourceFiles) {
    for (const func of file.functions) {
      funcLocations.set(func.name, { filePath, startLine: func.startLine, endLine: func.endLine });
    }
  }

  // DFS to find the deepest chain
  let longest: string[] = [entryFunc];

  function dfs(current: string, path: string[], visited: Set<string>, depth: number): void {
    if (depth >= maxDepth) return;
    if (path.length > longest.length) {
      longest = [...path];
    }

    const loc = funcLocations.get(current);
    if (!loc) return;

    const rawContent = rawFiles.get(loc.filePath);
    if (!rawContent) return;

    const calls = extractCallsFromBody(rawContent, loc.startLine, loc.endLine, knownFunctions);
    for (const call of calls) {
      if (!visited.has(call)) {
        visited.add(call);
        path.push(call);
        dfs(call, path, visited, depth + 1);
        path.pop();
        visited.delete(call);
      }
    }

    // Check after exploring all children
    if (path.length > longest.length) {
      longest = [...path];
    }
  }

  const visited = new Set<string>([entryFunc]);
  dfs(entryFunc, [entryFunc], visited, 0);

  return longest;
}

function findCandidates(context: ProjectContext): CallChain[] {
  const { exportedNames, allFunctionNames } = buildFunctionIndex(context);
  const candidates: CallChain[] = [];

  for (const [filePath, file] of context.sourceFiles) {
    for (const func of file.functions) {
      const isExported = exportedNames.has(func.name);
      if (!isEntryPoint(func.name, func.isAsync, isExported)) continue;

      const chain = traceCallChain(
        func.name,
        context.rawFiles,
        context,
        allFunctionNames,
      );

      if (chain.length <= MIN_CHAIN_DEPTH) continue;

      // Check for I/O indicators: function names with I/O patterns or async functions in the chain
      const ioOps: string[] = [];
      for (const name of chain) {
        if (hasIOIndicator(name)) {
          ioOps.push(name);
        }
      }

      // Also check for async functions in the chain (beyond the entry point)
      for (const name of chain.slice(1)) {
        // Look up if this function is async
        for (const [, f] of context.sourceFiles) {
          const funcInfo = f.functions.find((fn) => fn.name === name);
          if (funcInfo?.isAsync && !ioOps.includes(name)) {
            ioOps.push(`${name} (async)`);
          }
        }
      }

      if (ioOps.length === 0) continue;

      candidates.push({
        entryPoint: func.name,
        filePath,
        chain,
        ioOperations: ioOps,
        depth: chain.length,
      });
    }
  }

  return candidates;
}

function buildPrompt(candidate: CallChain): string {
  const chainStr = candidate.chain
    .map((name) => {
      const isIO = candidate.ioOperations.some((io) => io.startsWith(name));
      return isIO ? `${name} [I/O]` : name;
    })
    .join(' -> ');

  return [
    `This call chain handles the entry point "${candidate.entryPoint}".`,
    `The chain is ${candidate.depth} calls deep and includes these I/O operations: ${candidate.ioOperations.join(', ')}.`,
    '',
    `Call chain: ${chainStr}`,
    `File: ${candidate.filePath}`,
    '',
    'Would a user perceive latency from this chain? Answer "perceptible" or "acceptable".',
  ].join('\n');
}

type Verdict = 'perceptible' | 'acceptable';

function parseVerdict(response: string): Verdict {
  const lower = response.toLowerCase();
  if (/\b(perceptible|noticeable|slow|latency)\b/.test(lower)) return 'perceptible';
  if (/\b(acceptable|fast|fine|no issue)\b/.test(lower)) return 'acceptable';
  // Default to acceptable if unclear
  return 'acceptable';
}

export const performanceCriticalCheck: Check = {
  name: 'performance-critical',
  layer: 2,

  dumpCandidates(context: ProjectContext): CandidateDump {
    const candidates = findCandidates(context);
    return { check: 'performance-critical', count: candidates.length, candidates };
  },

  async run(context: ProjectContext, llmClient?: LLMClient): Promise<CheckResult> {
    if (!llmClient) {
      return {
        name: 'performance-critical',
        layer: 2,
        status: 'skipped',
        severity: 'clean',
        findings: [],
        errorMessage: 'No LLM client provided',
      };
    }

    const candidates = findCandidates(context);

    // Decision 7: zero candidates -> clean, no LLM call.
    if (candidates.length === 0) {
      return {
        name: 'performance-critical',
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
      const response = await llmClient.query(prompt, MAX_INPUT_TOKENS);
      totalInput += response.usage.input;
      totalOutput += response.usage.output;

      const verdict = parseVerdict(response.content);

      if (verdict === 'perceptible') {
        findings.push({
          file: candidate.filePath,
          location: `function ${candidate.entryPoint}`,
          description: `Call chain from "${candidate.entryPoint}" is ${candidate.depth} calls deep with I/O operations (${candidate.ioOperations.join(', ')}). LLM assessed latency as perceptible.`,
          suggestion: 'Consider caching, parallelizing I/O calls, or reducing chain depth to improve response time',
          evidence: {
            chain: candidate.chain,
            ioOperations: candidate.ioOperations,
            depth: candidate.depth,
            llmVerdict: verdict,
          },
        });
      }
    }

    const severity = findings.length > 0 ? 'warning' : 'clean';

    return {
      name: 'performance-critical',
      layer: 2,
      status: 'completed',
      severity,
      findings,
      errorMessage: null,
      tokenUsage: { input: totalInput, output: totalOutput },
    };
  },
};

registerCheck(performanceCriticalCheck);
