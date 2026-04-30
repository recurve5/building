# Decisions — test-project

## Foundational Tenets

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Use SQLite for local persistence | Embedded, no server, good enough for v1. | 2026-03-08 |
| 2 | [HARD KILL] Remove real-time sync feature | Adds complexity without clear user value. Real-time sync is permanently rejected. | 2026-03-10 |
| 3 | Abstractions must be earned | Every abstraction is a bet on future change. For v1, fewer abstractions. | 2026-03-12 |

## Operational Decisions

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 4 | [DEFERRED] Push notifications to v2 | Valid feature but out of scope. [DEFERRED] to post-launch. | 2026-03-14 |
| 5 | Git attribution uses commit convention | Enables per-task Scope Creep detection. | 2026-03-15 |
| 6 | [HARD KILL] Drop XML export | Nobody uses XML exports. [HARD KILL] — permanently removed. | 2026-03-16 |
| 7 | Use markdown for all documentation | Rationale includes a [DEFERRED] marker for rich-text support. | 2026-03-17 |

## Build Process

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 8 | Tests define done | "It works on my machine" is not done. | 2026-03-18 |
| 9 | [HARD KILL] [DEFERRED] Hybrid entry with both tags | This is an edge case — rationale also says [HARD KILL] for good measure. | 2026-03-19 |
