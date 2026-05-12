import { describe, it, expect, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeOverride, addOverrideToState } from "../src/override.js";
import { createInitialState, writeState, readState } from "../src/state.js";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..");
const GATES_DIR = join(PROJECT_ROOT, ".building", "hooks", "gates");

function makeRunDir(): string {
  const tmp = mkdtempSync(join(tmpdir(), "trellis-override-"));
  const runDir = join(tmp, "run");
  mkdirSync(join(runDir, "events"), { recursive: true });
  mkdirSync(join(runDir, "overrides"), { recursive: true });
  mkdirSync(join(runDir, "detections"), { recursive: true });
  mkdirSync(join(runDir, "confidence"), { recursive: true });
  const state = createInitialState("test-run", "test", "m1-test", "abc");
  writeState(runDir, state);
  return runDir;
}

interface GateResult {
  gate: string;
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; message: string | null }>;
}

function runGate(
  script: string,
  runDir: string,
  milestoneDir: string,
): { result: GateResult; exitCode: number } {
  const cmd = `bash "${join(GATES_DIR, script)}" "${runDir}" "${milestoneDir}"`;
  try {
    const stdout = execSync(cmd, { cwd: PROJECT_ROOT, encoding: "utf-8" });
    return { result: JSON.parse(stdout.trim()), exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number };
    let result: GateResult;
    try {
      result = JSON.parse((e.stdout ?? "").trim());
    } catch {
      result = { gate: "", passed: false, checks: [] };
    }
    return { result, exitCode: e.status ?? 1 };
  }
}

describe("writeOverride", () => {
  it("creates override file with all required sections", () => {
    const runDir = makeRunDir();
    const filename = writeOverride(
      runDir, 2, "stage-2-to-3",
      ["prd-missing: PRD not found"],
      "PRD will be written in the next step",
      "Proceeding without PRD verification",
      "orchestrator",
    );

    expect(filename).toMatch(/^2-.+\.md$/);
    const content = readFileSync(join(runDir, "overrides", filename), "utf-8");
    expect(content).toContain("# Override: Stage 2");
    expect(content).toContain("**Gate:** stage-2-to-3");
    expect(content).toContain("**Overridden by:** orchestrator");
    expect(content).toContain("## What Failed");
    expect(content).toContain("## Justification");
    expect(content).toContain("## Risk Accepted");
  });
});

describe("addOverrideToState", () => {
  it("adds stage to overrides array", () => {
    const runDir = makeRunDir();
    addOverrideToState(runDir, 2);
    const state = readState(runDir);
    expect(state.overrides).toContain("2");
  });

  it("preserves existing state while adding override", () => {
    const runDir = makeRunDir();
    const originalState = readState(runDir);
    addOverrideToState(runDir, 3);
    const state = readState(runDir);
    expect(state.run_id).toBe(originalState.run_id);
    expect(state.project).toBe(originalState.project);
    expect(state.overrides).toContain("3");
  });

  it("does not duplicate existing override", () => {
    const runDir = makeRunDir();
    addOverrideToState(runDir, 2);
    addOverrideToState(runDir, 2);
    const state = readState(runDir);
    expect(state.overrides.filter((s) => s === "2")).toHaveLength(1);
  });
});

describe("gate override integration", () => {
  it("GATE-028: override allows a failing gate to pass", () => {
    const runDir = makeRunDir();
    const tmp = mkdtempSync(join(tmpdir(), "trellis-ms-"));
    // Gate 1->2 fails: no brief
    const { exitCode: failCode } = runGate("gate-1-to-2.sh", runDir, tmp);
    expect(failCode).not.toBe(0);

    // Add override
    writeOverride(runDir, 1, "stage-1-to-2", ["brief missing"], "test", "test", "user");
    addOverrideToState(runDir, 1);

    // Now gate should pass
    const { result, exitCode } = runGate("gate-1-to-2.sh", runDir, tmp);
    expect(result.passed).toBe(true);
    expect(exitCode).toBe(0);
    // But checks still show failures
    const failedChecks = result.checks.filter((c) => !c.passed);
    expect(failedChecks.length).toBeGreaterThan(0);
  });

  it("GATE-029: override fails with file missing but flag set", () => {
    const runDir = makeRunDir();
    const tmp = mkdtempSync(join(tmpdir(), "trellis-ms-"));
    // Set flag but no file
    addOverrideToState(runDir, 1);
    const { result, exitCode } = runGate("gate-1-to-2.sh", runDir, tmp);
    expect(result.passed).toBe(false);
    expect(exitCode).not.toBe(0);
  });

  it("GATE-030: override fails with file present but flag not set", () => {
    const runDir = makeRunDir();
    const tmp = mkdtempSync(join(tmpdir(), "trellis-ms-"));
    // Write file but no flag
    writeOverride(runDir, 1, "stage-1-to-2", ["brief missing"], "test", "test", "user");
    const { result, exitCode } = runGate("gate-1-to-2.sh", runDir, tmp);
    expect(result.passed).toBe(false);
    expect(exitCode).not.toBe(0);
  });
});
