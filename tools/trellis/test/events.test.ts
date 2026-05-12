import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendEvent,
  readEvents,
  readEventsByType,
  readEventsForTask,
  nextEventNumber,
} from "../src/events.js";

function makeRunDir(): string {
  const tmp = mkdtempSync(join(tmpdir(), "trellis-events-"));
  mkdirSync(join(tmp, "events"));
  return tmp;
}

describe("appendEvent", () => {
  let runDir: string;

  beforeEach(() => {
    runDir = makeRunDir();
  });

  it("STATE-008: creates sequentially numbered files", () => {
    const f1 = appendEvent(runDir, {
      event: "run_started",
      stage: null,
      task: null,
      data: {},
    });
    expect(f1).toBe("001-run_started.json");

    const f2 = appendEvent(runDir, {
      event: "stage_started",
      stage: 0,
      task: null,
      data: {},
    });
    expect(f2).toBe("002-stage_started.json");
  });

  it("STATE-009: event file contains required fields", () => {
    appendEvent(runDir, {
      event: "task_started",
      stage: 9,
      task: "001",
      data: { task_id: "001" },
    });

    const events = readEvents(runDir);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("task_started");
    expect(events[0].stage).toBe(9);
    expect(events[0].task).toBe("001");
    expect(events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("nextEventNumber", () => {
  it("returns 1 for empty directory", () => {
    const tmp = mkdtempSync(join(tmpdir(), "trellis-empty-"));
    mkdirSync(join(tmp, "events"));
    expect(nextEventNumber(join(tmp, "events"))).toBe(1);
  });

  it("STATE-010: handles gaps — returns max+1", () => {
    const tmp = mkdtempSync(join(tmpdir(), "trellis-gaps-"));
    const eventsDir = join(tmp, "events");
    mkdirSync(eventsDir);

    writeFileSync(join(eventsDir, "001-run_started.json"), "{}");
    writeFileSync(join(eventsDir, "002-stage_started.json"), "{}");
    writeFileSync(join(eventsDir, "004-task_started.json"), "{}");

    expect(nextEventNumber(eventsDir)).toBe(5);
  });

  it("returns 1 for missing directory", () => {
    expect(nextEventNumber("/nonexistent/path")).toBe(1);
  });
});

describe("readEvents", () => {
  it("returns events sorted by number", () => {
    const runDir = makeRunDir();
    appendEvent(runDir, { event: "run_started", stage: null, task: null, data: {} });
    appendEvent(runDir, { event: "stage_started", stage: 0, task: null, data: {} });
    appendEvent(runDir, { event: "task_started", stage: 9, task: "001", data: {} });

    const events = readEvents(runDir);
    expect(events).toHaveLength(3);
    expect(events[0].event).toBe("run_started");
    expect(events[1].event).toBe("stage_started");
    expect(events[2].event).toBe("task_started");
  });

  it("skips malformed files", () => {
    const runDir = makeRunDir();
    appendEvent(runDir, { event: "run_started", stage: null, task: null, data: {} });
    writeFileSync(join(runDir, "events", "002-bad.json"), "not json {{{");
    appendEvent(runDir, { event: "stage_started", stage: 0, task: null, data: {} });

    const events = readEvents(runDir);
    expect(events).toHaveLength(2);
  });

  it("returns empty for missing directory", () => {
    expect(readEvents("/nonexistent")).toEqual([]);
  });
});

describe("readEventsByType", () => {
  it("filters by type", () => {
    const runDir = makeRunDir();
    appendEvent(runDir, { event: "run_started", stage: null, task: null, data: {} });
    appendEvent(runDir, { event: "stage_started", stage: 0, task: null, data: {} });
    appendEvent(runDir, { event: "stage_started", stage: 1, task: null, data: {} });

    const starts = readEventsByType(runDir, "stage_started");
    expect(starts).toHaveLength(2);
  });
});

describe("readEventsForTask", () => {
  it("filters by task ID", () => {
    const runDir = makeRunDir();
    appendEvent(runDir, { event: "task_started", stage: 9, task: "001", data: {} });
    appendEvent(runDir, { event: "task_started", stage: 9, task: "002", data: {} });
    appendEvent(runDir, { event: "task_complete", stage: 9, task: "001", data: {} });

    const t1 = readEventsForTask(runDir, "001");
    expect(t1).toHaveLength(2);
    expect(t1.every((e) => e.task === "001")).toBe(true);
  });
});
