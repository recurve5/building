# XRD: Trellis — Governance Layer for Building

## 1. Overall Assessment

The PRD is buildable as specified. The design is conservative in the right places: it uses Claude Code's native primitives (hooks, sub-agents, slash commands) rather than inventing parallel infrastructure, and it stores state in git-committed files rather than requiring a database. The scope is well-bounded — this is scaffolding around an existing pipeline, not a rewrite.

**What's clear:**
- Gate enforcement via hooks is mechanically sound. Claude Code's `PreToolUse` hooks fire externally to the agent and block on non-zero exit. The gate definitions are specific and testable.
- State persistence layout is well-defined. The directory structure, `state.json` schema, and commit strategy are implementation-ready.
- Morning-after generation from event log (not LLM memory) eliminates the reliability concern.

**What needs resolution:**
- The orchestrator skill's state management across tool calls and session boundaries.
- The relationship between Trellis's gate hooks and the existing `building-audit` checks — specifically, how much to wrap vs. rewrite.
- The hook trigger mechanism: Claude Code hooks fire on tool lifecycle events (`PreToolUse`, `PreToolUse`), not on abstract "stage transitions." The PRD describes gates as firing "when the orchestrator attempts to advance past that stage" — the translation from that intent to a hookable event needs specifying.

**Where engineering suggests a different approach:**
- The PRD's override mechanism (orchestrator-LLM writes override file, sets flag in state.json, gate re-checks) adds complexity without adding safety. The override should be a user action via slash command, not an LLM action. See Pushback section.

## 2. Open Questions

### Architecture-Blocking

**Q1: How does the orchestrator skill maintain state across the run?**

Recommended answer: File-backed state machine. The orchestrator reads `state.json` at every decision point and writes it after every state transition. The file is the single source of truth — not the skill's working memory, not structured commit messages.

Rationale: Claude Code sessions can lose context (compaction, context window limits, session restart). File-backed state survives all of these. The orchestrator skill's first action on any invocation is `read state.json` — this means resumption after halt, after context window overflow, or after user absence all work identically. Commit messages as state encoding creates a dependency on git log parsing that's brittle and hard to test.

**Q2: How does the hook system trigger on "stage advancement"?**

Recommended answer: The orchestrator skill advances stages by writing to `state.json`. A `PreToolUse` hook on `Write` fires when the target path matches `.building/runs/*/state.json`. The hook script reads the file, detects if `current_stage` increased, and runs the gate check for the new stage. If the gate fails, the hook exits non-zero, which blocks the write — the stage never advances.

Rationale: There is no "stage transition" lifecycle event in Claude Code. The only hookable events are tool uses. Since stage advancement necessarily involves updating state.json, hooking the write to that file is the correct indirection. This makes gate enforcement structural: the LLM literally cannot update the stage number without passing the gate.

**Q3: What happens when the user is offline during a halt?**

Recommended answer: Nothing. The run stays halted. `state.json` has `"halted": true`. The morning-after is generated and committed. On next session start, the orchestrator skill reads state.json, sees halted state, and presents the halt context to the user. No timeout, no expiry, no cleanup.

Rationale: The user's workflow is check-in-the-morning. A halt at 3am should be exactly where they left it at 8am. Time-based behavior (auto-resume, auto-rollback) adds complexity and risk for a single-developer workflow.

**Q4: How are sub-agents coordinated when a gate requires multiple validators?**

Recommended answer: Sequential. The orchestrator skill invokes validators one at a time. If any validator produces a blocking finding, subsequent validators are skipped — the gate fails immediately. Order: deterministic checks first (cheapest, fastest), then LLM validators in dependency order (peer review before task audit, since peer review catches broader issues).

Rationale: Parallel invocation requires managing concurrent sub-agents, which Claude Code does not natively support in a single session. Sequential is simpler, cheaper (early exit saves tokens), and debuggable (the event log shows exactly where the gate stopped).

### Implementation

**Q5: What's the granularity of git commits during a build?**

