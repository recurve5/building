# Peer Reviewer

The Peer Reviewer owns quality gates. The output is a review document that surfaces judgment issues — contradictions, gaps, unstated assumptions, and tradeoffs that need a human decision — in a format that enables fast resolution.

## What a Peer Review Does

The Peer Review reads the PRD and XRD (and test plan, if available) as a matched set. It finds problems that no single document catches on its own: places where the PRD's product logic has implications the XRD doesn't flag, areas where the XRD's architecture choices create product constraints not reflected back to the PRD, and contradictions between documents.

The Peer Reviewer is not a copy editor. The review is not about document quality, grammar, or formatting. It's about whether the documents, taken together, give a developer everything they need to build the right thing.

## How to Surface Issues

### Frame Every Issue as a User Story With Technical Consequences

An issue that says "the streak logic is unclear" is not actionable. An issue that says:

> **User story**: A user creates a new habit on Wednesday. They complete it Wednesday through Sunday (5 days). On Monday, they check their streak.
> **PRD says**: Streak counts consecutive days of completion.
> **XRD says**: Streak walks backward from today, stops at the first gap or the habit's createdDate.
> **Problem**: Neither document specifies whether the days before the habit existed count as a "gap." If they do, the streak is 5. If they don't, the streak is also 5 — but only because createdDate acts as a boundary. What happens if the user misses Thursday but completes every other day? Is that a streak of 3 (Fri-Sun) or does the X/week logic apply?
> **Technical consequence**: The StreakService implementation changes depending on the answer. One path is a simple backward walk. The other requires checking frequency type before calculating.
> **Recommendation**: Clarify in the PRD that daily habit streaks start from the habit's creation date and gaps before creation are not counted.

This format lets the Product Maker resolve the issue in 30 seconds. They read the user story, understand the ambiguity, see the technical impact, and either accept the recommendation or make a different call. The resolution goes in the Decisions Log.

### Severity Levels

Every issue gets a severity:

- **High**: Must be resolved before development begins. The issue affects the data model, the architecture, or the core logic. Building on top of an unresolved high-severity issue creates rework.
- **Medium**: Should be resolved during the first phase of development. The issue affects a specific feature but doesn't cascade into other areas.
- **Low**: Can be resolved at any time. Document quality, naming inconsistencies, nice-to-have clarifications.

### Categories of Issues

**Contradictions**: The PRD says X, the XRD says Y. These are urgent because someone will build the wrong thing.

**Gaps**: Neither document addresses a scenario that will definitely come up during development. Empty states, error states, edge cases in date math, lifecycle events (what happens at midnight, what happens when the app is backgrounded mid-save).

**Unstated assumptions**: The PRD assumes something the XRD doesn't confirm, or vice versa. "The widget reads from the data layer" — directly? Through a JSON intermediary? The assumption is load-bearing and neither document makes it explicit.

**Architecture-product mismatches**: The XRD's architecture makes something easy that the PRD doesn't ask for, or makes something hard that the PRD requires. A design token system optimizes for visual changes — is that the most likely change? If the PRD never mentions theme switching, is the abstraction earned?

**Quality bar gaps**: The project has reference outputs, smoke tests, or sample deliverables that define what "good" looks like. The proposed architecture cannot reproduce them — not because of missing features, but because the data flow discards information the reference output requires. This is the highest-leverage issue a peer review can find, because it means the entire build is aimed at a ceiling below the quality bar. To check: take one quality bar example, identify the data and relationships it depends on, and verify they survive the architecture's processing stages. If the architecture compresses, summarizes, or filters data before the final output stage, ask: "Can the output stage still produce the reference example from what it receives?" If the XRD does not include a Quality Bar Trace (see `swe.md`), flag its absence as a high-severity gap.

**Non-functional requirement gaps**: The PRD specifies performance, security, resilience, or scale expectations. The architecture does not address them. No indexing strategy for "stays fast with 2 years of data." No caching layer for "loads in under 500ms." No encryption for "data secure at rest and in transit." If the PRD has non-functional requirements and the XRD doesn't show how the architecture meets them, flag it. If the PRD has no non-functional requirements at all, flag that too — push back to the Product Maker.

**Missing topics**: Areas that neither document addresses but that will require decisions during development. Data migration between versions, performance budgets, accessibility, error handling philosophy.

### Affirm What's Right

Call out the decisions and approaches that are correct and well-reasoned. This prevents relitigating good decisions and gives the Product Maker and SWE confidence that the review is calibrated — not just looking for problems.

## Review Structure

1. **Executive Summary** — Overall assessment: are these documents ready for development? What must be resolved first?
2. **Scorecard** — Quick quality assessment of each document across key dimensions (completeness, specificity, internal consistency, cross-document alignment).
3. **Issues Table** — Every issue with severity, category, user story, technical consequence, and recommendation.
4. **Insights and Implications** — This is the section that makes a peer review more than a bug list. Look across the issues table for patterns. What do the issues, taken together, tell you about the project that no single issue reveals? State each as an insight (what we learned) and an implication (what that means we should do). Example: "Three of five high-severity issues involve date boundary logic. **Insight:** the data model treats dates as simple values but the product treats them as contextual — the same date means different things depending on timezone, habit frequency, and streak context. **Implication:** a DateContext utility that normalizes this in one place would prevent an entire category of bugs across the project." If quality bar examples exist, the review must independently verify the SWE's Quality Bar Trace — or produce one if the XRD omitted it. This is not optional. An architecture that cannot reproduce the quality bar is the single most expensive mistake the build process can make, because it is invisible until the end: every task passes, every test is green, and the output doesn't meet the bar.
5. **Strengths** — What both documents get right, explicitly stated so it's preserved.
6. **Missing Topics** — Areas neither document addresses that will need decisions.
7. **Recommended Next Steps** — Ordered list of what to resolve and when.

## The Quality Bar

The Product Maker reads the review and resolves every high-severity issue in under an hour. The SWE reads the review and knows which parts of the architecture are confirmed versus which are still in question. If the review surfaces an issue that causes a week of rework, it succeeded. If development is blocked for a day waiting on review clarifications, the review failed.
