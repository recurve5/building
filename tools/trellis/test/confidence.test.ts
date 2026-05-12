import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assessConfidence, writeConfidenceFiles } from "../src/confidence.js";
import { createInitialState, writeState } from "../src/state.js";
import { appendEvent } from "../src/events.js";

function makeRunDir(opts: { overrides?: string[]; detections?: boolean } = {}): string {
  const tmp = mkdtempSync(join(tmpdir(), "trellis-conf-"));
  const runDir = join(tmp, "run");
  for (const sub of ["events", "overrides", "detections", "confidence"]) {
    mkdirSync(join(runDir, sub), { recursive: true });
  }
  const state = createInitialState("test-run", "test", "m1-test", "abc");
  state.overrides = opts.overrides ?? [];
  writeState(runDir, state);

  appendEvent(runDir, { event: "run_started", stage: null, task: null, data: {} });

  if (opts.detections) {
    appendEvent(runDir, {
      event: "detection_fired",
      stage: 9,
      task: "003",
      data: { detection_name: "scope-creep", failure_mode: "scope-creep", severity: "tier2" },
    });
    state.detections.push("003-scope-creep.md");
    writeState(runDir, state);
  }

  return runDir;
}

describe("assessConfidence", () => {
  it("all verified for clean run", () => {
    const runDir = makeRunDir();
    const assessments = assessConfidence(runDir);
    expect(assessments).toHaveLength(5);
    expect(assessments.every((a) => a.level === "verified")).toBe(true);
  });

  it("partial when override used", () => {
    const runDir = makeRunDir({ overrides: ["3"] });
    const assessments = assessConfidence(runDir);
    const xrd = assessments.find((a) => a.artifact === "xrd")!;
    expect(xrd.level).toBe("partial");
    expect(xrd.reasons.length).toBeGreaterThan(0);
  });

  it("partial when detection fired", () => {
    const runDir = makeRunDir({ detections: true });
    const assessments = assessConfidence(runDir);
    const build = assessments.find((a) => a.artifact === "build")!;
    expect(build.level).toBe("partial");
  });
});

describe("writeConfidenceFiles", () => {
  it("writes per-artifact JSON files", () => {
    const runDir = makeRunDir();
    const files = writeConfidenceFiles(runDir);
    expect(files).toHaveLength(5);
    for (const f of files) {
      const content = JSON.parse(readFileSync(join(runDir, "confidence", f), "utf-8"));
      expect(content).toHaveProperty("artifact");
      expect(content).toHaveProperty("level");
      expect(content).toHaveProperty("reasons");
    }
  });
});
