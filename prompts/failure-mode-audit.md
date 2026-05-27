# Failure Mode Audit

You are auditing a completed build for the failure modes documented in `docs/agent-failure-modes.md`. You are not fixing anything. You are producing a report.

## How to Run This

Run this prompt from the root of the project you want to audit. You need access to:
- The project's source code
- The project's test files
- The project's task files (in milestone directories)
- The project's DECISIONS.md
- The project's DAY-ZERO.md or XRD

## What You Check

Work through each check below. For each one, report what you found — specific files, specific lines, specific patterns. If a check is clean, say "Clean" and move on. Do not pad the report.

---

### 1. Test Cheat — Weak Assertions

Search all test files. Flag any test where:
- Assertions only check existence (`toBeDefined`, `toBeTruthy`, `toBeNull`, `not.toBeNull`, `toBeCalled`) without checking correctness (`toEqual`, `toBe`, `toContain`, `toMatchObject` with specific values)
- A test function has no assertions at all
- A test has a single assertion for a complex operation (e.g., a function that returns an object, but the test only checks one field)
- Snapshot tests are used as the primary assertion strategy (snapshots confirm the output didn't change, not that the output is correct)

**Report format:** For each flagged test, state the file, the test name, what it asserts, and what it should assert instead.

---

### 2. Scope Creep — Files Changed Outside Task Scope

For each task file in the milestone's `tasks/` directory:
- Read the task's `Files` section to get the declared scope
- Run `git log --oneline` to identify commits associated with that task (by commit message or timing)
- Check the diff for those commits against the declared file list
- Flag any file modified that isn't in the task's Files section

**Report format:** For each violation, state the task, the undeclared file, and what was changed in it.

---

### 3. Ghost Refactor — Rewrites of Working Code

Search the git history for commits where:
- Files were significantly rewritten (large diffs) but the task didn't include "refactor" in its title or description
- Code style changes (renaming, reformatting, reorganizing imports) appear in diffs alongside functional changes
- Existing functions were rewritten to produce the same output in a different way

**Report format:** For each instance, state the file, the commit, what changed, and whether the change was necessary for the task.

---

### 4. Dependency Grab — Unjustified New Dependencies

Compare the current package manifest (package.json, Podfile, requirements.txt, etc.) against the version at project start.
- List every dependency added during the project
- For each, check if the task that added it included the dependency in its contracts or justification
- Flag any dependency that could be replaced by native/standard library functionality

**Report format:** For each flagged dependency, state what it does, which task added it, and what native alternative exists.

---

### 5. Clean Slate Bias — Duplicate Implementations

Search the codebase for:
- Multiple implementations of the same utility (date formatting, string manipulation, API call wrappers, config loading, error handling)
- New files that parallel existing files in purpose (e.g., `utils/helpers.ts` and `lib/utils.ts`)
- Functions that duplicate logic already present in another file

**Report format:** For each duplicate, state both locations, what they do, and which one should be canonical.

---

### 6. Premature Abstraction — Over-Engineering

Search for:
- Factory patterns, registries, plugin systems, or strategy patterns that have only one implementation
- Base classes or interfaces with a single concrete implementation
- Configuration systems for values that never change
- Generic type parameters that are only ever instantiated with one type
- Abstraction layers that pass through without transforming (a function that just calls another function with the same arguments)

**Report format:** For each instance, state what the abstraction is, how many implementations/uses it has, and what the simpler alternative would be.

---

### 7. Unoptimized Default — Missing Non-Functional Basics

Check for:
- Database queries without LIMIT clauses on tables that will grow
- API responses that return full objects when the consumer uses a subset of fields
- Lists that render all items without virtualization or pagination
- API calls made on every render/request that could be cached
- Missing database indexes on columns used in WHERE clauses or JOINs
- User input that reaches a database query or shell command without sanitization
- Secrets or API keys hardcoded in source files (not environment variables)

**Report format:** For each finding, state the file, the line, and the specific risk.

---

### 7b. Performance, Fluidity, and Resource Drain

This goes beyond missing basics. Assess the product as a user would experience it.

**Perceived latency:**
- Trace the critical path from user action to visible response. Flag any synchronous chain where one slow link blocks the response. Sequential awaits that could be parallel. Operations that block the main thread or UI thread.
- Check whether user actions get acknowledged within 100ms (button state change, loading indicator, optimistic update) even when the underlying operation is slow.
- Check for streaming or progressive rendering where applicable. Does the user stare at a blank screen until everything is ready, or do they see partial results?

**Fluidity:**
- Scroll performance: are long lists virtualized? Do scroll handlers run expensive logic without debouncing?
- Layout stability: does content shift after initial render (images loading, async data arriving, elements resizing)?
- Transitions: are state changes (panel open/close, tab switch, navigation) animated coherently, or do they snap?
- Re-render efficiency: do components re-render on every state change regardless of whether their inputs changed? Are expensive computations in the render path memoized?

**Resource drain (battery, memory, network):**
- Background processes: timers, intervals, polling, listeners, observers that are created but never cleaned up. Every `setInterval`, `setTimeout`, `addEventListener`, `subscribe`, or `observe` should have a corresponding cleanup.
- Memory trajectory: detached DOM nodes, growing arrays or caches without eviction, closures that retain large objects. Does the app stabilize or grow indefinitely during a session?
- Network waste: redundant requests for data already in memory, over-fetching, missing compression, polling when websockets or SSE would work.
- Wake locks, GPS, sensors, or other hardware-engaging APIs that stay active when not needed.

**Degradation curve:**
- Pick the primary data entity (documents, entries, messages, users — whatever grows). Assess whether the code handles 10x the current expected volume. A list that's instant at 100 items and frozen at 10,000 items has a cliff. Flag any operation where cost scales with total data size rather than result size.

**Report format:** For each finding, state the file, the code path, what the user experiences, and the specific fix. Frame every issue as user impact, not server metric.

---

### 8. Heresy — Ghost References to Killed Decisions

This check has two layers: surface heresies (the easy ones) and deep heresies (the dangerous ones).

**Surface heresies — terminology matches:**
Read DECISIONS.md. Find every decision that rejected or killed an approach.
- Search the entire codebase and all docs for terminology specific to each rejected approach
- Flag any reference that isn't the DECISIONS.md entry itself
- Distinguish between Hard Kill ghosts (should not exist) and Deferred references (should be tagged with decision number)

**Deep heresies — logic that implements a killed idea under a different name:**
For each Hard Kill decision, understand not just the terminology but the *behavior* that was rejected. Then search the codebase for:
- Code paths that implement the rejected behavior even if they use different names. A decision that killed "auto-retry on failure" is still violated by code that catches errors and re-invokes the same function, even if it's called `handleError` instead of `autoRetry`.
- Database columns, API fields, config keys, or UI elements that serve no current requirement but clearly served a prior one. These are orphaned infrastructure from a killed feature.
- Conditional branches that can never be reached under current requirements but would make sense under a killed requirement. Dead code paths are heresy in code form.
- Comments, docstrings, or variable names that reference concepts from a killed approach. A variable named `retryCount` in a system that explicitly decided against retries is a heresy even if the variable is used for something else.

**Document-level heresies:**
- Read the PRD, XRD, and any other project docs. For each Hard Kill, search for paragraphs, sections, or bullet points that describe the killed approach as if it's active. Agents reading these docs in future sessions will treat them as live requirements.
- Check task files — especially the "What to Build" and "Contracts" sections — for references to killed approaches that were written before the kill decision and never updated.

**Report format:** For each ghost, state the killed decision, where the ghost lives (file and line for code, file and section for docs), the specific text or logic, and whether it's a surface heresy (wrong name, easy to find) or a deep heresy (right behavior under a different name, hard to find without understanding the killed decision's intent).

