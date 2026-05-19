// Judgment prompt templates for Layer 2 checks.
// XRD Section 3, DAY-ZERO 2.15, Decision 13, Decision 17.
//
// Each template accepts a CandidateDump (from the corresponding check's
// dumpCandidates) and returns a well-formed prompt string for the
// orchestrator's LLM to judge the candidates.
//
// The coupling between these templates and the check's candidate shapes is
// intentional (Decision 13) and tested via integration tests (Decision 17).

import type { CandidateDump } from '../types/index.js';

// ---------------------------------------------------------------------------
// Candidate shape interfaces (mirror what each check's dumpCandidates returns)
// ---------------------------------------------------------------------------

interface GhostRefactorCandidate {
  commit: { hash: string; message: string; insertions: number; deletions: number };
  task: { taskNumber: number; shortName: string; whatToBuild: string | null };
}

interface CleanSlateBiasCandidate {
  name: string;
  fileA: string;
  fileB: string;
  signatureA: string;
  signatureB: string;
}

interface DeepHeresyCandidate {
  decisionNumber: number;
  decisionText: string;
  rationale: string;
  filePath: string;
  content: string;
  matchedKeywordCount: number;
}

interface DocumentHeresyCandidate {
  decisionNumber: number;
  decisionText: string;
  rationale: string;
  filePath: string;
  content: string;
  matchedTermCount: number;
}

interface PerformanceCriticalCandidate {
  entryPoint: string;
  filePath: string;
  chain: string[];
  ioOperations: string[];
  depth: number;
}

interface ReactFluidityCandidate {
  file: string;
  line: number;
  pattern: 'setState-in-loop' | 'large-array-map' | 'unthrottled-event';
  snippet: string;
  componentContext: string;
}

interface RefactoringMetrics {
  couplingHotspots: { file: string; taskCount: number }[];
  averageFunctionLength: number;
  totalFunctions: number;
  structuralConcerns: { taskNumber: number; text: string }[];
}

// ---------------------------------------------------------------------------
// Helper: truncate content for prompt inclusion
// ---------------------------------------------------------------------------

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\n[...truncated]';
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function ghostRefactorPrompt(dump: CandidateDump): string {
  if (dump.count === 0) {
    return 'No ghost-refactor candidates found. No judgment needed.';
  }

  const candidates = dump.candidates as GhostRefactorCandidate[];
  const parts: string[] = [
    '# Ghost Refactor Judgment',
    '',
    'The following commits have large diffs (>200 lines changed) on tasks that are NOT labeled as refactoring.',
    'For each candidate, determine:',
    '',
    '**Was this rewrite necessary to accomplish the task\'s stated goal?**',
    '',
    'Answer "necessary" if the diff size is justified by the task goal, or "unnecessary" if it appears to be a stylistic rewrite of working code.',
    '',
    '---',
    '',
  ];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    parts.push(`## Candidate ${i + 1}`);
    parts.push(`- **Commit:** ${c.commit.hash}`);
    parts.push(`- **Commit message:** ${c.commit.message}`);
    parts.push(`- **Diff size:** +${c.commit.insertions} -${c.commit.deletions} lines`);
    parts.push(`- **Task ${c.task.taskNumber}:** ${c.task.shortName}`);
    parts.push(`- **Task goal:** ${c.task.whatToBuild ?? '(not specified)'}`);
    parts.push('');
  }

  return parts.join('\n');
}

