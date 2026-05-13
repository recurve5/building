# Task 012: Skill Template and Global Skill Content

**Track:** F (Skill Rewrite)
**Phase:** 3 (User-Facing)
**Status:** not started
**Depends on:** 002, 003, 004, 009, 011
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-11 (Skill Template Contract), D0-1 (Path Resolver Interface), D0-3 (Bootstrap Contract), D0-7 (Git Commit Protocol), Task 002 spike report (skill template findings)

## What to Build

Create the skill template source file and determine its content based on Task 002 spike findings. Also remove the old project-local skill file.

### 1. Skill Template (tools/install/skill-template.md)

A Markdown file with `{{BUILDING_HOME}}` placeholders. The install script (Task 013) reads this file and replaces placeholders to produce the global skill file.

Content must include inline (per D0-11 — **fat skill file with all critical protocol rules**):
- YAML frontmatter: `name: build`, `description: Run the Building pipeline`, `user-invocable: true`.
- Three-path model: BUILDING_HOME (baked in), PROJECT_DIR (from `$PWD`), PROJECT_STATE (derived from project name).
- Project name derivation rules (D0-12 summary).
- State directory: `~/.building/projects/<project-name>/`.
- Command routing: `/build <brief>`, `/build --status`, `/build --resume`, `/build --bootstrap` (implicit).
- **State write protocol:** how to read, validate, snapshot (copy state.json to state.json.stage-N), and write state.json.
- **Stage advancement sequence:** the ordered list of stages and their transitions.
- **Gate enforcement behavior:** before writing state.json to advance a stage, call `gate-check.sh` via Bash tool with `BUILDING_HOME`, `PROJECT_DIR`, and `PROJECT_STATE` as env vars. Call `detection-check.sh` via Bash tool after task completions. No hooks in settings.json.
- **Sub-agent dispatch with context curation:** paths to `{{BUILDING_HOME}}/.claude/agents/` for peer-reviewer, task-auditor, security-reviewer, sdm-assessor, and rules for what context to pass to each.
- **Halt/resume protocol:** how to halt a run and how `/build --resume` picks up.
- **Override protocol:** how overrides are recorded and applied.
- Git commit protocol: `commitProjectCode()` in project repo, neutral messages.
- Project.lock collision check: on `/build` invocation, check `$PROJECT_STATE/project.lock` against `$PWD`.
- `createInitialState()` signature with `projectDir` parameter.

Content referenced by path (not inline):
- Full pipeline stage descriptions: `Read {{BUILDING_HOME}}/orchestrator.md`.
- Agent role definitions: `{{BUILDING_HOME}}/prompts/<agent>.md`.

### 2. Remove Old Skill File

Delete `.claude/skills/build.md`. This is the project-local skill file that is replaced by the global skill at `~/.claude/skills/build/SKILL.md`.

### 3. Skill File Verification

The generated skill file (after interpolation) must be verifiable:
- Contains the correct BUILDING_HOME path (SKILL-001).
- References orchestrator.md by absolute path (SKILL-002).
- Is regenerated on re-install (SKILL-003 -- the template is the source of truth).
- Derives project name from PWD (SKILL-004).
- Routes state to correct project state path (SKILL-005).

## Files

- Create: `tools/install/skill-template.md`
- Delete: `.claude/skills/build.md`
- Do not touch: orchestrator.md, agent prompts, hook scripts

## Contracts

### Template Placeholder

The only placeholder is `{{BUILDING_HOME}}`. The install script replaces all occurrences with the absolute path.

### Skill File YAML Frontmatter

```yaml
---
name: build
description: Run the Building pipeline
user-invocable: true
---
```

### Content Sections (minimum)

1. **Building Home** — `{{BUILDING_HOME}}` on its own line, clearly labeled.
2. **Three-Path Model** — BUILDING_HOME, PROJECT_DIR, PROJECT_STATE with derivation rules.
3. **Command Routing** — what each `/build` subcommand does.
4. **State Protocol** — where state lives, how to read/write/snapshot it.
5. **Bootstrap** — implicit on first `/build`, collision check via project.lock.
6. **Stage Advancement** — write state.json to advance, call gate-check.sh via Bash tool before writing.
7. **Gate Enforcement** — call gate-check.sh and detection-check.sh via Bash tool calls with BUILDING_HOME, PROJECT_DIR, PROJECT_STATE as env vars. No hooks in settings.json.
8. **Sub-Agent Dispatch** — paths to agent definitions and prompts, context curation rules.
9. **Halt/Resume Protocol** — how to halt and resume builds.
10. **Override Protocol** — how overrides are recorded and applied.
11. **Git Protocol** — commitProjectCode in project repo, neutral messages.
12. **Orchestrator Reference** — `Read {{BUILDING_HOME}}/orchestrator.md for full stage descriptions and agent roles`.

## Acceptance Criteria

1. `tools/install/skill-template.md` exists with all required content sections (D0-11).
2. `{{BUILDING_HOME}}` is the only placeholder and appears in all path references.
3. `.claude/skills/build.md` is deleted.
4. The template, when interpolated with a test path, produces a valid skill file (correct YAML frontmatter, correct paths).
5. The skill file contains project name derivation rules matching D0-12.
6. The skill file contains the `createInitialState()` signature with `projectDir` parameter.
7. The skill file contains the project.lock collision check protocol.

## Tests

- SKILL-001: Skill file contains correct BUILDING_HOME (verified by template interpolation test)
- SKILL-002: Skill file references orchestrator.md by absolute path
- SKILL-003: Skill file is regenerated on re-install (template is source of truth)
- SKILL-004: Skill file derives project name from PWD
- SKILL-005: Skill file routes state to ~/.building/projects/<project>/

## Notes

Read the Task 002 spike report before starting. It documents what content must be inline vs. referenced and whether the orchestrator.md reference chain works reliably. Use those findings to calibrate the template content.

The current skill file at `.claude/skills/build.md` is the primary reference for what the orchestrator expects. Read it thoroughly to understand the command routing, state protocol, and sub-agent dispatch patterns. Adapt these for the three-path model.

The BUILDING_HOME path must be on its own line, clearly labeled, and maximally unambiguous (Peer Review Gap G-4). The LLM reads this as plain text and uses it in subsequent tool calls. If the path is buried in a paragraph or formatted ambiguously, the LLM may construct wrong paths.