Recommended answer: Three commit types:
1. **Task commit** — code changes from a task, committed by the task agent on completion. Format: `[TASK-ID] description`.
2. **Gate commit** — state.json update + validator outputs, committed by the orchestrator on gate passage. Format: `[gate-passed] m1/stage-N checks:passed`.
3. **Halt commit** — state.json + halt context, committed by the orchestrator on halt. Format: `[halted] m1/stage-N reason`.

Validator output files (detections, reviews) are included in the gate commit, not in their own commits. This keeps the commit log readable without sacrificing auditability.

**Q6: How does the system handle external dependency failures?**

Recommended answer: External failures are a distinct category in the failure-response policy. When a task fails due to an external dependency (network timeout, API unavailable, package registry down), the detection is: same error 2+ times AND error message matches known external-failure patterns (ECONNREFUSED, 404 from registry, timeout). Response: halt with `halt_reason: "external_dependency"` and a recommendation to retry rather than fix. The morning-after surfaces these distinctly from code-quality halts.

**Q7: What's the bootstrap experience?**

Recommended answer: `/build --bootstrap` does:
1. Creates `.building/` directory structure (empty `runs/`, `hooks/` with check scripts).
2. Adds hook entries to `.claude/settings.local.json` (not settings.json — keeps it out of upstream).
3. Commits the bootstrap as `[trellis] bootstrap`.
4. Prints what was created and what hooks are now active.

No history analysis. No retroactive run creation. The system starts governing from this point forward.

## 3. Architecture

### Layer Diagram

