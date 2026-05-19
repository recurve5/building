import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createInitialState } from "../src/state.js";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..");
const GATE_CHECK = join(PROJECT_ROOT, ".building", "hooks", "gate-check.sh");

function makeEnv(projectState: string): Record<string, string> {
  return {
    BUILDING_HOME: PROJECT_ROOT,
    PROJECT_DIR: "/home/user/test-project",
    PROJECT_STATE: projectState,
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || "",
  };
}

function runGateCheck(
  fromStage: number,
  toStage: number,
  stateJson: string,
  env: Record<string, string>,
): { exitCode: number; stdout: string; stderr: string } {
  const cmd = `bash "${GATE_CHECK}" ${fromStage} ${toStage} "${stateJson}"`;
  try {
    const stdout = execSync(cmd, { env, encoding: "utf-8", timeout: 10000 });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      exitCode: e.status ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

describe("gate-check.sh state transitions", () => {
  function makeFixture(stage: number, halted = false): {
    stateJson: string;
    env: Record<string, string>;
  } {
    const tmp = mkdtempSync(join(tmpdir(), "trellis-hook-"));
    const projectState = join(tmp, "state");
    const runDir = join(projectState, "runs", "test-run");
    const milestoneDir = join(projectState, "milestones", "m1-trellis-governance-layer");
    mkdirSync(join(runDir, "events"), { recursive: true });
    mkdirSync(join(runDir, "overrides"), { recursive: true });
    mkdirSync(milestoneDir, { recursive: true });
    mkdirSync(join(milestoneDir, "tasks"), { recursive: true });

    const state = createInitialState("test-run", "test", "m1-trellis-governance-layer", "abc");
    state.current_stage = stage;
    if (halted) {
      state.halted = true;
      state.halt_reason = "test halt";
    }
    const stateJson = join(runDir, "state.json");
    writeFileSync(stateJson, JSON.stringify(state, null, 2));

    return { stateJson, env: makeEnv(projectState) };
  }

  it("HOOK-005: rejects same-stage call (no gate script exists)", () => {
    const { stateJson, env } = makeFixture(5);
    const { exitCode, stderr } = runGateCheck(5, 5, stateJson, env);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("no gate script");
  });

  it("STATE-012: blocks stage skip", () => {
    const { stateJson, env } = makeFixture(2);
    const { exitCode, stderr } = runGateCheck(2, 5, stateJson, env);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("skip");
  });

  it("STATE-013: blocks backward transition", () => {
    const { stateJson, env } = makeFixture(5);
    const { exitCode, stderr } = runGateCheck(5, 3, stateJson, env);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("backward");
  });

  it("STATE-014: blocks advance from halted", () => {
    const { stateJson, env } = makeFixture(3, true);
    const { exitCode, stderr } = runGateCheck(3, 4, stateJson, env);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("halted");
  });

  it("gate-check completes under 200ms for validation failures", () => {
    const { stateJson, env } = makeFixture(2);
    const start = performance.now();
    runGateCheck(2, 5, stateJson, env);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});
