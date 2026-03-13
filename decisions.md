# Decisions

Cross-project principles. These apply to everything built under `~/building/`. They are closed unless new material information surfaces.

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Decisions are final once documented | Relitigating resolved questions is the primary source of wasted time in both product thinking and code. The Decisions Log pattern enforces finality. Reopen only with new material information, not new feelings. | 2026-03-08 |
| 2 | Tests define done | "It works on my machine" and "it compiles" are not done. A test that fails when the feature is broken and passes when it works — that's done. Every task has acceptance criteria expressed as tests. | 2026-03-08 |
| 3 | No dependencies without justification | Every external dependency is a liability: version conflicts, security vulnerabilities, behavior changes, abandoned projects. Native code that does the job in a reasonable number of lines wins over a package. If a dependency is necessary, document why in the task file. | 2026-03-08 |
| 4 | Documents before code | The pipeline (PRD → XRD → Peer Review → Test Plan → Tasks → Build) is not optional. Steps can be fast — a PRD can be written in an evening, an XRD in an hour — but they cannot be skipped. Each stage catches errors the next stage would inherit. | 2026-03-08 |
| 5 | Decompose for concurrency, build sequentially until you trust the process | Every build plan is structured as parallel tracks with Day Zero contracts. Actual execution is sequential until you've completed at least one full track and understand the agent feedback loop well enough to run two tracks without losing quality. | 2026-03-08 |
| 6 | Files over conversations | Anything that needs to survive a session lives in a file. Conversations are for thinking. Files are for building. Context that exists only in chat history is context that's already lost. | 2026-03-08 |
| 7 | One task, one change | Scope discipline at the task level. Each task produces a reviewable, testable unit of work. Opportunistic fixes go on a separate task list, not into the current task. | 2026-03-08 |
| 8 | Abstractions must be earned | Every abstraction is a bet on future change. For v1 of any project, the default is fewer abstractions. An abstraction earns its place when the cost of not having it is concrete and near-term. "We might need this later" is not earned. | 2026-03-08 |
| 9 | Test plan source of truth is the PRD | The test plan is written from the PRD as the source of truth for product intent. The XRD is consulted for implementation-revealed edge cases but does not override PRD-driven coverage. Any test case sourced from the XRD rather than the PRD is tagged [XRD] to distinguish implementation discovery from product intent. | 2026-03-08 |
| 10 | Roles resolve issues with each other before escalating to the human | The human is the boss, not the bus. SWE asks Product to resolve PRD ambiguity before escalating. Tester routes contradictions to the claim owner first. SWE implementation choices include tradeoff statements (user impact, maintenance burden, refactoring risk). Escalation to the human happens when roles disagree on materiality, refactoring risk is non-trivial, or tradeoffs cross project boundaries. | 2026-03-09 |
| 11 | Rejected ideas have exactly two types: Hard Kill and Deferred | Hard Kill: idea is permanently dead, triggers immediate purge of all references across all documents and code. Deferred: idea is valid but out of scope for now, surviving references are tagged with the deferral decision number. No other rejection types exist — the reason for killing an idea belongs in the rationale column, not the type. | 2026-03-12 |
| 12 | Hard Kill decisions trigger an immediate cross-document purge | When a Hard Kill is logged, search all project documents and source code for the killed idea's terminology before doing anything else. Delete every reference that is not the DECISIONS.md kill entry itself. This is the one exception to one-task-one-change: purging a ghost takes priority over scope discipline because an unremoved ghost compounds with every subsequent session. Tag all Hard Kill entries `[HARD KILL]`. Tag all Deferred entries `[DEFERRED]`. | 2026-03-12 |

## Reopen Protocol

To reopen a closed decision:

1. State the original decision number and text.
2. State the new information that was not available when the decision was made.
3. State why that information is material — why it changes the calculus, not just adds a data point.

The decision is only reopened if the Product Maker (me) affirms the information is material. If reopened, the original entry stays in the table with an annotation: `[Reopened DATE — see #N]`. A new entry is added with the updated decision and rationale. The log is append-only. Nothing is deleted or overwritten.

## Deferred Topics

These were identified in the first peer review and are consciously deferred to the project level. They are not in scope for the master build docs. When they surface during a project, resolve them in that project's DECISIONS.md.

- **Error handling philosophy.** What does an agent do when a task is ambiguous, a test is flaky, or two tasks produce conflicting outputs? "Ask before guessing" covers code ambiguity. Process failures are project-specific.
- **Session handoff protocol.** What state should the codebase be in when a session ends mid-task? The task file status field (`in progress`) tracks this, but guidance on clean stopping points is project-dependent.
- **When to scale down stages.** The system says "no step is skipped" but doesn't define minimal-viable versions of each stage for a 2-hour project vs. a multi-week build. Scaling guidance depends on project scope and will be documented per-project as patterns emerge.
