import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..");
const TEMPLATE = readFileSync(join(PROJECT_ROOT, "tools", "install", "skill-template.md"), "utf-8");

function interpolate(template: string, buildingHome: string): string {
  return template.replace(/\{\{BUILDING_HOME\}\}/g, buildingHome);
}

describe("skill template", () => {
  const TEST_PATH = "/Users/dev/building";
  const interpolated = interpolate(TEMPLATE, TEST_PATH);

  it("SKILL-001: contains correct BUILDING_HOME after interpolation", () => {
    expect(interpolated).toContain(`**BUILDING_HOME:** ${TEST_PATH}`);
    expect(interpolated).not.toContain("{{BUILDING_HOME}}");
  });

  it("SKILL-002: references orchestrator.md by absolute path", () => {
    expect(interpolated).toContain(`${TEST_PATH}/orchestrator.md`);
  });

  it("SKILL-004: derives project name from PWD", () => {
    expect(interpolated).toContain("basename($PWD)");
    expect(interpolated).toContain("D0-12");
  });

  it("SKILL-005: routes state to ~/.building/projects/", () => {
    expect(interpolated).toContain("~/.building/projects/<project-name>/");
  });

  it("has valid YAML frontmatter", () => {
    expect(TEMPLATE).toMatch(/^---\nname: build\n/);
    expect(TEMPLATE).toContain("user-invocable: true");
  });

  it("contains state write protocol with snapshot", () => {
    expect(interpolated).toContain("state.json.stage-");
    expect(interpolated).toContain("Snapshot");
  });

  it("contains gate enforcement via Bash tool", () => {
    expect(interpolated).toContain("gate-check.sh");
    expect(interpolated).toContain("detection-check.sh");
    expect(interpolated).toContain("BUILDING_HOME=");
  });

  it("contains sub-agent dispatch paths", () => {
    expect(interpolated).toContain(`${TEST_PATH}/.claude/agents/peer-reviewer.md`);
    expect(interpolated).toContain(`${TEST_PATH}/.claude/agents/task-auditor.md`);
    expect(interpolated).toContain(`${TEST_PATH}/prompts/`);
  });

  it("contains project.lock collision check", () => {
    expect(interpolated).toContain("project.lock");
    expect(interpolated).toContain("already in use");
  });

  it("contains createInitialState signature with projectDir", () => {
    expect(interpolated).toContain("projectDir");
  });

  it("does not contain hooks in settings.json references", () => {
    expect(interpolated).not.toContain("settings.json");
    expect(interpolated).not.toContain("PreToolUse");
  });

  it("contains neutral git commit protocol", () => {
    expect(interpolated).toContain('No `[trellis]` prefix');
    expect(interpolated).toContain('No `[building]` prefix');
  });

  it("{{BUILDING_HOME}} is the only placeholder", () => {
    const otherPlaceholders = TEMPLATE.match(/\{\{(?!BUILDING_HOME)[^}]+\}\}/g);
    expect(otherPlaceholders).toBeNull();
  });
});
