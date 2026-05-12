import { execSync } from "node:child_process";

interface CommitResult {
  hash: string;
  message: string;
}

function gitCommit(files: string[], message: string, cwd: string): CommitResult {
  for (const file of files) {
    execSync(`git add "${file}"`, { cwd, encoding: "utf-8" });
  }
  execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
    cwd,
    encoding: "utf-8",
  });
  const hash = execSync("git rev-parse HEAD", { cwd, encoding: "utf-8" }).trim();
  return { hash, message };
}

export function commitRunStart(
  cwd: string,
  runDir: string,
  stateFile: string,
): CommitResult {
  return gitCommit(
    [runDir, stateFile],
    "[trellis] Run started",
    cwd,
  );
}

export function commitStageComplete(
  cwd: string,
  stage: number,
  stageName: string,
  files: string[],
): CommitResult {
  return gitCommit(
    files,
    `[trellis] Stage ${stage} complete: ${stageName}`,
    cwd,
  );
}

export function commitHalt(
  cwd: string,
  stateFile: string,
  reason: string,
): CommitResult {
  return gitCommit(
    [stateFile],
    `[trellis] Halted: ${reason}`,
    cwd,
  );
}

export function commitOverride(
  cwd: string,
  stateFile: string,
  overrideFile: string,
  stage: number,
): CommitResult {
  return gitCommit(
    [stateFile, overrideFile],
    `[trellis] Override: stage ${stage}`,
    cwd,
  );
}

export function commitMorningAfter(
  cwd: string,
  morningAfterFile: string,
  confidenceDir: string,
): CommitResult {
  return gitCommit(
    [morningAfterFile, confidenceDir],
    "[trellis] Morning-after summary",
    cwd,
  );
}
