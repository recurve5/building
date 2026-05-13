# Task 015: Integration Tests and Clean Project Guarantee

**Track:** G (Integration + Smoke)
**Phase:** 4 (Integration)
**Status:** not started
**Depends on:** 006, 007, 008, 009, 010, 011, 012, 013, 014
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-10 (Clean Project Guarantee), all D0 contracts, test plan Sections 3 and 2.10

## What to Build

End-to-end integration tests that verify the assembled system works as a whole. Also the clean project guarantee verification suite. These tests exercise the full chain: install -> bootstrap -> gate fires -> status check -> clean project directory.

### Integration Tests

**INT-001: Install -> Bootstrap -> Skill-invoked gate fires -> Status -> Clean project dir**
1. Run install script in temp environment.
2. Verify skill file installed (no hooks in settings.json).
3. Bootstrap a project (create state directory via bootstrap function).
4. Create a run with initial state.
5. Invoke gate-check.sh via Bash with BUILDING_HOME, PROJECT_DIR, PROJECT_STATE env vars (simulating the skill's Bash tool call).
6. Verify gate logic executes correctly.
7. Verify project directory is clean (no `.building/`, no Building hooks).

**INT-002: Gate script executes with correct env vars**
1. Set up project state with an active run.
2. Invoke gate-check.sh with BUILDING_HOME, PROJECT_DIR, PROJECT_STATE set correctly -- gate logic executes.
3. Invoke gate-check.sh with missing or incorrect env vars -- script fails with error (not silent no-op).

**INT-003: Bootstrap with collision produces error**
1. Bootstrap project from `/path/a/api`.
2. Attempt bootstrap from `/path/b/api`.
3. Second bootstrap fails with collision error containing first project's path.

**INT-004: Gate scripts receive environment variables from gate-check.sh**
1. Set up fixture with BUILDING_HOME, project state, milestone artifacts.
2. Create a test gate script that echoes env vars.
3. Run gate-check.sh with valid hook input.
4. Verify test gate script received PROJECT_STATE, PROJECT_DIR, PROJECT_NAME.

**INT-005: Install then uninstall leaves clean system**
1. Run install. Create project state. Run uninstall.
2. Verify skill file removed, project state preserved. No hooks to clean up.

**INT-006: Detection scripts receive PROJECT_DIR for git operations**
1. Set up project git repo with staged changes.
2. Set up project state with milestone artifacts.
3. Run detection-check.sh.
4. Verify scope-audit uses PROJECT_DIR for git diff.

### Clean Project Guarantee Tests

**CLEAN-001: No .building/ directory in project dir**
After bootstrap and simulated build cycle, project directory has no `.building/`.

**CLEAN-002: No Building references in .gitignore**
Project's `.gitignore` is unchanged after bootstrap.

**CLEAN-003: No hooks in .claude/settings.local.json or ~/.claude/settings.json**
No Building hooks in project-level or user-level settings file.

**CLEAN-004: No Building vocabulary in commit messages**
`commitProjectCode()` produces no `[trellis]`, `[building]`, or task-ID-format messages.

**CLEAN-005: No Building references in generated source files**
Grep project directory for "building", "trellis", BUILDING_HOME path -- zero matches.

## Files

- Create: `tools/trellis/test/integration.test.ts`
- Create: `tools/trellis/test/clean-project.test.ts`
- Create: `tools/trellis/test/fixtures/integration/` (shared fixtures for integration tests)
- Do not touch: any source files (all implementation is done by this point)

## Contracts

### Test Fixture Setup

All integration tests use isolated temp directories. The fixture helpers from the test plan (Section 5) provide:
- `createBuildingHomeFixture(tmpDir)` -- creates a minimal Building home with hook scripts, gate scripts, lib/.
- `createProjectStateFixture(tmpDir, projectName, opts)` -- creates project state with optional active run.
- `createProjectDirFixture(tmpDir, name)` -- creates a project directory, optionally with git init.
- `createHomeDirFixture(tmpDir)` -- creates a HOME with `.claude/` structure.

### Environment Isolation

Tests set `HOME`, `PWD`, `BUILDING_HOME` to temp directories. No test modifies the real `~/.building/`, `~/.claude/`, or any system directory.

## Acceptance Criteria

1. INT-001 passes: full install -> bootstrap -> gate -> clean flow works.
2. INT-002 passes: hooks fire for Building, no-op for non-Building.
3. INT-003 passes: collision detection works end-to-end.
4. INT-004 passes: env vars reach gate scripts.
5. INT-005 passes: install/uninstall cycle is clean.
6. INT-006 passes: detection scripts use PROJECT_DIR.
7. CLEAN-001 through CLEAN-005 pass: project directory is clean.
8. All tests run via `vitest run` in `tools/trellis/`.

## Tests

- INT-001 through INT-006
- CLEAN-001 through CLEAN-005

## Notes

This task depends on every implementation task being complete. It is pure verification -- no source changes, only test code.

The integration tests are the most complex tests in the milestone. They exercise cross-component interactions that unit tests cannot cover. If an integration test fails, the fix is in the component that broke the contract, not in the test.

For INT-001, the "invoke gate-check.sh" step calls the script with BUILDING_HOME, PROJECT_DIR, and PROJECT_STATE set as environment variables (simulating the skill's Bash tool call). No stdin input is needed — the script receives all context via env vars.

For CLEAN-005, use `grep -r` to search the project directory. Exclude `.git/` from the search. The search terms are: `building`, `trellis`, and the literal BUILDING_HOME path used in the test.
