# Peer Review: Trellis — Governance Layer for Building

## Independent First-Use Sequence (from Brief alone)

Before reading the PRD, here is what a solo developer would do in their first 30 minutes with Trellis, based solely on the idea brief:

1. **Install/bootstrap:** Run some command from the building repo root that sets up Trellis. Expect it to create config files and hook definitions. Expect a confirmation message.
2. **Start an overnight run:** Hand Claude Code a brief plus user stories, set the remote-control flag, and kick off the pipeline. Expect Trellis to begin tracking the run immediately.
3. **Go to sleep.** Expect the system to progress through stages, catch failure modes as they happen, deploy recovery agents (SDM, security) autonomously, and commit state at boundaries.
4. **Wake up, check phone:** Open Claude Code remote-control on phone. Expect a single summary telling me: did it ship, did it halt, what needs my attention. Expect confidence signals — was everything clean or did overrides/detections happen?
5. **If something is broken:** Expect to roll back 2-4 steps to a clean state using git. Expect the task list to tell me exactly where things went wrong. Expect the rollback to be a single command, not a forensic exercise.
6. **If it shipped:** Expect to review what was built, see decisions that were made autonomously, and verify via smoke test.

**Key expectations from brief that need coverage:**
- Failure mode detection and autonomous recovery (SDM deployed mid-run, not just at milestones)
- Performance and security agents running continuously, not post-hoc
- Tier 2 fixes happening autonomously before becoming Tier 3
- Clear phone-readable status
- Rollback to clean state in 1-2 commands

---

## 1. Executive Summary

These documents are **ready for development with 3 high-severity issues that must be resolved first.** The PRD and XRD form a coherent, buildable design. The core architecture — hooks on state.json writes, git-committed state, event-log-driven morning-after — is sound and well-reasoned. The documents agree on fundamentals and the XRD makes appropriate implementation choices.

The high-severity issues are:

1. **Hook blocking semantics are load-bearing but unverified.** The XRD identifies this as Technical Risk #2 (HIGH impact) but neither document specifies what happens if PostToolUse fires *after* the write completes rather than blocking it. The entire gate enforcement model depends on the answer.

2. **Autonomous recovery agents are absent from the design.** The brief's central value proposition — "Building deploys the right agent (often SDM) through the orchestrator with appropriate context to fix the mess" — is reduced in the PRD to detection-and-halt. The SDM runs at milestone boundaries only, not mid-task. The gap between "detect and halt" vs. "detect and recover" is the difference between a governance layer that stops work and one that keeps work flowing.

3. **Rollback granularity doesn't match the brief's promise.** The brief says "go back 2-3-4 steps to a clean state." The PRD commits at stage boundaries and on halt. But stages are coarse (entire PRD phase, entire XRD phase). Rolling back a stage means losing an entire document's worth of work. The user likely means rolling back 2-3-4 *tasks*, not 2-3-4 *stages*.

---

## 2. Scorecard

| Dimension | PRD | XRD |
|-----------|-----|-----|
| Completeness | 8/10 — covers enforcement, persistence, reporting well; thin on recovery and rollback mechanics | 7/10 — good architecture, thin on error paths and recovery |
| Specificity | 9/10 — gate conditions are concrete and testable | 8/10 — implementation choices are clear, some gaps in hook behavior |
| Internal Consistency | 9/10 — decisions log aligns with body | 9/10 — pushback resolutions are coherent |
| Cross-Document Alignment | 7/10 — XRD builds what PRD asks for, but both miss the brief's recovery model |

---

## 3. Issues Table

