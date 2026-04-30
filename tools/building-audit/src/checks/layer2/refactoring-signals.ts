import type { Check, CheckResult, Finding, ProjectContext, LLMClient } from '../types.js';
import { registerCheck } from '../registry.js';

// ---------------------------------------------------------------------------
// Refactoring Signals Check (Layer 2)
// ---------------------------------------------------------------------------
// Produces a holistic green/yellow/red refactoring assessment by computing
// code health metrics and asking the LLM whether the next milestone should
// proceed, proceed with targeted refactoring, or halt for structural rework.

const CONCERN_KEYWORDS = [
  'fragile',
  'coupling',
  'complexity',
  'technical debt',
  'refactor',
  'restructure',
];

const COUPLING_HOTSPOT_THRESHOLD = 3;

export type RefactoringAssessment = 'green' | 'yellow' | 'red';

// ---------------------------------------------------------------------------
// Metric computation (code phase)
// ---------------------------------------------------------------------------

export interface RefactoringMetrics {
  couplingHotspots: { file: string; taskCount: number }[];
  averageFunctionLength: number;
  totalFunctions: number;
  structuralConcerns: { taskNumber: number; text: string }[];
}

export function computeMetrics(context: ProjectContext): RefactoringMetrics {
  const { fileToTaskMapping, sourceFiles, taskFiles } = context;

  // Modification coupling: files touched by 3+ tasks
  const couplingHotspots: { file: string; taskCount: number }[] = [];
  for (const [file, tasks] of fileToTaskMapping) {
    if (tasks.length >= COUPLING_HOTSPOT_THRESHOLD) {
      couplingHotspots.push({ file, taskCount: tasks.length });
    }
  }
  couplingHotspots.sort((a, b) => b.taskCount - a.taskCount);

  // Complexity growth: average function length
  let totalLines = 0;
  let totalFunctions = 0;
  for (const [, analyzed] of sourceFiles) {
    for (const fn of analyzed.functions) {
      totalLines += fn.endLine - fn.startLine + 1;
      totalFunctions++;
    }
  }
  const averageFunctionLength = totalFunctions > 0 ? totalLines / totalFunctions : 0;

  // Structural concerns from task insight/implication text
  const structuralConcerns: { taskNumber: number; text: string }[] = [];
  for (const task of taskFiles) {
    const text = task.completed?.insightImplication;
    if (!text) continue;
    const lower = text.toLowerCase();
    if (CONCERN_KEYWORDS.some((kw) => lower.includes(kw))) {
      structuralConcerns.push({ taskNumber: task.taskNumber, text });
    }
  }

  return { couplingHotspots, averageFunctionLength, totalFunctions, structuralConcerns };
}

// ---------------------------------------------------------------------------
// LLM response parsing
// ---------------------------------------------------------------------------

export function parseAssessment(content: string): RefactoringAssessment {
  const lower = content.toLowerCase();

  // Check green indicators
  if (lower.includes('proceed as planned') || lower.includes('healthy') || lower.includes('green')) {
    return 'green';
  }

  // Check red indicators
  if (lower.includes('halt') || lower.includes('structural rework') || lower.includes('red')) {
    return 'red';
  }

  // Check yellow indicators
  if (
    lower.includes('targeted refactoring') ||
    lower.includes('some concerns') ||
    lower.includes('yellow')
  ) {
    return 'yellow';
  }

  // Default to yellow if ambiguous
  return 'yellow';
}

function assessmentToSeverity(assessment: RefactoringAssessment): 'clean' | 'warning' | 'critical' {
  switch (assessment) {
    case 'green':
      return 'clean';
    case 'yellow':
      return 'warning';
    case 'red':
      return 'critical';
  }
}

// ---------------------------------------------------------------------------
// Build LLM prompt
// ---------------------------------------------------------------------------

function buildPrompt(metrics: RefactoringMetrics): string {
  const parts: string[] = [];

  parts.push('Assess the codebase health based on the following metrics and concerns.');
  parts.push('');

  parts.push('## Modification Coupling');
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
  parts.push('');

  parts.push(
    'Given these codebase health trends and structural concerns raised during the build, ' +
      'should the next milestone proceed as planned, proceed with targeted refactoring first, ' +
      'or halt for structural rework?',
  );

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Check implementation
// ---------------------------------------------------------------------------

const refactoringSignals: Check = {
  name: 'refactoring-signals',
  layer: 2,

  async run(context: ProjectContext, llmClient?: LLMClient): Promise<CheckResult> {
    if (!llmClient) {
      return {
        name: 'refactoring-signals',
        layer: 2,
        status: 'skipped',
        severity: 'clean',
        findings: [],
        errorMessage: 'No LLM client provided',
        tokenUsage: { input: 0, output: 0 },
      };
    }

    const metrics = computeMetrics(context);
    const prompt = buildPrompt(metrics);
    const response = await llmClient.query(prompt, 16384);

    const assessment = parseAssessment(response.content);
    const severity = assessmentToSeverity(assessment);

    const findings: Finding[] = [
      {
        file: 'project',
        location: 'codebase-wide',
        description: `Refactoring assessment: ${assessment}`,
        suggestion:
          assessment === 'green'
            ? 'Codebase is healthy. Proceed with next milestone.'
            : assessment === 'yellow'
              ? 'Some concerns identified. Consider targeted refactoring before proceeding.'
              : 'Significant structural issues. Halt for structural rework before proceeding.',
        evidence: {
          refactoringAssessment: assessment,
          metrics: {
            couplingHotspots: metrics.couplingHotspots,
            averageFunctionLength: metrics.averageFunctionLength,
            totalFunctions: metrics.totalFunctions,
            structuralConcernsCount: metrics.structuralConcerns.length,
          },
          llmResponse: response.content,
        },
      },
    ];

    return {
      name: 'refactoring-signals',
      layer: 2,
      status: 'completed',
      severity,
      findings,
      errorMessage: null,
      tokenUsage: { input: response.usage.input, output: response.usage.output },
    };
  },
};

registerCheck(refactoringSignals);

export { refactoringSignals, buildPrompt };
