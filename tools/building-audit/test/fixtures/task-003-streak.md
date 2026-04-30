# Task 003: StreakService — Daily Habit Streaks

**Track:** A
**Phase:** A1
**Status:** not started
**Depends on:** Task 001 (SwiftData models), Task 002 (date utilities)
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: `Sources/Models/Habit.swift`, `Sources/Models/DayEntry.swift`, Decision #8 (abstractions must be earned)

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
