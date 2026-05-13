#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

const BUILDING_HOME = resolve(process.cwd());
const HOME = homedir();

function log(msg) {
  console.log(`  ${msg}`);
}

function fail(msg) {
  console.error(`\nError: ${msg}`);
  process.exit(1);
}

function atomicWrite(filePath, content) {
  const dir = join(filePath, "..");
  const tmpPath = join(dir, `.${randomBytes(4).toString("hex")}.tmp`);
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, filePath);
}

console.log("\nInstalling Building...\n");

// 1. Verify we're in the Building repo
const orchestrator = join(BUILDING_HOME, "orchestrator.md");
if (!existsSync(orchestrator)) {
  fail("orchestrator.md not found. Run this from the Building repo root.");
}

// 2. npm install in repo root (if package.json exists)
const rootPkg = join(BUILDING_HOME, "package.json");
if (existsSync(rootPkg)) {
  try {
    log("Installing root dependencies...");
    execSync("npm install", { cwd: BUILDING_HOME, stdio: "pipe" });
  } catch (err) {
    fail(`npm install failed in repo root: ${err.message}`);
  }
}

// 3. Build trellis
const trellisDir = join(BUILDING_HOME, "tools", "trellis");
if (existsSync(join(trellisDir, "package.json"))) {
  try {
    log("Building trellis...");
    execSync("npm install", { cwd: trellisDir, stdio: "pipe" });
    execSync("npm run build", { cwd: trellisDir, stdio: "pipe" });
  } catch (err) {
    fail(`trellis build failed: ${err.message}`);
  }
}

// 4. Build building-audit
const auditDir = join(BUILDING_HOME, "tools", "building-audit");
if (existsSync(join(auditDir, "package.json"))) {
  try {
    log("Building building-audit...");
    execSync("npm install", { cwd: auditDir, stdio: "pipe" });
    execSync("npm run build", { cwd: auditDir, stdio: "pipe" });
  } catch (err) {
    fail(`building-audit build failed: ${err.message}`);
  }
}

// 5. Create ~/.building/ with restricted permissions
const buildingState = join(HOME, ".building");
if (!existsSync(buildingState)) {
  log("Creating ~/.building/...");
  mkdirSync(buildingState, { recursive: true, mode: 0o700 });
}

// 6. Create ~/.building/projects/
const projectsDir = join(buildingState, "projects");
if (!existsSync(projectsDir)) {
  mkdirSync(projectsDir, { recursive: true });
}

// 7. Create ~/.claude/skills/build/
const skillDir = join(HOME, ".claude", "skills", "build");
if (!existsSync(skillDir)) {
  log("Creating skill directory...");
  mkdirSync(skillDir, { recursive: true });
}

// 8. Read and interpolate skill template
const templatePath = join(BUILDING_HOME, "tools", "install", "skill-template.md");
if (!existsSync(templatePath)) {
  fail("Skill template not found at tools/install/skill-template.md");
}

const template = readFileSync(templatePath, "utf-8");
const skillContent = template.replace(/\{\{BUILDING_HOME\}\}/g, BUILDING_HOME);

// 9. Write skill file (last critical action)
const skillPath = join(skillDir, "SKILL.md");
atomicWrite(skillPath, skillContent);

// 10. Summary
console.log(`
Building installed successfully.
  Home: ${BUILDING_HOME}
  Skill: ~/.claude/skills/build/SKILL.md
  State: ~/.building/projects/

  Run /build from any project directory to start.
`);
