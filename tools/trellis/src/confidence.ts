import { writeFileSync, renameSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { readState } from "./state.js";
import { readEvents } from "./events.js";
import type { ConfidenceAssessment } from "./types.js";

const ARTIFACTS = ["prd", "xrd", "test-plan", "build", "security"] as const;

export function assessConfidence(runDir: string): ConfidenceAssessment[] {
  const state = readState(runDir);
  const events = readEvents(runDir);

  const detections = new Set(state.detections);
  const overrides = new Set(state.overrides);

  const detectionEvents = events.filter((e) => e.event === "detection_fired");

  return ARTIFACTS.map((artifact) => {
    const reasons: string[] = [];

    // Check if any override was used for the relevant stage
    const stageMap: Record<string, string[]> = {
      prd: ["2"],
      xrd: ["3"],
      "test-plan": ["6"],
      build: ["9"],
      security: ["3", "9"],
    };

    const relevantStages = stageMap[artifact] ?? [];
    for (const s of relevantStages) {
      if (overrides.has(s)) {
        reasons.push(`Stage ${s} gate overridden`);
      }
    }

    // Check if any detection fired during the relevant stage
    for (const de of detectionEvents) {
      const detStage = de.stage;
      if (detStage !== null && relevantStages.includes(String(detStage))) {
        reasons.push(`Detection: ${de.data.failure_mode ?? de.data.detection_name ?? "unknown"}`);
      }
    }

    // Check build-specific: any detection during any task
    if (artifact === "build" && detectionEvents.length > 0) {
      if (!reasons.some((r) => r.startsWith("Detection:"))) {
        reasons.push("Detection fired during build phase");
      }
    }

    const level: "verified" | "partial" = reasons.length > 0 ? "partial" : "verified";
    return { artifact, level, reasons };
  });
}

export function writeConfidenceFiles(runDir: string): string[] {
  const assessments = assessConfidence(runDir);
  const filenames: string[] = [];

  for (const assessment of assessments) {
    const filename = `${assessment.artifact}.json`;
    const filePath = join(runDir, "confidence", filename);
    const tmpPath = join(runDir, "confidence", `.${filename}.${randomBytes(4).toString("hex")}.tmp`);
    writeFileSync(tmpPath, JSON.stringify(assessment, null, 2) + "\n", "utf-8");
    renameSync(tmpPath, filePath);
    filenames.push(filename);
  }

  return filenames;
}
