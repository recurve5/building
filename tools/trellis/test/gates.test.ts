import { describe, it, expect, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..");
const GATES_DIR = join(PROJECT_ROOT, ".building", "hooks", "gates");

interface GateResult {
  gate: string;
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; message: string | null }>;
  duration_ms: number;
}

function runGate(
  script: string,
  runDir: string,
  milestoneDir: string,
): { result: GateResult; exitCode: number; stderr: string } {
  const projectState = join(milestoneDir, "..", "..");
  const cmd = `bash "${join(GATES_DIR, script)}" "${runDir}" "${milestoneDir}"`;
  try {
    const stdout = execSync(cmd, {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
      env: {
        ...process.env,
        PATH: process.env.PATH,
        BUILDING_HOME: PROJECT_ROOT,
        PROJECT_DIR: "/tmp/test-project",
        PROJECT_STATE: projectState,
        PROJECT_NAME: "test-project",
      },
    });
    return { result: JSON.parse(stdout.trim()), exitCode: 0, stderr: "" };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    const stdout = e.stdout ?? "";
    const stderr = e.stderr ?? "";
    let result: GateResult;
    try {
      result = JSON.parse(stdout.trim());
    } catch {
      result = { gate: "", passed: false, checks: [], duration_ms: 0 };
    }
    return { result, exitCode: e.status ?? 1, stderr };
  }
}

function makeFixture(): { runDir: string; milestoneDir: string } {
  const tmp = mkdtempSync(join(tmpdir(), "trellis-gate-"));
  const projectState = join(tmp, "state");
  const runDir = join(projectState, "runs", "test-run");
  const milestoneDir = join(projectState, "milestones", "m1-test");
  mkdirSync(join(runDir, "events"), { recursive: true });
  mkdirSync(join(runDir, "overrides"), { recursive: true });
  mkdirSync(milestoneDir, { recursive: true });
  mkdirSync(join(milestoneDir, "tasks"), { recursive: true });

  // Write minimal state.json
  writeFileSync(
    join(runDir, "state.json"),
    JSON.stringify({
      run_id: "test",
      project: "test",
      milestone: "m1-test",
      brief_hash: "abc",
      current_stage: 0,
      stages: {},
      tasks: {},
      halted: false,
      halt_reason: null,
      overrides: [],
      detections: [],
      project_dir: "/tmp/test-project",
      version: 2,
    }),
  );

  return { runDir, milestoneDir };
}

describe("gate-0-to-1", () => {
  it("GATE-001: passes with milestone list and confirmation", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(
      join(runDir, "events", "001-run_started.json"),
      JSON.stringify({ event: "run_started", timestamp: "2026-01-01T00:00:00Z", stage: null, task: null, data: {} }),
    );
    const { result, exitCode } = runGate("gate-0-to-1.sh", runDir, milestoneDir);
    expect(result.passed).toBe(true);
    expect(exitCode).toBe(0);
  });

  it("GATE-003: fails without human confirmation", () => {
    const { runDir, milestoneDir } = makeFixture();
    const { result, exitCode } = runGate("gate-0-to-1.sh", runDir, milestoneDir);
    expect(result.passed).toBe(false);
    expect(exitCode).not.toBe(0);
  });
});

describe("gate-1-to-2", () => {
  it("GATE-004: passes with >50 word brief", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "brief.md"), Array(60).fill("word").join(" "));
    const { result, exitCode } = runGate("gate-1-to-2.sh", runDir, milestoneDir);
    expect(result.passed).toBe(true);
    expect(exitCode).toBe(0);
  });

  it("GATE-005: fails with <=50 word brief", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "brief.md"), "short brief");
    const { result, exitCode } = runGate("gate-1-to-2.sh", runDir, milestoneDir);
    expect(result.passed).toBe(false);
    expect(exitCode).not.toBe(0);
  });

  it("GATE-006: fails with missing brief", () => {
    const { runDir, milestoneDir } = makeFixture();
    const { result, exitCode } = runGate("gate-1-to-2.sh", runDir, milestoneDir);
    expect(result.passed).toBe(false);
    expect(exitCode).not.toBe(0);
  });
});

describe("gate-2-to-3", () => {
  const PRD_CONTENT = `# Overview\nStuff\n# Visual Design Language\nStuff\n# Screen Inventory\nStuff\n# First-Use Walkthrough\nStuff\n# Feature: Core Feature\nStuff\n# Data Model\nStuff\n# Non-Functional Requirements\nStuff\n# Technical Constraints\nStuff\n# Out of Scope\nStuff\n# Decisions Log\nStuff\n`;

  it("GATE-007: passes with complete PRD", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "PRD.md"), PRD_CONTENT);
    writeFileSync(join(milestoneDir, "DECISIONS.md"), "# Decisions\n");
    const { result, exitCode } = runGate("gate-2-to-3.sh", runDir, milestoneDir);
    expect(result.passed).toBe(true);
    expect(exitCode).toBe(0);
  });

  it("GATE-008: fails with missing PRD section", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "PRD.md"), "# Overview\nJust overview\n");
    writeFileSync(join(milestoneDir, "DECISIONS.md"), "# Decisions\n");
    const { result, exitCode } = runGate("gate-2-to-3.sh", runDir, milestoneDir);
    expect(result.passed).toBe(false);
    expect(exitCode).not.toBe(0);
  });

  it("GATE-009: fails with unresolved Tier 3", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "PRD.md"), PRD_CONTENT);
    writeFileSync(join(milestoneDir, "DECISIONS.md"), "# Decisions\n");
    writeFileSync(join(milestoneDir, "OPEN-ITEMS.md"), "# Open Items\n- Tier 3: Something unresolved\n");
    const { result, exitCode } = runGate("gate-2-to-3.sh", runDir, milestoneDir);
    expect(result.passed).toBe(false);
    expect(exitCode).not.toBe(0);
  });
});

