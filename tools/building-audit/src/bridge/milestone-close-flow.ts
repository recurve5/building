// End-to-end milestone-close audit wiring.
// Task 008: ties together candidate bridge (006), judgment prompts (007),
// detection writer (005), and policy classification (001).
//
// Two-phase API:
//   1. prepareMilestoneCloseAudit — dumps candidates, formats prompts, persists pre-judgment report
//   2. finalizeMilestoneCloseAudit — writes detection record after orchestrator provides judgments
//
// This module does NOT call the LLM. The orchestrator evaluates the prompts
// in its own session.

import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { runMilestoneCloseAudit } from './milestone-close-audit.js';
import { JUDGMENT_PROMPTS } from './judgment-prompts.js';
import { appendDetection } from './detection-writer.js';
import type { CandidateDump } from '../types/index.js';
import type { Detection, DetectionAction } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of the prepare phase. The orchestrator evaluates each prompt. */
export interface MilestoneCloseResult {
  candidates: Map<string, CandidateDump>;
  prompts: Map<string, string>;
  errors: Map<string, string>;
}

/** A single judgment provided by the orchestrator after evaluating a prompt. */
export interface JudgmentResult {
  checkName: string;
  /** Free-form judgment text from the LLM. */
  judgment: string;
  /** Did the LLM find actionable issues? */
  hasFindings: boolean;
}

/** Shape of the Layer 2 report persisted to disk. */
export interface Layer2Report {
  version: string;
  timestamp: string;
  project: string;
  milestone: string;
  phase: 'pre-judgment' | 'finalized';
  checks: Layer2ReportCheck[];
  errors: Array<{ check: string; error: string }>;
  /** Decision 23: present when remediated checks exist. */
  notReVerifiedNotice?: string;
}

export interface Layer2ReportCheck {
  check: string;
  candidateCount: number;
  candidates: unknown[];
  context?: Record<string, unknown>;
  prompt: string;
  /** Populated in the finalized phase. */
  judgment?: string;
  hasFindings?: boolean;
}

/** Options for the finalize phase. */
export interface FinalizeOptions {
  statePath: string;
  projectPath: string;
  milestone: string;
  judgments: JudgmentResult[];
  /** Decision 23: checks that were remediated since the last full audit. */
  remediatedChecks?: string[];
  preJudgmentReportPath?: string;
}

// ---------------------------------------------------------------------------
// Phase 1: Prepare
// ---------------------------------------------------------------------------

const REPORT_VERSION = '1.0.0';

/**
 * Prepare the milestone-close audit: dump candidates, format prompts,
 * persist the pre-judgment report.
 *
 * Returns the candidates and prompts for the orchestrator to evaluate.
 * Checks that errored appear in the `errors` map and in the report.
 */
