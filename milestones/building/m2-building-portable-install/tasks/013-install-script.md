# Task 013: Install Script

**Track:** E (Install Script)
**Phase:** 3 (User-Facing)
**Status:** not started
**Depends on:** 012
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-8 (Install Script Contract), D0-11 (Skill Template Contract), SDM IC-7 (no root package.json)

## What to Build

The install script (`tools/install/setup.ts`) and root `package.json`. This is the entry point for new users: clone repo, run `npm run setup`, and `/build` is available globally.

### 1. tools/install/setup.ts

A Node.js script following the D0-8 action sequence:

1. Verify Node.js availability (informational -- if they're running this, Node exists).
2. Run `npm install` in repo root.
3. Run `npm run build` in `tools/trellis/`.
4. Run `npm run build` in `tools/building-audit/`.
5. Determine BUILDING_HOME as `process.cwd()`.
6. Create `~/.building/` with 0o700 permissions (security review S-3).
7. Create `~/.building/projects/`.
8. Create `~/.claude/skills/build/` (and parent dirs if needed).
9. Read skill template from `tools/install/skill-template.md`.
10. Replace `{{BUILDING_HOME}}` with determined path.
11. Write to `~/.claude/skills/build/SKILL.md`.
12. Print summary.

No hook entries are written to `~/.claude/settings.json`. Gate enforcement is handled by the skill via direct Bash tool calls to gate-check.sh and detection-check.sh.

### 2. package.json (root)

Create a root `package.json` with:
```json
{
  "name": "building",
  "private": true,
  "type": "module",
  "scripts": {
    "setup": "node tools/install/setup.js",
    "uninstall": "node tools/install/uninstall.js"
  }
}
```

### 3. Failure Behavior

- If `npm install` fails: print error, exit non-zero. No skill file written.
- If `npm run build` fails: print error, exit non-zero. No skill file written.
- If directory creation fails (permissions): print error, exit non-zero. No skill file written.
- If skill template not found: print error, exit non-zero.
- The skill file write is the last critical action. Its existence = success.

### 4. Summary Output

```
Building installed successfully.
  Home: /Users/dev/building
  Skill: ~/.claude/skills/build/SKILL.md
  State: ~/.building/projects/
  
  Run /build from any project directory to start.
```

## Files

- Create: `tools/install/setup.ts`
- Create: `package.json` (repo root)
- Do not touch: trellis source, hook scripts, existing settings files

## Contracts

### setup.ts Exports

The script is a CLI entry point, not a library. It has no exports. It runs when invoked via `node tools/install/setup.js`.

### Home Directory

All home directory references use `os.homedir()` or `process.env.HOME`. Never hardcoded paths.

### Idempotency

Running install 10 times in succession produces: one skill file, directories unchanged (STRESS-002).

## Acceptance Criteria

1. Install creates `~/.building/` and `~/.building/projects/` (INST-001).
2. Install creates `~/.claude/skills/build/SKILL.md` with correct BUILDING_HOME (INST-002).
3. Install does NOT write hook entries to `~/.claude/settings.json` (INST-003).
4. Install is idempotent (INST-004).
5. Install fails cleanly when npm install fails (INST-005).
6. Skill file is the success indicator (INST-006).
7. Install creates `~/.claude/skills/` if absent (INST-007).
8. Root `package.json` exists with `setup` and `uninstall` scripts (INST-008).

## Tests

- INST-001: Install creates ~/.building/ and ~/.building/projects/
- INST-002: Install creates ~/.claude/skills/build/SKILL.md
- INST-003: Install does NOT write hooks to ~/.claude/settings.json
- INST-004: Install is idempotent
- INST-005: Install fails cleanly when npm install fails
- INST-006: Skill file is the success indicator
- INST-007: Install creates ~/.claude/skills/ if absent
- INST-008: Root package.json has setup and uninstall scripts

### Test Strategy

Tests override `HOME` to a temp directory (test plan Section 5). Create the install script's dependencies (skill template, etc.) in a test fixture. Invoke via `child_process.execSync` with `HOME` and `cwd` set. Assert against the temp home directory.

For INST-003, verify that `~/.claude/settings.json` is either absent or does not contain Building hook entries after install.

For INST-005 (failure), mock npm failure by using an invalid package.json in the test fixture.

## Notes

The root `package.json` does not exist yet (SDM IC-7). Creating it is part of this task. Keep it minimal: `name`, `private`, `type`, `scripts`.

The `tools/install/setup.ts` file needs to be compiled to `tools/install/setup.js` before it can be run. Either:
- Include a build step in the `setup` script: `"setup": "npx tsc tools/install/setup.ts --outDir tools/install/dist && node tools/install/dist/setup.js"`
- Or write it as plain JavaScript that runs directly with Node.

The simpler approach: write `tools/install/setup.ts` for development, but have the `setup` script use `npx tsx tools/install/setup.ts` for direct TypeScript execution, or compile as part of the setup flow. Decide based on what dependencies are available at setup time (before `npm install` runs).

Alternative: write `tools/install/setup.js` as plain JavaScript (no TypeScript compilation needed). This avoids the chicken-and-egg problem of needing to compile the installer before dependencies are installed.
