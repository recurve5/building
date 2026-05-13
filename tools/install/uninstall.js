#!/usr/bin/env node

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();
const skillDir = join(HOME, ".claude", "skills", "build");

if (!existsSync(skillDir)) {
  console.log("\nBuilding is not installed. Nothing to remove.\n");
  process.exit(0);
}

rmSync(skillDir, { recursive: true });

console.log(`
Building uninstalled.
  Removed: ~/.claude/skills/build/
  Preserved: ~/.building/projects/ (project state)

  To fully remove project state, delete ~/.building/
`);
