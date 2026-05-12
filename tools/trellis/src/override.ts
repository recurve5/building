import { writeFileSync, renameSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { readState, writeState } from "./state.js";

export function writeOverride(
  runDir: string,
  stage: number,
  gateName: string,
  failures: string[],
  justification: string,
  risk: string,
  overriddenBy: "orchestrator" | "user",
): string {
  const ts = new Date().toISOString();
  const tsSlug = ts.replace(/[:.]/g, "-");
  const filename = `${stage}-${tsSlug}.md`;
  const filePath = join(runDir, "overrides", filename);

  const failureList = failures.map((f) => `- ${f}`).join("\n");
  const content = `# Override: Stage ${stage}

**Timestamp:** ${ts}
**Gate:** ${gateName}
**Overridden by:** ${overriddenBy}

## What Failed

${failureList}

## Justification

${justification}

## Risk Accepted

${risk}
`;

  const tmpPath = join(runDir, "overrides", `.${filename}.${randomBytes(4).toString("hex")}.tmp`);
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, filePath);

  return filename;
}

export function addOverrideToState(runDir: string, stage: number): void {
  const state = readState(runDir);
  const stageStr = String(stage);
  if (!state.overrides.includes(stageStr)) {
    state.overrides.push(stageStr);
  }
  writeState(runDir, state);
}
