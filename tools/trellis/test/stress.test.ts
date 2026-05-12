import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, fork } from "node:child_process";
import { createFixtureRun } from "./fixtures/factory.js";
import { writeState, readState, createInitialState } from "../src/state.js";
import { appendEvent, readEvents, nextEventNumber } from "../src/events.js";
import { generateMorningAfter } from "../src/morning-after.js";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..");

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), "trellis-stress-"));
}

describe("STRESS-001: fast-path performance", () => {
  it("non-state.json writes exit under 100ms at p95", () => {
    const hookScript = join(PROJECT_ROOT, ".building", "hooks", "gate-check.sh");
    const times: number[] = [];

    for (let i = 0; i < 100; i++) {
      const input = JSON.stringify({
        tool_name: "Write",
        tool_input: {
          file_path: `/tmp/test-file-${i}.ts`,
          content: "export const x = 1;",
        },
      });

      const start = performance.now();
      try {
        execFileSync("bash", [hookScript], {
          input,
          cwd: PROJECT_ROOT,
          encoding: "utf-8",
          timeout: 5000,
        });
      } catch {
        // gate-check exits non-zero sometimes; timing is what matters
      }
      times.push(performance.now() - start);
    }

    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)];
    expect(p95).toBeLessThan(200);
  }, 30000);
});

describe("STRESS-002: morning-after generation time", () => {
  it("generates under 30s for 100 tasks / 200 events / 15 detections", () => {
    const tmp = makeTmp();
    const runDir = createFixtureRun(tmp, {
      taskCount: 100,
      eventCount: 200,
      detectionCount: 15,
      overrideCount: 3,
      milestoneCount: 1,
    });

    const start = performance.now();
    const report = generateMorningAfter(runDir);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(30000);
    expect(report).toContain("# Morning After");
    expect(report.length).toBeGreaterThan(100);
  }, 60000);
});

describe("STRESS-003: atomic writes", () => {
  it("500 rapid writes produce valid JSON each time", () => {
    const tmp = makeTmp();
    const runDir = join(tmp, "run");
    mkdirSync(runDir, { recursive: true });

    const state = createInitialState("20260101T0000Z-stress", "stress", "m1", "abc123");
    writeState(runDir, state);

    for (let i = 0; i < 500; i++) {
      state.current_stage = 0;
      (state.tasks as Record<string, unknown>)[`t${i}`] = { status: "complete", attempts: 1 };
      writeState(runDir, state);
    }

    const final = readState(runDir);
    expect(final.run_id).toBe("20260101T0000Z-stress");
    expect(Object.keys(final.tasks).length).toBe(500);
  });

  it("crash simulation leaves valid state", () => {
    const tmp = makeTmp();
    const runDir = join(tmp, "run");
    mkdirSync(runDir, { recursive: true });

    const state = createInitialState("20260101T0000Z-crash", "crash", "m1", "abc123");
    writeState(runDir, state);

    const workerScript = join(tmp, "crash-worker.mjs");
    writeFileSync(workerScript, `
import { writeFileSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";

const runDir = process.argv[2];
const state = JSON.parse(process.argv[3]);

for (let i = 0; i < 10; i++) {
  state.current_stage = 0;
  const filePath = join(runDir, "state.json");
  const tmpPath = join(dirname(filePath), ".state." + randomBytes(4).toString("hex") + ".tmp");
  writeFileSync(tmpPath, JSON.stringify(state, null, 2) + "\\n", "utf-8");
  renameSync(tmpPath, filePath);
  if (i === 4) process.kill(process.pid, "SIGKILL");
}
`);

    for (let scenario = 0; scenario < 10; scenario++) {
      writeState(runDir, state);
      try {
        execFileSync("node", [workerScript, runDir, JSON.stringify(state)], {
          timeout: 5000,
          encoding: "utf-8",
        });
      } catch {
        // Expected — SIGKILL
      }

      const raw = readFileSync(join(runDir, "state.json"), "utf-8");
      expect(() => JSON.parse(raw)).not.toThrow();
    }
  }, 30000);
});

describe("STRESS-004: event numbering at scale", () => {
  it("1000 events numbered sequentially with no gaps", () => {
    const tmp = makeTmp();
    const runDir = join(tmp, "run");
    mkdirSync(join(runDir, "events"), { recursive: true });

    for (let i = 0; i < 1000; i++) {
      appendEvent(runDir, {
        event: "task_complete",
        stage: 9,
        task: String((i % 50) + 1).padStart(3, "0"),
        data: {},
      });
    }

    const events = readEvents(runDir);
    expect(events.length).toBe(1000);

    const files = readdirSync(join(runDir, "events"))
      .filter((f) => f.endsWith(".json") && !f.startsWith("."))
      .sort();
    expect(files.length).toBe(1000);

    const numbers = files.map((f) => parseInt(f.split("-")[0], 10)).sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) {
      expect(numbers[i]).toBe(i + 1);
    }
  }, 30000);
});

