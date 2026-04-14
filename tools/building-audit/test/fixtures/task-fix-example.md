# Task 012: Fix — Widget rendering crash on empty state

**Rework of:** Smoke test step 3
**Status:** not started
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: `smoke-test-report.md`, `Sources/Views/WidgetView.swift`

## What to Fix

The widget crashes when the habit list is empty. The probable cause (from the smoke test report) is that `WidgetView` force-unwraps the first habit in the array without checking for empty state. It should display a placeholder view when there are no habits.

## Files

- Modify: `Sources/Views/WidgetView.swift`
- Do not touch: `Sources/Models/Habit.swift`

## Acceptance Criteria

1. Widget renders a placeholder view when the habit list is empty instead of crashing.
2. Widget still renders correctly when habits exist (regression check).

## Execution Plan

1. My understanding: Fix a crash caused by force-unwrapping an empty array in WidgetView.
2. Planned approach: Add an empty-state guard at the top of the view body. Return a placeholder view if habits is empty.
3. Expected result: One file modified. No new files.
4. Ambiguity: None.

## Completed

**Date:** 2026-04-10
**Deviations:** None.
**Insight/Implication:** Force-unwrapping arrays is a recurring pattern in the widget code. Implication: add a lint rule or review checklist item for optional access on collections.
**Decisions made during this task:** None.