export async function prepareMilestoneCloseAudit(
  projectPath: string,
  milestone: string,
): Promise<MilestoneCloseResult> {
  // Step 1: Run candidate dump
  const { candidates, errors } = await runMilestoneCloseAudit(
    projectPath,
    milestone,
  );

  // Step 2: Format prompts for each successful candidate dump
  const prompts = new Map<string, string>();
  for (const [checkName, dump] of candidates) {
    const templateFn = JUDGMENT_PROMPTS[checkName];
    if (templateFn) {
      prompts.set(checkName, templateFn(dump));
    } else {
      // No template for this check — record as an error
      errors.set(
        checkName,
        `No judgment prompt template for check "${checkName}"`,
      );
    }
  }

  // Step 3: Persist pre-judgment report
  const report = buildLayer2Report(
    projectPath,
    milestone,
    'pre-judgment',
    candidates,
    prompts,
    errors,
  );

  const auditDir = join(projectPath, milestone, 'audit');
  await mkdir(auditDir, { recursive: true });
  const reportPath = join(auditDir, 'milestone-close-layer2.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  return { candidates, prompts, errors };
}

// ---------------------------------------------------------------------------
// Phase 2: Finalize
// ---------------------------------------------------------------------------

/**
 * Finalize the milestone-close audit after the orchestrator has evaluated
 * the prompts. Writes the detection record and updates the report.
 *
 * Decision 23: if `remediatedChecks` is non-empty, the detection record
 * includes a "not re-verified" notice.
 */
export async function finalizeMilestoneCloseAudit(
  options: FinalizeOptions,
): Promise<{ report: Layer2Report; detection: Detection }> {
  const {
    statePath,
    projectPath,
    milestone,
    judgments,
    remediatedChecks = [],
    preJudgmentReportPath,
  } = options;

  // Step 1: Build detection actions from judgments
  const actions: DetectionAction[] = [];

  for (const j of judgments) {
    if (j.hasFindings) {
      actions.push({
        type: 'escalated',
        taskNumber: null,
        findingCheck: j.checkName,
        findingFile: null,
        resolution: `Layer 2 finding escalated to Tier 3: ${j.checkName}`,
      });
    }
  }

  // Decision 23: add "not re-verified" notice if remediated checks exist
  let notReVerifiedNotice: string | undefined;
  if (remediatedChecks.length > 0) {
    notReVerifiedNotice = `The following checks had findings that were remediated but have not been re-verified by Layer 2: ${remediatedChecks.join(', ')}. Layer 2 runs once per milestone close and does not re-run after remediation (Decision 8). Manual verification recommended.`;

    actions.push({
      type: 'accepted',
      taskNumber: null,
      findingCheck: null,
      findingFile: null,
      resolution: notReVerifiedNotice,
    });
  }

  // If no findings and no remediation notice, record acceptance
  if (actions.length === 0) {
    actions.push({
      type: 'accepted',
      taskNumber: null,
      findingCheck: null,
      findingFile: null,
      resolution: 'All Layer 2 checks clean at milestone close.',
    });
  }

  // Step 2: Build and append detection record
  const detection: Detection = {
    timestamp: new Date().toISOString(),
    trigger: 'milestone-close',
    taskId: null,
    layer: 2,
    results: [], // Layer 2 results come from orchestrator judgment, not CheckResult[]
    actions,
  };

  appendDetection(statePath, detection);

  // Step 3: Read pre-judgment report for candidate data
  let preJudgmentChecks: Layer2ReportCheck[] = [];
  const resolvedPath = preJudgmentReportPath ?? join(projectPath, milestone, 'audit', 'milestone-close-layer2.json');
  try {
    const raw = await readFile(resolvedPath, 'utf-8');
    const preReport = JSON.parse(raw) as Layer2Report;
    if (preReport.checks) {
      preJudgmentChecks = preReport.checks;
    }
  } catch {
    // Missing or invalid pre-judgment report — proceed with empty candidates
  }

  // Step 4: Persist finalized report (overwrite pre-judgment)
  const report = buildFinalizedReport(
    projectPath,
    milestone,
    judgments,
    notReVerifiedNotice,
    preJudgmentChecks,
  );

  const auditDir = join(projectPath, milestone, 'audit');
  await mkdir(auditDir, { recursive: true });
  const reportPath = join(auditDir, 'milestone-close-layer2.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  return { report, detection };
}

// ---------------------------------------------------------------------------
// Report builders
// ---------------------------------------------------------------------------

function buildLayer2Report(
  projectPath: string,
  milestone: string,
  phase: 'pre-judgment' | 'finalized',
  candidates: Map<string, CandidateDump>,
  prompts: Map<string, string>,
  errors: Map<string, string>,
  notReVerifiedNotice?: string,
): Layer2Report {
  const checks: Layer2ReportCheck[] = [];

  for (const [checkName, dump] of candidates) {
    checks.push({
      check: checkName,
      candidateCount: dump.count,
      candidates: dump.candidates,
      context: dump.context,
      prompt: prompts.get(checkName) ?? '',
    });
  }

  const errorEntries: Array<{ check: string; error: string }> = [];
  for (const [check, error] of errors) {
    errorEntries.push({ check, error });
  }

  const report: Layer2Report = {
    version: REPORT_VERSION,
    timestamp: new Date().toISOString(),
    project: projectPath,
    milestone,
    phase,
    checks,
    errors: errorEntries,
  };

  if (notReVerifiedNotice) {
    report.notReVerifiedNotice = notReVerifiedNotice;
  }

  return report;
}

function buildFinalizedReport(
  projectPath: string,
  milestone: string,
  judgments: JudgmentResult[],
  notReVerifiedNotice?: string,
  preJudgmentChecks?: Layer2ReportCheck[],
): Layer2Report {
  const preMap = new Map<string, Layer2ReportCheck>();
  if (preJudgmentChecks) {
    for (const c of preJudgmentChecks) {
      preMap.set(c.check, c);
    }
  }

  const checks: Layer2ReportCheck[] = judgments.map((j) => {
    const pre = preMap.get(j.checkName);
    return {
      check: j.checkName,
      candidateCount: pre?.candidateCount ?? 0,
      candidates: pre?.candidates ?? [],
      context: pre?.context,
      prompt: pre?.prompt ?? '',
      judgment: j.judgment,
      hasFindings: j.hasFindings,
    };
  });

  const report: Layer2Report = {
    version: REPORT_VERSION,
    timestamp: new Date().toISOString(),
    project: projectPath,
    milestone,
    phase: 'finalized',
    checks,
    errors: [],
  };

  if (notReVerifiedNotice) {
    report.notReVerifiedNotice = notReVerifiedNotice;
  }

  return report;
}