---

### 9. Confidence Bluff — Claims vs. Reality

For each completed task, read its Completed section. Check:
- Does the task claim tests pass? Run the tests. Do they actually pass?
- Does the task claim a file was created or modified? Does that file exist with those changes?
- Does the task claim a feature works? Is there a test that exercises that specific feature path?

**Report format:** For each discrepancy, state the task, the claim, and what you found instead.

---

### 10. Accumulating Fragility — Structural Health

Look across the codebase for:
- Files modified by 5+ different tasks (high modification coupling)
- Functions longer than 100 lines
- Files longer than 500 lines
- Circular imports or circular dependencies
- Test files that require complex setup (more than 20 lines of setup per test)
- Comments that say "TODO", "HACK", "FIXME", or "workaround"

**Report format:** List each finding with the file and the specific metric.

---

### 11. Refactoring Signals — SDM Assessment

This is not a per-file check. This is a codebase-level assessment of whether the project needs restructuring before more features are added. Evaluate the two SDM halt conditions:

**Condition 1: Maintenance Complexity Accumulation**
- Are multiple features working around the same structural limitation? Look for similar workarounds in different files — repeated patterns of "I can't do this the clean way because X, so I'm doing Y instead."
- Is test setup complexity growing faster than feature complexity? Compare the ratio of test setup code to test assertion code across early tasks vs. recent tasks. If setup is eating the tests, the architecture isn't supporting testability.
- Are files accumulating responsibilities beyond their original scope? A file that started as a simple service and now handles caching, error recovery, retry logic, and logging has become a god object.
- Read the Completed sections and insight/implication notes from task files. Are different tasks independently flagging the same structural concern?

**Condition 2: Cascading Bug Risk**
- Identify files modified by multiple unrelated tasks. High modification coupling means a change for Feature A can break Feature B.
- Look for functions with implicit side effects — functions that modify state beyond their return value, where callers depend on those side effects. These are invisible coupling.
- Check whether recent bug fixes mention "this also required changing X" or "this broke Y." Each instance is evidence of cascading risk.
- Do tests share mutable state or depend on execution order? Run the test suite with randomized order if possible. Tests that fail out of order are a fragility signal.

**Assessment:** Based on what you find, state one of:
- **Green** — The codebase is healthy. Continue building.
- **Yellow** — Early signals of one or both conditions. Flag specific areas to watch. No halt needed yet.
- **Red** — One or both conditions are met. Recommend a milestone halt for refactoring. State what needs to be restructured, what it costs to continue without restructuring, and what the refactoring tasks would look like.

**Report format:** State the condition, the evidence (specific files, tasks, and patterns), and the assessment color.

---

## Output Format

Produce a single report with one section per check above. Lead each section with a severity:

- **Critical** — This is causing bugs or will cause bugs soon. Fix before shipping.
- **Warning** — This is technical debt that will compound. Fix in the next milestone.
- **Info** — Worth knowing but not actionable right now.
- **Clean** — Nothing found.

End the report with a summary: how many Critical, Warning, and Info findings, the refactoring assessment color (Green/Yellow/Red), and the top 3 things to fix first.