| # | Severity | Category | Issue |
|---|----------|----------|-------|
| 1 | **High** | Architecture-Product Mismatch | Hook blocking semantics unverified |
| 2 | **High** | Gap | No autonomous recovery — only detect-and-halt |
| 3 | **High** | User-Experience Gap | Rollback granularity too coarse for brief's promise |
| 4 | Medium | Gap | No context-window exhaustion recovery protocol |
| 5 | Medium | Unstated Assumption | Hook execution environment and permissions |
| 6 | Medium | Gap | No run resumption protocol after halt |
| 7 | Medium | Contradiction | SDM timing — PRD says post-milestone, brief says continuous |
| 8 | Medium | Gap | No definition of "non-trivial content" for gate checks |
| 9 | Low | Gap | No versioning strategy for state.json schema |
| 10 | Low | Clarity | Override revert claim oversimplified |

### Issue Details

**Issue 1: Hook blocking semantics unverified**
- **User story:** Developer bootstraps Trellis, starts a run. The orchestrator writes a stage transition to state.json. The gate hook fires. If the hook fires *after* the write is already committed to disk, the gate cannot actually block the transition — it can only report retroactively.
- **PRD says:** Hooks "fire on lifecycle events" and "enforce the pipeline mechanically."
- **XRD says:** "PostToolUse hook on Write to state.json triggers gate checks" — but flags as Technical Risk #2 that blocking semantics are unverified.
- **Problem:** The entire enforcement model assumes hooks can *prevent* advancement. If they can only *observe* advancement, the architecture needs a compensating mechanism (e.g., a pre-write validation step, or a rollback-on-failure pattern).
- **Technical consequence:** If PostToolUse is fire-and-forget, gates become advisory, not enforcing. The core value proposition of Trellis collapses.
- **Recommendation:** Verify Claude Code hook semantics before Day Zero. If PostToolUse cannot block, redesign: either use a PreToolUse hook point (if available), or implement a two-phase write (write intent → validate → write final) that the hook can interrupt between phases.