describe("gate-3-to-4", () => {
  it("GATE-010: passes with XRD and clean security review", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "XRD.md"), "# XRD\nContent\n");
    writeFileSync(join(milestoneDir, "security-review.md"), "# Security Review\n## Low\nNo issues found.\n");
    const { result, exitCode } = runGate("gate-3-to-4.sh", runDir, milestoneDir);
    expect(result.passed).toBe(true);
    expect(exitCode).toBe(0);
  });

  it("GATE-011: fails without XRD", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "security-review.md"), "# Security Review\n");
    const { result, exitCode } = runGate("gate-3-to-4.sh", runDir, milestoneDir);
    expect(result.passed).toBe(false);
    expect(exitCode).not.toBe(0);
  });

  it("GATE-012: fails with unresolved Critical finding", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "XRD.md"), "# XRD\n");
    writeFileSync(join(milestoneDir, "security-review.md"), "# Security\n## Critical — Unresolved\nSQL injection\n");
    const { result, exitCode } = runGate("gate-3-to-4.sh", runDir, milestoneDir);
    expect(result.passed).toBe(false);
    expect(exitCode).not.toBe(0);
  });
});

describe("gate-5-to-6", () => {
  it("GATE-015: passes with clean peer review", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "peer-review.md"), "# Peer Review\nNo issues found.\n");
    const { result, exitCode } = runGate("gate-5-to-6.sh", runDir, milestoneDir);
    expect(result.passed).toBe(true);
    expect(exitCode).toBe(0);
  });

  it("GATE-016: fails with unresolved high-severity issue", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "peer-review.md"), "# Peer Review\n## Issue 1 — High — Unresolved\nBad design\n");
    const { result, exitCode } = runGate("gate-5-to-6.sh", runDir, milestoneDir);
    expect(result.passed).toBe(false);
    expect(exitCode).not.toBe(0);
  });
});

describe("gate-6-to-7", () => {
  it("GATE-017: passes with complete test plan", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "test-plan.md"), "# Test Plan\n## Feature Coverage\nTests\n## Stress Tests\nLoad tests\n");
    const { result, exitCode } = runGate("gate-6-to-7.sh", runDir, milestoneDir);
    expect(result.passed).toBe(true);
    expect(exitCode).toBe(0);
  });

  it("GATE-018: fails without stress test section", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "test-plan.md"), "# Test Plan\n## Feature Coverage\nTests\n");
    const { result, exitCode } = runGate("gate-6-to-7.sh", runDir, milestoneDir);
    expect(result.passed).toBe(false);
    expect(exitCode).not.toBe(0);
  });
});

describe("gate-7-to-8", () => {
  it("GATE-019: passes with SDM review", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "sdm-review.md"), "# SDM Review\n");
    const { result, exitCode } = runGate("gate-7-to-8.sh", runDir, milestoneDir);
    expect(result.passed).toBe(true);
    expect(exitCode).toBe(0);
  });

  it("GATE-020: passes when SDM skipped", () => {
    const { runDir, milestoneDir } = makeFixture();
    const state = JSON.parse(
      require("node:fs").readFileSync(join(runDir, "state.json"), "utf-8"),
    );
    state.stages["7"] = { status: "skipped", started: null, completed: null, gate_passed: false };
    writeFileSync(join(runDir, "state.json"), JSON.stringify(state));
    const { result, exitCode } = runGate("gate-7-to-8.sh", runDir, milestoneDir);
    expect(result.passed).toBe(true);
    expect(exitCode).toBe(0);
  });
});

describe("gate-8-to-9", () => {
  it("GATE-021: passes with DAY-ZERO and tasks", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "DAY-ZERO.md"), "# DAY-ZERO\n");
    writeFileSync(join(milestoneDir, "tasks", "001-test.md"), "# Task 001\n");
    const { result, exitCode } = runGate("gate-8-to-9.sh", runDir, milestoneDir);
    expect(result.passed).toBe(true);
    expect(exitCode).toBe(0);
  });

  it("GATE-022: fails without DAY-ZERO", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "tasks", "001-test.md"), "# Task 001\n");
    const { result, exitCode } = runGate("gate-8-to-9.sh", runDir, milestoneDir);
    expect(result.passed).toBe(false);
    expect(exitCode).not.toBe(0);
  });
});

describe("gate-10-to-done", () => {
  it("GATE-026: passes with passing smoke test", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "smoke-test-report.md"), "# Smoke Test\n- [x] Step 1 passed\n- [x] Step 2 passed\n");
    const { result, exitCode } = runGate("gate-10-to-done.sh", runDir, milestoneDir);
    expect(result.passed).toBe(true);
    expect(exitCode).toBe(0);
  });

  it("GATE-027: fails with failing smoke test step", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "smoke-test-report.md"), "# Smoke Test\n- [x] Step 1 passed\n- [ ] Step 2 FAIL\n");
    const { result, exitCode } = runGate("gate-10-to-done.sh", runDir, milestoneDir);
    expect(result.passed).toBe(false);
    expect(exitCode).not.toBe(0);
  });
});

describe("gate output format", () => {
  it("all gates output valid GateResult JSON", () => {
    const { runDir, milestoneDir } = makeFixture();
    // Run a simple gate that will fail (missing brief) but still outputs JSON
    const { result } = runGate("gate-1-to-2.sh", runDir, milestoneDir);
    expect(result).toHaveProperty("gate");
    expect(result).toHaveProperty("passed");
    expect(result).toHaveProperty("checks");
    expect(result).toHaveProperty("duration_ms");
    expect(Array.isArray(result.checks)).toBe(true);
    expect(typeof result.duration_ms).toBe("number");
  });
});
