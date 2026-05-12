# PRD: Trellis

## 1. Overview

Trellis adds structural enforcement to Building. Today, the build pipeline is defined in `orchestrator.md` and enforced by the LLM's compliance with those instructions. The LLM can skip gates, forget state between sessions, and produce no durable record of what happened overnight. Trellis fixes three things:

1. **Gate enforcement via Claude Code hooks.** The hooks are external to the LLM's context window. They fire on lifecycle events (task completion, stage transitions) and enforce the pipeline mechanically. The orchestrator-LLM cannot bypass them because it does not control them.

2. **State persistence in `.building/runs/<run-id>/`.** Every run produces a committed directory of state files — what happened, what was decided, what failed, what was detected. The files are git-committed, so rollback is `git revert` and forensic review is `git log`.

3. **Morning-after summary.** A single markdown file per run, designed for top-to-bottom reading in a terminal on a phone. The user checks Claude Code's remote-control mode in the morning and sees: what shipped, what stopped, what needs attention.

**What Trellis is not:** It is not a new orchestrator. It does not replace `orchestrator.md`. It does not manage agents or route communication. It is scaffolding around the existing pipeline — enforcement, persistence, and reporting that the pipeline cannot provide for itself because it runs inside an LLM context window that does not persist.

---

## 2. Gate Enforcement

### 2.1 Hook Architecture

Trellis uses Claude Code's hook system. Hooks are defined in `.claude/settings.json` (or `.claude/settings.local.json`) and fire on specific lifecycle events. They run shell commands that inspect state and return pass/fail.

Each pipeline stage has a gate. The gate is a hook that fires when the orchestrator attempts to advance past that stage. The hook reads the current run state, checks the gate conditions, and either allows advancement or blocks it with a message explaining what failed.

### 2.2 Gate Definitions

Each gate corresponds to a pipeline stage from `orchestrator.md`. The hook checks:

| Stage | Gate Check |
|-------|-----------|
| 0 -> 1 | Milestone list exists. Human confirmation recorded. |
| 1 -> 2 | Brief file exists with non-trivial content (>50 words). |
| 2 -> 3 | PRD exists with all required sections. Decisions Log section present. No unresolved Tier 3 items in OPEN-ITEMS.md. |
| 3 -> 4 | XRD exists. Security review exists. No Critical/High findings unresolved. |
| 4 -> 5 | Every pushback item in XRD has a resolution logged in DECISIONS.md. |
| 5 -> 6 | Peer review exists. No high-severity issues unresolved. |
| 6 -> 7 | Test plan exists. Every PRD feature section has at least one mapped test case. Stress test section present. |
| 7 -> 8 | SDM review exists (or SDM stage skipped for greenfield). |
| 8 -> 9 | DAY-ZERO.md exists. Task files exist. Controversy review completed. |
| 9 -> 10 | All task acceptance criteria pass. Security code review exists with no Critical/High findings. |
| 10 -> done | Smoke test report exists with all steps passing. |

### 2.3 Gate Check Mechanics

A gate check is a shell script that:
1. Reads `.building/runs/<run-id>/state.json` to determine current stage.
2. Reads the milestone directory to check for required artifacts.
3. Returns exit code 0 (pass) or exit code 1 (fail) with a message on stderr describing what's missing.

When a gate fails, the hook prevents the stage transition. The orchestrator-LLM receives the failure message and must address it before retrying. The hook does not fix anything — it only blocks.

### 2.4 Override Mechanism

Gates can be overridden. An override is explicit, logged, committed, and permanent in the run record. Per Decision 29 (Reversible Boldness): the system prefers autonomous action with a logged trail over halting when the action is revertible.

**To override a gate (autonomous):**
1. The orchestrator-LLM writes a file `.building/runs/<run-id>/overrides/<stage>-<timestamp>.md` containing: what gate failed, why the override is justified, and what risk the override accepts.
2. The orchestrator-LLM sets `"override": true` for the relevant stage in `state.json`.
3. The gate hook re-runs. When it sees the override flag and the override file exists, it passes.
4. The override is committed to git immediately — creating a known-good revert point.

