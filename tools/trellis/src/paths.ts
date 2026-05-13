import { basename, join } from "node:path";
import { homedir } from "node:os";

export interface BuildingPaths {
  buildingHome: string;
  projectDir: string;
  projectState: string;
  projectName: string;
  orchestrator: string;
  prompts: string;
  agents: string;
  hooks: string;
  gates: string;
  detections: string;
  hooksLib: string;
  trellisbin: string;
  auditbin: string;
  runs: string;
  milestones: string;
  decisions: string;
  openItems: string;
}

export function deriveProjectName(projectDir: string): string {
  const stripped = projectDir.replace(/\/+$/, "");
  let name = basename(stripped);
  name = name.toLowerCase();
  name = name.replace(/[ _]/g, "-");
  name = name.replace(/[^a-z0-9-]/g, "");
  name = name.replace(/-{2,}/g, "-");
  name = name.replace(/^-/, "").replace(/-$/, "");

  if (name.length === 0) {
    throw new Error(
      `Cannot derive project name from directory '${basename(stripped)}'`,
    );
  }

  return name;
}

export function resolvePaths(
  buildingHome: string,
  projectDir: string,
): BuildingPaths {
  const projectName = deriveProjectName(projectDir);
  const projectState = join(homedir(), ".building", "projects", projectName);

  return {
    buildingHome,
    projectDir,
    projectState,
    projectName,
    orchestrator: join(buildingHome, "orchestrator.md"),
    prompts: join(buildingHome, "prompts"),
    agents: join(buildingHome, ".claude", "agents"),
    hooks: join(buildingHome, ".building", "hooks"),
    gates: join(buildingHome, ".building", "hooks", "gates"),
    detections: join(buildingHome, ".building", "hooks", "detections"),
    hooksLib: join(buildingHome, ".building", "hooks", "lib"),
    trellisbin: join(buildingHome, "tools", "trellis", "dist"),
    auditbin: join(buildingHome, "tools", "building-audit", "dist"),
    runs: join(projectState, "runs"),
    milestones: join(projectState, "milestones"),
    decisions: join(projectState, "DECISIONS.md"),
    openItems: join(projectState, "OPEN-ITEMS.md"),
  };
}

export function resolveRunDir(projectState: string, runId: string): string {
  return join(projectState, "runs", runId);
}

export function resolveMilestoneDir(
  projectState: string,
  milestoneName: string,
): string {
  return join(projectState, "milestones", milestoneName);
}
