import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import {
  readState,
  writeState,
  validateTransition,
  createInitialState,
} from "../src/state.js";
import type { TrellisState } from "../src/types.js";

function makeRunDir(): string {
  const tmp = mkdtempSync(join(tmpdir(), "trellis-state-"));
  return tmp;
}

function makeState(): TrellisState {
  return createInitialState("20260115T0930Z-abc1234", "test", "m1-test-goal", "deadbeef");
}

describe("readState / writeState", () => {
  let runDir: string;
  let state: TrellisState;

  beforeEach(() => {
    runDir = makeRunDir();
    state = createInitialState("20260115T0930Z-abc1234", "test", "m1-test-goal", "deadbeef");
  });

  it("STATE-004: initial state is valid", () => {
    expect(state.run_id).toBe("20260115T0930Z-abc1234");
    expect(state.current_stage).toBe(0);
    expect(state.stages["0"].status).toBe("in_progress");
    expect(state.halted).toBe(false);
    expect(state.version).toBe(1);
  });

  it("round-trips through write and read", () => {
    writeState(runDir, state);
    const loaded = readState(runDir);
    expect(loaded.run_id).toBe(state.run_id);
    expect(loaded.current_stage).toBe(state.current_stage);
    expect(loaded.version).toBe(1);
  });

  it("throws on missing file", () => {
    expect(() => readState(runDir)).toThrow("not found");
  });

  it("throws on invalid JSON", () => {
    const filePath = join(runDir, "state.json");
    const { writeFileSync } = require("node:fs");
    writeFileSync(filePath, "not json {{{", "utf-8");
    expect(() => readState(runDir)).toThrow("invalid JSON");
  });

  it("throws on missing required fields", () => {
    const filePath = join(runDir, "state.json");
    const { writeFileSync } = require("node:fs");
    writeFileSync(filePath, JSON.stringify({ version: 1 }), "utf-8");
    expect(() => readState(runDir)).toThrow("missing required field");
  });

  it("STATE-007: atomic write uses temp file + rename", () => {
    writeState(runDir, state);
    const raw = readFileSync(join(runDir, "state.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.run_id).toBe(state.run_id);
    // No .tmp files should remain
    const { readdirSync } = require("node:fs");
    const files = readdirSync(runDir) as string[];
    const tmpFiles = files.filter((f: string) => f.endsWith(".tmp"));
    expect(tmpFiles).toHaveLength(0);
  });
});

describe("validateTransition", () => {
  let base: TrellisState;

  beforeEach(() => {
    base = createInitialState("20260115T0930Z-abc1234", "test", "m1-test-goal", "deadbeef");
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
