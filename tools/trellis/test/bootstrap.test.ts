import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { bootstrap } from "../src/bootstrap.js";

function makeTmp(): { projectState: string; projectDir: string } {
  const tmp = mkdtempSync(join(tmpdir(), "trellis-boot-"));
  return {
    projectState: join(tmp, "state"),
    projectDir: join(tmp, "project"),
  };
}

describe("bootstrap", () => {
  it("BOOT-001: creates correct directory structure", async () => {
    const { projectState, projectDir } = makeTmp();
    mkdirSync(projectDir, { recursive: true });
    const result = await bootstrap("test-project", projectState, projectDir);
    expect(result.alreadyBootstrapped).toBe(false);
    expect(existsSync(projectState)).toBe(true);
    expect(existsSync(join(projectState, "runs"))).toBe(true);
    expect(existsSync(join(projectState, "milestones"))).toBe(true);
  });

  it("BOOT-002: writes project.lock with correct content", async () => {
    const { projectState, projectDir } = makeTmp();
    mkdirSync(projectDir, { recursive: true });
    await bootstrap("test-project", projectState, projectDir);
    const lock = JSON.parse(readFileSync(join(projectState, "project.lock"), "utf-8"));
    expect(lock.project_dir).toBe(projectDir);
    expect(lock.project_name).toBe("test-project");
    expect(lock.created).toBeTruthy();
  });

  it("BOOT-003: detects collision via lockfile mismatch", async () => {
    const { projectState, projectDir } = makeTmp();
    mkdirSync(projectDir, { recursive: true });
    await bootstrap("test-project", projectState, projectDir);
    await expect(
      bootstrap("test-project", projectState, "/different/path"),
    ).rejects.toThrow("already in use");
  });

  it("BOOT-004: passes when projectDir matches lockfile", async () => {
    const { projectState, projectDir } = makeTmp();
    mkdirSync(projectDir, { recursive: true });
    await bootstrap("test-project", projectState, projectDir);
    const result = await bootstrap("test-project", projectState, projectDir);
    expect(result.alreadyBootstrapped).toBe(true);
    expect(result.created).toHaveLength(0);
  });

  it("BOOT-005: is idempotent — DECISIONS.md preserved on re-run", async () => {
    const { projectState, projectDir } = makeTmp();
    mkdirSync(projectDir, { recursive: true });
    await bootstrap("test-project", projectState, projectDir);
    writeFileSync(join(projectState, "DECISIONS.md"), "# Decisions Log\n\n## D1: Custom decision\n");
    const result = await bootstrap("test-project", projectState, projectDir);
    expect(result.alreadyBootstrapped).toBe(true);
    const content = readFileSync(join(projectState, "DECISIONS.md"), "utf-8");
    expect(content).toContain("Custom decision");
  });

  it("BOOT-006: does NOT create .building/ in project directory", async () => {
    const { projectState, projectDir } = makeTmp();
    mkdirSync(projectDir, { recursive: true });
    await bootstrap("test-project", projectState, projectDir);
    expect(existsSync(join(projectDir, ".building"))).toBe(false);
  });

  it("BOOT-007: does NOT write to .claude/settings.local.json", async () => {
    const { projectState, projectDir } = makeTmp();
    mkdirSync(projectDir, { recursive: true });
    await bootstrap("test-project", projectState, projectDir);
    expect(existsSync(join(projectDir, ".claude", "settings.local.json"))).toBe(false);
  });

  it("BOOT-008: does NOT commit to git", async () => {
    const { projectState, projectDir } = makeTmp();
    mkdirSync(projectDir, { recursive: true });
    execSync("git init", { cwd: projectDir });
    execSync("git config user.email test@test.com && git config user.name Test", { cwd: projectDir });
    writeFileSync(join(projectDir, "README.md"), "# Test\n");
    execSync("git add . && git commit -m 'init'", { cwd: projectDir });
    const beforeHash = execSync("git rev-parse HEAD", { cwd: projectDir, encoding: "utf-8" }).trim();
    await bootstrap("test-project", projectState, projectDir);
    const afterHash = execSync("git rev-parse HEAD", { cwd: projectDir, encoding: "utf-8" }).trim();
    expect(afterHash).toBe(beforeHash);
  });

  it("BOOT-009: BootstrapResult has correct shape", async () => {
    const { projectState, projectDir } = makeTmp();
    mkdirSync(projectDir, { recursive: true });
    const result = await bootstrap("test-project", projectState, projectDir);
    expect(result).toHaveProperty("created");
    expect(result).toHaveProperty("alreadyBootstrapped");
    expect(Array.isArray(result.created)).toBe(true);
    expect(result).not.toHaveProperty("hooksInstalled");
    expect(result).not.toHaveProperty("dependenciesInstalled");
    expect(result).not.toHaveProperty("commitHash");
  });

  it("writes stub DECISIONS.md and OPEN-ITEMS.md", async () => {
    const { projectState, projectDir } = makeTmp();
    mkdirSync(projectDir, { recursive: true });
    await bootstrap("test-project", projectState, projectDir);
    expect(readFileSync(join(projectState, "DECISIONS.md"), "utf-8")).toBe("# Decisions Log\n");
    expect(readFileSync(join(projectState, "OPEN-ITEMS.md"), "utf-8")).toBe("# Open Items\n");
  });
});
