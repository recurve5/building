# Starters

Quick-start templates for the building framework. Each starter establishes a minimal `CLAUDE.md` that redirects the agent to a project-local `PRIMER.md` before any work begins — a pattern designed to survive context resets and session compactions.

## Pick one

### `minimal/`

Base pattern. `CLAUDE.md` + `PRIMER.md` + `.gitignore`.

Use when:
- Small or exploratory project.
- Single-developer, single-session work.
- You want the minimum footprint and no external tools to install.

Tracking lives inside the project's own `tasks/` directories, `DECISIONS.md`, and `OPEN-ITEMS.md` per the building framework.

### `bd-integrated/`

Minimal + [Beads](https://github.com/steveyegge/beads) issue-tracker integration.

Use when:
- Longer-lived project with multiple milestones.
- You want `SessionStart` and `PreCompact` hooks that auto-inject workflow context at every new session and after compaction.
- You want queryable issue state and dependencies that persist across sessions.

Requires `bd` installed:

```
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
```

## Setup

1. Copy the chosen starter's contents into your project root:
   ```
   cp -R starters/<flavor>/. /path/to/my-project/
   ```

2. Make `./building/` available inside the project as a read-only dependency. Either clone per-project or symlink to a shared clone:
   ```
   # Per-project clone
   git clone https://github.com/recurve5/building.git ./building

   # Or symlink a shared clone (note: .gitignore in the starter matches `building` — not `building/` — so symlinks are caught)
   ln -s ~/building ./building
   ```

3. Edit `PRIMER.md` — replace the `## Project` section with your own product description.

4. **`bd-integrated` only:** run `bd init` from the project root. It initializes the Beads database, installs Claude Code session hooks, and creates a project git repo if none exists.

5. Start Claude in the project root. Each session reads `CLAUDE.md` → `PRIMER.md`. For `bd-integrated`, the `SessionStart` hook runs `bd prime` automatically.

## Resuming a build mid-process

If a session ends before the pipeline completes — context window limit, interruption, or new day — start a fresh session with:

```
read Primer.md. Continue building.
```

The agent reads the PRIMER, picks up the framework pointer, and resumes from where the pipeline left off. For `bd-integrated` projects, `bd prime` fires automatically via the session hook and surfaces in-flight work. For `minimal` projects, the PRIMER's session-start checklist tells the agent to scan `DECISIONS.md`, `OPEN-ITEMS.md`, and task files for prior state.

## Why this pattern

The building framework is long. A fresh agent session — or one recovering from compaction — cannot be expected to re-derive the whole pipeline every turn.

The starter establishes three surfaces:

- `CLAUDE.md` — the contact surface. Always loaded. It says one thing: "read PRIMER.md."
- `PRIMER.md` — the project-specific execution layer. Names the project, points at the framework, lists the non-negotiable rules that must survive any context reset.
- `./building/` — the framework. Read-only, gitignored, upstream-owned.

This keeps framework updates low-friction (pull `building`) while letting each project layer its own rules on top.
