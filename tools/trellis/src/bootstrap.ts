import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";

export interface BootstrapResult {
  created: string[];
  alreadyBootstrapped: boolean;
}

interface ProjectLock {
  project_dir: string;
  project_name: string;
  created: string;
}

function atomicWrite(filePath: string, content: string): void {
  const tmpPath = join(dirname(filePath), `.${randomBytes(4).toString("hex")}.tmp`);
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, filePath);
}

export async function bootstrap(
  projectName: string,
  projectState: string,
  projectDir: string,
): Promise<BootstrapResult> {
  const lockPath = join(projectState, "project.lock");

  if (existsSync(lockPath)) {
    const lock: ProjectLock = JSON.parse(readFileSync(lockPath, "utf-8"));
    if (lock.project_dir !== projectDir) {
      throw new Error(
        `Project name '${projectName}' is already in use by ${lock.project_dir}.\nRename one directory or use a symlink.`,
      );
    }
    return { created: [], alreadyBootstrapped: true };
  }

  const created: string[] = [];

  const dirs = [
    projectState,
    join(projectState, "runs"),
    join(projectState, "milestones"),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      created.push(dir);
    }
  }

  const decisionsPath = join(projectState, "DECISIONS.md");
  if (!existsSync(decisionsPath)) {
    atomicWrite(decisionsPath, "# Decisions Log\n");
    created.push(decisionsPath);
  }

  const openItemsPath = join(projectState, "OPEN-ITEMS.md");
  if (!existsSync(openItemsPath)) {
    atomicWrite(openItemsPath, "# Open Items\n");
    created.push(openItemsPath);
  }

  const lock: ProjectLock = {
    project_dir: projectDir,
    project_name: projectName,
    created: new Date().toISOString(),
  };
  atomicWrite(lockPath, JSON.stringify(lock, null, 2) + "\n");
  created.push(lockPath);

  return { created, alreadyBootstrapped: false };
}
