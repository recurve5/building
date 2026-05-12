# Architecture Notes: Governance Layer for Building

**Audience:** swe-agent at XRD-writing stage. Not for product-agent — the PRD should be written from user-facing intent, not from these pre-baked conclusions.

**Purpose:** Capture architectural decisions, the option space considered, and the reasoning that produced the surviving design. Prevent swe-agent from re-deriving (and possibly re-litigating) decisions that have already been made.

---

## The Problem the Architecture Solves

The existing Building pipeline catches failure modes inconsistently. The audit prompt enumerates the checks but runs post-hoc. Self-checks in agent prompts rely on the same LLM-substrate that produced the failure to also catch it — a structural weakness because the agent's drive to complete the task overrides its judgment about whether completion is genuine. Gates exist conceptually but advancement past them is decided by an orchestrator-LLM interpreting markdown, which means "halt if X" is a request, not a structural property.

The architecture's job is to make detection happen during the run rather than after, make enforcement structural rather than interpreted, and provide enough state persistence to support manual forensic investigation and human-decided rollback — without building parallel infrastructure to what Claude Code and git already provide.

## Option Space Considered

Five architectural options were explored in the originating conversation:

1. **Prompt-layer reinforcement only.** Better instructions, more aggressive self-checks. Rejected: same fundamental dynamic, dampened. The unifying failure (agent drive to complete overrides judgment) remains.

2. **Gate-embedded validators (all LLM).** More validator agents at more gates, structurally required to pass before advancement. Rejected as sufficient on its own: LLM-checking-LLM has structural limits more validators don't fix.

3. **Deterministic pre-gate + LLM gate.** Mechanical checks run as scripts before LLM validators. Adopted as the *content* layer for gates.

4. **Deterministic control loop.** A harness owns invocation, persistence, failure response, and rollback. Adopted as the *enforcement* layer.

5. **Adversarial multi-agent.** Builder + skeptic + judge at every artifact-producing stage. Rejected: cost-prohibitive, debate-doesn't-terminate, the existing peer review at PRD/XRD already provides this dynamic where it's most valuable.

The surviving design combines Option 3's check content with Option 4's enforcement layer, implemented in Claude Code's native primitives, with git as the persistence layer.

## The Surviving Design

### Control loop

The orchestrator's role changes from "LLM interprets markdown and decides what to invoke next" to "deterministic flow runs stages in order, invokes agents at defined points, runs checks at defined gates, persists state at defined boundaries, decides what to do on failure according to coded policy."

The mechanism is Claude Code's own primitives:

- **Skills** carry stage definitions and orchestration logic. An orchestrator skill is the entry point; per-stage skills carry the procedures for each stage.
- **Sub-agents** (defined in `.claude/agents/`) carry the existing agent roles (brief-agent, product-agent, swe-agent, peer-review-agent, etc.). Their context is isolated by default, which gives the "clean context window" behavior for free where it's the right move.
- **Hooks** (`PreToolUse`, `PostToolUse`) carry the deterministic checks. A `PostToolUse` hook on `Edit`/`Write` runs scope-diff, dependency-diff, test-claim verification scripts. A non-zero exit blocks the tool use structurally.
- **Slash commands** carry user-invoked workflows: `/building-run`, `/building-resume`, `/building-status`, possibly `/building-rollback`.

The "harness" is not a separate process. It's the configured collection of skills, hooks, sub-agents, and slash commands that together enforce the governance.

### Check content

Two layers per gate:

**Deterministic layer (runs first).** Scripts invoked by hooks or by orchestrator skill. Cover the mechanically-detectable failure modes:

- *Scope check:* `git diff --name-only` against task's Files section, set difference, non-empty = fail
- *Dependency check:* Diff package manifest, non-authorized adds = fail
- *Test-claim verification:* If the task claimed tests pass, the script runs the test suite and compares exit code
- *Commit-format check:* `git log --format=%s` for the task's commits, regex against `[TASK_ID]` prefix
- *Heresy (surface):* For each Hard Kill in DECISIONS.md, grep for killed terminology; hits = fail
- *Process Drift:* Verify git state matches build plan at phase boundaries

These are essentially the audit prompt's numbered sections, translated from prose to scripts. The audit prompt remains useful as a post-hoc tool and as a reference for what each check is testing.

**LLM validator layer (runs after deterministic layer passes).** Sub-agents invoked by the orchestrator skill at gate transitions. Cover the judgment-shaped checks:

- *Peer review* — existing agent, covers PRD↔XRD alignment, heresy (deep), spec-without-shoes, user-experience walkthrough gaps
- *Task audit* — new validator scope, covers per-task quality concerns the deterministic layer can't (weak test patterns beyond mechanical detection, premature abstraction nuance, clean slate bias edge cases)
- *Performance review* — existing agent extended to post-milestone validation
- *Security review* — existing agent extended to post-milestone validation
- *SDM refactor scan* — existing agent, now invoked at every milestone boundary not just on escalation

The LLM validators get smaller, more focused inputs because the deterministic layer pre-filtered the easy violations.

### Failure response policy