**To override a gate (user-initiated, e.g., from phone during a halt):**
1. User runs `/build --override <stage> --reason "..."`.
2. The system writes the override file and sets the flag.
3. The gate re-runs and passes.

**What the user sees in the morning-after:** Overrides appear in a dedicated section with the full justification text. They are never buried in a log. The morning-after summary sorts them by risk severity.

**Revert cost:** Each override has a dedicated git commit. If the user judges the override was wrong, `git revert <override-commit>` undoes both the override and all work built on top of it. The user knows exactly where the divergence point is.

**Degradation path:**
- *What the user sees:* A "Gates Overridden" section in the morning-after with each override's justification and the git commit hash for revert.
- *What the user thinks happened:* The system hit a structural requirement it couldn't satisfy, made a judgment call to continue, and left a clear trail.
- *What the user can do:* Review the justification. If the override was wrong, revert to the pre-override commit (one command, known target). If it was right, no action needed.

### 2.5 Failure-Mode Detection Hooks

In addition to stage-gate hooks, Trellis runs failure-mode detection hooks during the build (Stage 9). These fire on task completion events and check for the cataloged failure modes:

| Hook | Fires On | Checks For |
|------|----------|-----------|
| `scope-audit` | Task file marked complete | Files changed vs. task's Files section. Any diff outside scope fails. |
| `assertion-strength` | Test file written or modified | Assertions that test existence without testing correctness. |
| `dependency-check` | Package manifest changed | New entries not referenced in the task's contracts. |
| `attempt-counter` | Same error appearing 3+ times in session | Loop of Despair pattern. Halts the task. |
| `decision-conflict` | DECISIONS.md entry written | New entry contradicts an existing entry. |
| `ghost-reference` | Any Hard Kill decision logged | Full-text scan for references to the killed concept. |

When a failure-mode hook fires and detects a violation:
- **Tier 2 violations** (scope creep, test cheat, dependency grab, loop of despair, ghost refactor): The hook blocks task completion and writes a detection record to `.building/runs/<run-id>/detections/`. The orchestrator-LLM must fix the violation before the task can complete.
- **Tier 3 violations** (closed-loop build, heresy-deep, architecture decisions): The hook writes the detection record and halts the run. The morning-after summary shows it as a blocking item.

---

## 3. State Persistence

### 3.1 Directory Layout

```
.building/
  runs/
    <run-id>/
      state.json              # Current pipeline state
      morning-after.md        # Generated summary (written at run end or halt)
      overrides/              # One file per gate override
        3-20260510T0312Z.md
      detections/             # Failure-mode detection records
        task-003-scope-creep.md
      events/                 # Ordered event log
        001-stage-0-start.json
        002-stage-0-complete.json
        003-stage-1-start.json
        ...
      confidence/             # Per-artifact confidence assessments
        prd.json
        xrd.json
        test-plan.json
        tasks.json
```

### 3.2 Run ID Format

`<YYYYMMDD>T<HHMM>Z-<short-hash>`

- Timestamp is UTC at run start.
- Short hash is first 7 characters of a SHA-256 of the brief content + timestamp. This prevents collisions if two runs start in the same minute (unlikely for a solo developer, but the format should be unambiguous).

Example: `20260510T2230Z-a3f7c21`

### 3.3 state.json