**Issue 2: No autonomous recovery — only detect-and-halt**
- **User story:** Overnight, the task agent drifts into scope creep (adds a file outside the task's scope). The scope-audit hook catches it. Currently: the run halts. User wakes up to a halted run 2 hours into an 8-hour session. Brief's intent: the orchestrator deploys SDM or another agent to fix the scope creep and continue.
- **PRD says:** "Tier 2 violations: hook blocks task completion, orchestrator must fix." But how the orchestrator fixes it is unspecified. "Tier 3 violations: hook writes detection record and halts the run."
- **XRD says:** Sub-agents receive curated context. SDM runs at milestones. No mid-task recovery protocol.
- **Problem:** The sentence "orchestrator must fix" is the entire recovery specification. There is no protocol for: what context the orchestrator receives about the violation, what actions it's authorized to take, what happens if the fix fails, or how to distinguish a fixable Tier 2 from an unfixable one that should escalate.
- **Technical consequence:** Without a recovery protocol, Tier 2 detections will behave identically to Tier 3 in practice — they'll halt the run because the orchestrator has no playbook.
- **Recommendation:** Define a recovery protocol for each detection hook. Minimum: (a) what information the orchestrator receives, (b) what actions are authorized, (c) max attempts before escalation to halt, (d) what "fixed" means (re-run the check and it passes).

**Issue 3: Rollback granularity too coarse**
- **User story:** User wakes up. Morning-after says tasks 14-17 completed but task 18 introduced a regression that broke tasks 14-17's integration. User wants to "go back 3 steps" — meaning revert tasks 18, 17, 16 to get back to the state after task 15. Currently: git commits happen at stage boundaries. All of tasks 14-18 are in the same stage. The user would have to revert the entire stage or manually untangle individual task commits.
- **PRD says:** "Git commits at stage boundaries and on halt." Also: task-completion hooks fire. But no mention of per-task commits.
- **XRD says:** Three commit types: task, gate, halt. This implies per-task commits exist!
- **Problem:** PRD and XRD disagree on commit granularity. If the XRD's "task commit" is authoritative, the PRD should say so explicitly. If not, the rollback story is broken.
- **Technical consequence:** Without per-task commits, the user's "go back 2-3-4 steps" requires forensic git surgery, not a simple revert.
- **Recommendation:** Confirm per-task commits are the design. Update PRD Section 3.5 to explicitly state: "Git commits on every task completion, every stage boundary, and on halt. Task commits are the primary rollback unit."

**Issue 4: No context-window exhaustion recovery**
- **User story:** 6 hours into an overnight run, the context window fills. The PRD says this triggers a halt. But what happens to in-progress work? Is the current task's partial state committed? Can the run resume from where it stopped?
- **PRD says:** "Context-window exhaustion → halt."
- **XRD says:** Nothing about this scenario.
- **Problem:** A halt without a save protocol means partial work may be lost. The next session needs to know: what was the last committed state, what task was in progress, what sub-step was active.
- **Recommendation:** Define the halt-on-exhaustion protocol: commit current state, record the in-progress task and its status, write a specific event type so morning-after can report it distinctly.

**Issue 5: Hook execution environment and permissions**
- **User story:** Developer bootstraps Trellis. Gate hooks are bash scripts. Do they run in the project root? Do they have access to the full file system? Can they read files outside .building/? What shell are they invoked with? What happens if the script itself fails (syntax error, missing dependency)?
- **PRD says:** "A gate check is a shell script."
- **XRD says:** Bash gate scripts. No specification of execution context.
- **Problem:** Without environment specification, hooks may fail silently or behave differently across machines.
- **Recommendation:** Specify: working directory (project root), shell (bash), PATH requirements, error handling (non-zero exit from the script itself vs. non-zero exit meaning "gate failed"), timeout.

**Issue 6: No run resumption protocol**
- **User story:** Run halts at 3am (Tier 3 detection). User wakes up, reads morning-after, resolves the issue. How do they resume? Is it a new run or continuation of the existing one? If continuation, how is state.json updated? If new run, how does it know to skip already-completed stages?
- **PRD says:** Three states: running, halted, complete. `/build` starts a run.
- **XRD says:** "Halt stays halted indefinitely until user resumes."
- **Problem:** The resume mechanism is referenced but never specified.
- **Recommendation:** Define `/build --resume <run-id>` or equivalent. Specify: what state transitions are valid from halted, whether the user can override the halting condition, how the resumed run inherits the event log.

**Issue 7: SDM timing contradiction**
- **User story:** Task agent builds 6 tasks. By task 4, a pattern emerges: each task is adding a thin wrapper around the same utility, creating duplication. SDM running at milestones would catch this after all 6 tasks ship. SDM running continuously (brief's intent) would catch it at task 4.
- **PRD says:** "SDM runs at every milestone to look for refactor opportunities." (Section 6: post-milestone outputs.)
- **Brief says:** "SDM runs at every milestone to look for refactor opportunities so refactors happen as we go, not when everything is brittle."
- **Problem:** "As we go" suggests more frequent than milestone boundaries. The PRD's post-milestone SDM means refactors accumulate across an entire milestone's worth of tasks.
- **Recommendation:** Tier 2 decision — either accept milestone-boundary SDM (simpler, what PRD says) or add a task-count trigger (every N tasks, SDM scans for patterns). Document whichever is chosen.

**Issue 8: "Non-trivial content" undefined**
- **User story:** Gate 1→2 checks "Brief file exists with non-trivial content (>50 words)." A brief could be 50 words of Lorem Ipsum and pass. Gate 2→3 checks "PRD exists with all required sections" — but doesn't define what the required sections are.
- **Problem:** Gates need deterministic pass/fail. "Required sections" is ambiguous without a list.
- **Recommendation:** Define the section list for PRD validation (e.g., the sections from the PRD template in the building system). The >50 words check is fine as a minimum-effort gate; accept that it's a sanity check, not a quality check.

**Issue 9: No schema versioning**
- **User story:** Trellis ships v1. A month later, state.json needs a new field. Old runs have the old schema. Do old runs break? Can the morning-after generator handle both?
- **Recommendation:** Add a `"version": 1` field to state.json. Gate scripts check version compatibility. Low priority — can be added later.

**Issue 10: Override revert claim oversimplified**
- **User story:** User overrides gate 3→4 (XRD exists but security review incomplete). The orchestrator continues, builds tasks 1-6 on top of the incomplete security foundation. User later decides the override was wrong. PRD says "git revert <override-commit> undoes both the override and all work built on top of it."
- **Problem:** `git revert` of a single commit doesn't undo subsequent commits built on top. It reverts the *content* of that one commit. To actually undo "all work built on top," the user needs `git revert HEAD~6..HEAD` or `git reset --hard <override-commit>^`. The PRD's claim is technically inaccurate.
- **Recommendation:** Clarify the rollback mechanism. Either: (a) state that reverting an override means reverting everything after it (multiple commits), or (b) provide a `/build --rollback-to <stage>` command that handles the multi-commit revert.

---

## 4. User-Experience Gaps

Comparing my independent first-use sequence against the PRD:

| My Expectation | PRD Coverage | Gap? |
|---------------|--------------|------|
| Install/bootstrap in one command | Covered: `/build --bootstrap` | No gap |
| Start overnight run with brief | Covered: `/build <path-to-brief>` | No gap |
| Failure modes detected and fixed autonomously | **Partially covered.** Detection exists. Autonomous fix protocol missing. | **High-severity gap (Issue #2)** |
| Performance/security running continuously | Covered for security (code review hook, gate check). Performance is post-milestone only. | Medium gap — matches PRD Decision but diverges from brief |
| Single phone-readable summary in the morning | Well covered. Morning-after spec is thorough. | No gap |
| Confidence signal — clean vs. messy | Covered: two-tier confidence (Verified/Partial) | No gap |
| Roll back 2-4 steps easily | **Unclear.** Stage-boundary commits are too coarse. XRD mentions task commits but PRD doesn't confirm. | **High-severity gap (Issue #3)** |
| See what decisions were made autonomously | Covered: Tier 2 decisions in morning-after, DECISIONS.md committed | No gap |
| Resume after halt | Referenced but not specified | Medium gap (Issue #6) |

---

## 5. Insights and Implications

**Insight:** The documents design a *governance observer* but the brief asks for a *governance actor*. Detection hooks observe problems. The brief expects the system to also fix them autonomously. The gap between observing and acting is where overnight runs die — a halted run at 2am wastes 6 hours of potential progress.

**Implication:** The recovery protocol (Issue #2) is not a nice-to-have. It is the difference between Trellis-as-guardrails (stops the car from going off the cliff) and Trellis-as-autopilot (corrects course before the cliff). The brief asks for autopilot. The PRD delivers guardrails. This is the single most important design gap to resolve.

---

**Insight:** The XRD's Technical Risk #2 (hook blocking semantics) is not a risk to be monitored — it's a precondition to be verified. If PostToolUse doesn't block, the entire enforcement layer is advisory. This should be validated in a 30-minute spike before any architecture work begins.

**Implication:** Day Zero should begin with a hook-behavior verification task. If the result is "hooks don't block," Track A (Enforcement) needs redesign before any gate scripts are written.

---

**Insight:** The PRD and XRD agree on everything they both address. The issues are almost entirely in what neither document covers — recovery, resumption, and the operational semantics of "the orchestrator must fix."

**Implication:** The documents are high-quality individually. The gaps are at the seams — where enforcement meets recovery, where detection meets action, where halt meets resume. These are the integration points that need specification.

---

## 6. Strengths

**Gate enforcement via Claude Code hooks is the right primitive.** External to the LLM, mechanical, auditable. The decision to use hooks over a meta-agent (XRD Affirmation 1) is correct — it eliminates an entire class of "quis custodiet ipsos custodes" problems.

**Git as state store is elegant.** No database, no external service, no new dependency. Rollback is a git operation. Forensics is git log. The state is co-located with the code. This is the simplest possible persistence layer that works.

**Event-log-driven morning-after eliminates hallucination risk.** Generating the summary from committed event files rather than LLM memory means the morning-after report is as reliable as the event log itself. No "the LLM forgot what happened at 3am" failure mode.

**Two-tier confidence is appropriately simple.** Verified vs. Partial is a binary the user can assess in 2 seconds on a phone. More tiers would require judgment the user shouldn't need to apply at 7am.

**Override mechanism with dedicated commits is well-designed.** The principle (Decision 29: Reversible Boldness) is sound. Prefer action with a trail over halting. The implementation — override file + flag + dedicated commit — creates a clean forensic record and a clear revert target.

**The XRD's pushback items are genuine and well-resolved.** The assertion-strength concern (5.2) correctly identifies that LLM judgment cannot be a real-time blocking hook. Moving it to Layer 2 at gate boundaries is the right call.

**Detection hooks target the right failure modes.** Scope creep, dependency grab, loop of despair, decision conflicts, ghost references — these are the actual failure modes that occur in overnight builds. The selection is experience-informed, not theoretical.

---

## 7. Recommended Next Steps

1. **Verify hook blocking semantics (before Day Zero).** Write a 10-line test: register a PostToolUse hook on Write, have Claude write a file, check whether the hook can prevent the write from persisting. This is a go/no-go for Track A architecture.

2. **Resolve rollback granularity (Issue #3).** Confirm per-task commits are the design. Update PRD Section 3.5. This affects the git strategy for the entire build.

3. **Define recovery protocol for Tier 2 detections (Issue #2).** Minimum viable: for each detection hook, specify what the orchestrator does to fix it. Accept that v1 may have shallow recovery (revert the offending file, re-run the task) rather than deep recovery (diagnose root cause, apply targeted fix). Shallow recovery that keeps the run going is better than halt.

4. **Define run resumption protocol (Issue #6).** Specify `/build --resume`. This is needed before the first overnight run — every halt needs a resume path.

5. **Specify hook execution environment (Issue #5).** Brief section in XRD Day Zero contracts: working directory, shell, timeout, error-vs-failure distinction.

6. **Accept medium-severity issues as Tier 2 decisions.** Issues 7, 8, 9, 10 can be resolved during development by the implementing agent. They don't cascade.

---

## High-Severity Issues Requiring Resolution Before Development

1. **Hook blocking semantics** — Verify PostToolUse can prevent state transitions. If not, redesign enforcement layer.
2. **Autonomous recovery protocol** — Define what "orchestrator must fix" means for each detection hook. Without this, all detections become halts.
3. **Rollback granularity** — Confirm per-task commits. Update PRD to match XRD's three commit types (task, gate, halt).

---

## Tier 3 Items

### Item 1: Recovery Depth for Autonomous Overnight Runs

**User story:** A solo developer starts an overnight build expecting 8-10 hours of autonomous progress. At hour 2, a Tier 2 scope-creep detection fires. The system halts. The developer wakes up to find only 2 hours of progress were made. They expected the system to correct course and continue.

**Insight:** The gap between "detect and halt" vs. "detect and recover" determines whether Trellis enables 8-hour autonomous runs or creates a system that halts every 2 hours on average. The brief's value proposition depends on recovery, not just detection.

**Implication:** Adding recovery means the system takes autonomous corrective action (reverting files, re-running tasks, deploying SDM mid-run). This increases both capability and risk — a bad recovery could make things worse. The override/commit model mitigates this (bad recovery is revertible), but the product decision is: should v1 attempt recovery, or should v1 be detection-only with recovery planned for v2?

**Question for the Product Maker:** Should Trellis v1 attempt autonomous recovery on Tier 2 detections (higher overnight throughput, more risk of cascading bad fixes), or should v1 be detection-and-halt only (lower throughput, simpler to build, recovery deferred to v2)?
