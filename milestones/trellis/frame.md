# Frame: Governance Layer for Building

## The Chosen Frame

We are building **governance machinery that lives inside Claude Code's native primitives** for **the user, working alone on Building**, because **the existing markdown-driven pipeline catches failure modes inconsistently and provides no resumable trust state across long unattended runs**. Success looks like **overnight runs of 8-10 hours where most failure modes are caught and fixed at Tier 2 during the run, where the user wakes up to a structured digest that makes review efficient, and where bad outcomes can be investigated and rolled back from clearly-identified checkpoint states**. This is *not* **a workflow engine that replaces Claude Code's role as the host**, *not* **a system optimized for autonomous shipping without human review**, *not* **a parallel infrastructure that duplicates what git already provides**, and *not* **a tool-portable abstraction built ahead of evidence that portability needs to be a v1 concern**.

## Premises

Each is a hypothesis that downstream stages exist to test. A premise that no evidence could refute isn't a premise — it's a definition.

**Premise:** Most agent failure modes are mechanically expressible — they can be detected by deterministic scripts running at gate transitions without LLM judgment.
**Evidence that would contradict:** Implementation reveals that the majority of catalogued failure modes either cannot be expressed as mechanical checks, or that the mechanical expressions produce so many false positives or false negatives that the LLM validator has to re-do the work.

**Premise:** LLM-interpreted control flow is a load-bearing source of failure separable from LLM-interpreted artifact judgment. The orchestrator-LLM drifting on whether to halt at a gate is a different failure than a validator-LLM mis-judging an artifact's quality.
**Evidence that would contradict:** Overnight runs with deterministic enforcement at gates still drift in the same ways they did with LLM-interpreted enforcement, suggesting the control-flow LLM wasn't the locus of the problem.

**Premise:** Claude Code's native primitives (hooks, sub-agents, skills, slash commands) are sufficient infrastructure for the governance layer without a separate harness process.
**Evidence that would contradict:** Implementation reveals that hooks fire too late, sub-agent context boundaries are wrong-shaped, skills can't coordinate the multi-stage flow, or some other primitive limitation forces a parallel process anyway.

**Premise:** Git plus committed validator-output files is sufficient persistence for the manual-forensic-review workflow. A clean-context investigator spawned by the user can read git history and `.building/runs/<run-id>/` files to reconstruct what happened.
**Evidence that would contradict:** Actual forensic investigations reveal that the committed files don't carry enough state to localize divergence, or that the user reaches for state that isn't in the files (in-flight orchestrator state, sub-agent conversation history, intermediate artifacts).

**Premise:** The user is the only reviewer. Building is not optimizing for unattended shipping — it is optimizing for high-leverage human-in-the-loop with deep autonomy between check-ins.
**Evidence that would contradict:** The user finds the morning-after review onerous enough that they reach for additional automation, or finds that the system surfaces too few or too many things to them — the wrong things, repeatedly.

**Premise:** Most inner-loop and middle-loop failure modes can be fixed at Tier 2 (autonomous) because the fixes are mechanical. Most outer-loop modes require Tier 3 (human judgment) because the fixes are architectural.
**Evidence that would contradict:** The starting policy table fails on contact with real cases — the supposed-Tier-2 fixes turn out to require judgment in practice, or the Tier 3 cases turn out to be routinely auto-fixable.

**Premise:** Tool-agnosticism is a preference, not a hard requirement, and the right discipline is to avoid architectural one-way doors against later portability rather than to build for portability up-front.
**Evidence that would contradict:** The user starts running Building under Codex or Cursor before Claude-Code-first implementation is mature, making parallel-implementation pressure real-time rather than future.

**Premise:** Manual forensic review by the user spawning a clean-context window is sufficient for divergence localization. Automated forensics is not needed.
**Evidence that would contradict:** Forensic investigations become a chronic drag on the user's time, or the user finds that clean-context spawns lack the structural support they need to investigate efficiently.

## Alternate Frames Considered and Rejected