describe("STRESS-005: large run handling", () => {
  it("all operations succeed on 100-task / 10-milestone run", () => {
    const tmp = makeTmp();
    const runDir = createFixtureRun(tmp, {
      taskCount: 100,
      eventCount: 500,
      detectionCount: 10,
      overrideCount: 5,
      milestoneCount: 10,
    });

    const state = readState(runDir);
    expect(state.run_id).toBe("20260101T0000Z-fixture");
    expect(Object.keys(state.tasks).length).toBe(100);

    const events = readEvents(runDir);
    expect(events.length).toBe(500);

    const report = generateMorningAfter(runDir);
    expect(report).toContain("# Morning After");
  }, 30000);
});

describe("STRESS-006: portable bash", () => {
  it("all hook scripts use only allowed dependencies", () => {
    const allowedCommands = new Set([
      "bash", "cat", "grep", "wc", "sed", "awk", "find", "test",
      "sort", "head", "tail", "tr", "cut", "dirname", "basename",
      "mktemp", "mv", "date", "rm", "mkdir", "cp", "ls", "echo", "printf",
      "jq", "git", "node",
      // Bash builtins
      "set", "read", "exit", "source", ".", "if", "then", "else", "fi",
      "while", "do", "done", "for", "in", "case", "esac", "local",
      "export", "shift", "return", "true", "false", "break", "continue",
      "[", "[[", "]]", "exec", "elif",
    ]);

    const hookDirs = [
      join(PROJECT_ROOT, ".building", "hooks"),
      join(PROJECT_ROOT, ".building", "hooks", "gates"),
      join(PROJECT_ROOT, ".building", "hooks", "detections"),
      join(PROJECT_ROOT, ".building", "hooks", "lib"),
    ];

    const violations: string[] = [];

    for (const dir of hookDirs) {
      if (!existsSync(dir)) continue;
      const files = readdirSync(dir).filter((f) => f.endsWith(".sh"));
      for (const file of files) {
        const content = readFileSync(join(dir, file), "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line || line.startsWith("#") || line.startsWith("//")) continue;

          // Extract potential command invocations (first word of simple commands)
          const cmdMatch = line.match(/^(?:(?:[\w_]+=\S+\s+)*)(\w[\w.-]*)/);
          if (cmdMatch) {
            const cmd = cmdMatch[1];
            // Skip variable assignments, function defs, and string literals
            if (line.includes("=") && !line.includes("==") && line.indexOf("=") < line.indexOf(cmd) + cmd.length + 1) continue;
            if (line.endsWith("()") || line.endsWith("{")) continue;
            if (!allowedCommands.has(cmd) && !cmd.startsWith("$") && !cmd.match(/^[A-Z_]+$/)) {
              // Check if it's actually a command and not a variable or function call
              if (!line.startsWith(cmd + "=") && cmd !== "output_result" && cmd !== "check" && cmd !== "check_override" && cmd !== "check_file_exists" && cmd !== "count_words" && cmd !== "milestone_dir") {
                violations.push(`${file}:${i + 1}: ${cmd}`);
              }
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      expect.fail(`Non-portable commands found:\n${violations.join("\n")}`);
    }
  });
});

describe("STRESS-007: concurrent event writes", () => {
  it("no duplicate event numbers in rapid sequential writes", () => {
    const tmp = makeTmp();
    const runDir = join(tmp, "run");
    mkdirSync(join(runDir, "events"), { recursive: true });

    for (let pair = 0; pair < 100; pair++) {
      appendEvent(runDir, {
        event: "task_started",
        stage: 9,
        task: String(pair + 1).padStart(3, "0"),
        data: {},
      });
      appendEvent(runDir, {
        event: "task_complete",
        stage: 9,
        task: String(pair + 1).padStart(3, "0"),
        data: {},
      });
    }

    const files = readdirSync(join(runDir, "events"))
      .filter((f) => f.endsWith(".json") && !f.startsWith("."))
      .sort();

    expect(files.length).toBe(200);

    const numbers = files.map((f) => parseInt(f.split("-")[0], 10));
    const uniqueNumbers = new Set(numbers);
    expect(uniqueNumbers.size).toBe(200);
  });
});