function cleanSlateBiasPrompt(dump: CandidateDump): string {
  if (dump.count === 0) {
    return 'No clean-slate-bias candidates found. No judgment needed.';
  }

  const candidates = dump.candidates as CleanSlateBiasCandidate[];
  const parts: string[] = [
    '# Clean Slate Bias Judgment',
    '',
    'The following pairs of functions/classes share the same name across different files.',
    'For each pair, determine:',
    '',
    '**Could one implementation be eliminated by extending the other?**',
    '',
    'Answer "duplicate" if they serve the same purpose and one should be removed, or "distinct" if they are intentionally separate implementations.',
    '',
    '---',
    '',
  ];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    parts.push(`## Candidate ${i + 1}`);
    parts.push(`- **Name:** ${c.name}`);
    parts.push(`- **File A:** ${c.fileA}`);
    parts.push(`  - Signature: \`${c.signatureA}\``);
    parts.push(`- **File B:** ${c.fileB}`);
    parts.push(`  - Signature: \`${c.signatureB}\``);
    parts.push('');
  }

  return parts.join('\n');
}

function deepHeresyPrompt(dump: CandidateDump): string {
  if (dump.count === 0) {
    return 'No deep-heresy candidates found. No judgment needed.';
  }

  const candidates = dump.candidates as DeepHeresyCandidate[];
  const parts: string[] = [
    '# Deep Heresy Judgment',
    '',
    'The following source files contain keyword clusters matching HARD KILL decisions.',
    'For each candidate, determine:',
    '',
    '**Does this code reintroduce a killed decision?**',
    '',
    'Answer "violates" if the code reimplements the killed behavior under a different name, "uncertain" if the match is ambiguous, or "unrelated" if the keyword overlap is coincidental.',
    '',
    '---',
    '',
  ];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    parts.push(`## Candidate ${i + 1}`);
    parts.push(`- **Killed Decision ${c.decisionNumber}:** ${c.decisionText}`);
    parts.push(`- **Rationale:** ${c.rationale}`);
    parts.push(`- **File:** ${c.filePath}`);
    parts.push(`- **Keyword matches:** ${c.matchedKeywordCount}`);
    parts.push('');
    parts.push('```');
    parts.push(truncate(c.content, 2000));
    parts.push('```');
    parts.push('');
  }

  return parts.join('\n');
}

function documentHeresyPrompt(dump: CandidateDump): string {
  if (dump.count === 0) {
    return 'No document-heresy candidates found. No judgment needed.';
  }

  const candidates = dump.candidates as DocumentHeresyCandidate[];
  const parts: string[] = [
    '# Document Heresy Judgment',
    '',
    'The following documentation files contain term clusters matching HARD KILL decisions.',
    'For each candidate, determine:',
    '',
    '**Does the code contradict the documented decision?**',
    '',
    'Specifically: does this document still describe the killed approach as if it were active? Answer "outdated" if the document needs updating, "ambiguous" if unclear, or "not related" if the term overlap is coincidental.',
    '',
    '---',
    '',
  ];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    parts.push(`## Candidate ${i + 1}`);
    parts.push(`- **Killed Decision ${c.decisionNumber}:** ${c.decisionText}`);
    parts.push(`- **Rationale:** ${c.rationale}`);
    parts.push(`- **Document:** ${c.filePath}`);
    parts.push(`- **Term matches:** ${c.matchedTermCount}`);
    parts.push('');
    parts.push('---');
    parts.push(truncate(c.content, 2000));
    parts.push('---');
    parts.push('');
  }

  return parts.join('\n');
}

function performanceCriticalPrompt(dump: CandidateDump): string {
  if (dump.count === 0) {
    return 'No performance-critical candidates found. No judgment needed.';
  }

  const candidates = dump.candidates as PerformanceCriticalCandidate[];
  const parts: string[] = [
    '# Performance Critical Path Judgment',
    '',
    'The following entry-point functions have deep call chains that include I/O operations.',
    'For each candidate, determine:',
    '',
    '**Is this a performance risk on the critical path?**',
    '',
    'Answer "perceptible" if a user would notice latency from this chain during normal use, or "acceptable" if the chain depth and I/O are unlikely to cause perceivable delay.',
    '',
    '---',
    '',
  ];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const chainStr = c.chain
      .map((name) => {
        const isIO = c.ioOperations.some((io) => io.startsWith(name));
        return isIO ? `${name} [I/O]` : name;
      })
      .join(' -> ');

    parts.push(`## Candidate ${i + 1}`);
    parts.push(`- **Entry point:** ${c.entryPoint}`);
    parts.push(`- **File:** ${c.filePath}`);
    parts.push(`- **Chain depth:** ${c.depth}`);
    parts.push(`- **I/O operations:** ${c.ioOperations.join(', ')}`);
    parts.push(`- **Call chain:** ${chainStr}`);
    parts.push('');
  }

  return parts.join('\n');
}

