# Task 014: Uninstall Script

**Track:** E (Install Script)
**Phase:** 3 (User-Facing)
**Status:** not started
**Depends on:** 013
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-9 (Uninstall Script Contract), PRD Decision 10

## What to Build

The uninstall script (`tools/install/uninstall.ts` or `uninstall.js`) that cleanly removes Building's global artifacts without destroying project state.

### Actions

1. Remove `~/.claude/skills/build/` directory (skill file and containing directory).
2. Print summary of what was removed.

No hook entries need to be cleaned from `~/.claude/settings.json` — none are written by the install script.

### Does NOT

- Delete `~/.building/`. Root state directory preserved.
- Delete `~/.building/projects/`. All project state preserved.
- Modify `~/.claude/settings.json`.
- Require confirmation. The developer ran `npm run uninstall` intentionally.

### Safe When Already Uninstalled

If the skill file does not exist, exit 0 with:
```
Building is not installed. Nothing to remove.
```

### Summary Output

```
Building uninstalled.
  Removed: ~/.claude/skills/build/
  Preserved: ~/.building/projects/ (project state)
  
  To fully remove project state, delete ~/.building/
```

## Files

- Create: `tools/install/uninstall.ts` (or `uninstall.js` — match install script language)
- Modify: `package.json` (root) — `uninstall` script already added in Task 013
- Do not touch: hook scripts, trellis source, existing settings

## Contracts

The uninstall script is simple: remove the skill file directory. No settings.json manipulation needed since no hook entries exist.

## Acceptance Criteria

1. Uninstall removes skill file directory (UNINST-001).
2. Uninstall preserves project state (UNINST-002).
3. Uninstall is safe when already uninstalled (UNINST-003).

## Tests

- UNINST-001: Uninstall removes skill file
- UNINST-002: Uninstall preserves project state
- UNINST-003: Uninstall is safe when already uninstalled

### Test Strategy

Use the same `HOME` override approach as install tests. Pre-populate the temp home with installed artifacts (skill file, project state). Run uninstall. Verify skill file gone, project state preserved.

## Notes

This is a small task. With hooks removed from the architecture, uninstall is simply removing a directory. Match the file format of the install script (Task 013). If install is plain JS, uninstall is plain JS.