```json
{
  "run_id": "20260510T2230Z-a3f7c21",
  "project": "trellis",
  "milestone": "m1-trellis-gate-enforcement",
  "brief_hash": "sha256:abc123...",
  "current_stage": 3,
  "stages": {
    "0": { "status": "complete", "started": "...", "completed": "...", "gate_passed": true },
    "1": { "status": "complete", "started": "...", "completed": "...", "gate_passed": true },
    "2": { "status": "complete", "started": "...", "completed": "...", "gate_passed": true },
    "3": { "status": "in_progress", "started": "...", "completed": null, "gate_passed": false }
  },
  "tasks": {
    "001": { "status": "complete", "attempts": 1 },
    "002": { "status": "in_progress", "attempts": 2 }
  },
  "halted": false,
  "halt_reason": null,
  "overrides": ["3"],
  "detections": ["task-003-scope-creep"]
}
```

### 3.4 Event Log

Events are append-only JSON files, numbered sequentially. Each event has:

```json
{
  "timestamp": "2026-05-10T22:45:12Z",
  "event": "stage_complete",
  "stage": 2,
  "data": {
    "gate_result": "pass",
    "artifacts_produced": ["PRD.md"],
    "duration_minutes": 18
  }
}
```

Events record: stage transitions, gate results (pass/fail/override), task starts/completions, failure-mode detections, halts, and confidence assessments.

### 3.5 Git Commit Strategy

Trellis commits state at two points:
1. **On stage completion.** After a gate passes (or is overridden), the run state is committed with message: `[trellis] Stage N complete: <stage name>`.
2. **On halt.** If the run halts (Tier 3 detection, unrecoverable gate failure, context window exhaustion), state is committed with message: `[trellis] Run halted: <reason>`.

Commits are to the working branch. They include only `.building/runs/<run-id>/` files and the milestone directory artifacts produced in that stage. Source code commits from the build (Stage 9) are separate — task-agent commits code, Trellis commits state.

### 3.6 Rollback

Rolling back means reverting to a prior stage's state. Because state is committed at each stage boundary, rollback is:

```bash
git log --oneline --grep="[trellis]"   # Find the commit for the stage you want
git revert <commit>                     # Revert forward (preserves history)
```

The orchestrator-LLM can also rollback programmatically by resetting `state.json` to a prior stage and re-running from there. The event log preserves the full history including the reverted stages.

**Degradation path:**
- *What the user sees:* The morning-after shows "Run rolled back to Stage N" with reason.
- *What the user thinks happened:* The system hit a dead end and recovered by undoing work back to the last known-good state.
- *What the user can do:* Review the rolled-back work in git history. Decide whether to retry with different constraints or abandon that approach.

---

## 4. Morning-After Summary

### 4.1 Design Constraints

The morning-after is read on a phone in Claude Code's remote-control mode. This means:
- Terminal rendering (monospace, no rich formatting beyond markdown)
- Narrow viewport (assume 80 chars, but phone terminals vary)
- Read top-to-bottom in one pass
- The user's attention is freshest at the top

### 4.2 Structure

```markdown
# Morning After: <project> / <milestone>
Run: <run-id>
Duration: <hours>h <minutes>m
Result: SHIPPED | HALTED | PARTIAL

---

## What Shipped
- <feature/artifact 1>: <one-line description>
- <feature/artifact 2>: <one-line description>

## What Stopped (if halted)
Stage <N> — <stage name>
Reason: <one sentence>
Action needed: <what the user must decide or do>

## Gates Overridden (if any)
### Stage <N>: <gate name>
Justification: <from override file>
Risk accepted: <one sentence>

## Failure Modes Detected
### <detection name>
Task: <task number and name>
Mode: <failure mode name>
Resolution: FIXED (Tier 2) | BLOCKED (Tier 3)
Detail: <one sentence>

## Confidence
| Artifact | Level | Reason |
|----------|-------|--------|
| PRD | verified | All sections present, peer-reviewed |
| XRD | verified | Security review clear, pushback resolved |
| Build | partial | 2 tasks had scope-creep detections (fixed) |

## Decisions Made (Tier 2)
- <decision 1>: <rationale in one sentence>
- <decision 2>: <rationale in one sentence>

## Open Items (Tier 3)
- <item 1>: <user story in one sentence>
- <item 2>: <user story in one sentence>

## Stats
Tasks completed: <N>/<total>
Tests passing: <N>/<total>
Commits: <N>
Failure modes detected: <N> (fixed: <N>, blocking: <N>)
```