function reactFluidityPrompt(dump: CandidateDump): string {
  if (dump.count === 0) {
    const reason = (dump.context as Record<string, unknown> | undefined)?.reason;
    if (reason === 'not-a-react-project') {
      return 'Not a React project. No react-fluidity judgment needed.';
    }
    return 'No react-fluidity candidates found. No judgment needed.';
  }

  const candidates = dump.candidates as ReactFluidityCandidate[];
  const parts: string[] = [
    '# React Fluidity Judgment',
    '',
    'The following React components have patterns that could cause user-visible jank.',
    'For each candidate, determine:',
    '',
    '**Does this component have unnecessary re-renders?**',
    '',
    'Answer "perceptible" if a user would feel this performance issue during normal interaction, or "acceptable" if the pattern is unlikely to cause visible jank.',
    '',
    '---',
    '',
  ];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    parts.push(`## Candidate ${i + 1}`);
    parts.push(`- **Pattern:** ${c.pattern}`);
    parts.push(`- **File:** ${c.file}`);
    parts.push(`- **Line:** ${c.line}`);
    parts.push(`- **Component:** ${c.componentContext}`);
    parts.push('');
    parts.push('```');
    parts.push(truncate(c.snippet, 1000));
    parts.push('```');
    parts.push('');
  }

  return parts.join('\n');
}

function refactoringSignalsPrompt(dump: CandidateDump): string {
  if (dump.count === 0) {
    return 'No refactoring-signals candidates found. No judgment needed.';
  }

  // refactoring-signals produces exactly one candidate: the metrics object
  const metrics = dump.candidates[0] as RefactoringMetrics;
  const parts: string[] = [
    '# Refactoring Signals Judgment',
    '',
    'Assess the codebase health based on the following metrics and structural concerns.',
    '',
    '**Does this codebase need refactoring before the next milestone?**',
    '',
    'Answer "green" (proceed as planned), "yellow" (proceed with targeted refactoring first), or "red" (halt for structural rework).',
    '',
    '---',
    '',
    '## Modification Coupling',
  ];

  if (metrics.couplingHotspots.length === 0) {
    parts.push('No coupling hotspots (no files touched by 3+ tasks).');
  } else {
    for (const h of metrics.couplingHotspots) {
      parts.push(`- ${h.file}: touched by ${h.taskCount} tasks`);
    }
  }

  parts.push('');
  parts.push('## Complexity');
  parts.push(
    `Total functions: ${metrics.totalFunctions}, average function length: ${metrics.averageFunctionLength.toFixed(1)} lines`,
  );

  parts.push('');
  parts.push('## Structural Concerns from Build');
  if (metrics.structuralConcerns.length === 0) {
    parts.push('No structural concerns raised during the build.');
  } else {
    for (const c of metrics.structuralConcerns) {
      parts.push(`- Task ${c.taskNumber}: ${c.text}`);
    }
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const JUDGMENT_PROMPTS: Record<string, (candidates: CandidateDump) => string> = {
  'ghost-refactor': ghostRefactorPrompt,
  'clean-slate-bias': cleanSlateBiasPrompt,
  'deep-heresy': deepHeresyPrompt,
  'document-heresy': documentHeresyPrompt,
  'performance-critical': performanceCriticalPrompt,
  'react-fluidity': reactFluidityPrompt,
  'refactoring-signals': refactoringSignalsPrompt,
};
