# Task Template

Every task in the `tasks/` directory follows this format. The goal is that an agent can read the task file and execute it without asking a question.

## Template

```markdown
# Task [NUMBER]: [SHORT NAME]

**Track:** [A/B/C]
**Phase:** [A1, B2, etc.]
**Status:** [not started | in progress | done | blocked]
**Depends on:** [task numbers that must be complete first, or "none"]

## What to Build

[Concrete description of what this task produces. Not what it's for — what it is. Files created, functions implemented, data structures defined.]

## Files

- Create: [list of new files this task creates]
- Modify: [list of existing files this task changes, and what changes are expected]
- Do not touch: [files that are explicitly out of scope]

## Contracts

[If this task produces something other tasks consume, specify the interface. Function signatures, JSON schemas, protocol definitions. If this task consumes something from another task, reference where to find it.]

## Acceptance Criteria

[Numbered list. Each item is a testable statement.]

1. [When X, then Y]
2. [Given A, the function returns B]
3. [The test file [name] passes]

## Tests

[Specific tests this task must include. Reference test IDs from the test plan if applicable.]

- [ ] [Test ID]: [what it tests]
- [ ] [Test ID]: [what it tests]

## Deployment

[For existing codebases: How is this task shipped? Independent PR? Part of a deployment group with tasks X, Y? Feature-flagged? For greenfield projects, omit this section.]

## Execution Plan

[Filled in by the agent before writing code. Not part of the task spec — this is the agent's response to the task, equivalent to an XRD responding to a PRD but at the task level.]

1. My understanding of what this task requires: [restate in own words]
2. Planned approach: [which files, in what order, what pattern]
3. Expected result: [what the code looks like when done]
4. Ambiguity I see: [anything unclear in the task spec, or "none"]

## Notes

[Anything the agent needs to know that doesn't fit above. Architecture context, gotchas, references to decisions in DECISIONS.md.]
```

## Example

```markdown
# Task 003: StreakService — Daily Habit Streaks

**Track:** A
**Phase:** A1
**Status:** not started
**Depends on:** Task 001 (SwiftData models), Task 002 (date utilities)

## What to Build

A StreakService class that calculates the current streak for a daily habit. The service takes a habit ID and an array of DayEntry objects and returns an integer streak count.

## Files

- Create: `Sources/Services/StreakService.swift`
- Create: `Tests/Services/StreakServiceTests.swift`
- Modify: none
- Do not touch: `Sources/Models/` (owned by Task 001)

## Contracts

StreakService exposes:
```swift
func dailyStreak(habitID: UUID, entries: [DayEntry], asOf: Date) -> Int
```

DayEntry and Habit models are defined in Task 001. Use the shapes specified there.

## Acceptance Criteria

1. Given a habit created 7 days ago and completed every day, streak returns 7.
2. Given a habit completed for 5 days, missed 1 day, then completed 2 days, streak returns 2.
3. Given a habit created today and completed today, streak returns 1.
4. Given a habit created today and not yet completed, streak returns 0.
5. Given a habit created 3 days ago with no completions, streak returns 0.
6. Days before the habit's createdDate are not counted as gaps.
7. Archived habits return their streak as of the archive date (streak frozen).

## Tests

- [ ] ST-001: Daily streak — consecutive days
- [ ] ST-002: Daily streak — broken by gap
- [ ] ST-003: Daily streak — new habit same day
- [ ] ST-004: Daily streak — no completions
- [ ] ST-005: Daily streak — habit created mid-streak
- [ ] ST-006: Daily streak — archived habit frozen

## Execution Plan

1. My understanding: Build a single class that takes a habit's entries and computes how many consecutive days ending at `asOf` have completions, stopping at the first gap or the habit's creation date.
2. Planned approach: Create StreakService.swift with one public method. Walk backward from `asOf` day by day, checking for a completion in the entries array. Stop at the first missing day or at createdDate. Handle the archived case by substituting archiveDate for `asOf`. Then write tests covering all 7 acceptance criteria.
3. Expected result: Two files. StreakService is a standalone class with no dependencies beyond Foundation. Tests use an in-memory setup with factory helpers from Task 001.
4. Ambiguity: None — acceptance criteria are specific.

## Notes

Per DECISIONS.md #8, the streak is computed on read, not stored. Cache in memory and invalidate on any DayEntry write.

Task 007 will add X/week streaks to StreakService. Do not implement it here.
```

## Conventions

- A task should be completable in a single agent session. If it can't be, it needs further decomposition. If it takes less than 15 minutes, consider combining it with a related task in the same track.
- Task files are numbered sequentially: `001-swiftdata-models.md`, `002-date-utilities.md`, `003-streak-service-daily.md`
- The number is the task ID. Reference it in "Depends on" fields.
- Status is updated in the task file when work begins and when work completes.
- When a task is done, add a "Completed" section with the date, any deviations from the plan, and — critically — an **Insight/Implication** note. What did building this task reveal that wasn't in the spec? What does that mean for upcoming tasks? Example: "**Insight:** the StreakService needed a special case for habits created today — the backward walk from today hits the creation date immediately, producing ambiguity about whether today counts. **Implication:** Task 007 (X/week streaks) will need a similar edge case for habits created mid-week. Add it to that task's acceptance criteria now."
- Before writing code, the agent fills in the **Execution Plan** section. This is the task-level equivalent of an XRD responding to a PRD — the agent states what it understood, what it plans to do, and what it expects to produce. For simple tasks (single file, obvious approach), the execution plan can be abbreviated to 1-2 lines, but it is never skipped entirely. The plan catches misunderstandings before code is written, which is the cheapest place to catch them. If the agent's execution plan reveals ambiguity, the agent raises it before proceeding rather than guessing.
- If the project has quality bar examples (smoke tests, reference outputs), at least one task — typically the final integration task or an output milestone — must include an acceptance criterion that compares the actual output against the reference: "Compare output against [reference file]. Verify the output captures equivalent analytical depth, cross-entity relationships, and pattern detection." If no task references the quality bar in its acceptance criteria, the build loop is closed and the quality bar is outside it.
