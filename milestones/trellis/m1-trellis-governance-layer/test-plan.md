# Test Plan: Trellis — Governance Layer for Building

## 1. Overview

### Scope

This test plan covers all functionality defined in the Trellis PRD: gate enforcement via Claude Code hooks, state persistence in `.building/runs/`, morning-after summary generation, bootstrap and handoff, failure-mode detection hooks, and post-milestone outputs. Every PRD feature section has at least one test case. Edge cases surfaced by the XRD and peer review are included.

### Automation Strategy

All tests are automated. No manual test steps.

- **Unit tests:** Pure logic — state transitions, run-ID generation, event numbering, confidence classification, morning-after section filtering. Written in TypeScript using Vitest (matching building-audit's existing test infrastructure).
- **Integration tests:** Multi-component flows — hook fires on state.json write, gate script reads milestone directory, morning-after generates from event log + state files. Use filesystem fixtures and subprocess invocation. Bash gate scripts tested via `bash -c` from TypeScript test harness.
- **Stress tests:** Resource limits, concurrency edge cases, boundary conditions at scale. Executed as integration tests with larger fixtures and performance assertions.

### Test Framework

- TypeScript tests: Vitest
- Bash script tests: invoked from Vitest via `child_process.execSync`, assertions on exit code + stderr/stdout
- Fixtures: static directories under `tests/fixtures/` representing known run states, milestone directories, and state.json variants

### ID Convention

`[AREA]-[NNN]` where AREA is a short code for the feature area:

| Area Code | Feature Area |
|-----------|-------------|
| GATE | Gate enforcement (Section 2) |
| STATE | State persistence (Section 3) |
| MAFTER | Morning-after summary (Section 4) |
| BOOT | Bootstrap and handoff (Section 5) |
| DETECT | Failure-mode detection hooks (Section 2.5) |
| POST | Post-milestone outputs (Section 6) |
| HOOK | Hook infrastructure (cross-cutting) |

---

## 2. Test Cases by Feature Area

### 2.1 Gate Enforcement (PRD Section 2)

**Insight driving priority:** Gates are the load-bearing mechanism of Trellis. If a gate passes when it should fail, the entire governance guarantee is void. Gate checks are the highest-risk area because they combine conditional logic (11 different gate definitions) with file-system inspection (artifact existence, content parsing). A bug in any gate check silently degrades the system — unlike a crash, a wrong "pass" is invisible until the morning-after.

#### GATE-001: Stage 0→1 gate passes when milestone list and confirmation exist

- **Preconditions:** Fixture milestone directory with a milestone list file. state.json with `current_stage: 0` and human confirmation recorded in events.
- **Steps:**
  1. Run the Stage 0→1 gate script against the fixture directory.
- **Expected Result:** Exit code 0. No stderr output.

#### GATE-002: Stage 0→1 gate fails when milestone list is missing

- **Preconditions:** Fixture milestone directory with no milestone list file. state.json with `current_stage: 0`.
- **Steps:**
  1. Run the Stage 0→1 gate script against the fixture directory.
- **Expected Result:** Exit code 1. Stderr contains message identifying missing milestone list.

#### GATE-003: Stage 0→1 gate fails when human confirmation is not recorded

- **Preconditions:** Fixture milestone directory with milestone list file present. state.json with `current_stage: 0`. No confirmation event in events/.
- **Steps:**
  1. Run the Stage 0→1 gate script against the fixture directory.
- **Expected Result:** Exit code 1. Stderr contains message about missing human confirmation.

#### GATE-004: Stage 1→2 gate passes when brief has >50 words

- **Preconditions:** Fixture milestone directory with brief.md containing 60 words of substantive content.
- **Steps:**
  1. Run the Stage 1→2 gate script against the fixture directory.
- **Expected Result:** Exit code 0.

#### GATE-005: Stage 1→2 gate fails when brief has <=50 words

- **Preconditions:** Fixture milestone directory with brief.md containing exactly 50 words.
- **Steps:**
  1. Run the Stage 1→2 gate script against the fixture directory.
- **Expected Result:** Exit code 1. Stderr identifies insufficient brief content.

#### GATE-006: Stage 1→2 gate fails when brief file is missing

- **Preconditions:** Fixture milestone directory with no brief.md.
- **Steps:**
  1. Run the Stage 1→2 gate script against the fixture directory.
- **Expected Result:** Exit code 1. Stderr identifies missing brief file.

#### GATE-007: Stage 2→3 gate passes with complete PRD, decisions log, and no unresolved Tier 3 items

- **Preconditions:** Fixture with PRD.md containing all required sections. DECISIONS.md present. OPEN-ITEMS.md with no unresolved items (or absent).
- **Steps:**
  1. Run the Stage 2→3 gate script.
- **Expected Result:** Exit code 0.

#### GATE-008: Stage 2→3 gate fails when PRD missing required section

- **Preconditions:** Fixture with PRD.md missing the Decisions Log section.
- **Steps:**
  1. Run the Stage 2→3 gate script.
- **Expected Result:** Exit code 1. Stderr identifies the missing section.

#### GATE-009: Stage 2→3 gate fails when OPEN-ITEMS.md has unresolved Tier 3 items

- **Preconditions:** Fixture with valid PRD.md. OPEN-ITEMS.md with one unresolved Tier 3 item.
- **Steps:**
  1. Run the Stage 2→3 gate script.
- **Expected Result:** Exit code 1. Stderr identifies unresolved Tier 3 item(s).

#### GATE-010: Stage 3→4 gate passes with XRD and clean security review

- **Preconditions:** Fixture with XRD.md and security-review.md. Security review has no Critical/High findings.
- **Steps:**
  1. Run the Stage 3→4 gate script.
- **Expected Result:** Exit code 0.

#### GATE-011: Stage 3→4 gate fails when XRD is missing

- **Preconditions:** Fixture with security-review.md but no XRD.md.
- **Steps:**
  1. Run the Stage 3→4 gate script.
- **Expected Result:** Exit code 1. Stderr identifies missing XRD.

#### GATE-012: Stage 3→4 gate fails when security review has unresolved Critical finding

- **Preconditions:** Fixture with XRD.md and security-review.md containing one unresolved Critical finding.
- **Steps:**
  1. Run the Stage 3→4 gate script.
- **Expected Result:** Exit code 1. Stderr identifies unresolved Critical finding.

#### GATE-013: Stage 4→5 gate passes when all pushback items have resolutions in DECISIONS.md

- **Preconditions:** Fixture with XRD.md containing 3 pushback items. DECISIONS.md with matching resolution entries for all 3.
- **Steps:**
  1. Run the Stage 4→5 gate script.
- **Expected Result:** Exit code 0.

#### GATE-014: Stage 4→5 gate fails when a pushback item lacks a resolution

- **Preconditions:** Fixture with XRD.md containing 3 pushback items. DECISIONS.md with resolutions for only 2.
- **Steps:**
  1. Run the Stage 4→5 gate script.
- **Expected Result:** Exit code 1. Stderr identifies the unresolved pushback item.

#### GATE-015: Stage 5→6 gate passes with peer review and no unresolved high-severity issues

- **Preconditions:** Fixture with peer-review.md. All high-severity issues marked resolved.
- **Steps:**
  1. Run the Stage 5→6 gate script.
- **Expected Result:** Exit code 0.

#### GATE-016: Stage 5→6 gate fails with unresolved high-severity peer review issue

- **Preconditions:** Fixture with peer-review.md containing one unresolved high-severity issue.
- **Steps:**
  1. Run the Stage 5→6 gate script.
- **Expected Result:** Exit code 1. Stderr identifies the unresolved issue.

#### GATE-017: Stage 6→7 gate passes with test plan, feature coverage, and stress test section

- **Preconditions:** Fixture with test-plan.md. Every PRD feature section mapped to at least one test case. Stress test section present.
- **Steps:**
  1. Run the Stage 6→7 gate script.
- **Expected Result:** Exit code 0.

#### GATE-018: Stage 6→7 gate fails when test plan lacks stress test section

- **Preconditions:** Fixture with test-plan.md that has feature test cases but no stress test section.
- **Steps:**
  1. Run the Stage 6→7 gate script.
- **Expected Result:** Exit code 1. Stderr identifies missing stress test section.

#### GATE-019: Stage 7→8 gate passes when SDM review exists

- **Preconditions:** Fixture with sdm-review.md present.
- **Steps:**
  1. Run the Stage 7→8 gate script.
- **Expected Result:** Exit code 0.

#### GATE-020: Stage 7→8 gate passes when SDM stage explicitly skipped (greenfield)

- **Preconditions:** Fixture with no sdm-review.md. state.json has SDM stage marked as skipped.
- **Steps:**
  1. Run the Stage 7→8 gate script.
- **Expected Result:** Exit code 0.

#### GATE-021: Stage 8→9 gate passes with DAY-ZERO.md, task files, and controversy review

- **Preconditions:** Fixture with DAY-ZERO.md, task files in tasks/ directory, and controversy review recorded.
- **Steps:**
  1. Run the Stage 8→9 gate script.
- **Expected Result:** Exit code 0.

#### GATE-022: Stage 8→9 gate fails when DAY-ZERO.md is missing

- **Preconditions:** Fixture with task files but no DAY-ZERO.md.
- **Steps:**
  1. Run the Stage 8→9 gate script.
- **Expected Result:** Exit code 1. Stderr identifies missing DAY-ZERO.md.

#### GATE-023: Stage 9→10 gate passes when all tasks complete and security code review is clean

- **Preconditions:** Fixture with all tasks marked complete in state.json. security-code-review.md exists with no Critical/High findings.
- **Steps:**
  1. Run the Stage 9→10 gate script.
- **Expected Result:** Exit code 0.

#### GATE-024: Stage 9→10 gate fails when a task is incomplete

- **Preconditions:** Fixture with one task still marked `in_progress` in state.json.
- **Steps:**
  1. Run the Stage 9→10 gate script.
- **Expected Result:** Exit code 1. Stderr identifies the incomplete task.

#### GATE-025: Stage 9→10 gate fails when security code review has unresolved High finding

- **Preconditions:** Fixture with all tasks complete. security-code-review.md has one unresolved High finding.
- **Steps:**
  1. Run the Stage 9→10 gate script.
- **Expected Result:** Exit code 1. Stderr identifies the unresolved finding.

#### GATE-026: Stage 10→done gate passes when smoke test report exists with all steps passing

- **Preconditions:** Fixture with smoke-test-report.md. All steps marked as passing.
- **Steps:**
  1. Run the Stage 10→done gate script.
- **Expected Result:** Exit code 0.

#### GATE-027: Stage 10→done gate fails when smoke test has a failing step

- **Preconditions:** Fixture with smoke-test-report.md where step 3 of 5 is marked failing.
- **Steps:**
  1. Run the Stage 10→done gate script.
- **Expected Result:** Exit code 1. Stderr identifies the failing smoke test step.

#### GATE-028: Override allows a failing gate to pass

- **Preconditions:** Fixture where Stage 3→4 gate would fail (missing security review). Override file exists at `overrides/3-<timestamp>.md` with justification. state.json has `"override": true` for stage 3.
- **Steps:**
  1. Run the Stage 3→4 gate script.
- **Expected Result:** Exit code 0. Gate passes despite missing artifact.

#### GATE-029: Override fails when override file is missing but flag is set

- **Preconditions:** state.json has `"override": true` for stage 3. No override file in `overrides/`.
- **Steps:**
  1. Run the Stage 3→4 gate script.
- **Expected Result:** Exit code 1. Stderr indicates override flag set but no justification file found.

#### GATE-030: Override fails when override file exists but flag is not set

- **Preconditions:** Override file exists at `overrides/3-<timestamp>.md`. state.json does NOT have override flag for stage 3.
- **Steps:**
  1. Run the Stage 3→4 gate script.
- **Expected Result:** Exit code 1. Gate runs normally (override not activated), fails for missing artifact.

### 2.2 Hook Infrastructure (PRD Section 2.1, XRD Section 3)

**Insight driving priority:** The hook is the enforcement mechanism that makes gates structural rather than advisory. If the hook does not fire, or fires on wrong paths, or fails to block writes, gates become suggestions. This area is second priority because a broken hook infrastructure makes all gate logic irrelevant.

#### HOOK-001: Hook fires on write to state.json path

- **Preconditions:** Hook configured as PreToolUse on Write with path filter for `.building/runs/*/state.json`. A valid run directory exists.
- **Steps:**
  1. Trigger a Write tool call targeting `.building/runs/<run-id>/state.json`.
  2. Observe whether the hook script executes.
- **Expected Result:** Hook script executes. Evidence: hook's side-effect is observable (e.g., a log file written by the hook).

#### HOOK-002: Hook does NOT fire on writes to non-state-json paths

- **Preconditions:** Same hook configuration. A file at `.building/runs/<run-id>/events/001.json`.
- **Steps:**
  1. Trigger a Write tool call targeting `.building/runs/<run-id>/events/001.json`.
- **Expected Result:** Hook script does NOT execute for this path (fast path).

#### HOOK-003: Hook blocks write when gate script exits non-zero

- **Preconditions:** Hook configured. Gate script for the relevant stage will fail (fixture missing required artifact).
- **Steps:**
  1. Attempt to write state.json with `current_stage` advanced by 1.
- **Expected Result:** Write is blocked. state.json on disk retains its pre-write content.

#### HOOK-004: Hook allows write when gate script exits zero

- **Preconditions:** Hook configured. Gate script for the relevant stage will pass (all artifacts present).
- **Steps:**
  1. Attempt to write state.json with `current_stage` advanced by 1.
- **Expected Result:** Write succeeds. state.json on disk has the new content.

#### HOOK-005: Hook fast-path for non-stage-advancing writes to state.json

- **Preconditions:** Hook configured. state.json write that updates a task status but does NOT change `current_stage`.
- **Steps:**
  1. Write state.json with same `current_stage` but updated task status.
- **Expected Result:** Write succeeds. No gate check runs (the hook detects no stage advancement and exits 0 immediately).

#### HOOK-006: Hook receives proposed file content, not current content

- **Preconditions:** state.json on disk at stage 3. Proposed write advances to stage 4.
- **Steps:**
  1. In the hook script, read the proposed content passed to the hook.
  2. Verify it shows `current_stage: 4`, not `current_stage: 3`.
- **Expected Result:** Hook receives the proposed new content, allowing it to compare against current on-disk state to detect the stage change.

#### HOOK-007: Router script dispatches to correct gate based on stage transition

- **Preconditions:** Router hook script configured. Stage advancing from 5 to 6.
- **Steps:**
  1. Write state.json advancing from stage 5 to 6.
  2. Observe which gate check the router invokes.
- **Expected Result:** Router invokes the Stage 5→6 gate script (peer review check), not any other gate.

#### HOOK-008: Hook handles script syntax error without crashing the build

- **Preconditions:** Gate script has a bash syntax error.
- **Steps:**
  1. Attempt a stage-advancing write to state.json.
- **Expected Result:** Hook exits non-zero (blocking the write). Stderr contains a meaningful error indicating the script failed, not a silent pass.

### 2.3 State Persistence (PRD Section 3)

**Insight driving priority:** State.json is the single source of truth. Corruption, invalid transitions, or lost events mean the run state diverges from reality. The atomic-write requirement (temp file + rename) exists because a crash mid-write could leave state.json half-written — and a half-written state file is worse than a missing one.

#### STATE-001: Run ID generation produces correct format

- **Preconditions:** Brief content string and a fixed timestamp.
- **Steps:**
  1. Call the run-ID generator with the brief content and timestamp.
- **Expected Result:** Run ID matches format `YYYYMMDDTHHMMZ-<7-char-hex>`. The 7-char suffix is the first 7 characters of SHA-256 of (brief content + timestamp).

#### STATE-002: Two runs with same brief but different timestamps produce different IDs

- **Preconditions:** Same brief content, two timestamps one minute apart.
- **Steps:**
  1. Generate run IDs for both.
- **Expected Result:** IDs differ in both timestamp and hash portions.

#### STATE-003: Two runs with same timestamp but different briefs produce different IDs

- **Preconditions:** Same timestamp, two different brief contents.
- **Steps:**
  1. Generate run IDs for both.
- **Expected Result:** IDs share the timestamp but differ in hash portion.

#### STATE-004: Initial state.json is valid after run creation

- **Preconditions:** No existing run.
- **Steps:**
  1. Create a new run with a brief.
  2. Read the generated state.json.
- **Expected Result:** state.json contains: run_id (matching generated ID), project name, milestone name, brief_hash (SHA-256 of brief content), current_stage: 0, stages object with stage 0 as `in_progress`, empty tasks object, halted: false, halt_reason: null, empty overrides and detections arrays.

#### STATE-005: Stage advancement updates state.json correctly

- **Preconditions:** state.json with `current_stage: 2`, stage 2 status `in_progress`.
- **Steps:**
  1. Advance stage to 3 (assuming gate passes).
  2. Read updated state.json.
- **Expected Result:** `current_stage: 3`. Stage 2 status: `complete` with `completed` timestamp and `gate_passed: true`. Stage 3 status: `in_progress` with `started` timestamp.

#### STATE-006: Task status transitions are recorded correctly

- **Preconditions:** state.json with task 001 at status `in_progress`, attempts: 1.
- **Steps:**
  1. Mark task 001 as complete.
  2. Read updated state.json.
- **Expected Result:** Task 001 status: `complete`. Attempts unchanged at 1.

#### STATE-007: state.json write is atomic (temp file + rename)

- **Preconditions:** Existing state.json on disk.
- **Steps:**
  1. Initiate a state.json write.
  2. Verify the write implementation uses a temporary file followed by rename.
- **Expected Result:** At no point is state.json partially written. If the process crashes mid-write, the original state.json is intact. (Verified by checking implementation uses `writeFileSync` to temp path + `renameSync`.)

#### STATE-008: Event log files are numbered sequentially

- **Preconditions:** Run with 3 existing events (001, 002, 003).
- **Steps:**
  1. Append a new event.
  2. Check the events/ directory.
- **Expected Result:** New event file is named `004-<event-type>.json`.

#### STATE-009: Event file contains required fields

- **Preconditions:** None.
- **Steps:**
  1. Write a `stage_complete` event.
  2. Read the event file.
- **Expected Result:** JSON contains: `timestamp` (ISO 8601), `event` (string), `stage` (number), `data` (object with event-specific fields).

#### STATE-010: Event numbering handles gaps gracefully

- **Preconditions:** Events directory with files 001, 002, 004 (gap at 003 — simulating a deleted or corrupted file).
- **Steps:**
  1. Append a new event.
- **Expected Result:** New event is numbered 005 (max existing + 1), not 003.

#### STATE-011: Halt sets halted flag and records reason

- **Preconditions:** state.json with `halted: false`, run in progress at stage 5.
- **Steps:**
  1. Trigger a halt with reason "Tier 3 detection: heresy".
  2. Read state.json.
- **Expected Result:** `halted: true`, `halt_reason: "Tier 3 detection: heresy"`. `current_stage` unchanged at 5.

#### STATE-012: Invalid state transition is rejected — skipping a stage

- **Preconditions:** state.json with `current_stage: 3`.
- **Steps:**
  1. Attempt to write state.json with `current_stage: 5` (skipping stage 4).
- **Expected Result:** Write blocked or rejected. state.json unchanged. Error message indicates invalid transition (cannot skip stages).

#### STATE-013: Invalid state transition is rejected — going backward without rollback

- **Preconditions:** state.json with `current_stage: 5`, stages 0-4 complete.
- **Steps:**
  1. Attempt to write state.json with `current_stage: 3` without using a rollback command.
- **Expected Result:** Write blocked or rejected. Error indicates backward transitions require explicit rollback.

#### STATE-014: Halted run cannot advance stage without user resumption

- **Preconditions:** state.json with `halted: true`, `current_stage: 4`.
- **Steps:**
  1. Attempt to write state.json with `current_stage: 5`.
- **Expected Result:** Write blocked. Error indicates run is halted and must be resumed before advancing.

#### STATE-015: Directory scaffold is created correctly for a new run

- **Preconditions:** `.building/runs/` exists (post-bootstrap). No run directory.
- **Steps:**
  1. Start a new run.
  2. List the created directory.
- **Expected Result:** Directory `.building/runs/<run-id>/` contains: `state.json`, `events/` (directory), `overrides/` (directory), `detections/` (directory), `confidence/` (directory). All subdirectories are empty except events/ which has the initial event.

#### STATE-016: Git commit occurs on stage completion

- **Preconditions:** Run at stage 3 in a git repo. Gate 3→4 passes.
- **Steps:**
  1. Advance from stage 3 to stage 4.
  2. Check git log.
- **Expected Result:** A new commit with message matching `[trellis] Stage 3 complete: *`. Commit includes state.json and relevant milestone artifacts.

#### STATE-017: Git commit occurs on halt

- **Preconditions:** Run in progress. A Tier 3 detection triggers halt.
- **Steps:**
  1. Trigger halt.
  2. Check git log.
- **Expected Result:** A new commit with message matching `[trellis] Run halted: *`. Commit includes state.json and the detection record.

#### STATE-018: Override produces a dedicated git commit

- **Preconditions:** Run at stage 3. Override file written for stage 3.
- **Steps:**
  1. Write override file and set override flag.
  2. Stage advancement succeeds via override.
  3. Check git log.
- **Expected Result:** The override has its own commit (or is part of the gate commit), and the commit includes the override file. The commit hash is identifiable for a targeted `git revert`.

### 2.4 Failure-Mode Detection Hooks (PRD Section 2.5)

**Insight driving priority:** Detection hooks are the runtime quality net. A scope-creep bug that passes silently means the build produces work the user didn't ask for. A loop-of-despair that goes undetected burns hours of context window on the same error. These hooks justify the overnight-run model — without them, unattended builds are a gamble.

#### DETECT-001: Scope-audit detects files changed outside task scope

- **Preconditions:** Task file specifies Files section listing `src/module-a.ts`. Git diff for the task shows changes to `src/module-a.ts` AND `src/module-b.ts`.
- **Steps:**
  1. Run scope-audit check for the task.
- **Expected Result:** Detection fires. Exit code 1. Stderr identifies `src/module-b.ts` as out-of-scope.

#### DETECT-002: Scope-audit passes when all changes are within task scope

- **Preconditions:** Task file specifies Files section listing `src/module-a.ts` and `src/module-a.test.ts`. Git diff shows changes to exactly those files.
- **Steps:**
  1. Run scope-audit check for the task.
- **Expected Result:** Exit code 0. No detection.

#### DETECT-003: Dependency-check detects unauthorized package addition

- **Preconditions:** package.json (or equivalent manifest) has a new dependency not referenced in the task's contracts section.
- **Steps:**
  1. Run dependency-check for the task.
- **Expected Result:** Detection fires. Stderr identifies the unauthorized dependency by name.

#### DETECT-004: Dependency-check passes when no new dependencies added

- **Preconditions:** Package manifest unchanged from baseline.
- **Steps:**
  1. Run dependency-check for the task.
- **Expected Result:** Exit code 0. No detection.

#### DETECT-005: Attempt-counter detects 3+ same errors within a task

- **Preconditions:** Event log contains 3 events for the current task with the same error message pattern.
- **Steps:**
  1. Run attempt-counter check for the task.
- **Expected Result:** Detection fires. Stderr identifies the repeated error pattern and count (3).

#### DETECT-006: Attempt-counter does NOT fire for 2 occurrences

- **Preconditions:** Event log contains exactly 2 events for the current task with the same error pattern.
- **Steps:**
  1. Run attempt-counter check for the task.
- **Expected Result:** Exit code 0. No detection. (Threshold is 3.)

#### DETECT-007: Attempt-counter is scoped per-task, not per-session

- **Preconditions:** Event log has error X appearing twice in task-003 and once in task-004. Total across session: 3.
- **Steps:**
  1. Run attempt-counter for task-004.
- **Expected Result:** Exit code 0. No detection. (Only 1 occurrence within task-004's scope.)

#### DETECT-008: Decision-conflict detects contradicting DECISIONS.md entries

- **Preconditions:** DECISIONS.md contains: Decision 5 "Use REST API for data layer." A new entry being added: "Use GraphQL for data layer."
- **Steps:**
  1. Run decision-conflict check.
- **Expected Result:** Detection fires. Stderr identifies the conflicting entries and their topics.

#### DETECT-009: Decision-conflict passes for non-contradicting entries

- **Preconditions:** DECISIONS.md with coherent entries. New entry on a distinct topic.
- **Steps:**
  1. Run decision-conflict check.
- **Expected Result:** Exit code 0.

#### DETECT-010: Ghost-reference detects reference to a Hard Kill decision

- **Preconditions:** DECISIONS.md contains a Hard Kill entry: "Decision 7: Kill the Widget approach." Source code or documentation contains the string "Widget" in a context that references using it.
- **Steps:**
  1. Run ghost-reference check.
- **Expected Result:** Detection fires. Stderr identifies the ghost reference location and the killed decision.

#### DETECT-011: Ghost-reference passes when no killed concepts are referenced

- **Preconditions:** DECISIONS.md has one Hard Kill. No references to the killed concept in scanned files.
- **Steps:**
  1. Run ghost-reference check.
- **Expected Result:** Exit code 0.

#### DETECT-012: Tier 2 detection writes record to detections/ directory

- **Preconditions:** A scope-creep detection fires (Tier 2).
- **Steps:**
  1. Trigger scope-audit detection.
  2. Check `detections/` directory.
- **Expected Result:** A new file exists in `detections/` with name matching `task-<id>-scope-creep.md`. File contains: task ID, failure mode name, severity, evidence, resolution status (unresolved).

#### DETECT-013: Tier 3 detection halts the run

- **Preconditions:** A detection classified as Tier 3 fires (e.g., a heresy detection).
- **Steps:**
  1. Trigger Tier 3 detection.
  2. Read state.json.
- **Expected Result:** `halted: true`. `halt_reason` references the Tier 3 detection. Detection record written to `detections/`. Git commit with halt message.

### 2.5 Morning-After Summary (PRD Section 4)

**Insight driving priority:** The morning-after is the user's decision interface. If it omits a section that should appear, the user misses something. If it includes a section that should be omitted, the user wastes attention. The generation-from-event-log guarantee is what makes this trustworthy — testing that guarantee means verifying the morning-after says exactly what the events say, no more, no less.

#### MAFTER-001: Clean completed run produces minimal morning-after

- **Preconditions:** Fixture run that completed cleanly: all stages passed, no overrides, no detections, no Tier 3 items.
- **Steps:**
  1. Generate morning-after from the fixture run's event log + state files.
- **Expected Result:** Morning-after contains: header (project, milestone, run ID, duration, Result: SHIPPED), "What Shipped" section, "Confidence" section (all Verified), "Stats" section. Does NOT contain: "What Stopped", "Gates Overridden", "Failure Modes Detected", "Decisions Made", "Open Items".

#### MAFTER-002: Halted run includes "What Stopped" section

- **Preconditions:** Fixture run halted at stage 5 due to Tier 3 detection.
- **Steps:**
  1. Generate morning-after.
- **Expected Result:** Result: HALTED. "What Stopped" section present with: stage number, stage name, reason, action needed.

#### MAFTER-003: Run with overrides includes "Gates Overridden" section

- **Preconditions:** Fixture run with one override at stage 3. Override file contains justification text.
- **Steps:**
  1. Generate morning-after.
- **Expected Result:** "Gates Overridden" section present. Contains: stage number, gate name, justification text (from override file), risk statement.

#### MAFTER-004: Run with detections includes "Failure Modes Detected" section

- **Preconditions:** Fixture run with two detections: one Tier 2 (fixed) and one Tier 2 (also fixed).
- **Steps:**
  1. Generate morning-after.
- **Expected Result:** "Failure Modes Detected" section with both detections. Each includes: detection name, task, mode, resolution status, detail.

#### MAFTER-005: Confidence levels are per-artifact, not per-run

- **Preconditions:** Fixture run where PRD phase was clean (no overrides, no detections) but build phase had a scope-creep detection (fixed).
- **Steps:**
  1. Generate morning-after.
- **Expected Result:** Confidence table shows PRD: Verified and Build: Partial. Different levels for different artifacts in the same run.

#### MAFTER-006: Confidence is Partial when override was used in artifact's stage

- **Preconditions:** Fixture run where stage 3→4 gate was overridden (XRD stage).
- **Steps:**
  1. Generate morning-after.
- **Expected Result:** XRD confidence: Partial. Reason references the override.

#### MAFTER-007: Confidence is Partial when detection fired during artifact's production (even if fixed)

- **Preconditions:** Fixture run where a scope-creep detection fired during build but was resolved.
- **Steps:**
  1. Generate morning-after.
- **Expected Result:** Build confidence: Partial. Reason references the detection.

#### MAFTER-008: Empty sections are omitted

- **Preconditions:** Fixture run with no overrides, no Tier 3 items, no Tier 2 decisions beyond what gates enforce.
- **Steps:**
  1. Generate morning-after.
  2. Check for presence of "Gates Overridden", "Open Items", and "Decisions Made" sections.
- **Expected Result:** None of those sections appear in the output.

#### MAFTER-009: Morning-after generated from event log, not passed data

- **Preconditions:** Fixture run with events/ directory containing specific events. An intentionally inconsistent "summary" data blob.
- **Steps:**
  1. Generate morning-after providing ONLY the run directory path (not pre-summarized data).
  2. Verify each section's content matches the events on disk.
- **Expected Result:** Morning-after content is derived from reading events/ + state.json + detections/ + overrides/ files. Content matches file contents, not any passed summary.

#### MAFTER-010: Morning-after header contains correct metadata

- **Preconditions:** Fixture run with known run-id, project, milestone, start time, end time.
- **Steps:**
  1. Generate morning-after.
- **Expected Result:** Header contains: project name, milestone name, run ID, duration (calculated from start/end timestamps), result (SHIPPED/HALTED/PARTIAL).

#### MAFTER-011: Stats section has accurate counts

- **Preconditions:** Fixture run with 6 tasks total (5 complete, 1 in progress at halt). 3 detections (2 fixed, 1 blocking). 4 git commits from Trellis.
- **Steps:**
  1. Generate morning-after.
- **Expected Result:** Stats section shows: Tasks completed: 5/6. Failure modes detected: 3 (fixed: 2, blocking: 1). Commits count is accurate.

#### MAFTER-012: Morning-after handles context-window exhaustion halt

- **Preconditions:** Fixture run halted with reason "context_window_exhaustion" at stage 7.
- **Steps:**
  1. Generate morning-after.
- **Expected Result:** Result: HALTED. "What Stopped" reason identifies context window exhaustion specifically. Action needed states user should start a new session to continue from stage 7.

### 2.6 Bootstrap and Handoff (PRD Section 5)

**Insight driving priority:** Bootstrap is the first thing any user does. If it fails or produces an incorrect state, no subsequent feature works. It is low-complexity but load-bearing as an entry point.

#### BOOT-001: Bootstrap creates correct directory structure

- **Preconditions:** A git repo with no `.building/` directory.
- **Steps:**
  1. Run bootstrap.
- **Expected Result:** `.building/` directory created with: `runs/` (empty directory), `hooks/` (containing gate check scripts), `config.json`.

#### BOOT-002: Bootstrap adds hook entries to settings file

- **Preconditions:** A git repo. `.claude/settings.local.json` either absent or existing with other content.
- **Steps:**
  1. Run bootstrap.
  2. Read `.claude/settings.local.json`.
- **Expected Result:** File contains hook entries for PreToolUse on Write with path filter for state.json. Existing settings are preserved (not overwritten).

#### BOOT-003: Bootstrap commits with correct message

- **Preconditions:** A git repo.
- **Steps:**
  1. Run bootstrap.
  2. Check git log.
- **Expected Result:** Most recent commit message is `[trellis] Bootstrap`. Commit includes `.building/` directory and settings changes.

#### BOOT-004: Bootstrap is idempotent — running twice does not break state

- **Preconditions:** Bootstrap already run once. `.building/` exists.
- **Steps:**
  1. Run bootstrap again.
- **Expected Result:** No error. No duplicate hook entries. No second bootstrap commit (or a no-op commit). Directory structure unchanged.

#### BOOT-005: Bootstrap does NOT modify orchestrator.md or agent prompts

- **Preconditions:** orchestrator.md and prompts/ directory with known content.
- **Steps:**
  1. Record checksums of orchestrator.md and all files in prompts/.
  2. Run bootstrap.
  3. Re-check checksums.
- **Expected Result:** All checksums unchanged.

#### BOOT-006: Run start creates run directory and initial state

- **Preconditions:** Bootstrap completed. User invokes `/build <brief-path>`.
- **Steps:**
  1. Start a run with a brief.
  2. Check `.building/runs/`.
- **Expected Result:** New directory exists with run-ID name. state.json present with stage 0 in progress. Initial event file exists in events/. Git commit with message `[trellis] Run started: <run-id>`.

#### BOOT-007: Run start with missing brief file fails gracefully

- **Preconditions:** Bootstrap completed. Brief path points to non-existent file.
- **Steps:**
  1. Attempt to start a run with invalid brief path.
- **Expected Result:** Error message identifying the missing file. No run directory created. No state change.

#### BOOT-008: Three run states are mutually exclusive

- **Preconditions:** A run exists.
- **Steps:**
  1. Verify state.json can represent `running` (halted: false, not complete).
  2. Verify state.json can represent `halted` (halted: true).
  3. Verify state.json can represent `complete` (final stage done).
  4. Attempt to set both `halted: true` and `current_stage` to the final done state.
- **Expected Result:** The invalid dual-state is rejected. A run is in exactly one of: running, halted, complete.

### 2.7 Post-Milestone Outputs (PRD Section 6)

#### POST-001: Performance findings are written but do not block smoke test

- **Preconditions:** Run at post-build stage. Performance review produces findings.
- **Steps:**
  1. Write performance-review.md to milestone directory.
  2. Attempt to advance to smoke test stage.
- **Expected Result:** Gate to smoke test does NOT check for performance finding resolution. Stage advances normally. Event log records the performance findings.

#### POST-002: Security code review with Critical finding blocks Stage 10

- **Preconditions:** Run at stage 9 (build complete). Security code review has one Critical finding unresolved.
- **Steps:**
  1. Attempt Stage 9→10 gate.
- **Expected Result:** Gate fails. Stderr identifies unresolved Critical security finding. (Overlaps with GATE-025 but validates from the post-milestone output perspective.)

#### POST-003: Security code review with only Medium findings does not block

- **Preconditions:** Security code review has two Medium findings, no Critical/High.
- **Steps:**
  1. Attempt Stage 9→10 gate.
- **Expected Result:** Gate passes. Medium findings logged in morning-after but not blocking.

#### POST-004: SDM refactor recommendations appear as Tier 3 in morning-after

- **Preconditions:** Completed run. SDM wrote `sdm-reassessment.md` with refactoring recommendation.
- **Steps:**
  1. Generate morning-after.
- **Expected Result:** "Open Items" section contains the SDM recommendation as a Tier 3 item.

---

## 3. Stress Tests

### STRESS-001: Gate Check Fast-Path Performance

- **Target:** Non-functional requirement — gate check scripts must execute in under 100ms for non-gate-relevant writes.
- **Category:** Boundary conditions at scale.
- **Method:** Configure the hook. Execute 100 sequential Write tool calls to paths that are NOT state.json (e.g., source files, event files). Measure per-invocation time of the hook script.
- **Load parameters:** 100 writes in rapid succession. Project directory contains a large run (100 events, 20 detections, 10 overrides) to ensure the fast-path exit happens before any heavy I/O.
- **Pass threshold:** 95th percentile execution time under 100ms per hook invocation for non-state-json writes.
- **Fail threshold:** Any invocation exceeds 200ms, or median exceeds 50ms (indicating the fast-path is not actually fast).

### STRESS-002: Morning-After Generation Time

- **Target:** Non-functional requirement — morning-after generation must complete in under 30 seconds.
- **Category:** Boundary conditions at scale.
- **Method:** Create a fixture run with maximum realistic complexity: 100 tasks across 10 milestones, 50 events, 15 detections, 5 overrides, all confidence assessments. Time the morning-after generation.
- **Load parameters:** 100 tasks, 200 events, 15 detection records, 5 override files, 10 confidence files.
- **Pass threshold:** Generation completes in under 30 seconds.
- **Fail threshold:** Generation takes more than 30 seconds or produces incomplete output.

### STRESS-003: state.json Atomic Write Under Load

- **Target:** Non-functional requirement — state.json writes must be atomic (temp file + rename).
- **Category:** Error recovery.
- **Method:** Write state.json 500 times in rapid succession with incrementing task counters. After each write, read back and verify content integrity. Simulate crash (process.kill) during write to verify the previous valid state survives.
- **Load parameters:** 500 sequential writes. 10 simulated crash-during-write scenarios.
- **Pass threshold:** All 500 reads return valid JSON matching the most recently completed write. All 10 crash scenarios leave valid state.json on disk (either the new content or the previous content, never a partial write).
- **Fail threshold:** Any read returns invalid JSON. Any crash scenario leaves a corrupt state.json.

### STRESS-004: Event Log Sequential Numbering at Scale

- **Target:** Event log integrity under high event volume.
- **Category:** Boundary conditions at scale.
- **Method:** Append 1000 events in rapid succession to a single run's events/ directory. Verify sequential numbering with no gaps and no duplicates.
- **Load parameters:** 1000 events.
- **Pass threshold:** Events numbered 001 through 1000, each containing valid JSON, no gaps, no duplicates.
- **Fail threshold:** Any numbering gap, any duplicate number, any invalid JSON in an event file.

### STRESS-005: Large Run State Handling (100 Tasks, 10 Milestones)

- **Target:** Non-functional requirement — system must handle runs with up to 100 tasks across 10 milestones.
- **Category:** Boundary conditions at scale.
- **Method:** Create a fixture state.json with 100 tasks and 10 milestone entries. Run all gate checks, generate morning-after, and verify all operations complete without error.
- **Load parameters:** 100 tasks (80 complete, 15 in-progress, 5 not-started). 10 milestones. 500 events.
- **Pass threshold:** All operations (gate checks, morning-after generation, state reads/writes) complete successfully. Morning-after accurately reflects all 100 tasks in Stats.
- **Fail threshold:** Any operation fails, produces incorrect counts, or truncates data.

### STRESS-006: Hook Script Portability

- **Target:** Non-functional requirement — hook scripts must be portable bash (no exotic dependencies).
- **Category:** Boundary conditions.
- **Method:** Run all gate check scripts and detection hook scripts in a minimal bash environment. Verify they use only: bash builtins, coreutils (cat, grep, wc, sed, awk, find, test), jq (for JSON parsing), and git. No homebrew-installed tools, no npm-executed scripts, no Python.
- **Load parameters:** All hook scripts (11 gate scripts + 5 detection scripts).
- **Pass threshold:** All scripts execute successfully in a minimal bash environment with only the specified dependencies.
- **Fail threshold:** Any script requires an unlisted dependency.

### STRESS-007: Concurrent Event File Creation

- **Target:** Event log file contention (XRD Risk 4).
- **Category:** Concurrent operations.
- **Method:** Simulate two rapid event writes that could theoretically conflict on sequence numbering (list dir, compute max+1, write). Run 100 iterations of two near-simultaneous event writes.
- **Load parameters:** 100 pairs of near-simultaneous writes (200 total events).
- **Pass threshold:** All 200 events written. No duplicate sequence numbers. No data loss.
- **Fail threshold:** Any duplicate sequence number or missing event.

---

## 4. Implementation Notes

### Test Data Factory

Create a `tests/fixtures/` directory with the following fixture runs:

| Fixture | Purpose |
|---------|---------|
| `clean-complete` | A fully completed run. All stages passed, no overrides, no detections. For MAFTER-001, MAFTER-008. |
| `halted-tier3` | Run halted at stage 5 due to Tier 3 detection. For MAFTER-002, STATE-011, STATE-014. |
| `with-overrides` | Run with one override at stage 3. For GATE-028, GATE-029, GATE-030, MAFTER-003, MAFTER-006. |
| `with-detections` | Run with 2 Tier 2 detections (fixed). For MAFTER-004, MAFTER-007. |
| `mixed-confidence` | Run where PRD stage was clean but build stage had detections. For MAFTER-005. |
| `context-exhaustion` | Run halted due to context window exhaustion. For MAFTER-012. |
| `large-run` | 100 tasks, 10 milestones, 500 events. For STRESS-002, STRESS-005. |
| `per-gate/stage-N-pass` | One fixture per gate (11 total) with all conditions met. For GATE pass tests. |
| `per-gate/stage-N-fail-X` | One fixture per gate failure condition. Multiple per gate where gates check multiple conditions. For GATE fail tests. |
| `scope-creep-task` | Task with out-of-scope file changes. For DETECT-001, DETECT-002. |
| `dependency-grab-task` | Task with unauthorized dependency. For DETECT-003, DETECT-004. |
| `loop-of-despair-task` | Event log with repeated errors. For DETECT-005, DETECT-006, DETECT-007. |

Each fixture is a complete directory tree matching `.building/runs/<run-id>/` structure. Fixtures are static and committed to the test directory — they do not depend on runtime generation.

A TypeScript helper `createFixtureRun(options)` generates additional fixtures programmatically for stress tests and parameterized cases.

### CI Requirements

- Tests run on every PR that modifies files under `.building/`, `hooks/`, or the Trellis source directories.
- Gate script tests (Bash invocations) require `bash` and `jq` available in CI.
- Integration tests that check git commits require a git repo initialized in a temp directory (not the project repo).
- Stress tests tagged separately (`describe.concurrent` or `@stress` tag) so they can run on a longer CI timeout without slowing fast feedback.

### building-audit Integration Tests

Gate scripts that wrap building-audit need integration fixtures where building-audit is invocable. These tests verify:
- building-audit's JSON output format matches what the gate script parser expects.
- building-audit's check names match the strings the gate scripts route on.
- A version pin test: run building-audit with known input, assert the output schema version has not changed.

---

## 5. Priority Order

Tests are implemented in this order, with rationale:

### Phase 1: Foundation (blocks everything else)

1. **STATE-001 through STATE-007** — State persistence core. Every other test depends on valid state.json.
2. **HOOK-001 through HOOK-008** — Hook infrastructure. If hooks don't fire or don't block, all gate tests are meaningless.

**Rationale:** These validate the two load-bearing premises of the system: that state persists correctly and that hooks enforce structurally. A failure here changes the architecture.

### Phase 2: Gate Enforcement (core value proposition)

3. **GATE-001 through GATE-030** — All 11 gates, pass and fail, plus override mechanics.

**Rationale:** Gates are what makes Trellis more than a state tracker. Each gate check is independent, so they can be implemented and tested in parallel. Priority within gates: 9→10 (most complex, most checks), 2→3 (most frequently hit), 10→done (ship/no-ship decision).

### Phase 3: Detection Hooks (runtime safety net)

4. **DETECT-001 through DETECT-013** — All failure-mode detections.

**Rationale:** These fire during the build (Stage 9), which is the longest and riskiest phase. Scope-audit and attempt-counter first (highest real-world frequency), then dependency-check, decision-conflict, ghost-reference.

### Phase 4: Morning-After (user-facing output)

5. **MAFTER-001 through MAFTER-012** — Summary generation.

**Rationale:** The morning-after is the user's primary interface. Testing it after gates and detections means the inputs it consumes (events, detections, overrides) are already validated.

### Phase 5: Bootstrap and Lifecycle

6. **BOOT-001 through BOOT-008** — Bootstrap and run lifecycle.
7. **POST-001 through POST-004** — Post-milestone outputs.

**Rationale:** Bootstrap is simple and tested last because it runs once per project. Post-milestone outputs are the least complex feature area.

### Phase 6: Stress Tests

8. **STRESS-001 through STRESS-007** — Performance and boundary conditions.

**Rationale:** Stress tests validate non-functional requirements. They run after all functional tests pass because a system that produces wrong results fast is worse than one that produces right results slowly.

---

## 6. Contradictions Found

1. **PRD Section 3.5 vs. XRD Section 4 — Commit granularity.** The PRD says commits happen "on stage completion" and "on halt." The XRD defines three commit types: task, gate, halt — implying per-task commits exist. The peer review (Issue #3) flagged this. The test plan assumes the XRD's three commit types are authoritative (STATE-016, STATE-017, STATE-018). If per-task commits are NOT the design, tests STATE-016 and STATE-018 need revision and the rollback story needs a separate test.

2. **PRD Section 2.5 vs. XRD Section 5.3 — Attempt-counter scope.** The PRD says "same error appearing 3+ times in session." The XRD pushback recommends per-task scoping with reset at task boundary. Test DETECT-007 assumes per-task scoping (the XRD recommendation). If per-session scoping is retained, DETECT-007's expected result changes.

3. **PRD Assumption 1 vs. XRD Architecture — Hook trigger for task completion.** The PRD assumes hooks fire on "task completion events." The XRD resolves this: task completion is detected via state.json writes (task status changing to "complete"), not a separate event. Tests DETECT-001 through DETECT-013 assume the XRD's state.json-write trigger. If a separate task-completion hook mechanism is added, detection hook tests may need different trigger setup.

---

## 7. PRD Feature Coverage Confirmation

| PRD Section | Feature | Test Cases |
|-------------|---------|------------|
| 2.1 | Hook architecture | HOOK-001 through HOOK-008 |
| 2.2 | Gate definitions (11 gates) | GATE-001 through GATE-027 |
| 2.3 | Gate check mechanics | HOOK-003, HOOK-004, HOOK-005, GATE pass/fail pairs |
| 2.4 | Override mechanism | GATE-028, GATE-029, GATE-030, STATE-018 |
| 2.5 | Failure-mode detection hooks | DETECT-001 through DETECT-013 |
| 3.1 | Directory layout | STATE-015, BOOT-001 |
| 3.2 | Run ID format | STATE-001, STATE-002, STATE-003 |
| 3.3 | state.json schema | STATE-004, STATE-005, STATE-006, BOOT-008 |
| 3.4 | Event log | STATE-008, STATE-009, STATE-010 |
| 3.5 | Git commit strategy | STATE-016, STATE-017, STATE-018 |
| 3.6 | Rollback | STATE-012, STATE-013 |
| 4.1-4.2 | Morning-after structure | MAFTER-001, MAFTER-010 |
| 4.3 | Generation rules | MAFTER-001, MAFTER-002, MAFTER-009, MAFTER-012 |
| 4.4 | Confidence assessment | MAFTER-005, MAFTER-006, MAFTER-007 |
| 4.5 | Empty section omission | MAFTER-008 |
| 5.1 | Bootstrap | BOOT-001 through BOOT-005 |
| 5.2 | Starting a run | BOOT-006, BOOT-007 |
| 5.3 | Run lifecycle states | BOOT-008, STATE-011, STATE-014 |
| 6.1 | Performance findings (non-blocking) | POST-001 |
| 6.2 | Security findings (blocking) | POST-002, POST-003 |
| 6.3 | SDM recommendations | POST-004 |
| NFR | Fast-path <100ms | STRESS-001 |
| NFR | Morning-after <30s | STRESS-002 |
| NFR | Atomic state writes | STRESS-003, STATE-007 |
| NFR | 100 tasks / 10 milestones | STRESS-005 |
| NFR | Portable bash | STRESS-006 |
