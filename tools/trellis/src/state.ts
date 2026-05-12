import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { TrellisState, StageRecord, TaskRecord } from "./types.js";

export function readState(runDir: string): TrellisState {
  const filePath = join(runDir, "state.json");
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      throw new Error(`state.json not found at ${filePath}`);
    }
    throw e;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`state.json at ${filePath} contains invalid JSON`);
  }

  validateSchema(parsed);
  return parsed as TrellisState;
}

export function writeState(runDir: string, state: TrellisState): void {
  validateSchema(state);
  const filePath = join(runDir, "state.json");
  const tmpPath = join(dirname(filePath), `.state.${randomBytes(4).toString("hex")}.tmp`);
  writeFileSync(tmpPath, JSON.stringify(state, null, 2) + "\n", "utf-8");
  renameSync(tmpPath, filePath);
}

export function validateTransition(
  current: TrellisState,
  next: TrellisState,
): { valid: boolean; reason: string | null } {
  if (current.run_id !== next.run_id) {
    return { valid: false, reason: "run_id cannot change" };
  }

  if (current.halted && !next.halted && next.current_stage !== current.current_stage) {
    return { valid: false, reason: "Cannot advance stage while resuming from halt — resume first, then advance" };
  }

  if (current.halted && next.current_stage !== current.current_stage) {
    return { valid: false, reason: "Cannot advance stage from halted state — resume first" };
  }

  const stageDelta = next.current_stage - current.current_stage;
  if (stageDelta > 1) {
    return { valid: false, reason: `Cannot skip stages: ${current.current_stage} to ${next.current_stage}` };
  }

  if (stageDelta < 0) {
    return { valid: false, reason: `Cannot go backward: ${current.current_stage} to ${next.current_stage}` };
  }

  if (next.halted && isFinalStageComplete(next)) {
    return { valid: false, reason: "Cannot be both halted and have final stage complete" };
  }

  return { valid: true, reason: null };
}

export function createInitialState(
  runId: string,
  project: string,
  milestone: string,
  briefHash: string,
): TrellisState {
  const stages: Record<string, StageRecord> = {};
  for (let i = 0; i <= 11; i++) {
    stages[String(i)] = {
      status: i === 0 ? "in_progress" : "not_started",
      started: i === 0 ? new Date().toISOString() : null,
      completed: null,
      gate_passed: false,
    };
  }

  return {
    run_id: runId,
    project,
    milestone,
    brief_hash: briefHash,
    current_stage: 0,
    stages,
    tasks: {},
    halted: false,
    halt_reason: null,
    overrides: [],
    detections: [],
    version: 1,
  };
}

function isFinalStageComplete(state: TrellisState): boolean {
  const finalStage = state.stages["11"];
  return finalStage?.status === "complete" && finalStage.gate_passed;
}

function validateSchema(obj: unknown): asserts obj is TrellisState {
  if (typeof obj !== "object" || obj === null) {
    throw new Error("state.json must be a JSON object");
  }

  const state = obj as Record<string, unknown>;
  const required = ["run_id", "project", "milestone", "brief_hash", "current_stage", "stages", "tasks", "halted", "version"];
  for (const key of required) {
    if (!(key in state)) {
      throw new Error(`state.json missing required field: ${key}`);
    }
  }

  if (typeof state.current_stage !== "number") {
    throw new Error("current_stage must be a number");
  }

  if (state.version !== 1) {
    throw new Error(`Unsupported schema version: ${state.version}`);
  }
}
