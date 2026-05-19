import { execSync } from "node:child_process";

export interface CommitResult {
  hash: string;
  filesCommitted: string[];
}

export async function commitProjectCode(
  projectDir: string,
  files: string[],
  message: string,
): Promise<CommitResult> {
  if (files.length === 0) {
    return { hash: "", filesCommitted: [] };
  }

  for (const file of files) {
    execSync(`git -C "${projectDir}" add "${file}"`, { encoding: "utf-8" });
  }

  try {
    execSync(`git -C "${projectDir}" commit -m "${message.replace(/"/g, '\\"')}"`, {
      encoding: "utf-8",
    });
  } catch {
    return { hash: "", filesCommitted: [] };
  }

  const hash = execSync(`git -C "${projectDir}" rev-parse HEAD`, {
    encoding: "utf-8",
  }).trim();

  return { hash, filesCommitted: files };
}
