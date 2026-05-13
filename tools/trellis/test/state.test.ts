import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readState,
  writeState,
  validateTransition,
  createInitialState,
  snapshotState,
} from "../src/state.js";
import type { TrellisState } from "../src/types.js";

function makeRunDir(): string {
  return mkdtempSync(join(tmpdir(), "trellis-state-"));
}

function makeState(): TrellisState {
  return createInitialState("20260115T0930Z-abc1234", "test", "m1-test-goal", "deadbeef", "/home/user/test");
}

describe("readState / writeState", () => {
  let runDir: string;
  let state: TrellisState;

  beforeEach(() => {
    runDir = makeRunDir();
    state = makeState();
  });

  it("STATE-001: version 2 state includes project_dir field", () => {
    expect(state.run_id).toBe("20260115T0930Z-abc1234");
    expect(state.current_stage).toBe(0);
    expect(state.stages["0"].status).toBe("in_progress");
    expect(state.halted).toBe(false);
    expect(state.version).toBe(2);
    expect(state.project_dir).toBe("/home/user/test");
  });

  it("round-trips through write and read", () => {
    writeState(runDir, state);
    const loaded = readState(runDir);
    expect(loaded.run_id).toBe(state.run_id);
    expect(loaded.current_stage).toBe(state.current_stage);
    expect(loaded.version).toBe(2);
    expect(loaded.project_dir).toBe("/home/user/test");
  });

  it("STATE-002: reads version 1 state files without project_dir", () => {
    const v1State = {
      run_id: "20260115T0930Z-abc1234",
      project: "test",
      milestone: "m1-test-goal",
      brief_hash: "deadbeef",
      current_stage: 0,
      stages: { "0": { status: "in_progress", started: null, completed: null, gate_passed: false } },
      tasks: {},
      halted: false,
      halt_reason: null,
      overrides: [],
      detections: [],
      version: 1,
    };
    writeFileSync(join(runDir, "state.json"), JSON.stringify(v1State), "utf-8");
    const loaded = readState(runDir);
    expect(loaded.version).toBe(1);
    expect(loaded.run_id).toBe("20260115T0930Z-abc1234");
  });

  it("STATE-003: rejects version 2 state missing project_dir", () => {
    const badV2 = {
      run_id: "20260115T0930Z-abc1234",
      project: "test",
      milestone: "m1-test-goal",
      brief_hash: "deadbeef",
      current_stage: 0,
      stages: {},
      tasks: {},
      halted: false,
      halt_reason: null,
      overrides: [],
      detections: [],
      version: 2,
    };
    writeFileSync(join(runDir, "state.json"), JSON.stringify(badV2), "utf-8");
    expect(() => readState(runDir)).toThrow("project_dir");
  });

  it("STATE-004: writing state always produces version 2", () => {
    const v1State: TrellisState = {
      run_id: "20260115T0930Z-abc1234",
      project: "test",
      milestone: "m1-test-goal",
      brief_hash: "deadbeef",
      current_stage: 0,
      stages: { "0": { status: "in_progress", started: null, completed: null, gate_passed: false } },
      tasks: {},
      halted: false,
      halt_reason: null,
      overrides: [],
      detections: [],
      project_dir: "",
      version: 1,
    };
    writeState(runDir, v1State);
    const raw = JSON.parse(readFileSync(join(runDir, "state.json"), "utf-8"));
    expect(raw.version).toBe(2);
    expect(raw.project_dir).toBe("");
  });

  it("throws on missing file", () => {
    expect(() => readState(runDir)).toThrow("not found");
  });

  it("throws on invalid JSON", () => {
    writeFileSync(join(runDir, "state.json"), "not json {{{", "utf-8");
    expect(() => readState(runDir)).toThrow("invalid JSON");
  });

  it("throws on missing required fields", () => {
    writeFileSync(join(runDir, "state.json"), JSON.stringify({ version: 1 }), "utf-8");
    expect(() => readState(runDir)).toThrow("missing required field");
  });

  it("STATE-005: atomic write uses temp file + rename", () => {
    writeState(runDir, state);
    const raw = readFileSync(join(runDir, "state.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.run_id).toBe(state.run_id);
    const files = readdirSync(runDir) as string[];
    const tmpFiles = files.filter((f: string) => f.endsWith(".tmp"));
    expect(tmpFiles).toHaveLength(0);
  });
});

describe("snapshotState", () => {
  it("SNAP-001: copies state.json to state.json.stage-N", () => {
    const runDir = makeRunDir();
    const state = makeState();
    writeState(runDir, state);
    snapshotState(runDir, 0);
    expect(existsSync(join(runDir, "state.json.stage-0"))).toBe(true);
    const snapshot = JSON.parse(readFileSync(join(runDir, "state.json.stage-0"), "utf-8"));
    expect(snapshot.run_id).toBe(state.run_id);
    expect(snapshot.version).toBe(2);
  });

  it("is a no-op if state.json does not exist", () => {
    const runDir = makeRunDir();
    snapshotState(runDir, 5);
    expect(existsSync(join(runDir, "state.json.stage-5"))).toBe(false);
  });
});

describe("validateTransition", () => {
  let base: TrellisState;

  beforeEach(() => {
    base = makeState();
  });

  it("STATE-005: allows stage advancement by 1", () => {
    const next = { ...base, current_stage: 1 };
    const result = validateTransition(base, next);
    expect(result.valid).toBe(true);
  });

  it("rejects stage skip", () => {
    const next = { ...base, current_stage: 3 };
    const result = validateTransition(base, next);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("skip");
  });

  it("rejects backward movement", () => {
    const current = { ...base, current_stage: 3 };
    const next = { ...current, current_stage: 1 };
    const result = validateTransition(current, next);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("backward");
  });

  it("rejects advancement from halted", () => {
    const current = { ...base, halted: true, halt_reason: "test" };
    const next = { ...current, current_stage: 1, halted: false, halt_reason: null };
    const result = validateTransition(current, next);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("halt");
  });

  it("allows resume from halt without stage change", () => {
    const current = { ...base, halted: true, halt_reason: "test" };
    const next = { ...current, halted: false, halt_reason: null };
    const result = validateTransition(current, next);
    expect(result.valid).toBe(true);
  });

  it("rejects run_id change", () => {
    const next = { ...base, run_id: "different" };
    const result = validateTransition(base, next);
    expect(result.valid).toBe(false);
  });
});