Coded, not interpreted. The policy table in the brief governs which failure modes auto-fix at Tier 2 vs. escalate to Tier 3. Policy implementation lives in the orchestrator skill.

Key implementation points:

- *Tier 2 fixes are mechanical.* Revert out-of-scope files. Send task back to agent with the specific failure mode named and the constraint explicit. Track retry count for Loop of Despair detection.
- *Tier 3 surfaces halt the gate.* The orchestrator skill writes failure context to `.building/halts/<timestamp>/` and waits for user input via a structured prompt. The user can answer through the running Claude Code session (terminal or remote-control phone).
- *The harness doesn't decide rollback.* When the orchestrator detects state that warrants rollback (cascading Tier 3s, repeated Tier 2 retries, milestone-level fragility), it writes a rollback recommendation to `.building/halts/`. The user reviews and decides.
- *Override surface for the user.* The user can advance past a halted gate with explicit override (logged as a Decision). The user can force a rollback the system didn't recommend. The user can kill a run entirely. The mechanism is slash commands.

### Persistence

Files in the repo, committed to git. No separate datastore.

Layout sketch (open in the brief for product-agent to refine):

```
.building/
  runs/
    <run-id>/
      morning-after.md
      gates/
        m1-pre-xrd/
          peer-review.md
          security-review.md
        m1-wave-3/
          task-audit.md
          deterministic-checks.json
        m1-post-milestone/
          sdm-refactor-scan.md
          performance-review.md
          security-review.md
      halts/
        <timestamp>/
          context.md
          rollback-recommendation.md (if applicable)
      events.log
```

Run-state is mostly implicit in the file system: which gates have files = which gates have run; which gates have non-empty halts/ = which gates need user attention. The orchestrator skill reads the file system to determine what state the run is in.

Gate-passage commits use structured messages: `[gate-passed] m1/wave-3 scope:ok deps:ok tests:ok audit:ok` — searchable, greppable by the user or by a clean-context investigator.

The `.building/` directory is committed alongside the project code. Rollback is `git reset --hard <commit>` which reverts both code and gate-state together. There's no synchronization problem because they're in the same repo.

### What the morning-after artifact looks like (mechanics, not contents)

The orchestrator skill writes `.building/runs/<run-id>/morning-after.md` at the end of every run (success, halt, or failure). The summary message at end-of-run includes either the file's contents inline or a pointer to it depending on length.

The artifact is committed to git as part of the run's end. The user can read it on phone via remote-control mode (it's a markdown file in their repo) or check it later locally.

The specific content shape (sections, ordering, work-confidence categorization rules) is open in the brief for product-agent to design.

## Architectural Decisions and Rationale

Captured here in the format swe-agent normally uses for Tier 2 decisions, so they can be moved into DECISIONS.md or referenced from the XRD.

**Decision: Enforcement uses Claude Code's hook system, not orchestrator-LLM interpretation.**
*Rationale:* Hooks structurally cannot be bypassed. A `PostToolUse` hook with non-zero exit blocks the tool use. The orchestrator-LLM has no opportunity to decide to advance anyway. This is the headline mechanism that gets us out of LLM-interpreted-control-flow.
*Tradeoff:* Hooks are Claude Code-specific. Codex CLI and Cursor have analogous mechanisms but the wiring would be parallel implementations. This is acceptable because the failure-mode catalog, agent prompts, and check scripts (bash) all remain portable; only the wiring is per-tool.

**Decision: State lives in `.building/` files in the repo, committed to git.**
*Rationale:* Manual forensic review needs to read past state with standard tools (`git log`, `git show`, `git diff`). A separate datastore would require a custom interface for the same investigation. Rollback semantics are git's native operation; emulating them in a separate store is a synchronization bug waiting to happen.
*Tradeoff:* No real-time observability, no cross-run analytics, no concurrent-mutation ergonomics. None of these are needed for the user's workload (single-project overnight runs, single user). Adding a datastore later remains possible; the file layer would become canonical and the store would be derived.

**Decision: Sub-agents are invoked with curated context, not parent context or blank context.**
*Rationale:* The user backed off the rule of "always fresh context for fixes." Sometimes continuity helps; sometimes fresh helps. Claude Code's sub-agent system supports curated context — the orchestrator picks what the sub-agent sees per-situation. This is more flexible than either alternative.
*Tradeoff:* The orchestrator skill has to know what context to provide per sub-agent invocation. This is real complexity but it's localized to one place.

**Decision: Checkpoint level is "medium" — git plus committed validator-output and gate-passage files.**
*Rationale:* Lightweight (bare git) is insufficient for manual forensic review because validator outputs would be lost. Heavy (full run-state snapshots) is overkill without automated forensics or rollback. Medium gives the investigator real material to work with at trivial storage cost.
*Tradeoff:* Some commit noise from gate-passage commits. Acceptable; the commits are also the audit trail.

**Decision: Performance and security validation run post-milestone, not post-wave or post-task.**
*Rationale:* Milestone is the natural integration unit (smoke test already fires there). Consolidating validation at one boundary keeps overhead manageable and gives the validators a coherent chunk of work to assess. Per-wave is too frequent; per-task is too granular for these particular concerns.