**Frame:** Building gets a deterministic workflow engine — its own orchestration process, external to Claude Code, that owns control flow top-to-bottom.
**Why rejected:** This is the Frame Lock-In example already documented in the agent-failure-modes catalog: a prior project wrapped Claude Code with a CLI so completely that the host's TUI and native capabilities became inaccessible. The user explicitly does not want this shape. Claude Code's primitives (hooks, sub-agents, skills) provide the enforcement and isolation the harness needs without requiring an external process.
**Evidence that would shift toward this frame:** Implementation reveals Claude Code's primitives are insufficient — hooks can't enforce what's needed, sub-agents can't be coordinated across stages, skills can't carry the state machine. At that point an external coordinator becomes the lesser evil.

**Frame:** Building stays markdown-only — the existing pipeline's problems get fixed by better prompts and better self-checks, not by introducing structural enforcement.
**Why rejected:** The user has tried this. The audit prompt already specifies the checks; the catalog already describes the failure modes; the agents already have self-check sections. The problem isn't the quality of the specification — it's that LLM-interpreted self-check is structurally weak because the agent's drive to complete the task overrides its judgment about whether completion is genuine. More markdown doesn't change this dynamic.
**Evidence that would shift toward this frame:** Implementation reveals that the failures actually were prompt-quality problems all along — that deterministic enforcement doesn't catch meaningfully more than well-tuned self-check would have.

**Frame:** Building becomes adversarial-multi-agent — every artifact-producing stage spawns builder + skeptic agents in tension, with debate-driven gating throughout.
**Why rejected:** Cost-prohibitive at the scale of overnight runs. Debate-doesn't-terminate is a real failure mode. The user already has working debate at the PRD/XRD gate via peer review; that's the right place for it and extending the pattern everywhere isn't justified by the failure-mode evidence.
**Evidence that would shift toward this frame:** Implementation reveals that judgment-shaped LLM validators systematically miss failure modes that adversarial framing would have caught, and the cost increase is bearable.

**Frame:** Building gets a rich datastore (SQL or MCP-server-backed) for run state, failure tracking, cross-run analytics, and observability into in-flight work.
**Why rejected:** No current need. The user does single-project overnight runs, not multi-project or multi-tenant work. Forensic review is manual. Rollback is human-decided. Cross-run analytics aren't on the road map. A datastore would be infrastructure built ahead of need, violating the user's "earn the abstraction" disposition.
**Evidence that would shift toward this frame:** The user starts wanting cross-run analytics, real-time observability into in-flight work, or coordination across concurrent runs. Any of those make git-as-store insufficient and a datastore proportional to the need.

**Frame:** Building defers everything to the human (everything starts as Tier 3, the user graduates failure modes to Tier 2 only after observing them).
**Why rejected:** The user named this as too painful — "it means nothing ever automates." The cautious posture has real cost: the system never builds capability because everything always surfaces. Pre-specifying a starting policy table based on each failure mode's nature is the better trade.
**Evidence that would shift toward this frame:** The pre-specified policy table proves consistently wrong in production — Tier 2 fixes routinely make things worse, the user finds themselves reverting auto-fixes and wishing they'd been consulted.

## Notes on Frame Stability

This frame was arrived at through architecture-first exploration rather than through brief-agent's normal flow. The conversation that produced it visited and rejected the alternates above in the course of the architectural discussion — they aren't post-hoc rationalizations, they are positions the discussion considered and discarded with reasoning. The frame is somewhat unusual in being this concrete this early; that's a function of the architectural pre-work, not a sign that the frame has been over-specified.

The frame is challengeable. Every premise above has a named contradiction. If implementation work surfaces evidence that any premise is wrong, the surfacing should route as a frame-shift Tier 3 per the orchestrator's standard protocol, not as a routine decision within the frame.

One particular sensitivity to flag: the premise about Claude Code's primitives being sufficient is the load-bearing one. If it turns out to be wrong, much of the design needs to change. The right disposition is to validate this premise early in implementation — build the smallest end-to-end thing that exercises the primitive surface and see if it works — rather than to design extensively against the assumption.
