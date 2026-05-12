import { readFileSync, writeFileSync, renameSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { TrellisEvent, EventType } from "./types.js";

export function appendEvent(
  runDir: string,
  event: Omit<TrellisEvent, "timestamp">,
): string {
  const eventsDir = join(runDir, "events");
  const num = nextEventNumber(eventsDir);
  const padded = String(num).padStart(num > 999 ? 4 : 3, "0");
  const filename = `${padded}-${event.event}.json`;

  const full: TrellisEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  const filePath = join(eventsDir, filename);
  const tmpPath = join(eventsDir, `.${filename}.${randomBytes(4).toString("hex")}.tmp`);
  writeFileSync(tmpPath, JSON.stringify(full, null, 2) + "\n", "utf-8");
  renameSync(tmpPath, filePath);

  return filename;
}

export function readEvents(runDir: string): TrellisEvent[] {
  const eventsDir = join(runDir, "events");
  let files: string[];
  try {
    files = readdirSync(eventsDir);
  } catch {
    return [];
  }

  const eventFiles = files
    .filter((f) => f.endsWith(".json") && !f.startsWith("."))
    .map((f) => ({ name: f, num: parseEventNumber(f) }))
    .filter((f) => f.num !== null)
    .sort((a, b) => a.num! - b.num!);

  const events: TrellisEvent[] = [];
  for (const { name } of eventFiles) {
    try {
      const raw = readFileSync(join(eventsDir, name), "utf-8");
      events.push(JSON.parse(raw) as TrellisEvent);
    } catch {
      // Skip malformed files
    }
  }
  return events;
}

export function readEventsByType(
  runDir: string,
  type: EventType,
): TrellisEvent[] {
  return readEvents(runDir).filter((e) => e.event === type);
}

export function readEventsForTask(
  runDir: string,
  taskId: string,
): TrellisEvent[] {
  return readEvents(runDir).filter((e) => e.task === taskId);
}

export function nextEventNumber(eventsDir: string): number {
  let files: string[];
  try {
    files = readdirSync(eventsDir);
  } catch {
    return 1;
  }

  let max = 0;
  for (const f of files) {
    const num = parseEventNumber(f);
    if (num !== null && num > max) {
      max = num;
    }
  }
  return max + 1;
}

function parseEventNumber(filename: string): number | null {
  const match = filename.match(/^(\d+)-/);
  if (!match) return null;
  return parseInt(match[1], 10);
}