**Decision: SDM runs a refactor-opportunity scan at every milestone boundary regardless of other triggers.**
*Rationale:* Accumulating Fragility can build across many tasks without any single task tripping existing SDM triggers. Making the post-milestone scan standing practice catches drift before it cascades. Existing SDM triggers (pre-XRD, escalation-driven, mid-build synthesis) stay.

**Decision: Worker-validator debate is not extended beyond peer review.**
*Rationale:* The dynamic works at PRD/XRD because the artifacts are stable documents and the debate is bounded (peer review surfaces issues, originator responds, contradictions route to product). Extending the pattern to gates that operate on live, evolving artifacts would multiply cost and introduce termination problems.

**Decision: Forensic review is manual; the system does not automate divergence localization.**
*Rationale:* The user prefers to spawn a clean-context window manually when investigation is needed. Automated forensics would need to be reliable to be useful and that reliability is hard to establish without significant infrastructure. Manual review with git history + committed validator outputs is sufficient.

**Decision: Rollback is human-decided. The system recommends; the user acts.**
*Rationale:* The system can identify cases where rollback looks warranted, but the decision is judgment-shaped (is this drift recoverable, or do we need to lose work). The user is the right decision-maker. The system's job is to make the recommendation legible and actionable.

**Decision: Most inner-loop and middle-loop failure modes default to Tier 2 (autonomous fix); most outer-loop modes default to Tier 3 (human judgment).**
*Rationale:* Execution-level failures have mechanical fixes; design-level failures need judgment. The starting policy table in the brief encodes this. It will be refined as real cases surface edges.

## Implementation Sequence Suggestion

Not prescriptive — swe-agent will decide ordering in the XRD. But the natural sequence the conversation implied:

1. **Translate deterministic checks from audit prompt to scripts.** Smallest, cheapest, learnable. Validates the premise that most failure modes are mechanically expressible.
2. **Wire scripts as Claude Code hooks at gate boundaries.** Validates the premise that hook enforcement is sufficient.
3. **Sub-agent definitions for existing agent roles** (most already exist as prompts; conversion is mechanical).
4. **Orchestrator skill carrying stage definitions and invocation logic.** This is where the most design work lives.
5. **Failure-response policy implementation** (Tier 2 auto-fix logic, Tier 3 surfacing, retry tracking).
6. **Persistence layer** (`.building/` structure, gate-passage commits, validator output committing).
7. **Morning-after artifact generation.**
8. **Slash commands for user-facing operations** (`/building-run`, `/building-resume`, `/building-status`, `/building-rollback`).
9. **Rollback recommendation logic** (detection patterns, recommendation generation).

Steps 1-2 are the cheapest path to validating the load-bearing premise (Claude Code's primitives are sufficient). If steps 1-2 reveal that primitives are inadequate, the design needs to change before going deeper. This argues for building these end-to-end at small scope before committing to the rest.

## Open Architectural Questions

These are not decisions; they're things swe-agent will need to resolve in the XRD.

1. **How does the orchestrator skill maintain state across the run?** The file layer carries durable state, but in-session orchestrator state (current stage, current wave, pending invocations) needs a representation. Options: file-backed state machine, ephemeral state held in the skill's working context, structured commit messages as state encoding. Each has tradeoffs.

2. **What happens when the user is offline during a halt?** The system writes to `.building/halts/`, but the running Claude Code session may have terminated or the human may not check for hours. Resumption from halt needs to work cleanly even if significant time has passed.

3. **How are sub-agents coordinated when a gate requires multiple validators?** Sequential, parallel, with what timeout? The orchestrator skill needs a coordination model.

4. **What's the granularity of git commits during a build?** Per-task is the obvious answer (and matches the existing `[TASK_ID]` convention). Gate-passage commits are additional. Whether validator output files get their own commit or piggyback on the gate-passage commit is open.

5. **How does the system handle external dependencies during a run?** Some tasks need to install packages, hit external APIs, run migrations. Failure of these is different from agent failure. The failure-response policy probably needs a category for "external dependency failure" distinct from the catalog modes.

6. **What's the bootstrap experience for a project that doesn't yet have a `.building/` directory?** Mentioned in the brief as an open assumption. Probably a slash command that initializes the directory and the relevant skills/agents/hooks for that project.

These questions are flagged for resolution in the XRD, not as Tier 3 escalations — they're engineering decisions that swe-agent owns.

## Notes on Not-Doing

A few things were considered and consciously left out of scope:

- **No MCP server for state.** Even though MCP would give nice cross-session state, it's a one-way door against tool portability and adds infrastructure without commensurate benefit.
- **No separate web UI.** The user wants phone access via Claude Code's remote-control mode, not a parallel web interface.
- **No multi-project coordination.** Single project at a time, single user.
- **No real-time event streams.** The user checks in periodically via phone; push notifications aren't in scope.
- **No automated divergence localization.** Manual forensic review covers the need.
- **No debate orchestration beyond peer review.** The existing peer review handles where debate is warranted.

These are bounded by the frame. If evidence emerges that any of them is wrong, the surfacing should be a frame-shift, not a routine extension.
