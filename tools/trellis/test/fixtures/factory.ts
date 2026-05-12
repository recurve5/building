import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface FixtureOptions {
  taskCount: number;
  eventCount: number;
  detectionCount: number;
  overrideCount: number;
  milestoneCount: number;
  halted?: boolean;
  haltStage?: number;
}

export function createFixtureRun(
  baseDir: string,
  options: FixtureOptions,
): string {
  const runId = "20260101T0000Z-fixture";
  const runDir = join(baseDir, ".building", "runs", runId);

  for (const sub of ["events", "overrides", "detections", "confidence"]) {
    mkdirSync(join(runDir, sub), { recursive: true });
  }

  const milestoneDir = join(baseDir, "m1-fixture-project");
  mkdirSync(join(milestoneDir, "tasks"), { recursive: true });

  const tasks: Record<string, { status: string; attempts: number }> = {};
  for (let i = 1; i <= options.taskCount; i++) {
    const id = String(i).padStart(3, "0");
    tasks[id] = { status: "complete", attempts: 1 };
    writeFileSync(
      join(milestoneDir, "tasks", `${id}-task.md`),
      `# Task ${id}\n\n## Files\n\n- Create: \`src/task-${id}.ts\`\n\n## Acceptance Criteria\n\n1. Works.\n`,
    );
  }

  const stages: Record<string, { status: string; started: string | null; completed: string | null; gate_passed: boolean }> = {};
  for (let s = 0; s <= 11; s++) {
    const stageStr = String(s);
    if (options.halted && options.haltStage !== undefined && s >= options.haltStage) {
      stages[stageStr] = { status: "not_started", started: null, completed: null, gate_passed: false };
    } else if (s <= 9) {
      stages[stageStr] = {
        status: "complete",
        started: "2026-01-01T00:00:00Z",
        completed: "2026-01-01T01:00:00Z",
        gate_passed: true,
      };
    } else {
      stages[stageStr] = { status: "not_started", started: null, completed: null, gate_passed: false };
    }
  }

  const state = {
    run_id: runId,
    project: "fixture",
    milestone: "m1-fixture-project",
    brief_hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    current_stage: options.halted && options.haltStage !== undefined ? options.haltStage : 9,
    stages,
    tasks,
    halted: options.halted ?? false,
    halt_reason: options.halted ? "Stress test halt" : null,
    overrides: [] as string[],
    detections: [] as string[],
    version: 1,
  };

  for (let i = 1; i <= options.eventCount; i++) {
    const num = String(i).padStart(3, "0");
    const event = {
      timestamp: "2026-01-01T00:00:00Z",
      event: i % 5 === 0 ? "task_failed" : "task_complete",
      stage: 9,
      task: String((i % options.taskCount) + 1).padStart(3, "0"),
      data: {},
    };
    writeFileSync(join(runDir, "events", `${num}-${event.event}.json`), JSON.stringify(event) + "\n");
  }

  for (let i = 1; i <= options.detectionCount; i++) {
    const num = String(i).padStart(3, "0");
    const filename = `${num}-detect.json`;
    const detection = {
      detection: `detect-${i}`,
      task: String((i % options.taskCount) + 1).padStart(3, "0"),
      severity: i % 3 === 0 ? "tier3" : "tier2",
      message: `Detection ${i} fired`,
      timestamp: "2026-01-01T00:00:00Z",
    };
    writeFileSync(join(runDir, "detections", filename), JSON.stringify(detection) + "\n");
    state.detections.push(filename);
  }

  for (let i = 1; i <= options.overrideCount; i++) {
    const stageNum = String(i);
    state.overrides.push(stageNum);
    writeFileSync(
      join(runDir, "overrides", `${stageNum}-override.md`),
      `# Override: Stage ${i}\n\n## Gate\n\nstage-${i - 1}-to-${i}\n\n## Failing Checks\n\n- check-${i}\n\n## Justification\n\nStress test override.\n\n## Rollback\n\ngit revert HEAD\n`,
    );
  }

  for (const artifact of ["prd", "xrd", "test-plan", "build", "security"]) {
    writeFileSync(
      join(runDir, "confidence", `${artifact}.json`),
      JSON.stringify({ artifact, level: "verified", reasons: ["fixture"] }) + "\n",
    );
  }

  writeFileSync(join(runDir, "state.json"), JSON.stringify(state, null, 2) + "\n");

  for (let m = 1; m <= options.milestoneCount; m++) {
    const mDir = join(baseDir, `m${m}-fixture-project`);
    if (m > 1) {
      mkdirSync(join(mDir, "tasks"), { recursive: true });
    }
    writeFileSync(join(mDir, "PRD.md"), `# PRD M${m}\n\nFixture PRD.\n`);
    writeFileSync(join(mDir, "XRD.md"), `# XRD M${m}\n\nFixture XRD.\n`);
    writeFileSync(join(mDir, "DECISIONS.md"), `# Decisions M${m}\n`);
  }

  return runDir;
}