```
┌─────────────────────────────────────────────────────────┐
│  User Interface Layer                                    │
│  Slash commands: /build, /build --status, /build --override │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  Orchestration Layer                                     │
│  Orchestrator skill: reads state, invokes agents,        │
│  writes state transitions, generates morning-after       │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  Enforcement Layer                                       │
│  Claude Code hooks: PreToolUse on Write to state.json   │
│  Gate scripts: per-stage checks                          │
│  Detection hooks: PreToolUse on task-completion writes   │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  Check Layer                                             │
│  Deterministic scripts (wrapping building-audit L1)      │
│  LLM validators (sub-agents with curated context)        │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  Persistence Layer                                       │
│  .building/runs/<id>/ — state.json, events/, detections/ │
│  Git commits at boundaries                               │
└─────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

**1. Hook trigger point is Write to state.json, not a custom lifecycle event.**

The gate-enforcement hook is a `PreToolUse` hook on the `Write` tool, filtered by path pattern `.building/runs/*/state.json`. When the orchestrator writes a stage advancement, the hook:
- Reads the proposed new content of state.json
- Compares `current_stage` to the previous value (read from git HEAD)
- If stage increased: runs the gate check for the target stage
- If gate fails: exits non-zero, blocking the write

This means the orchestrator LLM cannot advance the stage without passing the gate, because the file system operation that records the advancement is the operation the hook blocks.

**2. building-audit checks are wrapped, not reimplemented.**

The existing `building-audit` CLI already implements scope-creep, dependency-grab, test-cheat, surface-heresy, confidence-bluff, fragility-metrics, premature-abstraction, and unoptimized-defaults as Layer 1 checks. Rather than rewriting these as shell scripts, the Trellis gate scripts invoke `building-audit --mechanical --milestone <current>` and parse its JSON output. For individual task-completion hooks, the `--dump-candidates` mode provides the per-file data needed for targeted checks.

This gives us:
- Single source of truth for check logic
- building-audit remains usable standalone (post-hoc audits still work)
- Trellis adds timing (when checks run) and enforcement (what happens on failure) without duplicating detection logic

**3. Failure-mode detection hooks fire on task-file writes, not continuously.**

The PRD specifies hooks fire on "task file marked complete." The mechanism: a `PreToolUse` hook on `Write` filtered to `.building/runs/*/state.json` where a task's status changes to `"complete"`. When detected, the hook runs the relevant failure-mode checks scoped to that task's commits.

**4. State machine transitions are explicit and total.**

Valid state transitions:

```
INIT → STAGE_0_ACTIVE
STAGE_N_ACTIVE → STAGE_N_GATE_CHECKING
STAGE_N_GATE_CHECKING → STAGE_N+1_ACTIVE (gate pass)
STAGE_N_GATE_CHECKING → STAGE_N_ACTIVE (gate fail, fix and retry)
STAGE_N_GATE_CHECKING → STAGE_N_OVERRIDDEN → STAGE_N+1_ACTIVE (override)
ANY → HALTED (tier 3 detection or external failure)
HALTED → STAGE_N_ACTIVE (user resumes)
STAGE_10_GATE_CHECKING → COMPLETE (final gate pass)
```

Invalid transitions (hook rejects): skipping stages, going backward without explicit rollback command, transitioning from HALTED without user action.

**5. Sub-agents receive curated context per the architecture notes.**

The orchestrator skill constructs the context payload for each sub-agent invocation. Context curation rules:

| Sub-agent | Receives | Does NOT receive |
|-----------|----------|------------------|
| Peer reviewer | PRD, XRD, DECISIONS.md | Task files, source code |
| Task auditor | Task file, git diff for that task, DAY-ZERO.md | Other tasks, PRD |
| Security reviewer | XRD architecture section, source code, dependency manifests | PRD, task files |
| SDM | XRD, source code tree structure, milestone history | Individual task details |

### Blast Radius Analysis

**When a new gate check is added:** Change the gate-definitions table (config), write one check script, update the stage's gate runner. No other stages affected.

**When a failure-mode check is added:** Register in the detection-hooks config. Write the check script. No gate logic changes.

**When the pipeline stages change (orchestrator.md updated):** Gate definitions must be updated to match. The gate-stage mapping is configuration, not hardcoded — but the mapping must be manually synced.

**When building-audit adds a new Layer 1 check:** Trellis picks it up automatically if it's registered in building-audit's check registry. No Trellis changes needed.

## 4. Quality Bar Trace

Tracing the most complex gate: **Stage 9 → 10 (all task acceptance criteria pass, security code review exists with no Critical/High findings).**

**Setup:** Run has 6 tasks. Tasks 001-005 complete. Task 006 just completed. The orchestrator writes state.json with all tasks marked complete and `current_stage: 10`.

**Hook fires:** `PreToolUse` on Write to state.json. Hook reads new content, sees stage advancing from 9 to 10.

**Gate script executes:**
1. Reads milestone directory for `security-code-review.md`. File exists? If not → exit 1 with "Security code review missing."
2. Parses security-code-review.md for findings. Any Critical or High unresolved? If yes → exit 1 with "Unresolved Critical/High security findings: [list]."
3. For each task in state.json's `tasks` object: confirms status is "complete". Any incomplete? → exit 1 with "Task [ID] not complete."
4. Invokes `building-audit --mechanical --milestone m1-trellis-governance-layer` for the cumulative check. Parses JSON output. Any critical findings? → exit 1 with findings summary.
5. All checks pass → exit 0.

**Gate passes:** The write to state.json succeeds. Stage is now 10.

**Gate commit:** Orchestrator commits state.json + any validator outputs with message `[gate-passed] m1/stage-10 scope:ok deps:ok tests:ok security:ok`.

**If gate had failed:** The write is blocked. state.json still shows `current_stage: 9`. The orchestrator receives the failure message and must address the issue (fix the security finding, complete the missing task) before re-attempting the write.

## 5. Pushback

### 5.1 Override Mechanism — RESOLVED

**Original pushback:** The orchestrator-LLM shouldn't be able to self-override gates because it weakens structural enforcement.

**Resolution (Decision 29 — Reversible Boldness):** LLM self-override is permitted. The override is committed to git immediately, creating a known revert point. The cost of a wrong override is one `git revert`. The cost of halting and waiting is hours of idle build time. The gate still fires, still detects, still logs — the override doesn't make the gate invisible, it makes it a checkpoint the LLM can pass with a paper trail. The user reviews overrides in the morning-after and reverts if any were wrong.

### 5.2 Assertion-Strength Hook Is Fragile as a Deterministic Check

**Insight:** The PRD lists `assertion-strength` as a failure-mode detection hook that fires on "test file written or modified" and checks for "assertions that test existence without testing correctness." Detecting weak assertions mechanically (regex, AST pattern matching) has high false-positive rates. `expect(result).toBeDefined()` is weak in isolation but legitimate as a null-guard before deeper assertions. The existing building-audit handles this in Layer 2 (LLM judgment) for this reason — the `test-cheat` check uses heuristic scoring, not binary pass/fail.

**Implication:** assertion-strength should remain an LLM-validator check (invoked at gates) rather than a real-time hook that blocks test file writes. Blocking test writes with a high false-positive rate will trigger Loop of Despair.

**What the user loses:** Immediate feedback on weak tests during the build.

**What the developer gains:** Fewer false halts. The check still runs — it just runs at the gate, not inline.

**Product decision needed:** Should assertion-strength block inline (with false-positive risk) or only at gates (with delayed feedback)?

### 5.3 Attempt-Counter Hook Needs a Reset Mechanism

**Insight:** The PRD specifies "same error appearing 3+ times in session" triggers a halt. But LLM sessions can span multiple tasks. An error that appeared twice in task-003 (legitimately, as part of iterative debugging) and once in task-004 (different context entirely) would trigger the counter. The counter also has no reset point between tasks.

**Implication:** The attempt counter should be scoped per-task, not per-session. Reset on task boundary. Threshold stays at 3.

**What the user loses:** Detection of cross-task Loop of Despair patterns (rare in practice — the loop pattern is almost always within a single task).

**What the developer gains:** No false halts from coincidental error message overlap across tasks.

**Product decision needed:** Per-task or per-session scoping for the attempt counter?

## 6. Affirmations

**Decision: Hooks over meta-agent.** Correct. A "governance agent" that runs in the same context as the orchestrator has the same structural weakness as self-checks. Hooks are external to the LLM's execution — they fire regardless of what the LLM "thinks" about the gate.

**Decision: Git state over database.** Correct. The user reviews in a terminal. The forensic tool is `git log`. Adding a database would create a sync problem between two sources of truth for zero user-facing benefit.

**Decision: Morning-after from event log, not LLM memory.** Correct. This is the single most important reliability property. LLM memory is lossy (compaction), confabulatory (hallucinated completion), and non-persistent (session restart). File-based generation guarantees accuracy.

**Decision: Two confidence tiers (Verified, Partial) over a spectrum.** Correct. A 5-point scale would require the user to learn what each level means. Binary is actionable: "Can I trust this?" Yes or Mostly.

**Decision: Halt over pause.** Correct. A "paused" state implies automatic resumption. Halt is unambiguous: something needs your attention, the run will not proceed without you.

**Decision: No push notifications.** Correct. The morning-after is the notification mechanism. Adding push creates a dependency on external services and a permission/configuration surface.

**Decision: Post-milestone validation timing (performance, security, SDM).** Correct. Post-task validation for these would be prohibitively expensive and would surface findings without the integration context that makes them actionable.

## 7. Build Plan

### Day Zero Contracts

**D0-1: state.json schema** — TypeScript interface defining all fields, valid values, and transition constraints. All components read/write this format.

**D0-2: Event schema** — JSON schema for event files. Event types enumerated. All hooks and the orchestrator write events in this format.

**D0-3: Hook interface contract** — Input: state.json path. Output: exit code + stderr message. Environment variables available to hooks (RUN_ID, CURRENT_STAGE, MILESTONE_DIR).

**D0-4: Detection record format** — Markdown format for `.building/runs/<id>/detections/`. Consistent fields: task ID, failure mode name, severity, evidence, resolution status.

**D0-5: Gate check result format** — JSON output from gate scripts. Fields: gate name, pass/fail, checks run, failures (with messages), duration.

**D0-6: Morning-after template** — Section ordering, conditional inclusion rules, generation contract (what data source feeds each section).

### Track A: Enforcement Infrastructure

**Phase 1 — Gate scripts (standalone)**
- Translate each PRD gate definition into a shell script that reads the milestone directory and returns pass/fail.
- Scripts operate on the filesystem. No hook wiring yet. Testable in isolation with fixture directories.
- Wraps `building-audit --mechanical` for checks that already exist there.

**Phase 2 — Hook wiring**
- Configure `.claude/settings.local.json` with `PreToolUse` hooks on Write, filtered by path.
- Wire gate scripts to fire on state.json writes.
- Wire detection scripts to fire on task-completion state transitions.
- Integration test: simulate a stage advancement write, verify hook blocks when gate fails.

**Phase 3 — Failure-mode detection hooks**
- scope-audit: invokes building-audit scope-creep check scoped to the completing task.
- dependency-check: invokes building-audit dependency-grab check.
- decision-conflict: parses DECISIONS.md for contradiction (simple: same topic, different conclusion).
- ghost-reference: invokes building-audit surface-heresy check.
- attempt-counter: reads event log for repeated error patterns within the current task.

### Track B: State Management

**Phase 1 — Persistence layer**
- Implement state.json read/write utilities (TypeScript, since building-audit is TypeScript).
- Implement event-log append utility.
- Implement run-ID generation.
- Implement directory scaffold creation.

**Phase 2 — Orchestrator skill**
- Skill that reads state.json, determines current position, and executes the next action.
- Handles: stage advancement (writes state.json, triggers gate hook), task dispatch, halt recording, resume from halt.
- Invokes sub-agents with curated context per the context table above.

**Phase 3 — Slash commands**
- `/build <path-to-brief>` — starts a run (creates run directory, initializes state.json, begins Stage 0).
- `/build --status` — reads current state.json, prints human-readable status.
- `/build --override <stage>` — writes override file, sets override flag, re-triggers gate.
- `/build --bootstrap` — creates .building/ structure, adds hooks to settings.

### Track C: Reporting

**Phase 1 — Morning-after generation**
- Reads event log + state.json + detections/ + overrides/.
- Generates markdown per the PRD template.
- Handles conditional section inclusion (empty sections omitted).

**Phase 2 — Confidence assessment**
- Reads gate results and detection records.
- Applies two-tier classification: Verified (clean pass) vs. Partial (any override, detection, or review issue).

### Merge Points

**M1: Track A Phase 1 + Track B Phase 1** — Gate scripts need to read state.json. The state utilities from Track B must be available before gate scripts can be wired to hooks.

**M2: Track A Phase 2 + Track B Phase 2** — Hook wiring and orchestrator skill must agree on how state.json writes trigger gates. The orchestrator skill is the component that writes state.json; the hooks are what fire when it does.

**M3: Track B Phase 2 + Track C Phase 1** — The orchestrator skill triggers morning-after generation at run end. Track C must be complete before the orchestrator skill can finalize a run.

### Solo Developer Fallback (Sequential Order)

1. Day Zero contracts (D0-1 through D0-6)
2. Track B Phase 1 (state management utilities)
3. Track A Phase 1 (gate scripts, standalone)
4. Track A Phase 2 (hook wiring)
5. Track B Phase 2 (orchestrator skill)
6. Track A Phase 3 (failure-mode detection hooks)
7. Track C Phase 1 (morning-after generation)
8. Track C Phase 2 (confidence assessment)
9. Track B Phase 3 (slash commands)

This order front-loads the load-bearing premise validation: after steps 3-4, we know whether Claude Code's hook system actually works for gate enforcement. If it doesn't, we discover that before investing in the orchestrator skill or reporting.

## 8. Technical Risks

### Risk 1: Hook Path Filtering Limitations

**What:** Claude Code's hook system may not support glob patterns for path filtering (`.building/runs/*/state.json`). If hooks can only filter on tool name (e.g., all `Write` calls), every file write in the project would trigger the gate check script — which would need to filter internally and exit 0 for non-state-json writes.

**Why it matters:** If every Write triggers the hook, performance degrades. The hook script must be fast (<100ms) for non-state-json writes to avoid making the build feel sluggish.

**Likelihood:** Medium. Claude Code hook documentation is sparse on filtering granularity.

**Impact:** Low-medium. Mitigation is straightforward (fast path-check at script top), but the script must exist and be correct.

**Mitigation:** Phase 1 task includes a spike: configure a PreToolUse hook, verify what arguments it receives, confirm whether path filtering is built-in or must be implemented in the script. Build gate scripts with a fast-exit path for irrelevant writes regardless.

### Risk 2: ~~Hook Blocking Semantics on Write~~ RESOLVED

Claude Code's `PreToolUse` hooks fire before the tool executes. A non-zero exit blocks the tool — the write never happens. The hook receives the tool input (file path + proposed content), so it can inspect the state transition before it hits disk. This is the correct mechanism for gate enforcement. No spike needed; this is documented Claude Code behavior.

### Risk 3: Sub-Agent Context Isolation May Block State Access

**What:** Sub-agents (`.claude/agents/`) have isolated context by design. If a sub-agent (e.g., the task auditor) needs to read `.building/runs/<id>/state.json` or task-specific git diffs, it may not have filesystem access or git access in its isolated context.

**Why it matters:** The architecture relies on sub-agents receiving "curated context" — but if curation means passing the data inline rather than giving the sub-agent file paths, the orchestrator must read all relevant files and include them in the sub-agent's prompt. This increases orchestrator complexity and token usage.

**Likelihood:** Low-medium. Sub-agents likely have filesystem access (they're Claude Code sessions), but their working directory and available tools may differ from the parent.

**Impact:** Medium. Workaround exists (inline context) but adds orchestrator complexity.

**Mitigation:** Validate sub-agent file access in Track B Phase 2 spike. If sub-agents cannot read files, the orchestrator includes file content in the invocation prompt.

### Risk 4: Event Log File Contention

**What:** Multiple hooks and the orchestrator skill write to the event log. If two hooks fire in rapid succession (e.g., task completion triggers both a detection hook and a gate hook), they may write conflicting sequence numbers or corrupt the file.

**Likelihood:** Low. Hooks fire sequentially within Claude Code (one tool use at a time), so true concurrency is unlikely. But session-restart scenarios (where a hook fires while the orchestrator is mid-write) could cause issues.

**Impact:** Low. Event log is append-only; worst case is a sequence gap or duplicate number, neither of which breaks the system.

**Mitigation:** Use file-locking in the event-write utility. Each event file is a separate file (numbered), not a single appended log — so contention is between "what number is next" only. A simple approach: list existing files, take max+1.

### Risk 5: building-audit Integration Coupling

**What:** Trellis wraps building-audit for deterministic checks. If building-audit's output format changes, check names change, or its CLI interface changes, Trellis gate scripts break.

**Likelihood:** Medium. building-audit is actively developed (recent commits add features).

**Impact:** Medium. Broken gate scripts mean gates either always-pass (dangerous) or always-fail (blocking).

**Mitigation:** Pin to building-audit's JSON report schema. Add an integration test that runs building-audit with known fixtures and validates the output format. The gate scripts parse the JSON report's `results[]` array — as long as that contract holds, internal building-audit refactors don't break Trellis.

## 9. Implementation Choices

### Choice 1: Gate scripts in Bash, orchestrator in TypeScript skill

**Tradeoff:**
- *User-facing:* Bash scripts are inspectable with `cat`. Users can read and modify gate checks without a build step.
- *Maintenance:* Two languages in the system (Bash for hooks, TypeScript for orchestrator/state utilities). But the boundary is clean: Bash scripts are thin wrappers that invoke building-audit or check file existence; TypeScript handles state manipulation and report generation.
- *Refactoring risk:* Low. The hook scripts are intentionally simple (file existence checks, JSON parsing with jq, exit codes). Complex logic lives in building-audit or the TypeScript state utilities, not in the Bash layer.

### Choice 2: One hook script with internal routing, not one hook per gate

**Tradeoff:**
- *User-facing:* Single hook entry in settings.json. Simpler configuration.
- *Maintenance:* The router script (`gate-check.sh`) determines which gate to run based on the state transition detected. Adding a gate means adding a case to the router + writing the gate's check logic. More code in one file, but all gate routing is in one place.
- *Refactoring risk:* Medium. If Claude Code's hook system later supports multiple hooks per event, the router could be decomposed. But decomposition is additive, not breaking.

Alternative rejected: One hook entry per gate. Claude Code's settings.json hook entries would balloon (10+ gates × detection hooks). The configuration becomes the complexity instead of the code.

### Choice 3: Events as individual numbered files, not an appended log

**Tradeoff:**
- *User-facing:* `ls .building/runs/<id>/events/` shows event count at a glance. Individual events are readable without parsing a multi-entry file.
- *Maintenance:* Many small files. `git status` shows each as a new file. But they're committed in batch at gate boundaries, so the noise is contained.
- *Refactoring risk:* Low. Switching to a single appended JSONL file later is a straightforward migration (concatenate existing files). The event-write utility abstracts the storage format.

### Choice 4: LLM self-override with committed trail (Decision 29)

**Tradeoff:**
- *User-facing:* Overnight runs continue past gate failures when the LLM judges the override is justified. The user reviews in the morning. Wrong overrides are one `git revert` away from undone.
- *Maintenance:* Override logic must ensure the override commit happens before any post-override work. The commit is the revert target — if override and subsequent work share a commit, revert granularity is lost.
- *Refactoring risk:* Low. If overrides prove systematically wrong, tightening to user-only is a configuration change (remove the LLM's ability to write override files).

### Choice 5: Confidence assessment is binary per-artifact, not per-section

**Tradeoff:**
- *User-facing:* The morning-after says "PRD: Verified" or "PRD: Partial" — not "PRD Section 3: Partial, Section 5: Verified." Actionability is at the artifact level — if anything in the PRD phase was unclean, the user investigates the PRD.
- *Maintenance:* Simpler logic. The confidence for an artifact is `any(overrides in stage) || any(detections in stage)` → Partial, else → Verified.
- *Refactoring risk:* Low. Granularity can be increased later without changing the schema (add a `details` field to the confidence JSON).

### Choice 6: state.json is the single point of truth, not git commit messages

**Tradeoff:**
- *User-facing:* `cat .building/runs/<id>/state.json` gives full run status. No git log parsing needed.
- *Maintenance:* The file must be kept consistent. Crashes mid-write could corrupt it. Mitigation: write to temp file, atomic rename.
- *Refactoring risk:* Low. Git commit messages remain human-readable summaries but are not parsed programmatically.

### Choice 7: Wrapping building-audit rather than extracting its check logic

**Tradeoff:**
- *User-facing:* building-audit remains a standalone tool. Users can still run `building-audit --mechanical` independently of Trellis.
- *Maintenance:* Coupling between Trellis and building-audit's CLI interface. Changes to building-audit's flags or output format require updating Trellis's wrapper scripts.
- *Refactoring risk:* Medium. If building-audit's interface changes substantially, the wrapper scripts need updating. Mitigated by pinning to the JSON report format and testing the integration.

Alternative rejected: Extract building-audit's check functions into a shared library imported by both. This creates a tight coupling at the code level and requires building-audit to be a library (it's currently a CLI). The CLI wrapper approach is looser coupling — building-audit can be refactored internally without breaking Trellis as long as the output format is stable.
