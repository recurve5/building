# Task 012: Bootstrap Command

**Track:** B
**Phase:** B3 (slash commands — bootstrap)
**Status:** not started
**Depends on:** 002, 005, 007
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-7 (Directory Layout), D0-3 (Hook Interface Contract), D0-9 (building-audit Integration Contract), PRD Section 5.1 (Bootstrap), SDM Constraints 2 and 6

## What to Build

The `/build --bootstrap` implementation. This is the first-time setup that creates the `.building/` directory structure, installs hook scripts, verifies dependencies, and commits the bootstrap.

### Bootstrap Steps

1. Create `.building/` directory structure (D0-7):
   - `.building/runs/` (empty)
   - `.building/hooks/` (containing gate-check.sh, detection-check.sh, lib/common.sh)
   - `.building/hooks/gates/` (all gate scripts from Task 005)
   - `.building/hooks/detections/` (all detection scripts from Task 009)
   - `.building/config.json` (project name, trellis version)

2. Add hook entries to `.claude/settings.local.json`:
   - PreToolUse Write hook for gate-check.sh
   - PreToolUse Write hook for detection-check.sh
   - Preserve existing settings (permissions, etc.)

3. Verify dependencies:
   - `tools/building-audit/node_modules` exists. If not, run `npm install` in `tools/building-audit/`.
   - `tools/trellis/node_modules` exists. If not, run `npm install` in `tools/trellis/`.
   - Both TypeScript packages are compiled. If not, run `npm run build` in each.

4. Commit: `[trellis] Bootstrap`

5. Print confirmation: what was created, what hooks are active.

### Idempotency

Running bootstrap twice must not break state:
- If `.building/` exists, do not recreate (update hook scripts if they differ).
- If hook entries exist in settings.local.json, do not duplicate them.
- If dependencies are installed, skip the install step.
- If already committed, no second bootstrap commit.

## Files

- Create: `tools/trellis/src/bootstrap.ts` (bootstrap logic)
- Create: `tools/trellis/test/bootstrap.test.ts`
- Modify: `.claude/settings.local.json` (bootstrap adds hooks here)
- Do not touch: `orchestrator.md`, `prompts/`, `.claude/settings.json`

## Contracts

### bootstrap

```typescript
async function bootstrap(projectRoot: string, projectName: string): Promise<BootstrapResult>

interface BootstrapResult {
  created: string[];          // list of directories/files created
  hooksInstalled: string[];   // hook entries added
  dependenciesInstalled: boolean;
  commitHash: string | null;  // git commit hash, null if nothing to commit
  alreadyBootstrapped: boolean;
}
```

### config.json

```json
{
  "project": "<project-name>",
  "version": "1.0.0",
  "bootstrapped": "<ISO 8601 timestamp>"
}
```

## Acceptance Criteria

1. Bootstrap creates the correct directory structure (BOOT-001).
2. Bootstrap adds hook entries to settings.local.json (BOOT-002).
3. Bootstrap commits with message `[trellis] Bootstrap` (BOOT-003).
4. Bootstrap is idempotent — running twice does not break state (BOOT-004).
5. Bootstrap does NOT modify orchestrator.md or agent prompts (BOOT-005).
6. Bootstrap verifies and installs building-audit dependencies if missing (SDM Constraint 2).
7. Bootstrap verifies and installs trellis dependencies if missing.
8. Bootstrap preserves existing settings.local.json content (permissions).
9. Hooks are written to settings.local.json, NOT settings.json (SDM Constraint 6).

## Tests

- [ ] BOOT-001: Correct directory structure created
- [ ] BOOT-002: Hook entries added to settings.local.json
- [ ] BOOT-003: Commit with correct message
- [ ] BOOT-004: Idempotent — second run is no-op
- [ ] BOOT-005: orchestrator.md and prompts unchanged
- [ ] Existing settings preserved when adding hooks
- [ ] Missing building-audit node_modules triggers npm install

## Notes

The bootstrap test runs in a temporary git repo (not the project repo) to avoid side effects. It initializes a fresh git repo, runs bootstrap, and asserts on the resulting file tree and git log.

Bootstrap is the entry point for new users. It must provide clear output:
```
[trellis] Bootstrap complete.
  Created: .building/ (runs/, hooks/, config.json)
  Hooks: 2 PreToolUse hooks installed in .claude/settings.local.json
  Dependencies: building-audit ready, trellis ready
  Committed: [trellis] Bootstrap (abc1234)
```

If bootstrap fails partway (e.g., npm install fails), it should clean up any partially created files and report the failure clearly. Do not leave a half-bootstrapped state.