### 4.3 Generation Rules

The morning-after is generated:
- At run completion (all stages done, smoke test passed)
- At halt (any point the run cannot continue)
- On context-window exhaustion (before the session ends)

It is generated from the event log and state files — not from the LLM's memory. This ensures it reflects what actually happened, not what the LLM believes happened.

### 4.4 Confidence Assessment

Two tiers for v1:

**Verified:** The artifact passed its gate without override, no failure-mode detections fired during its production, and any peer/security review cleared without high-severity issues.

**Partial:** The artifact passed its gate but one or more of: an override was used, a failure-mode detection fired (even if fixed), or a review surfaced issues that were resolved but indicate the artifact was produced under stress.

The confidence level is per-artifact, not per-run. A run can have verified PRD and partial build.

### 4.5 Sections That Don't Appear

If a section has no content (no overrides, no detections, no Tier 3 items), it does not appear. The morning-after is as short as the run allows. A clean overnight build produces: What Shipped, Confidence, Stats.

**Degradation path (long morning-after):**
- *What the user sees:* Multiple sections with items requiring attention.
- *What the user thinks happened:* The overnight build ran into issues but kept going where it could.
- *What the user can do:* Read the "What Stopped" and "Open Items" sections first. Those are the only sections requiring action. Everything else is informational.

---

## 5. Bootstrap and Handoff

### 5.1 Bootstrap

Running Trellis for the first time on a project creates the `.building/` directory structure. Bootstrap does not analyze git history, import existing state, or retroactively assess prior work.

**Bootstrap creates:**
```
.building/
  runs/          # Empty — populated on first run
  hooks/         # Gate check scripts
  config.json    # Trellis configuration
```

**Bootstrap also:**
- Adds hook entries to `.claude/settings.json` (or creates the file if absent)
- Adds `.building/` to the project's `.gitignore` exceptions (if `.building/` would otherwise be ignored)
- Commits the bootstrap with message `[trellis] Bootstrap`

**Bootstrap does not:**
- Modify `orchestrator.md` or any agent prompt
- Create a run
- Analyze existing milestone directories
- Require any input beyond confirming the project name

### 5.2 Handoff (Starting a Run)

A run begins when the user invokes the build pipeline with a brief. The handoff format is:

```
/build <path-to-brief>
```

Or equivalently, pasting the brief content after the starter prompt. Trellis detects pipeline start by watching for the orchestrator-LLM to begin Stage 0 (Milestone Decomposition).

When a run starts, Trellis:
1. Generates the run-id from timestamp + brief hash.
2. Creates `.building/runs/<run-id>/`.
3. Writes initial `state.json` with stage 0 in progress.
4. Commits: `[trellis] Run started: <run-id>`.
5. Activates gate hooks for this run.

The user's pre-work (if any — notes, prior art, reference files) is referenced in the brief. Trellis does not manage pre-work files.

### 5.3 Run Lifecycle

```
START -> Stage 0 ... Stage 10 -> COMPLETE
                  \-> HALT (at any point)
```

A run is in exactly one state: `running`, `halted`, or `complete`. There is no paused state — if the context window exhausts, the run halts. The user resumes by starting a new session that picks up from the halted state (reading `state.json` to determine where to continue).

**Degradation path (context window exhaustion):**
- *What the user sees:* Morning-after shows "HALTED — context window exhaustion at Stage N."
- *What the user thinks happened:* The build was too large for a single session.
- *What the user can do:* Start a new session. The orchestrator reads `state.json`, sees the current stage, and continues from there. No work is lost because state was committed at the last stage boundary.

---

## 6. Post-Milestone Outputs

### 6.1 Performance Findings

