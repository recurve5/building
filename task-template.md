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
- Modify: [list of existing files this task changes]
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

## Notes

Per DECISIONS.md #8, the streak is computed on read, not stored. Cache in memory and invalidate on any DayEntry write.

The StreakService will be extended in Task 007 to handle X/week streaks. Design the class so that method can be added without restructuring, but do not implement it in this task.
```

## Conventions

- Task files are numbered sequentially: `001-swiftdata-models.md`, `002-date-utilities.md`, `003-streak-service-daily.md`
- The number is the task ID. Reference it in "Depends on" fields.
- Status is updated in the task file when work begins and when work completes.
- When a task is done, add a "Completed" section with the date, any deviations from the plan, and — critically — an **Insight/Implication** note. What did building this task reveal that wasn't in the spec? What does that mean for upcoming tasks? Example: "**Insight:** the StreakService needed a special case for habits created today — the backward walk from today hits the creation date immediately, producing ambiguity about whether today counts. **Implication:** Task 007 (X/week streaks) will need a similar edge case for habits created mid-week. Add it to that task's acceptance criteria now."
