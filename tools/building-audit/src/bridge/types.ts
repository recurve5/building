// Shared bridge types used across all bridge modules.
// DAY-ZERO contracts 2.4, 2.5, 2.10, 2.12, 2.13

import type { CheckResult, Finding } from '../types/index.js';
import type { Tier, Action } from './policy.js';

/** A finding that has been classified by the policy engine. */
export interface ClassifiedFinding {
  checkName: string;
  checkResult: CheckResult;
  finding: Finding;
  tier: Tier;
  action: Action;
}

/** Specification for generating a remediation task from a finding. */
export interface RemediationTaskSpec {
  originatingTaskNumber: number;
  checkName: string;
  severity: CheckResult['severity'];
  finding: Finding;
  remediationDepth: number;
}

/** Result of a git operation (tag or branch creation). */
export interface GitOpResult {
  created: boolean;
  ref: string | null;
  error: string | null;
  /** Decision 25: non-fatal warning, e.g. missing prerequisite tag at rollback time. */
  warning?: string;
}

/** Git checkpoint state for a milestone. */
export interface StateGit {
  startTag: GitOpResult;
  completeTag: GitOpResult;
  rollbackBranch: GitOpResult;
}

/** A single audit detection event recorded in state. */
export interface Detection {
  /** ISO 8601 timestamp. */
  timestamp: string;
  trigger: 'task-complete' | 'milestone-close';
  taskId: number | null;
  layer: 1 | 2;
  /** Decision 20: L1 + clean-slate-bias only for task-complete. */
  results: CheckResult[];
  actions: DetectionAction[];
}

/** An action taken in response to a detection. */
export interface DetectionAction {
  type: 'blocked' | 'task-created' | 'escalated' | 'accepted';
  taskNumber: number | null;
  findingCheck: string | null;
  findingFile: string | null;
  resolution: string | null;
}

// ── M3: Handoff payload ──

export interface HandoffPayload {
  runId: string;
  project: string;
  milestone: string;
  projectDir: string;
  stateDir: string;
  stage: number;
  stageName: string;
  halted: boolean;
  haltReason: string | null;
  overrides: number[];

  completedTasks: Array<{ number: number; shortName: string; status: string }>;
  currentTask: { number: number; shortName: string; status: string } | null;
  remainingTasks: Array<{ number: number; shortName: string; status: string }>;
  remediationTasks: Array<{ number: number; shortName: string; status: string }>;

  decisions: Array<{ number: number; decision: string; rationale: string }>;
  openItems: Array<{ description: string; context: string }>;

  auditSummary: {
    l1Findings: number;
    l2Findings: number;
    detectionFiles: string[];
  } | null;

  gitCheckpoints: string[];
  artifactPaths: string[];
  nextStep: string;
}

export interface HandoffHeader {
  runId: string;
  project: string;
  milestone: string;
  currentStage: number;
  currentStageName: string;
  halted: boolean;
  haltReason: string | null;
  completedTaskCount: number;
  remainingTaskCount: number;
  currentTaskNumber: number | null;
  nextStep: string;
}

// ── M3: Session lifecycle events ──

export interface SessionBoundaryEvent {
  event: 'session_boundary';
  timestamp: string;
  stage: number;
  taskProgress?: { completed: number; remaining: number; current: number | null };
  reason: 'stage-complete' | 'batch-complete';
}

export interface HandoffWrittenEvent {
  event: 'handoff_written';
  timestamp: string;
  trigger: 'stage-complete' | 'batch-complete' | 'halt' | 'run-complete';
  handoffPath: string;
}

export interface SessionResumedEvent {
  event: 'session_resumed';
  timestamp: string;
  handoffSource: 'handoff.md' | 'state.json-fallback';
  resumingStage: number;
  resumingTask: number | null;
}

// ── M3: Constants ──

export const HANDOFF_TEMPLATE_SECTIONS = [
  'Run Identity',
  'Pipeline Position',
  'Task Progress',
  'Decisions Made This Session',
  'Open Items',
  'Audit Summary',
  'Git Checkpoints',
  'Artifact Paths',
  'Next Step',
] as const;

export const HANDOFF_HEADER_KEYS = [
  'run_id',
  'project',
  'milestone',
  'stage',
  'stage_name',
  'halted',
  'halt_reason',
  'completed_tasks',
  'remaining_tasks',
  'current_task',
  'next_step',
] as const;
