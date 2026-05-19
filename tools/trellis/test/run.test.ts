import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateRunId, createRunDirectory } from "../src/run.js";

describe("generateRunId", () => {
  it("STATE-001: produces correct format", () => {
    const id = generateRunId("test brief", new Date("2026-01-15T09:30:00Z"));
    expect(id).toMatch(/^\d{8}T\d{4}Z-[a-f0-9]{7}$/);
    expect(id).toMatch(/^20260115T0930Z-/);
  });

  it("STATE-002: different timestamps produce different IDs", () => {
    const a = generateRunId("same brief", new Date("2026-01-15T09:30:00Z"));
    const b = generateRunId("same brief", new Date("2026-01-15T09:31:00Z"));
    expect(a).not.toBe(b);
  });

  it("STATE-003: different briefs produce different IDs", () => {
    const ts = new Date("2026-01-15T09:30:00Z");
    const a = generateRunId("brief A", ts);
    const b = generateRunId("brief B", ts);
    expect(a).not.toBe(b);
  });
});

describe("createRunDirectory", () => {
  it("STATE-015: creates full scaffold", () => {
    const tmp = mkdtempSync(join(tmpdir(), "trellis-test-"));
    const runDir = createRunDirectory(tmp, "20260115T0930Z-abc1234");

    expect(existsSync(runDir)).toBe(true);
    for (const sub of ["events", "overrides", "detections", "confidence"]) {
      expect(existsSync(join(runDir, sub))).toBe(true);
    }
  });
});
