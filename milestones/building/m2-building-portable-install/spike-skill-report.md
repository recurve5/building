# Spike Report: Skill Template Content

**Task:** 002-skill-template-spike
**Date:** 2026-05-12
**Status:** Complete

## Question 1: What content must be inline in the skill file?

### Must be inline (breaks without it)

1. **BUILDING_HOME constant** — The absolute path to the Building repo. Without this, the LLM has no way to locate any Building artifacts (orchestrator, agents, scripts, tools). This is the single most critical piece of information.

2. **Three-path model** — BUILDING_HOME, PROJECT_DIR (`$PWD`), PROJECT_STATE (`~/.building/projects/<name>/`). The LLM must understand all three paths and their derivation to route any command correctly. Without it inline, the skill cannot even locate state.

3. **Project name derivation rules** — The sanitization algorithm (lowercase, spaces/underscores to hyphens, strip non-`[a-z0-9-]`, collapse hyphens, trim). Without these rules inline, the LLM cannot compute the state directory path from `$PWD`.

4. **Command routing table** — The five `/build` commands and their dispatch logic. This is the entry point — without it, the skill has no behavior.

5. **State write protocol with snapshot** — Read, validate, snapshot (`state.json.stage-N`), write, gate-check. The snapshot step is new in v2 and critical for forensic debugging. If missing, state transitions happen without snapshots, losing the recovery mechanism.

6. **Gate enforcement via Bash tool** — The exact invocation pattern: `BUILDING_HOME=... PROJECT_DIR=... PROJECT_STATE=... gate-check.sh <from> <to> <path>`. Without this inline, the LLM falls back to old hook-based behavior or skips gates entirely.

7. **Sub-agent dispatch paths** — The table mapping agents to `{{BUILDING_HOME}}/.claude/agents/<name>.md`. Without this, the LLM cannot spawn sub-agents with correct context.

8. **project.lock collision check** — The check-on-every-invocation protocol. If missing, two projects with the same basename silently corrupt each other's state.

9. **Halt/resume protocol** — What happens when the pipeline stops and how `/build --resume` picks up. Without it inline, a halted run cannot be recovered.

10. **Override protocol** — How overrides are recorded and how the gate check honors them. Without it, `/build --override` doesn't work.

11. **Bootstrap protocol** — What `/build --bootstrap` creates and where. Without it, the skill cannot set up a new project.

### Can be referenced (orchestrator.md)

1. **Full stage descriptions** — What each stage does in detail (agent roles, what artifacts are produced, quality expectations). The skill only needs the stage table inline. The orchestrator has the long descriptions.

2. **Agent prompt content** — The actual agent prompts in `prompts/`. The skill only needs the dispatch table; the prompts are loaded by the spawned sub-agents.

3. **Gate script details** — What each individual gate checks for. The skill calls gate-check.sh; the script handles the details.

4. **Detection system details** — What each detection script looks for. Same pattern as gates.

5. **Morning-after generation details** — The full template and section logic. The skill needs the trigger points; the details are in the trellis library.

6. **Confidence assessment details** — How confidence scores are calculated.

7. **Writing quality guidelines** — `writing-failure-modes.md` and related docs.

## Question 2: Does the LLM reliably follow "Read orchestrator.md at: <path>"?

**Answer: No — not reliably enough for core protocol.**

The current skill file works because everything is in one file. When the skill says "Read orchestrator.md for full stage descriptions," the LLM may or may not actually read it before proceeding. Observed failure modes:

- **Lazy loading:** The LLM proceeds with the inline content and only reads orchestrator.md when it encounters an ambiguity. This works for supplementary detail but fails if the referenced content is load-bearing.
- **Hallucinated content:** If the LLM has prior training knowledge of similar pipeline systems, it may synthesize plausible-but-wrong details rather than reading the file.
- **Session context pressure:** In long sessions, the LLM may skip the file read to conserve context window.

**Mitigation for the fat skill:** All protocol-critical content is inline. The orchestrator.md reference is genuinely supplementary — the pipeline functions correctly even if orchestrator.md is never read. Reading it improves agent stage execution quality but doesn't break routing, state management, or gate enforcement.

## Question 3: Minimum skill file size?

**Approximate line count of the draft: ~230 lines.**

The current M1 skill file is ~200 lines. The M2 draft is ~230 lines — modestly longer despite covering more protocol. The increase comes from:
- Three-path model documentation (+10 lines)
- Project name derivation rules (+5 lines)
- project.lock collision check (+8 lines)
- Gate enforcement via Bash (replacing hook-based protocol) (+8 lines)
- State snapshot protocol (+5 lines)

Partially offset by removing hook-related content (-15 lines) and simplifying bootstrap (-5 lines).

**Could it be shorter?** The state write protocol and gate enforcement sections are the longest and most critical. Compressing them risks the LLM missing steps (especially the snapshot). The command routing table and stage table are already terse. The sub-agent dispatch table is minimal.

**Verdict:** ~230 lines is near the minimum for reliable operation. Below ~180 lines, core protocol steps would need to be omitted, creating dependence on orchestrator.md for load-bearing content.

## Question 4: BUILDING_HOME path format

**Format: Absolute path, no trailing slash, no tilde expansion, no variable references.**

```markdown
**BUILDING_HOME:** /Users/dev/building
```

Findings:
- **Absolute paths are unambiguous.** The LLM treats `/Users/dev/building` as a literal string and uses it correctly in `join()` operations and Bash commands.
- **Tilde (`~`) is ambiguous.** In Bash, `~` expands to `$HOME`. In TypeScript/Node, it does not. The skill file is read by the LLM, which may or may not expand `~` correctly when interpolating into Bash commands. Use the absolute path.
- **No trailing slash.** Path joining with `path.join()` handles this correctly, but Bash string concatenation does not. `"/Users/dev/building/" + "orchestrator.md"` produces a double slash. The install script strips trailing slashes.
- **No `$BUILDING_HOME` variable.** The LLM reads the skill as markdown text. Using a variable reference requires the LLM to resolve it, adding a failure point. The literal path is substituted at install time by the install script.

The install script writes `**BUILDING_HOME:** /absolute/path/to/building` with the actual resolved path. The `{{BUILDING_HOME}}` placeholders in the template are replaced at install time. No runtime resolution needed.

## Summary

The draft skill file at `spike-skill-draft.md` is ~230 lines and contains all protocol-critical content inline. It references orchestrator.md only for supplementary stage descriptions and agent role details. The three-path model, project name derivation, state snapshot protocol, gate enforcement via Bash, and project.lock collision check are all inline.

The draft becomes the basis for Task 012 (skill template and content). The `{{BUILDING_HOME}}` placeholder pattern is confirmed as the right approach for the install-time template in `tools/install/skill-template.md`.
