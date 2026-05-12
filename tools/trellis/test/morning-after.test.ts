import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateMorningAfter, classifyResult, calculateDuration } from "../src/morning-after.js";
import { createInitialState, writeState } from "../src/state.js";
import { appendEvent } from "../src/events.js";
import type { TrellisState } from "../src/types.js";

function makeCleanRun(): string {
  const tmp = mkdtempSync(join(tmpdir(), "trellis-ma-"));
  const runDir = join(tmp, "run");
  for (const sub of ["events", "overrides", "detections", "confidence"]) {
    mkdirSync(join(runDir, sub), { recursive: true });
  }
  const state = createInitialState("test-run", "myproject", "m1-test-goal", "abc");
  state.stages["0"] = { status: "complete", started: "2026-01-01T00:00:00Z", completed: "2026-01-01T00:05:00Z", gate_passed: true };
  state.stages["11"] = { status: "complete", started: "2026-01-01T01:00:00Z", completed: "2026-01-01T02:00:00Z", gate_passed: true };
  writeState(runDir, state);
  appendEvent(runDir, { event: "run_started", stage: null, task: null, data: {} });
  appendEvent(runDir, { event: "stage_complete", stage: 0, task: null, data: { artifacts_produced: ["brief.md"] } });
  return runDir;
}

function makeHaltedRun(): string {
  const tmp = mkdtempSync(join(tmpdir(), "trellis-ma-"));
  const runDir = join(tmp, "run");
  for (const sub of ["events", "overrides", "detections", "confidence"]) {
    mkdirSync(join(runDir, sub), { recursive: true });
  }
  const state = createInitialState("test-run", "myproject", "m1-test-goal", "abc");
  state.halted = true;
  state.halt_reason = "Tier 3 detection";
  state.current_stage = 5;
  writeState(runDir, state);
  appendEvent(runDir, { event: "run_started", stage: null, task: null, data: {} });
  appendEvent(runDir, { event: "halt", stage: 5, task: null, data: { halt_reason: "Tier 3 detection", recoverable: true } });
  return runDir;
}

describe("generateMorningAfter", () => {
  it("MAFTER-001: clean run produces Header, What Shipped, Confidence, Stats", () => {
    const runDir = makeCleanRun();
    const output = generateMorningAfter(runDir);
    expect(output).toContain("# Morning After: myproject / m1-test-goal");
    expect(output).toContain("Result: SHIPPED");
    expect(output).toContain("## What Shipped");
    expect(output).toContain("## Confidence");
    expect(output).toContain("## Stats");
    expect(output).not.toContain("## What Stopped");
    expect(output).not.toContain("## Gates Overridden");
    expect(output).not.toContain("## Failure Modes Detected");
  });

  it("MAFTER-002: halted run includes What Stopped", () => {
    const runDir = makeHaltedRun();
    const output = generateMorningAfter(runDir);
    expect(output).toContain("## What Stopped");
    expect(output).toContain("Tier 3 detection");
    expect(output).toContain("Result: HALTED");
  });

  it("MAFTER-003: overrides included when present", () => {
    const runDir = makeCleanRun();
    writeFileSync(
      join(runDir, "overrides", "2-2026-01-01.md"),
      "# Override: Stage 2\n\n**Gate:** stage-2-to-3\n**Overridden by:** orchestrator\n\n## What Failed\n\n- test\n\n## Justification\n\ntest\n\n## Risk Accepted\n\ntest\n",
    );
    const output = generateMorningAfter(runDir);
    expect(output).toContain("## Gates Overridden");
    expect(output).toContain("stage-2-to-3");
  });

  it("MAFTER-004: detections included when present", () => {
    const runDir = makeCleanRun();
    writeFileSync(
      join(runDir, "detections", "003-scope-creep.md"),
      "# Detection: scope-creep\n\n**Severity:** tier2\n**Task:** 003\n\nFiles changed outside scope.\n",
    );
    const output = generateMorningAfter(runDir);
    expect(output).toContain("## Failure Modes Detected");
    expect(output).toContain("scope-creep");
  });

  it("MAFTER-008: empty sections omitted", () => {
    const runDir = makeCleanRun();
    const output = generateMorningAfter(runDir);
    expect(output).not.toContain("## What Stopped");
    expect(output).not.toContain("## Gates Overridden");
    expect(output).not.toContain("## Failure Modes Detected");
    expect(output).not.toContain("## Decisions Made");
  });

  it("MAFTER-010: header metadata correct", () => {
    const runDir = makeCleanRun();
    const output = generateMorningAfter(runDir);
    expect(output).toContain("Run: test-run");
    expect(output).toContain("Duration:");
  });

  it("MAFTER-011: stats counts accurate", () => {
    const runDir = makeCleanRun();
    const output = generateMorningAfter(runDir);
    expect(output).toContain("Events logged: 2");
    expect(output).toContain("Overrides: 0");
    expect(output).toContain("Detections: 0");
  });

  it("MAFTER-012: context exhaustion reported", () => {
    const tmp = mkdtempSync(join(tmpdir(), "trellis-ma-"));
    const runDir = join(tmp, "run");
    for (const sub of ["events", "overrides", "detections", "confidence"]) {
      mkdirSync(join(runDir, sub), { recursive: true });
    }
    const state = createInitialState("test-run", "myproject", "m1-test-goal", "abc");
    state.halted = true;
    state.halt_reason = "context exhaustion";
    writeState(runDir, state);
    appendEvent(runDir, { event: "run_started", stage: null, task: null, data: {} });
    appendEvent(runDir, { event: "context_exhaustion", stage: 9, task: "005", data: {} });
    const output = generateMorningAfter(runDir);
    expect(output).toContain("Context window exhaustion");
  });
});

describe("classifyResult", () => {
  it("returns SHIPPED for completed run", () => {
    const state = createInitialState("t", "p", "m", "h");
    state.stages["11"] = { status: "complete", started: null, completed: null, gate_passed: true };
    expect(classifyResult(state)).toBe("SHIPPED");
  });

  it("returns HALTED for halted run", () => {
    const state = createInitialState("t", "p", "m", "h");
    state.halted = true;
    expect(classifyResult(state)).toBe("HALTED");
  });
});

describe("calculateDuration", () => {
  it("computes duration from events", () => {
    const events = [
      { timestamp: "2026-01-01T00:00:00Z", event: "run_started" as const, stage: null, task: null, data: {} },
      { timestamp: "2026-01-01T02:30:00Z", event: "stage_complete" as const, stage: 11, task: null, data: {} },
    ];
    const { hours, minutes } = calculateDuration(events);
    expect(hours).toBe(2);
    expect(minutes).toBe(30);
  });

  it("returns 0 for no events", () => {
    const { hours, minutes } = calculateDuration([]);
    expect(hours).toBe(0);
    expect(minutes).toBe(0);
  });
});
