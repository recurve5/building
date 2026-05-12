import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

export interface BootstrapResult {
  created: string[];
  hooksInstalled: string[];
  dependenciesInstalled: boolean;
  commitHash: string | null;
  alreadyBootstrapped: boolean;
}

const HOOK_ENTRY = {
  matcher: "Write",
  hooks: [{ type: "command", command: "" }],
};

export async function bootstrap(
  projectRoot: string,
  projectName: string,
): Promise<BootstrapResult> {
  const created: string[] = [];
  const hooksInstalled: string[] = [];
  let dependenciesInstalled = false;

  const buildingDir = join(projectRoot, ".building");
  const alreadyBootstrapped = existsSync(join(buildingDir, "config.json"));

  // 1. Create directory structure
  for (const dir of [
    "runs",
    "hooks/gates",
    "hooks/detections",
    "hooks/lib",
  ]) {
    const fullPath = join(buildingDir, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      created.push(`.building/${dir}`);
    }
  }

  // Write config.json
  const configPath = join(buildingDir, "config.json");
  if (!existsSync(configPath)) {
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          project: projectName,
          version: "1.0.0",
          bootstrapped: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
    created.push(".building/config.json");
  }

  // 2. Add hook entries to settings.local.json
  const settingsPath = join(projectRoot, ".claude", "settings.local.json");
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  } else {
    mkdirSync(join(projectRoot, ".claude"), { recursive: true });
  }

  if (!settings.hooks) {
    settings.hooks = { PreToolUse: [] };
  }
  const hooks = settings.hooks as { PreToolUse: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }> };
  if (!hooks.PreToolUse) {
    hooks.PreToolUse = [];
  }

  const hookScripts = [
    "bash .building/hooks/gate-check.sh",
    "bash .building/hooks/detection-check.sh",
  ];

  for (const cmd of hookScripts) {
    const exists = hooks.PreToolUse.some((h) =>
      h.hooks?.some((inner) => inner.command === cmd),
    );
    if (!exists) {
      hooks.PreToolUse.push({
        matcher: "Write",
        hooks: [{ type: "command", command: cmd }],
      });
      hooksInstalled.push(cmd);
    }
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");

  // 3. Verify dependencies
  for (const pkg of ["tools/building-audit", "tools/trellis"]) {
    const pkgDir = join(projectRoot, pkg);
    if (!existsSync(pkgDir)) continue;

    const nmDir = join(pkgDir, "node_modules");
    if (!existsSync(nmDir)) {
      execSync("npm install", { cwd: pkgDir, encoding: "utf-8" });
      dependenciesInstalled = true;
    }

    const distDir = join(pkgDir, "dist");
    if (!existsSync(distDir)) {
      execSync("npm run build", { cwd: pkgDir, encoding: "utf-8" });
      dependenciesInstalled = true;
    }
  }

  // 4. Commit
  let commitHash: string | null = null;
  try {
    const status = execSync("git status --porcelain", {
      cwd: projectRoot,
      encoding: "utf-8",
    });
    if (status.trim().length > 0) {
      execSync("git add .building/", { cwd: projectRoot, encoding: "utf-8" });
      execSync('git commit -m "[trellis] Bootstrap"', {
        cwd: projectRoot,
        encoding: "utf-8",
      });
      commitHash = execSync("git rev-parse HEAD", {
        cwd: projectRoot,
        encoding: "utf-8",
      }).trim();
    }
  } catch {
    // Git commit may fail if nothing to commit
  }

  return {
    created,
    hooksInstalled,
    dependenciesInstalled,
    commitHash,
    alreadyBootstrapped,
  };
}
