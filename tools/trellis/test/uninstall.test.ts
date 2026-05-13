import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..");
const UNINSTALL_SCRIPT = join(PROJECT_ROOT, "tools", "install", "uninstall.js");

function runUninstall(home: string): { exitCode: number; stdout: string } {
  try {
    const stdout = execSync(`node "${UNINSTALL_SCRIPT}"`, {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });
    return { exitCode: 0, stdout };
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number };
    return { exitCode: e.status ?? 1, stdout: e.stdout ?? "" };
  }
}

function installFixture(home: string): void {
  const skillDir = join(home, ".claude", "skills", "build");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "# /build\ntest content\n");
  const stateDir = join(home, ".building", "projects", "test-project", "runs");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(
    join(home, ".building", "projects", "test-project", "project.lock"),
    '{"project_dir": "/test"}',
  );
}

describe("uninstall script", () => {
  it("UNINST-001: removes skill file directory", () => {
    const home = mkdtempSync(join(tmpdir(), "building-uninst-"));
    installFixture(home);
    expect(existsSync(join(home, ".claude", "skills", "build", "SKILL.md"))).toBe(true);
    const { exitCode } = runUninstall(home);
    expect(exitCode).toBe(0);
    expect(existsSync(join(home, ".claude", "skills", "build"))).toBe(false);
  });

  it("UNINST-002: preserves project state", () => {
    const home = mkdtempSync(join(tmpdir(), "building-uninst-"));
    installFixture(home);
    runUninstall(home);
    expect(existsSync(join(home, ".building", "projects", "test-project", "project.lock"))).toBe(true);
  });

  it("UNINST-003: safe when already uninstalled", () => {
    const home = mkdtempSync(join(tmpdir(), "building-uninst-"));
    const { exitCode, stdout } = runUninstall(home);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("not installed");
  });
});
