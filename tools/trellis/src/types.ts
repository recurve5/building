// D0-1: state.json schema

export interface TrellisState {
  /** Format: YYYYMMDDTHHMMZ-<7-char-hex> */
  run_id: string;

  /** Project name, lowercase with hyphens */
  project: string;

  /** Exact filesystem directory name of the current milestone */
  milestone: string;

  /** SHA-256 hex digest of the brief file content */
  brief_hash: string;

  /** Current pipeline stage (0-11) */
  current_stage: number;

  /** Per-stage status records */
  stages: Record<string, StageRecord>;

  /** Per-task status records. Keys are zero-padded task numbers ("001", "002", etc.) */
  tasks: Record<string, TaskRecord>;

  /** Whether the run is halted */
  halted: boolean;

  /** Human-readable halt reason, null when not halted */
  halt_reason: string | null;

  /** Stage numbers that were overridden (as strings: "3", "5") */
  overrides: string[];

  /** Detection record filenames (without path) */
  detections: string[];

  /** Absolute path to the developer's project directory */
  project_dir: string;

  /** Schema version for forward compatibility */
  version: 1 | 2;
}

export interface StageRecord {
  status: "not_started" | "in_progress" | "complete" | "skipped";
  started: string | null;
  completed: string | null;
  gate_passed: boolean;
}

export interface TaskRecord {
  status: "not_started" | "in_progress" | "complete" | "blocked";
  attempts: number;
}

// D0-2: Event schema

export type EventType =
  | "run_started"
  | "stage_started"
  | "stage_complete"
  | "gate_passed"
  | "gate_failed"
  | "gate_overridden"
  | "task_started"
  | "task_complete"
  | "task_failed"
  | "detection_fired"
  | "halt"
  | "resume"
  | "morning_after_generated"
  | "context_exhaustion";

export interface TrellisEvent {
  /** ISO 8601 UTC timestamp */
  timestamp: string;

  /** Event type identifier */
  event: EventType;

  /** Pipeline stage this event relates to (null for run-level events) */
  stage: number | null;

  /** Task number this event relates to (null for stage-level events) */
  task: string | null;

  /** Event-specific payload */
  data: Record<string, unknown>;
}

// D0-5: Gate check result format

export interface GateResult {
  /** Gate identifier: "stage-0-to-1", "stage-2-to-3", etc. */
  gate: string;

  /** Whether all checks passed */
  passed: boolean;

  /** Individual checks that were run */
  checks: GateCheck[];

  /** Wall-clock duration of the gate check */
  duration_ms: number;
}

export interface GateCheck {
  /** Check name: "milestone-list-exists", "prd-sections-complete", etc. */
  name: string;

  /** Whether this individual check passed */
  passed: boolean;

  /** Human-readable failure message (null on pass) */
  message: string | null;
}

// D0-6: Confidence assessment

export interface ConfidenceAssessment {
  artifact: string;
  level: "verified" | "partial";
  reasons: string[];
}
