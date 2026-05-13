import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  deriveProjectName,
  resolvePaths,
  resolveRunDir,
  resolveMilestoneDir,
} from "../src/paths.js";

describe("deriveProjectName", () => {
  // D0-12 example table — every row is a test case

  it("PATH-002: lowercases uppercase characters", () => {
    expect(deriveProjectName("/home/user/MyApp")).toBe("myapp");
  });

  it("PATH-003: replaces spaces with hyphens", () => {
    expect(deriveProjectName("/home/user/My Cool App")).toBe("my-cool-app");
  });

  it("PATH-004: strips shell metacharacters", () => {
    expect(deriveProjectName("/home/user/my;rm -rf ~/")).toBe("myrm-rf");
  });

  it("PATH-005: collapses consecutive hyphens", () => {
    expect(deriveProjectName("/home/user/my--app")).toBe("my-app");
  });

  it("PATH-006: trims leading and trailing hyphens", () => {
    expect(deriveProjectName("/home/user/---app---")).toBe("app");
  });

  it("PATH-007: throws on empty basename after sanitization", () => {
    expect(() => deriveProjectName("/home/user/!!!")).toThrow(
      "Cannot derive project name",
    );
  });

  it("PATH-008: handles trailing slash", () => {
    expect(deriveProjectName("/home/user/fitness-tracker/")).toBe(
      "fitness-tracker",
    );
    expect(deriveProjectName("/home/user/fitness-tracker///")).toBe(
      "fitness-tracker",
    );
  });

  it("passes through clean names unchanged", () => {
    expect(deriveProjectName("/home/user/fitness-tracker")).toBe(
      "fitness-tracker",
    );
  });

  it("converts underscores to hyphens", () => {
    expect(deriveProjectName("/home/user/UPPER_case")).toBe("upper-case");
  });

  it("strips dots", () => {
    expect(deriveProjectName("/home/user/app.v2")).toBe("appv2");
  });

  it("handles single character", () => {
    expect(deriveProjectName("/home/user/a")).toBe("a");
  });
});

describe("resolvePaths", () => {
  const buildingHome = "/opt/building";
  const projectDir = "/home/user/fitness-tracker";

  it("PATH-001: produces correct BuildingPaths for standard inputs", () => {
    const paths = resolvePaths(buildingHome, projectDir);
    const expectedState = join(
      homedir(),
      ".building",
      "projects",
      "fitness-tracker",
    );

    expect(paths.buildingHome).toBe(buildingHome);
    expect(paths.projectDir).toBe(projectDir);
    expect(paths.projectName).toBe("fitness-tracker");
    expect(paths.projectState).toBe(expectedState);
    expect(paths.orchestrator).toBe(join(buildingHome, "orchestrator.md"));
    expect(paths.prompts).toBe(join(buildingHome, "prompts"));
    expect(paths.agents).toBe(join(buildingHome, ".claude", "agents"));
    expect(paths.hooks).toBe(join(buildingHome, ".building", "hooks"));
    expect(paths.gates).toBe(
      join(buildingHome, ".building", "hooks", "gates"),
    );
    expect(paths.detections).toBe(
      join(buildingHome, ".building", "hooks", "detections"),
    );
    expect(paths.hooksLib).toBe(
      join(buildingHome, ".building", "hooks", "lib"),
    );
    expect(paths.trellisbin).toBe(join(buildingHome, "tools", "trellis", "dist"));
    expect(paths.auditbin).toBe(
      join(buildingHome, "tools", "building-audit", "dist"),
    );
    expect(paths.runs).toBe(join(expectedState, "runs"));
    expect(paths.milestones).toBe(join(expectedState, "milestones"));
    expect(paths.decisions).toBe(join(expectedState, "DECISIONS.md"));
    expect(paths.openItems).toBe(join(expectedState, "OPEN-ITEMS.md"));
  });

  it("PATH-009: is pure computation — no filesystem calls", () => {
    const paths = resolvePaths("/nonexistent/building", "/nonexistent/project");
    expect(paths.projectName).toBe("project");
    expect(paths.projectState).toBe(
      join(homedir(), ".building", "projects", "project"),
    );
  });
});

describe("resolveRunDir", () => {
  it("returns correct run directory", () => {
    const result = resolveRunDir("/state/path", "20260115T0930Z-abc1234");
    expect(result).toBe(join("/state/path", "runs", "20260115T0930Z-abc1234"));
  });
});

describe("resolveMilestoneDir", () => {
  it("returns correct milestone directory", () => {
    const result = resolveMilestoneDir("/state/path", "m1-test-goal");
    expect(result).toBe(join("/state/path", "milestones", "m1-test-goal"));
  });
});
