import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { commitProjectCode } from "../src/git.js";
import * as gitModule from "../src/git.js";

function makeGitRepo(): string {
  const tmp = mkdtempSync(join(tmpdir(), "trellis-git-"));
  execSync("git init", { cwd: tmp });
  execSync('git config user.email "test@test.com"', { cwd: tmp });
  execSync('git config user.name "Test"', { cwd: tmp });
  writeFileSync(join(tmp, "init.txt"), "init");
  execSync("git add init.txt && git commit -m 'init'", { cwd: tmp });
  return tmp;
}

describe("commitProjectCode", () => {
  it("GIT-001: commits in the project repo", async () => {
    const repo = makeGitRepo();
    const file = join(repo, "feature.ts");
    writeFileSync(file, "export const x = 1;\n");
    const result = await commitProjectCode(repo, [file], "Add feature module");
    expect(result.hash).toMatch(/^[a-f0-9]{40}$/);
    expect(result.filesCommitted).toContain(file);

    const log = execSync("git log --oneline -1", { cwd: repo, encoding: "utf-8" });
    expect(log).toContain("Add feature module");
  });

  it("GIT-002: commit messages use neutral developer conventions", async () => {
    const repo = makeGitRepo();
    const file = join(repo, "readme.md");
    writeFileSync(file, "# README\n");
    const result = await commitProjectCode(repo, [file], "Add project readme");

    const log = execSync("git log --oneline -1", { cwd: repo, encoding: "utf-8" });
    expect(log).not.toContain("[trellis]");
    expect(log).not.toContain("[building]");
    expect(log).toContain("Add project readme");
  });

  it("returns empty result for no files", async () => {
    const repo = makeGitRepo();
    const result = await commitProjectCode(repo, [], "No changes");
    expect(result.hash).toBe("");
    expect(result.filesCommitted).toHaveLength(0);
  });
});

describe("GIT-003: old state-commit functions removed", () => {
  it("does not export commitRunStart", () => {
    expect("commitRunStart" in gitModule).toBe(false);
  });

  it("does not export commitStageComplete", () => {
    expect("commitStageComplete" in gitModule).toBe(false);
  });

  it("does not export commitHalt", () => {
    expect("commitHalt" in gitModule).toBe(false);
  });

  it("does not export commitOverride", () => {
    expect("commitOverride" in gitModule).toBe(false);
  });

  it("does not export commitMorningAfter", () => {
    expect("commitMorningAfter" in gitModule).toBe(false);
  });
});
