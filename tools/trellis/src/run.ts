import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function generateRunId(briefContent: string, timestamp?: Date): string {
  const ts = timestamp ?? new Date();
  const iso = ts.toISOString();
  const dateStr =
    iso.slice(0, 4) +
    iso.slice(5, 7) +
    iso.slice(8, 10) +
    "T" +
    iso.slice(11, 13) +
    iso.slice(14, 16) +
    "Z";
  const hash = createHash("sha256")
    .update(briefContent + iso)
    .digest("hex")
    .slice(0, 7);
  return `${dateStr}-${hash}`;
}

export function createRunDirectory(
  buildingDir: string,
  runId: string,
): string {
  const runDir = join(buildingDir, "runs", runId);
  for (const sub of ["events", "overrides", "detections", "confidence"]) {
    mkdirSync(join(runDir, sub), { recursive: true });
  }
  return runDir;
}
