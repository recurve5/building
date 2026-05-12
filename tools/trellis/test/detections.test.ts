import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..");
const DETECTIONS_DIR = join(PROJECT_ROOT, ".building", "hooks", "detections");

function runDetection(
  script: string,
  runDir: string,
  taskId: string,
  milestoneDir: string,
): { exitCode: number; stderr: string } {
  try {
    execFileSync("bash", [join(DETECTIONS_DIR, script), runDir, taskId, milestoneDir], {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
      timeout: 10000,
    });
    return { exitCode: 0, stderr: "" };
  } catch (err: unknown) {
    const e = err as { stderr?: string; status?: number };
    return { exitCode: e.status ?? 1, stderr: e.stderr ?? "" };
  }
}

function makeFixture(): { runDir: string; milestoneDir: string } {
  const tmp = mkdtempSync(join(tmpdir(), "trellis-detect-"));
  const runDir = join(tmp, "run");
  const milestoneDir = join(tmp, "milestone");
  mkdirSync(join(runDir, "events"), { recursive: true });
  mkdirSync(join(runDir, "detections"), { recursive: true });
  mkdirSync(join(milestoneDir, "tasks"), { recursive: true });

  // Init a git repo for scope/dependency checks
  execSync("git init && git config user.email 'test@test.com' && git config user.name 'Test'", { cwd: tmp });
  writeFileSync(join(tmp, "init.txt"), "init");
  execSync("git add . && git commit -m 'init'", { cwd: tmp });

  return { runDir, milestoneDir };
}

describe("attempt-counter", () => {
  it("DETECT-005: fires at 3+ same errors", () => {
    const { runDir, milestoneDir } = makeFixture();
    for (let i = 1; i <= 3; i++) {
      writeFileSync(
        join(runDir, "events", `00${i}-task_failed.json`),
        JSON.stringify({ event: "task_failed", task: "003", stage: 9, timestamp: "2026-01-01T00:00:00Z", data: {} }),
      );
    }
    const { exitCode } = runDetection("attempt-counter.sh", runDir, "003", milestoneDir);
    expect(exitCode).not.toBe(0);
  });

  it("DETECT-006: does not fire at 2 occurrences", () => {
    const { runDir, milestoneDir } = makeFixture();
    for (let i = 1; i <= 2; i++) {
      writeFileSync(
        join(runDir, "events", `00${i}-task_failed.json`),
        JSON.stringify({ event: "task_failed", task: "003", stage: 9, timestamp: "2026-01-01T00:00:00Z", data: {} }),
      );
    }
    const { exitCode } = runDetection("attempt-counter.sh", runDir, "003", milestoneDir);
    expect(exitCode).toBe(0);
  });

  it("DETECT-007: scoped per-task", () => {
    const { runDir, milestoneDir } = makeFixture();
    // 3 failures but for different tasks
    writeFileSync(join(runDir, "events", "001-task_failed.json"), JSON.stringify({ event: "task_failed", task: "001", stage: 9, timestamp: "2026-01-01T00:00:00Z", data: {} }));
    writeFileSync(join(runDir, "events", "002-task_failed.json"), JSON.stringify({ event: "task_failed", task: "002", stage: 9, timestamp: "2026-01-01T00:00:00Z", data: {} }));
    writeFileSync(join(runDir, "events", "003-task_failed.json"), JSON.stringify({ event: "task_failed", task: "003", stage: 9, timestamp: "2026-01-01T00:00:00Z", data: {} }));
    const { exitCode } = runDetection("attempt-counter.sh", runDir, "001", milestoneDir);
    expect(exitCode).toBe(0);
  });
});

describe("decision-conflict", () => {
  it("DETECT-009: passes for non-contradicting entries", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "DECISIONS.md"), "# Decisions\n\n## Use TypeScript\n\nRationale: type safety.\n\n## Use ESM\n\nRationale: modern standard.\n");
    const { exitCode } = runDetection("decision-conflict.sh", runDir, "003", milestoneDir);
    expect(exitCode).toBe(0);
  });
});

describe("dependency-check", () => {
  it("DETECT-004: passes with no package.json changes", () => {
    const { runDir, milestoneDir } = makeFixture();
    writeFileSync(join(milestoneDir, "tasks", "003-test.md"), "# Task 003\n\n## Files\n\n- Create: `src/test.ts`\n");
    const { exitCode } = runDetection("dependency-check.sh", runDir, "003", milestoneDir);
    expect(exitCode).toBe(0);
  });
});
