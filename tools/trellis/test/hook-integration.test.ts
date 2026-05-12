import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createInitialState } from "../src/state.js";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..");
const HOOK_SCRIPT = join(PROJECT_ROOT, ".building", "hooks", "gate-check.sh");

function runHook(
  filePath: string,
  content: string,
): { exitCode: number; stdout: string; stderr: string } {
  const input = JSON.stringify({
    tool_name: "Write",
    tool_input: { file_path: filePath, content },
    hook_event_name: "PreToolUse",
    cwd: PROJECT_ROOT,
    session_id: "test",
    transcript_path: "/tmp/test.jsonl",
    permission_mode: "default",
    tool_use_id: "test",
  });

  try {
    const stdout = execFileSync("bash", [HOOK_SCRIPT], {
      input,
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
      timeout: 10000,
    });
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

describe("gate-check.sh fast path", () => {
  it("HOOK-002: exits 0 immediately for non-state.json writes", () => {
    const { exitCode } = runHook("/tmp/some-file.txt", "hello");
    expect(exitCode).toBe(0);
  });

  it("fast path completes under 100ms", () => {
    const start = performance.now();
    runHook("/tmp/some-file.txt", "hello");
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});

describe("gate-check.sh state transitions", () => {
  function makeRunDir(stage: number, halted = false): string {
    const tmp = mkdtempSync(join(tmpdir(), "trellis-hook-"));
    // Create path that matches the .building/runs/<id>/state.json pattern
    const runDir = join(tmp, ".building", "runs", "test-run");
    mkdirSync(join(runDir, "events"), { recursive: true });
    mkdirSync(join(runDir, "overrides"), { recursive: true });

    const state = createInitialState("test-run", "test", "m1-trellis-governance-layer", "abc");
    state.current_stage = stage;
    if (halted) {
      state.halted = true;
      state.halt_reason = "test halt";
    }
    writeFileSync(join(runDir, "state.json"), JSON.stringify(state, null, 2));
    return runDir;
  }

  it("HOOK-005: allows state.json writes that don't change stage", () => {
    const runDir = makeRunDir(5);
    const newState = createInitialState("test-run", "test", "m1-trellis-governance-layer", "abc");
    newState.current_stage = 5;
    newState.tasks["001"] = { status: "complete", attempts: 1 };
    const { exitCode } = runHook(
      join(runDir, "state.json"),
      JSON.stringify(newState, null, 2),
    );
    expect(exitCode).toBe(0);
  });

  it("allows first write to state.json (file doesn't exist yet)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "trellis-hook-"));
    const runDir = join(tmp, ".building", "runs", "new-run");
    mkdirSync(runDir, { recursive: true });
    const state = createInitialState("new-run", "test", "m1-test", "abc");
    const { exitCode } = runHook(
      join(runDir, "state.json"),
      JSON.stringify(state),
    );
    expect(exitCode).toBe(0);
  });

  it("STATE-012: blocks stage skip", () => {
    const runDir = makeRunDir(2);
    const newState = createInitialState("test-run", "test", "m1-trellis-governance-layer", "abc");
    newState.current_stage = 5;
    const { exitCode, stderr } = runHook(
      join(runDir, "state.json"),
      JSON.stringify(newState),
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("skip");
  });

  it("STATE-013: blocks backward transition", () => {
    const runDir = makeRunDir(5);
    const newState = createInitialState("test-run", "test", "m1-trellis-governance-layer", "abc");
    newState.current_stage = 3;
    const { exitCode, stderr } = runHook(
      join(runDir, "state.json"),
      JSON.stringify(newState),
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("backward");
  });

  it("STATE-014: blocks advance from halted", () => {
    const runDir = makeRunDir(3, true);
    const newState = createInitialState("test-run", "test", "m1-trellis-governance-layer", "abc");
    newState.current_stage = 4;
    const { exitCode, stderr } = runHook(
      join(runDir, "state.json"),
      JSON.stringify(newState),
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("halt");
  });
});
