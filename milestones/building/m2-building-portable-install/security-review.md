# Security Review: Portable Install

## Scope

Post-XRD architectural security review for the M2 Portable Install milestone. Reviews the three-path model, global hook installation, state directory structure, install script, and the new attack surface introduced by moving from an in-repo model to a user-level model.

## Findings

### S-1: Baked-in Absolute Path in Skill File

**Severity:** Low (reduced from Medium)
**Category:** Information Disclosure
**Affected Files:** `~/.claude/skills/build/SKILL.md`

**Description:** The install command writes the absolute path to the Building repository into the skill file. On a shared machine or a machine where `~/.claude/` is synced to a cloud service, this leaks the developer's filesystem layout (home directory name, directory structure).

The skill file contains a line like `Building home: /Users/jsmith/code/building` which discloses the username and directory structure.

**Reduced scope:** Previously, hook entries in `~/.claude/settings.json` also contained baked-in paths. With hooks removed, only the skill file contains a baked-in path. The exposure is limited to one file rather than two.

**Risk:** Low practical risk. `~/.claude/` is not typically shared or synced. The information disclosed (filesystem paths) is low-sensitivity. An attacker who can read `~/.claude/` already has local access to the machine.

**Remediation:** Accept for v1. If Building later supports team/shared configurations, paths should use `$HOME` expansion rather than baked-in absolute paths. For now, the skill file is a local-only file with no sharing mechanism.

---

### S-2: ~~User-Level Hooks Execute on All Claude Code Sessions~~

**Severity:** ~~Medium~~ ELIMINATED
**Category:** Unintended Execution Scope

**Status:** This finding is eliminated by the architectural change to remove hooks from `~/.claude/settings.json`. Gate enforcement is now performed by the `/build` skill via direct Bash tool calls to gate-check.sh and detection-check.sh. The scripts only execute during an active build session when the skill explicitly invokes them — they never fire on non-Building sessions.

The entire class of risk (hook scripts having visibility into all Claude Code sessions' file writes) no longer exists.

---

### S-3: State Directory Readable by Any Process

**Severity:** Low
**Category:** Data Exposure
**Affected Files:** `~/building/projects/`

**Description:** The `~/building/` directory is created with default permissions (typically 755 on macOS/Linux). Any process running as any user on the machine can read pipeline state, including:
- Project names (directory listing reveals what the developer is working on)
- PRD and XRD content (product plans, architecture decisions)
- DECISIONS.md (product and engineering decisions)
- state.json (pipeline progress, run timing)

On a multi-user machine, this leaks project information to other users.

**Risk:** Low. Most developer machines are single-user. The data in Building state is non-secret (no credentials, no API keys, no personal data). PRDs and architecture docs are typically shared within teams anyway.

**Remediation:** Create `~/building/` with 700 permissions (owner-only). The install script should explicitly `chmod 700 ~/building/`. This prevents other users from reading the directory. It does not protect against other processes running as the same user, but that is standard for user-level data.

---

### S-4: Atomic Write Race Window

**Severity:** Low
**Category:** Race Condition / Integrity
**Affected Files:** `tools/trellis/src/state.ts`, all atomic write paths

**Description:** The atomic write pattern (write to temp file, rename) has a small window where the temp file exists alongside the target file. If the process crashes after writing the temp file but before the rename, the temp file remains on disk. On the next run, Building reads the original (stale) state.json and ignores the temp file.

This is the designed behavior (crash safety: the old file is the fallback). The finding is that orphaned temp files accumulate over time if crashes are frequent. They are named `.state.<random>.tmp` and live in the same directory as state.json.

**Risk:** Negligible. Temp files are small (a few KB). They do not affect correctness. A developer would need hundreds of crashes to accumulate meaningful disk usage.

**Remediation:** The morning-after summary or the bootstrap routine can clean up `.*.tmp` files in the runs directory. Not a v1 priority.

---

### S-5: No Integrity Verification on Hook Scripts

**Severity:** Info
**Category:** Tamper Detection
**Affected Files:** All hook scripts in `.building/hooks/`

**Description:** The install command writes hook entries that reference scripts by path. There is no checksum or signature verification that the scripts have not been modified since install. If an attacker modifies a hook script in the Building repo directory, the modified script executes on every Claude Code session.

**Risk:** Extremely low. The attacker needs write access to the Building repo directory, which means they already have the developer's user-level access. Modifying hook scripts is one of many things such an attacker could do.

**Remediation:** Not actionable for v1. Integrity verification would require a signing mechanism and a trusted verifier — complexity disproportionate to the threat. Note for future: if Building is ever distributed as a binary package (not a git clone), integrity verification becomes relevant.

---

## Architecture Concerns

### Concern 1: Hook Command Injection via Project Directory Name

The hook scripts derive PROJECT_NAME from `basename $PWD`. If a project directory name contains shell metacharacters (e.g., a directory named `my;rm -rf ~/`), the derived name could inject commands into shell operations.

**Assessment:** The XRD's `deriveProjectName()` in `paths.ts` lowercases and replaces spaces with hyphens, but does not sanitize shell metacharacters. The bash scripts use the derived name in path construction (`$PROJECT_STATE`), which is passed to `find`, `jq`, and other commands.

**Remediation:** The `deriveProjectName()` function must strip all characters except `[a-z0-9-]`. The bash `resolve_project_paths()` function must do the same sanitization. Both layers must agree on the sanitization rules.

### Concern 2: Symlink Following in State Directory

If an attacker creates a symlink at `~/building/projects/target-project/` pointing to a sensitive directory (e.g., `~/.ssh/`), Building would write state files into that directory.

**Assessment:** Low risk. The attacker needs write access to `~/building/projects/`, which requires user-level access. An attacker with that access can already read `~/.ssh/` directly.

**Remediation:** The bootstrap routine can check that the project state directory is not a symlink before writing. `lstat()` instead of `stat()` for the existence check. Low priority.

## Dependency Audit

No new dependencies are introduced by this milestone. The install script uses only Node.js built-ins (`fs`, `path`, `child_process`). No npm packages are added.

## Summary

No Critical or High findings. S-2 (hooks execute on all sessions) was eliminated by moving gate enforcement from global hooks to skill-invoked Bash tool calls. S-1 severity reduced from Medium to Low — only the skill file contains a baked-in path (no hook entries in settings.json). The architecture concern about command injection via project directory names requires action during implementation (sanitize `deriveProjectName()`). All other findings are informational or low severity.
