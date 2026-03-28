# Agent Failure Modes

Patterns to watch for when agents write code. These are the equivalent of the writing failure modes doc, but for engineering. See CLAUDE.md for the growth mechanism: when a new failure mode is observed, add it here before the next session.

## When Failure Modes Strike

Failure modes cluster by development loop timescale (per Yegge/Kim's three-loop model). Knowing *when* a failure mode manifests tells you *where* to watch for it.

**Inner loop** (during task execution, seconds to minutes) — These happen while the agent is writing code. Detection during execution is cheaper than detection at the gate: **Test Cheat, Loop of Despair, Scope Creep, Ghost Refactor, Clean Slate Bias, Dependency Grab.**

**Middle loop** (across tasks and sessions, hours to days) — These emerge from the boundaries between tasks or the gaps between sessions: **Context Amnesia, Heresy, Precondition Ghost, Closed-Loop Build, Confidence Bluff, Heroic Unblock.**

**Outer loop** (architectural, weeks to months) — These are baked into the design before code is written. They're the most expensive to fix because every task built on a flawed architecture inherits the flaw: **Architecture Mirror, Lossy Middleman, Premature Abstraction, Unoptimized Default, Spec Without Shoes, Big Bang Integration.**

## The Test Cheat

**What it is:** The agent makes a failing test pass by weakening the assertion rather than fixing the code. `XCTAssertNotNil(result)` instead of `XCTAssertEqual(result, expectedValue)`. Or the agent modifies the test to match the (wrong) output instead of fixing the code to produce the right output.

**Why it happens:** The agent's objective is "make tests pass." The cheapest path to that objective is often changing the test, not the code.

**How to catch it:** Review test assertions, not just test results. Any assertion that tests for existence without testing for correctness is suspicious.

## The Scope Creep

**What it is:** The task says "build StreakService" and the agent also refactors the data model, renames files for consistency, adds a utility it thinks will be useful later, and reformats code it didn't write.

**Why it happens:** The agent sees the full codebase and optimizes globally rather than locally. It's trying to be helpful.

**How to catch it:** Two checks. First, diff the changed files against the task's "Files" section — any file modified that isn't listed is scope creep. Second, verify that the changes *within* each listed file are consistent with the "What to Build" section. A file can be listed in Files→Modify and still be scope-crept if the agent rewrote unrelated parts of it. Reject and ask for a clean implementation.

## The Dependency Grab

**What it is:** The agent installs a third-party package to solve a problem that's solvable in native code. A date formatting library when Foundation handles it. A state management framework for a 10-screen app. A testing utility when XCTest does the job.

**Why it happens:** The agent's training data includes millions of projects that use these packages. It defaults to the common pattern rather than the minimal one.

**How to catch it:** Check for any `import` that wasn't in the task's contracts section. Any new entry in a package manifest. Per the decisions doc, no dependencies without justification.

## The Confidence Bluff

**What it is:** The agent says "Done — all tests pass" but either didn't run the tests, ran a subset, or is ignoring a failure.

**Why it happens:** Some agent configurations don't actually execute tests as part of their loop. Or the agent ran into a test failure it couldn't fix and decided to report done anyway.

**How to catch it:** Run the tests yourself after every "done" report. Trust but verify. In Claude Code, you can ask it to run the full test suite and show you the output.

## The Context Amnesia

**What it is:** An agent in a later session contradicts or ignores a decision from an earlier session. It uses a different persistence approach than the XRD specified. It restructures something that was deliberately designed a certain way.

**Why it happens:** Each session starts with a blank context. If the decision isn't in the CLAUDE.md or the DECISIONS.md, the agent doesn't know about it.

**How to catch it:** This is why context management exists. Keep the project CLAUDE.md and DECISIONS.md current. If an agent makes a choice that contradicts a documented decision, point it to the file.

## The Ghost Refactor

**What it is:** The agent rewrites working code to match its preferred style, conventions, or patterns. The code worked before. The code works after. But the diff is large, the review burden is high, and the risk of introduced bugs is non-zero.

**Why it happens:** The agent has strong opinions about code style and treats "could be better" as "should be changed."

**How to catch it:** If the task doesn't say "refactor," a refactor is a failure mode. Working code that passes tests stays as-is unless a task explicitly targets it for cleanup.

## The Premature Abstraction

**What it is:** The task says "build a theme with dark mode colors." The agent builds a ThemeEngine with protocol conformances, a theme registry, a factory pattern, and runtime theme switching — when all you needed was a struct with color values.

**Why it happens:** The agent pattern-matches against sophisticated codebases in its training data and builds for scale that doesn't exist yet.

**How to catch it:** Compare the abstraction to decision #8 in `decisions.md`: "Abstractions must be earned." If the abstraction doesn't serve a concrete, near-term need stated in the PRD or XRD, it's premature.

## The Loop of Despair

**What it is:** The agent hits an error, tries to fix it, creates a new error, tries to fix that, and enters a cycle where each fix introduces a new problem. After 10 iterations, the code is worse than where it started.

**Why it happens:** The agent doesn't have a mental model of the system — it's pattern-matching against error messages. When the fix for error A creates error B, it treats B as an independent problem rather than recognizing it's a consequence of the wrong approach to A.

**How to catch it:** If an agent has made more than 3 attempts at the same problem, stop it. Read the error yourself. Often the right move is to revert to the last working state and reframe the task.

## The Heresy

**What it is:** A rejected idea that was not fully purged from all documentation and code. The fragment — a field name, a feature description, a code comment, an import statement, a database table, a JSON key — survives in one document while the idea is dead everywhere else. A later agent reads the wrong document first, treats the fragment as a live requirement, and builds against it. The result is a schism: the selected approach and a ghost implementation of the rejected one coexist in the same codebase. Two competing data models. Two UI flows that surface under different code paths. The schism deepens with every subsequent session because each new agent sees both implementations and has no basis to choose between them.

**Why it happens:** Decisions are logged when they're made, but the documents that originally introduced the rejected idea are not always updated when it's killed. A PRD draft mentions an approach. The XRD rejects it. DECISIONS.md logs the kill. But the PRD still has the paragraph. The next agent reads the PRD, sees a live-looking requirement, and builds it.

**Two rejection types govern the response:**

- **Hard Kill** — The idea is dead permanently. Every reference to it anywhere other than the DECISIONS.md entry that killed it is a ghost. Trigger: full purge across all documents and source code immediately upon logging the decision.
- **Deferred** — The idea is valid but out of scope for now. References survive but must be tagged with the deferral decision number so they're recognizable as intentional. A tagged reference is not a ghost — an untagged one is.

**How to catch it:** Every Hard Kill decision triggers an immediate cross-document audit. Search for the idea's specific terminology — class names, field names, feature names, any phrasing unique to the rejected approach. Delete references in docs. Remove dead code. Do not leave comments that say "we considered X but rejected it" — to a future agent reading quickly, that is indistinguishable from a live requirement.

Before beginning any significant build phase, run a Heresy inspection: read DECISIONS.md, extract every Hard Kill, and search the entire codebase and all documents for their terminology. Any hit that isn't the DECISIONS.md kill entry itself is a ghost that must be removed before new code is written.

## The Precondition Ghost

**What it is:** A task references files, directories, tools, or infrastructure that no prior task creates. Task 3 writes to `src/interfaces/signal-adapter.ts` but no task creates `src/` or initializes the TypeScript project. The task looks complete in isolation — it has clear inputs, outputs, and acceptance criteria — but it can't execute because a precondition is orphaned.

**Why it happens:** Task decomposition works top-down from the architecture. The SWE mentally starts from the XRD's structure and breaks it into deliverables. The implicit environment — project scaffold, installed tools, configuration files, directory structure — feels like it already exists because the architecture describes a finished system. No one walks backward from the first task to an empty directory.

> **Insight:** Engineering-perspective task decomposition is blind to preconditions that are only visible when walking the user story from zero. The architect sees the finished system; the developer starting on day one sees an empty directory.
> **Implication:** A user-story walkthrough after task decomposition — starting from nothing, tracing every step to the first passing test — catches the entire class of orphaned preconditions that architectural review misses.
> **Decision:** Added user-story walkthrough as a required verification step in Stage 6 of `build-process.md`.

**How to catch it:** After writing task files, walk the user story from an empty directory through the first task's acceptance criteria. Every precondition must trace to a prior task or explicit documentation. If a precondition is orphaned, add a task that creates it.

## The Architecture Mirror

**What it is:** The SWE designs the system to mirror the *structure* of the desired output rather than the *process* that produces it. The output has categories (consumables, rotation, deaths, gear), so the architecture has matching components (ConsumableAnalyzer, RotationAnalyzer, DeathAnalyzer, GearAuditor). But the output wasn't *produced* by categories. It was produced by a human reading everything chronologically and letting patterns emerge. The architecture recapitulates the output's table of contents, not the process that created it.

**Why it happens:** Decomposition by output structure feels like understanding. The SWE looks at the quality bar example, sees sections and categories, and builds components that map to them. This is classification — sorting the *results* of insight into bins — not comprehension of how the insight was generated. The architecture looks right on a whiteboard. Every component has a clear responsibility. The system is clean, testable, and wrong.

**The signature:** The architecture's component names read like the headings in the quality bar example. The data flow diagram looks like the output's table of contents turned sideways.

**How to catch it:** Before proposing an architecture, the SWE must understand not just what the quality bar output *contains* but how it was *created*. What was the actual process — human or machine — that turned raw input into that output? What did the creator need to see, simultaneously, to produce the key insights? The architecture should recapitulate *that process*, not the output's structure.

Ask: "Am I designing this system to mirror what the output looks like, or to mirror how the output was made?" If the answer is the former, stop and study the creation process before proceeding.

## The Lossy Middleman

**What it is:** The architecture places processing layers between raw data and the model that does final reasoning. Each layer extracts what the designer *thought* was important and discards the rest. The model at the end receives pre-filtered fragments and tries to reconstruct insight — but the filtering already removed the signal the model was best positioned to find. The system works exactly as designed. Every component passes its tests. The output is mediocre because the architecture made it impossible to be good.

**Why it happens:** Intermediate processing feels obviously correct. Break the problem into categories, check each category, collect the results, narrate them. The designer doesn't realize the compression is lossy because they can't enumerate what patterns the model *would have found* in the raw data — by definition, those are the patterns nobody anticipated.

**The signature:** The system has a quality bar example (smoke test, reference output, design mock) that the architecture provably cannot reproduce — not because of bugs, but because the data reaching the final stage no longer contains the information needed to produce it. Every component works. The pipeline fails.

**How to catch it:** Before committing to an architecture where a model does final synthesis, take one concrete quality bar example and trace it backward: what specific data points produced this output? Then trace forward through the proposed architecture: at each processing stage, is that data still present, or has it been summarized, categorized, or discarded? If the data reaching the model is insufficient to reproduce the example, the architecture has a Lossy Middleman.

**The deeper principle:** When a model does the final reasoning, intermediate layers should be additive (enriching, annotating, structuring) rather than reductive (filtering, summarizing, compressing away the raw signal). The moment you throw away data to save tokens, you're betting you know what the model will need. If you knew that, you wouldn't need the model.

## The Closed-Loop Build

**What it is:** The build validates itself against its own spec rather than against the quality bar. The architecture defines tasks. Tasks define tests. Tests validate code. Code satisfies the architecture. The loop is closed — internally consistent, fully passing — and the quality bar is outside the loop entirely.

**Why it happens:** Each task's acceptance criteria are derived from the architecture, not from the desired output. "Does the analyzer produce findings? ✓ Does the synthesizer produce prose from findings? ✓ Done." No task asks "does the final output match the quality bar?" The build can run to completion — every test green, every milestone hit — without anyone comparing the actual output to the reference examples.

**The signature:** The project has quality bar examples that existed before any code was written. Every task is complete. Every test passes. Nobody has compared the output to the examples. When someone finally does, the gap is structural, not incremental.

**How to catch it:** At least one task — ideally an integration milestone, not just the final task — must have acceptance criteria that reference the quality bar examples directly: "Compare output against [reference example]. Verify the output captures the same patterns, cross-entity relationships, and depth of insight." If no task's acceptance criteria mention the quality bar, the build loop is closed and the quality bar is outside it.

**The pipeline-level variant:** The same pattern applies beyond individual tasks. The entire pipeline can be internally consistent — PRD, XRD, peer review, test plan, tasks, and tests all aligned — and the product can still be broken because the loop is closed against the spec, not against the user's experience. Nacre 0.5.1 demonstrated this: 1383 tests passing, every task complete, and the product didn't work for the user. The fix is the Smoke Test stage (Stage 10 in `orchestrator.md`), which runs the product against the PRD's First-Use Walkthrough after all code is complete. The walkthrough was written before code existed. If the running product can't complete it, the build loop was closed.

## The Heroic Unblock

**What it is:** The agent encounters a missing dependency or precondition that belongs to another task, and resolves it itself rather than reporting the block. It has enough context to see what's missing and enough capability to fill the gap — so it does. The result: work that belongs to Task 5 gets done inside Task 8, undocumented, untested against Task 5's acceptance criteria, and invisible to whoever picks up Task 5 later.

**Why it happens:** The agent's training rewards problem-solving. When it sees a blocker and knows how to fix it, "stop and report" feels like giving up. The RL tuning is designed to pull in context and resolve, not to hand off. Broader context makes this worse — an agent that can see the full project sees more opportunities to be heroic.

**The signature:** Files modified that aren't in the task's Files section, but the modifications "make sense" — they're prerequisites the task genuinely needed. The agent's explanation sounds reasonable: "I needed X to exist before I could build Y, so I created X." The problem is that X was another task's responsibility.

**How to catch it:** Diff audit against the task's Files section (same as Scope Creep). The distinction: Scope Creep is the agent doing extra work it wasn't asked for. Heroic Unblock is the agent doing another task's work because it was blocked. Both are caught the same way — the diff shows files outside scope. The response differs: Scope Creep means "revert the extras." Heroic Unblock means "revert the extras and mark this task blocked."

**How to prevent it:** Context scoping. The agent that can't see the dependency can't resolve it. The task's Context field limits what the agent reads. The `Depends on` field gates whether the task starts. Together, they remove the opportunity for heroism. See `peer-reviewer.md` (Orchestration) and `task-template.md` (Context field, dependency gate).

## The Clean Slate Bias

**What it is:** The agent treats every task as greenfield even when 80% of the solution already exists in the codebase. Rather than finding and extending existing code, it writes new components from scratch — new utilities that duplicate existing ones, new abstractions that reimplement what's already there, new files in new directories when a one-line addition to an existing file would suffice.

**Why it happens:** Writing new code is easier than reading existing code. The agent can produce a clean, self-contained solution faster than it can find, understand, and extend the existing implementation. It also avoids the risk of breaking something that already works. The result is a codebase that grows sideways — multiple implementations of the same concept, inconsistent patterns, increasing maintenance burden.

**The signature:** `grep` finds two or three implementations of the same utility. New directories appear that parallel existing ones. The codebase has a "geological layers" feel — each feature was built as if the previous features didn't exist.

**How to catch it:** Before writing a new component, search the codebase for existing solutions. "Does this project already have a date formatter? A config loader? An API client wrapper?" Extend what exists. Add a method to an existing class. Import an existing utility. The default should be reuse; new code requires justifying why the existing code can't be extended.

**The counterweight:** This bias must be balanced against The Premature Abstraction (Decision #8). "Reuse what exists" does not mean "build abstractions so that future code can reuse them." Use existing code aggressively. Build new abstractions reluctantly. Reuse is about leveraging code that's already written. Abstraction is about anticipating code that might be written later. The agent should strongly prefer the first and be skeptical of the second.

## The Unoptimized Default

**What it is:** The agent builds features that work correctly but ignores performance, security, and resilience unless explicitly told to address them. No pagination on a list that will grow to 10,000 items. No indexing on a query that runs on every page load. No caching on an API call made every 3 seconds. No input sanitization on user-facing forms. The app works on day one and degrades steadily from there.

**Why it happens:** The agent optimizes for the acceptance criteria in front of it. "Display the user's entries" is satisfied by `SELECT * FROM entries`. The query works. The test passes. The task is complete. Nobody said "and it should still work in 6 months when there are 50,000 rows," so the agent didn't think about it.

**The signature:** The app feels fast in development and slow in production. Database queries have no LIMIT clauses. API responses return full objects when the client needs two fields. Lists render every item instead of virtualizing. The codebase has no caching layer despite making the same expensive calls repeatedly.

**How to catch it:** This is primarily a Product Maker responsibility. The PRD must include non-functional requirements — performance budgets, security posture, scale expectations — stated in human terms (see `product-maker.md`, "Non-Functional Requirements"). These give the SWE a mandate to build for longevity, not just correctness. The Peer Reviewer checks that the architecture addresses these requirements. Without non-functional requirements in the PRD, the agent has no reason to optimize and won't.

## Spec Without Shoes

**What it is:** The PRD describes the system's capabilities but not the user's experience of discovering, configuring, and recovering from those capabilities. Every feature section is complete — what the system does, how the data model works, what the edge cases are. But nobody walked the product as a first-time user. There's no first-launch flow, no empty states, no configuration discovery path, no "what does the user see when they open this for the first time and nothing exists yet."

**Why it happens:** The product-agent thinks in features and capabilities. The idea brief describes what the product should do, not what the user's first 15 minutes look like. The peer review checks documents against each other — PRD vs. XRD, contradictions, gaps between specs — but doesn't walk the product as a user would. The entire pipeline reviews the spec structurally but never experientially.

**The signature:** The PRD has thorough feature sections but no first-use flow. There's no description of empty states. There's no configuration discovery — the user needs to know where to put files, what formats are supported, or how to set things up, but no document describes how they learn this. The product works if you already know how to use it. A person sitting down for the first time hits walls within minutes.

**How to catch it:** The User-Experience Walkthrough gate. The product-agent writes a First-Use Walkthrough section as part of the PRD — a step-by-step walk through the user's first session. The peer reviewer independently walks the user journey before reading the PRD and compares. Gaps between the two walkthroughs are high-severity issues. See `prompts/product-agent.md` and `prompts/peer-review-agent.md`.

## The Big Bang Integration

**What it is:** The pipeline decomposes a large brief into tasks and tracks, builds them all in one pass, and smoke tests at the end. Integration bugs that exist from the first task compound across every subsequent task. The smoke test fails on multiple fronts because every piece was built on a broken foundation — a config misread, a wiring omission, a budget overflow — that existed before any task started.

**Why it happens:** The pipeline treats briefs as single units. Task decomposition creates parallelism within a milestone but not sequencing between milestones. The SDM assesses once at the start and disappears. No one checks whether the output of an early task survives the constraints of the broader system until everything is built. The brief says "support five formats" and the pipeline builds all five before checking whether one format's output fits through the system's constraints.

**The signature:** The smoke test fails on multiple steps simultaneously. The root cause is a single issue — a config bug, a wiring omission, a budget overflow — that existed before the first task started. Every task built on top of it. The fix is small but discovering it required building everything first. Four build cycles passed all tests. Four build cycles failed for the user.

**How to catch it:** Decompose briefs into milestones. Each milestone produces working software the user can touch. Smoke test after each milestone. Run the SDM after each milestone's smoke test to reassess the codebase for the next milestone. Integration problems surface at the first milestone, not the last. See `orchestrator.md` Stage 0 (Milestone Decomposition) and Decision 27.
