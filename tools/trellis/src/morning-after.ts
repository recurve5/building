import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readState } from "./state.js";
import { readEvents } from "./events.js";
import type { TrellisState, TrellisEvent, ConfidenceAssessment } from "./types.js";

export function generateMorningAfter(runDir: string): string {
  const state = readState(runDir);
  const events = readEvents(runDir);
  const result = classifyResult(state);
  const duration = calculateDuration(events);
  const sections: string[] = [];

  // Header (always)
  sections.push(
    `# Morning After: ${state.project} / ${state.milestone}`,
    `Run: ${state.run_id}`,
    `Duration: ${duration.hours}h ${duration.minutes}m`,
    `Result: ${result}`,
    "",
    "---",
    "",
  );

  // What Shipped
  const completedStages = Object.entries(state.stages)
    .filter(([, s]) => s.status === "complete")
    .map(([n]) => `Stage ${n}`);
  if (completedStages.length > 0) {
    sections.push("## What Shipped", "");
    const stageEvents = events.filter((e) => e.event === "stage_complete");
    for (const ev of stageEvents) {
      const artifacts = (ev.data.artifacts_produced as string[]) ?? [];
      sections.push(`- Stage ${ev.stage} complete`);
      for (const a of artifacts) {
        sections.push(`  - ${a}`);
      }
    }
    sections.push("");
  }

  // What Stopped
  if (state.halted) {
    sections.push("## What Stopped", "");
    sections.push(`- Stage: ${state.current_stage}`);
    sections.push(`- Reason: ${state.halt_reason ?? "Unknown"}`);
    const haltEvents = events.filter((e) => e.event === "halt");
    if (haltEvents.length > 0) {
      const last = haltEvents[haltEvents.length - 1];
      const isContextExhaustion = last.event === "context_exhaustion" ||
        (last.data.halt_reason as string)?.includes("context");
      if (isContextExhaustion) {
        sections.push("- Type: Context window exhaustion");
        sections.push("- Action: Resume with /build --resume");
      }
    }
    // Check for context_exhaustion events
    const contextEvents = events.filter((e) => e.event === "context_exhaustion");
    if (contextEvents.length > 0) {
      sections.push("- Type: Context window exhaustion");
      sections.push("- Action: Resume with /build --resume");
    }
    sections.push("");
  }

  // Gates Overridden
  const overridesDir = join(runDir, "overrides");
  const overrideFiles = safeReadDir(overridesDir).filter((f) => f.endsWith(".md"));
  if (overrideFiles.length > 0) {
    sections.push("## Gates Overridden", "");
    for (const f of overrideFiles) {
      const content = readFileSync(join(overridesDir, f), "utf-8");
      const gateLine = content.match(/\*\*Gate:\*\* (.+)/);
      const byLine = content.match(/\*\*Overridden by:\*\* (.+)/);
      sections.push(`- ${gateLine?.[1] ?? f} (by ${byLine?.[1] ?? "unknown"})`);
    }
    sections.push("");
  }

  // Failure Modes Detected
  const detectionsDir = join(runDir, "detections");
  const detectionFiles = safeReadDir(detectionsDir).filter((f) => f.endsWith(".md"));
  if (detectionFiles.length > 0) {
    sections.push("## Failure Modes Detected", "");
    for (const f of detectionFiles) {
      const content = readFileSync(join(detectionsDir, f), "utf-8");
      const title = content.match(/^# Detection: (.+)/m);
      const severity = content.match(/\*\*Severity:\*\* (.+)/);
      sections.push(`- ${title?.[1] ?? f} [${severity?.[1] ?? "unknown"}]`);
    }
    sections.push("");
  }

  // Confidence
  const confidenceDir = join(runDir, "confidence");
  const confFiles = safeReadDir(confidenceDir).filter((f) => f.endsWith(".json"));
  sections.push("## Confidence", "");
  if (confFiles.length > 0) {
    for (const f of confFiles) {
      try {
        const conf: ConfidenceAssessment = JSON.parse(
          readFileSync(join(confidenceDir, f), "utf-8"),
        );
        const reasons = conf.reasons.length > 0 ? ` (${conf.reasons.join(", ")})` : "";
        sections.push(`- ${conf.artifact}: ${conf.level}${reasons}`);
      } catch {
        // skip malformed
      }
    }
  } else {
    sections.push("- No confidence assessments recorded");
  }
  sections.push("");

  // Decisions Made
  const decisionEvents = events.filter(
    (e) => e.data.decision_tier === "tier2" || e.data.type === "tier2_decision",
  );
  if (decisionEvents.length > 0) {
    sections.push("## Decisions Made", "");
    for (const ev of decisionEvents) {
      sections.push(`- ${ev.data.description ?? ev.data.decision ?? "Tier 2 decision"}`);
    }
    sections.push("");
  }

  // Stats (always)
  const taskCount = Object.keys(state.tasks).length;
  const completedTasks = Object.values(state.tasks).filter(
    (t) => t.status === "complete",
  ).length;
  const stageCount = Object.values(state.stages).filter(
    (s) => s.status === "complete",
  ).length;

  sections.push("## Stats", "");
  sections.push(`- Stages completed: ${stageCount}`);
  sections.push(`- Tasks completed: ${completedTasks}/${taskCount}`);
  sections.push(`- Overrides: ${overrideFiles.length}`);
  sections.push(`- Detections: ${detectionFiles.length}`);
  sections.push(`- Events logged: ${events.length}`);
  sections.push("");

  return sections.join("\n");
}

export function classifyResult(state: TrellisState): "SHIPPED" | "HALTED" | "PARTIAL" {
  if (state.halted) return "HALTED";
  const finalStage = state.stages["11"];
  if (finalStage?.status === "complete" && finalStage.gate_passed) return "SHIPPED";
  const anyComplete = Object.values(state.stages).some((s) => s.status === "complete");
  if (anyComplete) return "PARTIAL";
  return "HALTED";
}

export function calculateDuration(
  events: TrellisEvent[],
): { hours: number; minutes: number } {
  if (events.length === 0) return { hours: 0, minutes: 0 };
  const first = new Date(events[0].timestamp).getTime();
  const last = new Date(events[events.length - 1].timestamp).getTime();
  const totalMinutes = Math.round((last - first) / 60000);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

function safeReadDir(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => !f.startsWith("."));
  } catch {
    return [];
  }
}
