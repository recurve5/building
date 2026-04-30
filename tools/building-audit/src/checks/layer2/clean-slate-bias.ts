import type { Check, CheckResult, Finding, ProjectContext, LLMClient, CandidateDump } from '../types.js';
import { registerCheck } from '../registry.js';

// ---------------------------------------------------------------------------
// Clean Slate Bias Check (Layer 2)
// ---------------------------------------------------------------------------
// Detects duplicate implementations across files by finding functions/classes
// with the same name in different files, then uses the LLM to confirm whether
// one could be eliminated by extending the other.

const COMMON_NAMES = new Set([
  'constructor',
  'toString',
  'render',
  'index',
  'default',
  'main',
  'init',
  'setup',
  'teardown',
]);

interface CandidatePair {
  name: string;
  fileA: string;
  fileB: string;
  signatureA: string;
  signatureB: string;
}

function formatSignature(
  name: string,
  params: { name: string; type: string | null }[],
  returnType: string | null,
): string {
  const paramStr = params.map((p) => (p.type ? `${p.name}: ${p.type}` : p.name)).join(', ');
  const ret = returnType ? `: ${returnType}` : '';
  return `${name}(${paramStr})${ret}`;
}

function findCandidatePairs(context: ProjectContext): CandidatePair[] {
  // Map: function/class name -> list of { file, signature }
  const nameMap = new Map<string, { file: string; signature: string }[]>();

  for (const [filePath, analyzed] of context.sourceFiles) {
    for (const fn of analyzed.functions) {
      if (COMMON_NAMES.has(fn.name)) continue;
      const sig = formatSignature(fn.name, fn.params, fn.returnType);
      const entries = nameMap.get(fn.name) ?? [];
      entries.push({ file: filePath, signature: sig });
      nameMap.set(fn.name, entries);
    }

    for (const cls of analyzed.classes) {
      if (COMMON_NAMES.has(cls.name)) continue;
      const sig = `class ${cls.name}`;
      const entries = nameMap.get(cls.name) ?? [];
      entries.push({ file: filePath, signature: sig });
      nameMap.set(cls.name, entries);
    }
  }

  const pairs: CandidatePair[] = [];
  for (const [name, entries] of nameMap) {
    if (entries.length < 2) continue;
    // Generate pairs across different files only
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[i].file !== entries[j].file) {
          pairs.push({
            name,
            fileA: entries[i].file,
            fileB: entries[j].file,
            signatureA: entries[i].signature,
            signatureB: entries[j].signature,
          });
        }
      }
    }
  }

  return pairs;
}

function buildPrompt(pair: CandidatePair): string {
  return [
    `Two implementations share the name "${pair.name}" in different files.`,
    '',
    `File A: ${pair.fileA}`,
    `Signature: ${pair.signatureA}`,
    '',
    `File B: ${pair.fileB}`,
    `Signature: ${pair.signatureB}`,
    '',
    'Do these two implementations serve the same purpose? Could one be eliminated by extending the other?',
    'Answer concisely.',
  ].join('\n');
}

function classifyResponse(content: string): 'warning' | 'info' {
  const lower = content.toLowerCase();
  if (lower.includes('duplicate') || lower.includes('same purpose') || lower.includes('eliminate')) {
    return 'warning';
  }
  if (lower.includes('distinct') || lower.includes('different') || lower.includes('separate')) {
    return 'info';
  }
  // Default to info if unclear
  return 'info';
}

const cleanSlateBias: Check = {
  name: 'clean-slate-bias',
  layer: 2,

  dumpCandidates(context: ProjectContext): CandidateDump {
    const candidates = findCandidatePairs(context);
    return { check: 'clean-slate-bias', count: candidates.length, candidates };
  },

  async run(context: ProjectContext, llmClient?: LLMClient): Promise<CheckResult> {
    const candidates = findCandidatePairs(context);

    // Decision 7: Zero candidates -> don't call LLM, return clean.
    if (candidates.length === 0) {
      return {
        name: 'clean-slate-bias',
        layer: 2,
        status: 'completed',
        severity: 'clean',
        findings: [],
        errorMessage: null,
      };
    }

    // Mechanical mode (no LLM client): emit each name collision as an
    // info-severity finding without LLM confirmation. The agent or human
    // reviews the pair and decides; no tokens spent. This is the per-task
    // gate — see prompts/task-agent.md "Clean Slate Bias".
    if (!llmClient) {
      const findings: Finding[] = candidates.map((pair) => ({
        file: pair.fileA,
        location: `${pair.name} also in ${pair.fileB}`,
        description: `Name collision: "${pair.name}" defined in ${pair.fileA} and ${pair.fileB}. Mechanical phase only — review whether one should import the other.`,
        suggestion: `Read both definitions. If they serve the same purpose, eliminate one by extending or importing. If they are intentionally distinct, leave a comment explaining why.`,
        evidence: {
          name: pair.name,
          fileA: pair.fileA,
          fileB: pair.fileB,
          signatureA: pair.signatureA,
          signatureB: pair.signatureB,
          llmVerdict: 'mechanical-only',
        },
      }));

      return {
        name: 'clean-slate-bias',
        layer: 2,
        status: 'completed',
        severity: findings.length > 0 ? 'info' : 'clean',
        findings,
        errorMessage: null,
      };
    }

    const findings: Finding[] = [];
    let totalInput = 0;
    let totalOutput = 0;
    let maxSeverity: 'warning' | 'info' | 'clean' = 'clean';

    for (const pair of candidates) {
      const prompt = buildPrompt(pair);
      const response = await llmClient.query(prompt);

      totalInput += response.usage.input;
      totalOutput += response.usage.output;

      const severity = classifyResponse(response.content);

      if (severity === 'warning') maxSeverity = 'warning';
      else if (severity === 'info' && maxSeverity === 'clean') maxSeverity = 'info';

      findings.push({
        file: pair.fileA,
        location: `${pair.name} also in ${pair.fileB}`,
        description:
          severity === 'warning'
            ? `Duplicate implementation: "${pair.name}" in ${pair.fileA} and ${pair.fileB}. LLM confirms these serve the same purpose.`
            : `Related implementation: "${pair.name}" exists in ${pair.fileA} and ${pair.fileB}, but they serve distinct purposes.`,
        suggestion:
          severity === 'warning'
            ? `Consider eliminating one implementation by extending the other.`
            : `No action needed — implementations are related but distinct.`,
        evidence: {
          name: pair.name,
          fileA: pair.fileA,
          fileB: pair.fileB,
          signatureA: pair.signatureA,
          signatureB: pair.signatureB,
          llmVerdict: severity,
        },
      });
    }

    return {
      name: 'clean-slate-bias',
      layer: 2,
      status: 'completed',
      severity: maxSeverity,
      findings,
      errorMessage: null,
      tokenUsage: { input: totalInput, output: totalOutput },
    };
  },
};

registerCheck(cleanSlateBias);

export { cleanSlateBias };