After the build completes (Stage 9) and before the smoke test (Stage 10), the performance agent (if configured) produces findings. These findings:
- Are written to the milestone directory as `performance-review.md`
- Are recorded in the event log
- Appear in the morning-after under a "Performance Notes" section (if any exist)
- Do NOT block the smoke test or the next milestone
- Are categorized as informational (no action required now) or recommended (action suggested for a future milestone)

### 6.2 Security Findings (Post-Build)

The security code review (Stage 9.5) produces findings that ARE gating — Critical/High findings block Stage 10. Medium findings are logged with remediation and appear in the morning-after but do not block.

### 6.3 SDM Refactor Recommendations

After a milestone completes, the SDM agent can assess whether the codebase needs structural work before the next milestone. These recommendations:
- Are written to the completed milestone directory as `sdm-reassessment.md`
- Appear in the morning-after as Tier 3 items (user decides whether to act)
- Do NOT gate the next milestone automatically
- Include: what debt was observed, what the consequence of ignoring it is, and what a refactoring milestone would look like

**Degradation path (SDM recommends refactoring):**
- *What the user sees:* Morning-after Open Items section: "SDM recommends refactoring <area> before next milestone. Risk of ignoring: <consequence>."
- *What the user thinks happened:* The build revealed structural issues that will compound if unaddressed.
- *What the user can do:* Accept the recommendation (insert a refactoring milestone), defer it (acknowledge the risk), or dismiss it (the system continues regardless).

---

## 7. First-Run Walkthrough

This is the user's first overnight build with Trellis, start to finish.

### 7.1 Evening Setup

**Step 1: Bootstrap (one-time)**
```bash
cd ~/my-project
claude
> /build --bootstrap
```
Output: "Trellis bootstrapped. Created .building/ directory. Hooks installed. Ready for first run."

The user sees the `.building/` directory and hook entries in `.claude/settings.json`. No other project files are modified.

**Step 2: Start the run**
```bash
> /build ~/my-project/brief.md
```
Output:
```
[trellis] Run started: 20260510T2230Z-a3f7c21
[trellis] Stage 0: Milestone Decomposition — starting
```

The orchestrator-LLM takes over. It reads the brief and begins the pipeline. Trellis is invisible to the user from this point — it runs alongside the pipeline, enforcing gates and recording state.

**Step 3: Confirm milestones (if multi-milestone)**

The orchestrator surfaces the milestone list. The user confirms (this is the existing interaction — Trellis does not change it). After confirmation:
```
[trellis] Stage 0: complete. Gate passed.
[trellis] Stage 1: Brief — starting
```

**Step 4: Go to sleep**

The pipeline runs. Gates fire at each stage boundary. The user sees nothing further until morning (unless they check the remote-control session).

### 7.2 Overnight (No User Interaction)

The pipeline runs through stages 1-10 (or halts). At each stage boundary:
- Gate hook fires and checks conditions
- If gate passes: state committed, next stage begins
- If gate fails: orchestrator-LLM addresses the failure and retries
- If gate cannot be satisfied: orchestrator-LLM writes an override (if justified) or halts the run

Failure-mode hooks fire during Stage 9 (Build). Tier 2 detections are fixed inline. Tier 3 detections halt the run.

### 7.3 Morning Review

**Step 5: Check the morning-after**
```bash
cat .building/runs/20260510T2230Z-a3f7c21/morning-after.md
```

The user reads the summary top-to-bottom. If the result is SHIPPED, they review the "What Shipped" and "Confidence" sections. If HALTED, they read "What Stopped" first.

**Step 6: Act on open items (if any)**

For each Tier 3 item in the morning-after, the user either:
- Answers the question (starts a new session, provides the answer, pipeline continues)
- Defers it (acknowledges the risk, pipeline continues past it)
- Rolls back (reverts to a prior stage and changes approach)

**Step 7: Verify the build**

If SHIPPED, the user runs the product and confirms the smoke test results match their expectations. The smoke test already ran automatically — this is the user's subjective "does this feel right" check.

