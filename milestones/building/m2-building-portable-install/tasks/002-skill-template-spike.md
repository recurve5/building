# Task 002: Skill Template Content Spike

**Track:** Spike
**Phase:** 0 (blocks Phase 3)
**Status:** not started
**Depends on:** none
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-11 (Skill Template Contract), SDM Risk R-2, SDM IP-6, Peer Review Issue 8, Peer Review Gap G-4

## What to Build

A verification that a thin-but-not-too-thin global skill file can successfully drive the orchestrator when loaded from `~/.claude/skills/`. The SDM review flagged that the current 200-line skill file works because everything is in one file. The new skill file must include enough inline to function even if the orchestrator.md reference is not immediately read.

Produce:
1. A draft skill file (`milestones/building/m2-building-portable-install/spike-skill-draft.md`) with inline content covering the minimum viable set.
2. A spike report (`milestones/building/m2-building-portable-install/spike-skill-report.md`) documenting what must be inline vs. referenced.

### Test Procedure

1. Read the current skill file at `.claude/skills/build.md` and catalog its content sections.
2. Draft a new skill file that:
   - Has the correct YAML frontmatter for a global skill.
   - Includes inline: three-path model, project name derivation, state directory location, command routing table, stage advancement protocol, sub-agent paths, project.lock collision check.
   - References orchestrator.md for: full pipeline stage definitions, gate details, detection system details.
3. Temporarily install the draft skill file at `~/.claude/skills/build/SKILL.md`.
4. Test: invoke `/build --status` from a project directory. Verify the skill correctly derives the project name and locates state.
5. Document findings: what worked, what was missing, what needed to be inline vs. referenced.
6. Restore the original skill file setup.

## Files

- Create: `milestones/building/m2-building-portable-install/spike-skill-draft.md`
- Create: `milestones/building/m2-building-portable-install/spike-skill-report.md`
- Do not touch: `.claude/skills/build.md` (read only), `orchestrator.md` (read only)

## Contracts

The spike report must answer:

1. What content must be inline in the skill file for the orchestrator to function correctly?
2. Does the LLM reliably follow the "Read orchestrator.md at: <path>" instruction?
3. What is the minimum skill file size (approximate line count) that works?
4. Does the BUILDING_HOME path need special formatting to be unambiguous to the LLM?

The spike draft becomes the basis for the skill template in Task 012.

## Acceptance Criteria

1. The draft skill file successfully routes `/build --status` to the correct state directory.
2. The spike report identifies the minimum inline content set.
3. The spike report documents whether the orchestrator.md reference chain works reliably.
4. The BUILDING_HOME path format is confirmed as unambiguous.

## Tests

- SKILL-001 through SKILL-005 (partial validation during spike)

## Notes

Task 001 (hook env var spike) has been removed — hooks are no longer installed in settings.json. This spike is now the only Phase 0 spike. The findings from this spike directly inform Task 012 (skill template and content).

The current skill file is the primary reference. Read it carefully to understand what the orchestrator expects to find inline. Focus on: what breaks if it is missing vs. what is merely convenient to have inline.
