import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..");
const SETUP_SCRIPT = join(PROJECT_ROOT, "tools", "install", "setup.js");

function makeTestHome(): string {
  return mkdtempSync(join(tmpdir(), "building-install-"));
}

function runSetup(home: string, cwd?: string): { exitCode: number; stdout: string; stderr: string } {
  const cmd = `node "${SETUP_SCRIPT}"`;
  try {
    const stdout = execSync(cmd, {
      cwd: cwd || PROJECT_ROOT,
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
      timeout: 60000,
    });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { exitCode: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("install script", () => {
  it("INST-001: creates ~/.building/ and ~/.building/projects/", () => {
    const home = makeTestHome();
    runSetup(home);
    expect(existsSync(join(home, ".building"))).toBe(true);
    expect(existsSync(join(home, ".building", "projects"))).toBe(true);
  });

  it("INST-002: creates skill file with correct BUILDING_HOME", () => {
    const home = makeTestHome();
    runSetup(home);
    const skillPath = join(home, ".claude", "skills", "build", "SKILL.md");
    expect(existsSync(skillPath)).toBe(true);
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toContain(`**BUILDING_HOME:** ${PROJECT_ROOT}`);
    expect(content).not.toContain("{{BUILDING_HOME}}");
  });

  it("INST-003: does NOT write hooks to ~/.claude/settings.json", () => {
    const home = makeTestHome();
    runSetup(home);
    const settingsPath = join(home, ".claude", "settings.json");
    if (existsSync(settingsPath)) {
      const content = readFileSync(settingsPath, "utf-8");
      expect(content).not.toContain("gate-check");
      expect(content).not.toContain("detection-check");
    }
  });

  it("INST-004: is idempotent", () => {
    const home = makeTestHome();
    const r1 = runSetup(home);
    expect(r1.exitCode).toBe(0);
    const r2 = runSetup(home);
    expect(r2.exitCode).toBe(0);
    const skillPath = join(home, ".claude", "skills", "build", "SKILL.md");
    expect(existsSync(skillPath)).toBe(true);
  });

  it("INST-006: skill file existence indicates success", () => {
    const home = makeTestHome();
    const { exitCode } = runSetup(home);
    const skillExists = existsSync(join(home, ".claude", "skills", "build", "SKILL.md"));
    if (exitCode === 0) {
      expect(skillExists).toBe(true);
    }
  });

  it("INST-007: creates ~/.claude/skills/ if absent", () => {
    const home = makeTestHome();
    expect(existsSync(join(home, ".claude", "skills"))).toBe(false);
    runSetup(home);
    expect(existsSync(join(home, ".claude", "skills", "build"))).toBe(true);
  });

  it("INST-008: root package.json has setup and uninstall scripts", () => {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf-8"));
    expect(pkg.scripts.setup).toContain("setup");
    expect(pkg.scripts.uninstall).toContain("uninstall");
  });
});
