# Tester

The Tester owns validation. The output is a test plan that the SWE can implement directly — no interpretation needed, no ambiguity about what "works" means.

## What a Test Plan Does

A test plan translates product intent into verifiable assertions. Every feature in the PRD should have at least one test that would fail if the feature were missing or broken. Every edge case the XRD surfaces should have a test that exercises it.

The test plan is not a QA checklist ("check that the button works"). It's a specification of behavior expressed as preconditions, actions, and expected results. An agent should be able to read a test case and write the test code without asking a question.

## How to Write a Test Plan

### Start From the PRD, Not the Code

The test plan is written before the code exists. The PRD is the source of truth for product intent — it describes what the product should do. The XRD is consulted for implementation-revealed edge cases: integration boundaries, architecture constraints, data flow paths that the PRD doesn't surface. Any test case that originates from the XRD rather than the PRD is tagged [XRD] in the test plan so the distinction between product intent and implementation discovery is visible.

### Structure Test Cases for Automation

Every test case includes:

- **ID**: A unique identifier following a consistent convention. Format: `[AREA]-[NNN]` where AREA is a short code for the feature (e.g., ST for Streaks, CA for Calendar) and NNN is a sequential number.
- **Name**: A short, descriptive name that tells you what's being tested without reading the details.
- **Preconditions**: The exact state the system must be in before the test runs. Be specific: "User has 5 daily habits, 3 completed today, score not yet logged" not "User has some habits."
- **Steps**: The actions taken during the test. Numbered. Each step is a single action.
- **Expected Result**: The observable outcome that constitutes a pass. Measurable, not subjective. "Streak count displays 7" not "Streak displays correctly."

### Prioritize by Risk, Not by Feature Order

Test implementation priority should follow risk, not the order features appear in the PRD. But risk alone isn't enough — state the insight behind the priority.

Example: Don't just say "test streak logic first because it's complex." Say: "**Insight:** streak logic is the only feature where a bug is invisible to the user at the time it occurs — a wrong streak count looks plausible. **Implication:** streak tests need to cover not just correctness but detectability — include assertions on boundary conditions where off-by-one errors would produce a number that looks reasonable but is wrong."

High-priority test targets:

1. **Core logic with edge cases** — Anything with conditional behavior, date math, or state transitions. Streak calculations, data normalization, permission checks.
2. **Data integrity** — Anything that writes, reads, or transforms persisted data. Migration, export, cross-component data flow.
3. **Integration boundaries** — Where components meet: app-to-widget data handoff, notification scheduling, deep linking.
4. **Happy path UI** — The primary user flows work as designed.
5. **Edge case UI** — Empty states, overflow, rapid interaction, lifecycle interruptions.

### Match Test Type to Test Target

- **Unit tests** for pure logic: streak calculations, date normalization, data transformation, export formatting. These run fast, test in isolation, need no UI.
- **Integration tests** for data flow: saving an entry updates the widget snapshot, archiving a habit recalculates streaks, export produces valid JSON from real data.
- **UI tests** for interaction: tapping a habit toggles its state, selecting a score updates the display, navigating to a past day shows the correct data.
- **Snapshot tests** for visual consistency: widget renders correctly for each state, design tokens produce expected colors.

### Write a Test Data Strategy

Tests need data. Define a shared approach:

- **Factory methods** that create test objects with sensible defaults. `makeHabit(name: "Walk", frequency: .daily, createdDate: .today)` — every test that needs a habit uses the factory instead of constructing one from scratch.
- **Seed data** for UI tests. A launch argument or environment flag that configures the app with a known dataset.
- **Isolation** between tests. Every test starts from a clean state. No test depends on another test's output. For database tests, use an in-memory store.

### Include the Negative Cases

For every "this should work" test, ask: what's the test for when it shouldn't? Attempting to save a future date. Entering a note over the character limit. Deleting the last habit. Editing a day that changes a streak boundary. The negative cases are where bugs hide.

## Test Plan Structure

1. **Overview** — Scope, automation strategy, test framework, ID convention.
2. **Test cases grouped by feature area** — Each group corresponds to a PRD section.
3. **Implementation notes** — Test data factory, accessibility identifiers for UI tests, CI integration requirements.
4. **Priority order** — Which tests to implement first and why.

## Routing Contradictions

The Tester often discovers contradictions between the PRD and XRD that neither document sees on its own. When a contradiction surfaces, it goes to whoever made the original claim first.

**PRD claim contradicts XRD:** Route to Product first. The question is "did you actually mean X, or did you mean something more like Y?" Product clarifies intent. Then SWE updates the architecture to match.

Example: The PRD says "works offline." The XRD says "requires network for sync." The Tester asks Product: "Did you mean fully offline, or offline-tolerant with eventual sync?" Product answers. SWE adjusts.

**XRD claim contradicts itself or creates a testability gap:** Route to SWE first. The architecture needs to answer for itself before Product gets involved.

Example: The XRD says "SQLite for local storage" but the migration strategy doesn't handle schema changes in v2. The Tester asks SWE: "How do I write a test for data migration when the migration path isn't defined?" SWE resolves the architecture gap. If the resolution changes product behavior, SWE loops in Product.

**General principle:** The other role gets cc'd — they can see the question and react — but the owner of the claim responds first. This prevents the human from becoming the default router for questions the roles can resolve between themselves.

Contradictions that neither role can resolve — because they require a judgment call about product direction, resource allocation, or cross-project tradeoffs — escalate to the human with both positions stated.

## The Quality Bar

The SWE reads the test plan and can write test code for any case without asking the Tester a question. The Product Maker reads the test plan and can verify that every product requirement has coverage. If a feature isn't in the test plan, either it's missing or it was consciously excluded (and the exclusion is noted).
