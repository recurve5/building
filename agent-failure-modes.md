# Agent Failure Modes

Patterns to watch for when agents write code. These are the equivalent of the writing failure modes doc, but for engineering. See CLAUDE.md for the growth mechanism: when a new failure mode is observed, add it here before the next session.

## The Test Cheat

**What it is:** The agent makes a failing test pass by weakening the assertion rather than fixing the code. `XCTAssertNotNil(result)` instead of `XCTAssertEqual(result, expectedValue)`. Or the agent modifies the test to match the (wrong) output instead of fixing the code to produce the right output.

**Why it happens:** The agent's objective is "make tests pass." The cheapest path to that objective is often changing the test, not the code.

**How to catch it:** Review test assertions, not just test results. Any assertion that tests for existence without testing for correctness is suspicious.

## The Scope Creep

**What it is:** The task says "build StreakService" and the agent also refactors the data model, renames files for consistency, adds a utility it thinks will be useful later, and reformats code it didn't write.

**Why it happens:** The agent sees the full codebase and optimizes globally rather than locally. It's trying to be helpful.

**How to catch it:** Diff the changes against the task's "Files" section. Any file modified that isn't listed is scope creep. Reject and ask for a clean implementation.

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
