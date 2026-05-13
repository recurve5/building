import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deriveProjectName } from "../src/paths.js";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..");
const GATE_CHECK = join(PROJECT_ROOT, ".building", "hooks", "gate-check.sh");
const DETECTION_CHECK = join(PROJECT_ROOT, ".building", "hooks", "detection-check.sh");
const COMMON_SH = join(PROJECT_ROOT, ".building", "hooks", "lib", "common.sh");

function makeEnvFixture(): {
  projectState: string;
  runDir: string;
  milestoneDir: string;
  stateJson: string;
  env: Record<string, string>;
} {
  const tmp = mkdtempSync(join(tmpdir(), "trellis-entry-"));
  const projectState = join(tmp, "project-state");
  const runDir = join(projectState, "runs", "test-run");
  const milestoneDir = join(projectState, "milestones", "m1-test");
  mkdirSync(join(runDir, "events"), { recursive: true });
  mkdirSync(join(runDir, "overrides"), { recursive: true });
  mkdirSync(join(runDir, "detections"), { recursive: true });
  mkdirSync(milestoneDir, { recursive: true });
  mkdirSync(join(milestoneDir, "tasks"), { recursive: true });

  const stateJson = join(runDir, "state.json");
  writeFileSync(
    stateJson,
    JSON.stringify({
      run_id: "test-run",
      project: "test-project",
      milestone: "m1-test",
      brief_hash: "abc",
      current_stage: 0,
      stages: {},
      tasks: {},
      halted: false,
      halt_reason: null,
      overrides: [],
      detections: [],
      project_dir: "/home/user/test-project",
      version: 2,
    }),
  );

  const env: Record<string, string> = {
    BUILDING_HOME: PROJECT_ROOT,
    PROJECT_DIR: "/home/user/test-project",
    PROJECT_STATE: projectState,
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || "",
  };

  return { projectState, runDir, milestoneDir, stateJson, env };
}

describe("gate-check.sh entry point", () => {
  it("GATE-ENTRY-001: uses env vars for path resolution", () => {
    const { runDir, stateJson, env } = makeEnvFixture();
    writeFileSync(
      join(runDir, "events", "001-run_started.json"),
      JSON.stringify({ event: "run_started", timestamp: "2026-01-01T00:00:00Z", stage: null, task: null, data: {} }),
    );

    const cmd = `bash "${GATE_CHECK}" 0 1 "${stateJson}"`;
    const result = execSync(cmd, { env, encoding: "utf-8" });
    const parsed = JSON.parse(result.trim());
    expect(parsed.gate).toBe("stage-0-to-1");
  });

  it("GATE-ENTRY-002: does not read stdin", () => {
    const content = readFileSync(GATE_CHECK, "utf-8");
    expect(content).not.toContain("$(cat)");
    expect(content).not.toContain("INPUT=$(cat");
  });

  it("GATE-ENTRY-003: no active-run guard", () => {
    const content = readFileSync(GATE_CHECK, "utf-8");
    expect(content).not.toContain("active-run");
    expect(content).not.toContain("fast path");
  });

  it("GATE-ENTRY-004: exports PROJECT_NAME for child scripts", () => {
    const content = readFileSync(GATE_CHECK, "utf-8");
    expect(content).toContain("resolve_project_paths");
  });

  it("blocks backward stage movement", () => {
    const { stateJson, env } = makeEnvFixture();
    const state = JSON.parse(readFileSync(stateJson, "utf-8"));
    state.current_stage = 3;
    writeFileSync(stateJson, JSON.stringify(state));

    try {
      execSync(`bash "${GATE_CHECK}" 3 2 "${stateJson}"`, { env, encoding: "utf-8" });
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const e = err as { stderr?: string; status?: number };
      expect(e.status).toBe(2);
      expect(e.stderr).toContain("backward");
    }
  });

  it("blocks stage advancement when halted", () => {
    const { stateJson, env } = makeEnvFixture();
    const state = JSON.parse(readFileSync(stateJson, "utf-8"));
    state.halted = true;
    state.halt_reason = "test halt";
    writeFileSync(stateJson, JSON.stringify(state));

    try {
      execSync(`bash "${GATE_CHECK}" 0 1 "${stateJson}"`, { env, encoding: "utf-8" });
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const e = err as { stderr?: string; status?: number };
      expect(e.status).toBe(2);
      expect(e.stderr).toContain("halted");
    }
  });
});

describe("detection-check.sh entry point", () => {
  it("GATE-ENTRY-005: mirrors gate-check env var usage", () => {
    const content = readFileSync(DETECTION_CHECK, "utf-8");
    expect(content).toContain("resolve_project_paths");
    expect(content).not.toContain("$(cat)");
    expect(content).not.toContain("git rev-parse");
  });
});

describe("common.sh resolve_project_paths", () => {
  it("GATE-ENTRY-006: validates env vars and derives PROJECT_NAME", () => {
    const cmd = `source "${COMMON_SH}" && BUILDING_HOME=/test PROJECT_DIR=/home/user/My-Project PROJECT_STATE=/state resolve_project_paths && echo "$PROJECT_NAME"`;
    const result = execSync(`bash -c '${cmd}'`, { encoding: "utf-8" });
    expect(result.trim()).toBe("my-project");
  });

  it("fails when env vars are missing", () => {
    const cmd = `source "${COMMON_SH}" && resolve_project_paths`;
    try {
      execSync(`bash -c '${cmd}'`, { encoding: "utf-8", env: { PATH: process.env.PATH } });
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const e = err as { stderr?: string; status?: number };
      expect(e.stderr).toContain("BUILDING_HOME");
    }
  });
});

describe("PATH-010: bash/TypeScript sanitization parity", () => {
  const D012_MATRIX: Array<{ input: string; expected: string | "ERROR" }> = [
    { input: "fitness-tracker", expected: "fitness-tracker" },
    { input: "MyApp", expected: "myapp" },
    { input: "My Cool App", expected: "my-cool-app" },
    { input: "my;rm -rf ~/", expected: "myrm-rf" },
    { input: "---app---", expected: "app" },
    { input: "UPPER_case", expected: "upper-case" },
    { input: "app.v2", expected: "appv2" },
    { input: "!!!", expected: "ERROR" },
    { input: "a", expected: "a" },
    { input: "my--app", expected: "my-app" },
  ];

  for (const { input, expected } of D012_MATRIX) {
    it(`"${input}" -> "${expected}" (both layers)`, () => {
      // TypeScript
      if (expected === "ERROR") {
        expect(() => deriveProjectName(`/test/${input}`)).toThrow();
      } else {
        expect(deriveProjectName(`/test/${input}`)).toBe(expected);
      }

      // Bash
      const cmd = `source "${COMMON_SH}" && derive_project_name "/test/${input.replace(/"/g, '\\"')}"`;
      if (expected === "ERROR") {
        try {
          execSync(`bash -c '${cmd}'`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
          expect.unreachable("bash should have failed");
        } catch {
          // expected
        }
      } else {
        const result = execSync(`bash -c '${cmd}'`, { encoding: "utf-8" }).trim();
        expect(result).toBe(expected);
      }
    });
  }
});
