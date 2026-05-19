import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import {
  mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bootstrap } from "../src/bootstrap.js";
import { createInitialState, writeState } from "../src/state.js";
import { createRunDirectory, generateRunId } from "../src/run.js";
import { commitProjectCode } from "../src/git.js";

const BUILDING_HOME = join(import.meta.dirname, "..", "..", "..");
const GATE_CHECK = join(BUILDING_HOME, ".building", "hooks", "gate-check.sh");
const DETECTION_CHECK = join(BUILDING_HOME, ".building", "hooks", "detection-check.sh");

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), "trellis-int-"));
}

function makeEnv(projectState: string, projectDir: string): Record<string, string> {
  return {
    BUILDING_HOME,
    PROJECT_DIR: projectDir,
    PROJECT_STATE: projectState,
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || "",
  };
}

describe("INT-001: full install -> bootstrap -> gate -> clean flow", () => {
  it("end-to-end flow works", async () => {
    const tmp = makeTmp();
    const projectDir = join(tmp, "my-project");
    mkdirSync(projectDir, { recursive: true });

    // Bootstrap
    const result = await bootstrap("my-project", join(tmp, "state"), projectDir);
    expect(result.alreadyBootstrapped).toBe(false);
    const projectState = join(tmp, "state");

    // Create milestone
    const milestoneDir = join(projectState, "milestones", "m1-test");
    mkdirSync(join(milestoneDir, "tasks"), { recursive: true });

    // Create a run
    const runId = generateRunId("test brief");
    const runDir = createRunDirectory(projectState, runId);
    const state = createInitialState(runId, "my-project", "m1-test", "abc", projectDir);
    writeState(runDir, state);

    // Write run_started event
    writeFileSync(
      join(runDir, "events", "001-run_started.json"),
      JSON.stringify({ event: "run_started", timestamp: new Date().toISOString(), stage: null, task: null, data: {} }),
    );

    // Invoke gate-check for stage 0->1
    const env = makeEnv(projectState, projectDir);
    const stateJson = join(runDir, "state.json");
    const cmd = `bash "${GATE_CHECK}" 0 1 "${stateJson}"`;
    const output = execSync(cmd, { env, encoding: "utf-8" });
    const gateResult = JSON.parse(output.trim());
    expect(gateResult.gate).toBe("stage-0-to-1");

    // Project directory is clean
    expect(existsSync(join(projectDir, ".building"))).toBe(false);
    const files = readdirSync(projectDir);
    expect(files).toHaveLength(0);
  });
});

describe("INT-002: gate script env var requirements", () => {
  it("fails with missing env vars", () => {
    const tmp = makeTmp();
    const stateJson = join(tmp, "state.json");
    writeFileSync(stateJson, "{}");
    try {
      execSync(`bash "${GATE_CHECK}" 0 1 "${stateJson}"`, {
        env: { PATH: process.env.PATH },
        encoding: "utf-8",
      });
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const e = err as { stderr?: string; status?: number };
      expect(e.status).not.toBe(0);
    }
  });
});

describe("INT-003: bootstrap collision detection", () => {
  it("second bootstrap from different path fails", async () => {
    const tmp = makeTmp();
    const projectState = join(tmp, "state");
    await bootstrap("api", projectState, "/path/a/api");
    await expect(bootstrap("api", projectState, "/path/b/api")).rejects.toThrow("already in use");
  });
});

describe("INT-005: install/uninstall cycle", () => {
  it("uninstall removes skill, preserves state", async () => {
    const home = makeTmp();
    const projectState = join(home, ".building", "projects", "test");

    // Simulate install artifacts
    const skillDir = join(home, ".claude", "skills", "build");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "test");

    // Create project state
    await bootstrap("test", projectState, "/tmp/test");

    // Run uninstall
    const uninstallScript = join(BUILDING_HOME, "tools", "install", "uninstall.js");
    execSync(`node "${uninstallScript}"`, {
      env: { ...process.env, HOME: home },
      encoding: "utf-8",
    });

    expect(existsSync(skillDir)).toBe(false);
    expect(existsSync(join(projectState, "project.lock"))).toBe(true);
  });
});