### 7.4 What Success Looks Like

The user goes to sleep with a brief loaded. They wake up to a morning-after that says SHIPPED with verified confidence on all artifacts. They read it in 30 seconds, skim the decisions log to see what Tier 2 calls were made, and start using the product. Total morning time: under 5 minutes for a clean build.

---

## 8. Decisions Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Gate enforcement via Claude Code hooks, not a meta-agent | Hooks are external to the LLM context window. A meta-agent could be convinced to skip checks. Hooks cannot be bypassed by prompt manipulation. |
| 2 | State committed to git, not a database or external service | The user's constraint: no separate infrastructure. Git is already the persistence layer. Rollback is git operations the user already knows. |
| 3 | Morning-after generated from event log, not LLM memory | LLM memory is lossy and can confabulate. The event log is append-only and reflects what the hooks actually observed. |
| 4 | Override mechanism requires a written justification file | Prevents quiet bypasses. The override is a deliberate act with a paper trail. The user can grep for override files across all runs to see patterns. |
| 5 | Two confidence tiers (verified/partial) for v1 | More tiers create ambiguity about what "medium confidence" means. Two tiers force a binary: did anything go wrong during production, or not? |
| 6 | Run halts on context exhaustion rather than "pausing" | A paused state requires mechanism to resume mid-stage. Halting at stage boundaries is simpler — the state file tells you exactly where to pick up. Context exhaustion mid-stage means the current stage's work may be incomplete, which is the same as a halt. |
| 7 | Bootstrap does not analyze history | Retroactive analysis is unreliable (what counts as a "stage" in prior freeform work?) and scope-creeping. Clean start. Prior work stands as-is. |
| 8 | Failure-mode hooks fire on task completion, not continuously | Continuous monitoring during code generation would interrupt the agent mid-thought. Checking at completion is less intrusive and catches the same issues (the violation is in the output, not the process). |
| 9 | SDM refactor recommendations are Tier 3, not gating | The user decides whether to invest in refactoring. Automatic gating would block progress on judgment calls that only the user can make. |
| 10 | No push notifications — system halts and waits | The user chose this. The phone check is asynchronous. If the system halts at 3am, the morning-after shows it. No infrastructure for push delivery. |
| 11 | Overrides visible as dedicated morning-after section, never buried | Override review answers: is the user aware? (yes, dedicated section). Can they do something? (yes, revert). Does friction scale? (yes — more overrides means longer section means more reading). |

---

## Tier 3 Items

None. All open items from the playback were resolved by the confirmed assumptions.

---

## Assumptions Made

1. **Claude Code hooks can fire on "task completion" events.** The PRD assumes hooks can be triggered when the task-agent marks a task complete. If Claude Code hooks only fire on file-system events or command events, the failure-mode detection hooks need a different trigger mechanism (e.g., watching for writes to the task file's "Completed" section).

2. **Claude Code hooks can read and return structured error messages.** The PRD assumes a hook can return stderr that the orchestrator-LLM receives as context. If hooks are fire-and-forget without message passing, the gate-failure communication path needs redesign.

3. **The `.claude/settings.json` hook format supports the specificity needed.** The PRD assumes hooks can be scoped to specific file patterns or event types granularly enough to distinguish "package manifest changed" from "any file changed." If the hook system is coarser, some failure-mode hooks may need to run on broader triggers and filter internally.

4. **Single-session builds of 8-10 hours are within Claude Code's session limits.** If there's a hard session timeout shorter than a full pipeline run, the halt-on-exhaustion mechanism becomes the primary path rather than the degradation path. The system still works — but "HALTED" becomes the common morning-after result for large milestones.

5. **The `/build` command (or equivalent) is implementable as a Claude Code slash command or hook trigger.** If slash commands can't trigger the bootstrap/run-start sequence, an alternative entry point is needed (e.g., a shell script that sets up state before invoking `claude`).
