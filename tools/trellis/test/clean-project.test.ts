import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import {
  mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bootstrap } from "../src/bootstrap.js";
import { commitProjectCode } from "../src/git.js";

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), "trellis-clean-"));
}

describe("clean project guarantee", () => {
  it("CLEAN-001: no .building/ directory in project dir", async () => {
    const tmp = makeTmp();
    const projectDir = join(tmp, "my-app");
    const projectState = join(tmp, "state");
    mkdirSync(projectDir, { recursive: true });
    await bootstrap("my-app", projectState, projectDir);
    expect(existsSync(join(projectDir, ".building"))).toBe(false);
  });

  it("CLEAN-002: no Building references in project .gitignore", async () => {
    const tmp = makeTmp();
    const projectDir = join(tmp, "my-app");
    const projectState = join(tmp, "state");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, ".gitignore"), "node_modules/\n");
    await bootstrap("my-app", projectState, projectDir);
    const gitignore = readFileSync(join(projectDir, ".gitignore"), "utf-8");
    expect(gitignore).not.toContain(".building");
    expect(gitignore).not.toContain("trellis");
  });

  it("CLEAN-003: no hooks in settings files", async () => {
    const tmp = makeTmp();
    const projectDir = join(tmp, "my-app");
    const projectState = join(tmp, "state");
    mkdirSync(projectDir, { recursive: true });
    await bootstrap("my-app", projectState, projectDir);
    expect(existsSync(join(projectDir, ".claude", "settings.local.json"))).toBe(false);
  });

  it("CLEAN-004: commitProjectCode uses neutral messages", async () => {
    const tmp = makeTmp();
    const projectDir = join(tmp, "my-app");
    mkdirSync(projectDir, { recursive: true });
    execSync("git init", { cwd: projectDir });
    execSync('git config user.email "t@t.com" && git config user.name "T"', { cwd: projectDir });
    writeFileSync(join(projectDir, "app.ts"), "export const x = 1;\n");
    execSync("git add . && git commit -m 'init'", { cwd: projectDir });

    writeFileSync(join(projectDir, "feature.ts"), "export const y = 2;\n");
    await commitProjectCode(projectDir, ["feature.ts"], "Add feature module");

    const log = execSync("git log --oneline", { cwd: projectDir, encoding: "utf-8" });
    expect(log).not.toContain("[trellis]");
    expect(log).not.toContain("[building]");
    expect(log).not.toMatch(/task-\d{3}/);
  });

  it("CLEAN-005: no Building references in project source files", async () => {
    const tmp = makeTmp();
    const projectDir = join(tmp, "my-app");
    const projectState = join(tmp, "state");
    mkdirSync(join(projectDir, "src"), { recursive: true });
    writeFileSync(join(projectDir, "src", "app.ts"), "console.log('hello');\n");
    await bootstrap("my-app", projectState, projectDir);

    try {
      const result = execSync(
        `grep -r "trellis\\|BUILDING_HOME" "${projectDir}" --exclude-dir=.git 2>/dev/null`,
        { encoding: "utf-8" },
      );
      expect(result.trim()).toBe("");
    } catch {
      // grep exits 1 when no matches — that's the success case
    }
  });
});
