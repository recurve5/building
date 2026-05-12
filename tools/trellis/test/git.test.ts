import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { commitStageComplete, commitHalt } from "../src/git.js";

function makeGitRepo(): string {
  const tmp = mkdtempSync(join(tmpdir(), "trellis-git-"));
  execSync("git init", { cwd: tmp });
  execSync('git config user.email "test@test.com"', { cwd: tmp });
  execSync('git config user.name "Test"', { cwd: tmp });
  writeFileSync(join(tmp, "init.txt"), "init");
  execSync("git add init.txt && git commit -m 'init'", { cwd: tmp });
  return tmp;
}

describe("commitStageComplete", () => {
  it("creates commit with correct message format", () => {
    const repo = makeGitRepo();
    const file = join(repo, "artifact.md");
    writeFileSync(file, "# Test Artifact\n");
    const result = commitStageComplete(repo, 2, "PRD", [file]);
    expect(result.message).toBe("[trellis] Stage 2 complete: PRD");
    expect(result.hash).toMatch(/^[a-f0-9]{40}$/);

    const log = execSync("git log --oneline -1", { cwd: repo, encoding: "utf-8" });
    expect(log).toContain("[trellis] Stage 2 complete: PRD");
  });
});

describe("commitHalt", () => {
  it("creates halt commit", () => {
    const repo = makeGitRepo();
    const stateFile = join(repo, "state.json");
    writeFileSync(stateFile, '{"halted": true}');
    const result = commitHalt(repo, stateFile, "Tier 3 detection");
    expect(result.message).toContain("[trellis] Halted:");
  });
});
