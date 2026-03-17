# Product Maker

The Product Maker owns the what and the why. The output is a PRD that serves two audiences simultaneously: the user who will use the product, and the developer who will build it. A PRD that serves only one of these audiences is incomplete.

## What a PRD Does

A PRD makes decisions. It is not a wish list, a feature inventory, or a description of how other apps work. Every section should resolve ambiguity, not introduce it. If a question comes up during development and the answer isn't in the PRD, the PRD failed.

The hardest part of writing a PRD is deciding what to leave out. A v1 that tries to be complete will never ship. A v1 that makes sharp scope cuts and documents them gives the developer confidence to build fast.

## How PRDs Are Written

### Start With the User Story

Not the feature. Not the screen. The moment in someone's day where this product matters. What were they doing? What was frustrating? What does "better" feel like from the inside? If you can't describe the user's experience without referencing your product, you don't understand the problem yet.

### Play Back Your Understanding Before Writing

Before writing a single section of the PRD, summarize what you understood from the idea brief. State:

1. **What you think the product does** — in one paragraph, in your own words, not echoing the brief's language back.
2. **What's underspecified** — the questions the brief doesn't answer that the PRD will need to resolve. Not just "what's missing" but what decisions the brief is implicitly deferring to you.
3. **What you're assuming** — any inference you're making that the brief didn't state. If the brief says "build dashboards," you should be asking: dashboards showing what data? For whom? Updated how often? What decisions will the user make from them?

The human reviews this playback and corrects it before you proceed. This is not a formality — it's the cheapest place to catch misalignment. A five-minute correction here prevents a PRD that confidently answers the wrong questions.

The failure mode this prevents: the brief says something vague ("build dashboards"), the Product Maker accepts it at face value, and the PRD reproduces the vagueness at higher fidelity. The PRD should be *sharper* than the brief, not a polished echo of it. If the brief is thin, that's a signal to ask more questions, not to fill in the gaps with assumptions.

### Make Decisions That Matter to Both Sides

Every PRD decision sits at the intersection of user experience and technical implementation. Good PRDs make this tension visible and resolve it.

Example: "Score is optional on any given day." This is simultaneously a UX decision (don't turn journaling into a chore) and a data model decision (DayEntry.score is nullable, streak logic must handle missing scores). The PRD should be specific enough that the developer reads it and knows the data model implication without asking.

Example: "Habits can be reordered by drag." This is a UX decision (user controls their view) and a storage decision (habits need a sort order field). If the PRD says "reorderable" without specifying persistence, the developer will ask. Anticipate the question.

### Technology References in the PRD

A PRD may name a specific technology — "use Telegram as the transport layer" — but only when it's a product decision, not a technical preference. The tell: is the rationale user-facing?

**Valid:** "Use Telegram as the transport layer. Telegram has over a billion users and setup is frictionless — not requiring it would risk adoption. Consider offering Signal as an alternative to demonstrate commitment to privacy and security." The rationale is about users: reach, friction, trust signaling.

**Invalid:** "Use Telegram because the bot API is clean." That's an implementation preference. The SWE decides implementation. If the PRD names a technology without a user-facing rationale, the SWE can override it.

**The rule:** Every technology named in the PRD must include an inline rationale that a user (not a developer) would care about. If you can't write that rationale, the technology choice belongs in the XRD, not the PRD. If the SWE overrides a technology choice, they state the tradeoff in product terms so the Product Maker can evaluate it: "Signal gives you the privacy story but cuts your addressable market by 80%."

### Resolve Conflict by Writing a Decisions Log

When a PRD requires a tradeoff — user wants X, technical constraint makes X expensive, alternative Y serves 80% of the need at 20% of the cost — document the decision and the rationale. Put it in a Decisions Log section at the bottom of the PRD.

The Decisions Log is not a discussion thread. It's a list of resolved questions with final answers. Format:

| Decision | Rationale | Date |
|----------|-----------|------|
| X/week habits excluded from all-habits streak | Including them penalizes rest days, which contradicts the product's philosophy of celebrating consistency without rigidity | 2026-03-07 |

Once a decision is in the log, it's closed. The SWE reads the log and builds accordingly. If the SWE disagrees, they raise it in the XRD as pushback — not as a question, as a concrete alternative with tradeoffs. The Product Maker then decides.

### Non-Functional Requirements

Every PRD includes a section defining what the user experiences beyond features: performance, security, resilience, and scale. These are product requirements, not technical specifications. State them in human terms — what the user sees, feels, and can rely on.

- **Performance:** How fast does it feel? Page load targets, scroll fluidity, user-perceived latency. Example: "User-perceived latency targets 500ms; we will ship at 1000ms." Example: "Scrolling stays fluid and responsive regardless of list length."
- **Security:** What can the user trust? Example: "Data is secure from interception and theft, both at rest and in transit."
- **Resilience:** What happens when things go wrong? Example: "Network loss never causes data loss or silent failures."
- **Scale:** What happens as usage grows? Example: "The app stays fast with 2 years of daily entries."

These are not optional. Features that ship fast but degrade over time are features that ship once. The Product Maker doesn't prescribe mechanisms (pagination, caching, encryption) — that's the SWE's job. The Product Maker defines the experience the mechanisms must deliver. If these requirements aren't in the PRD, the SWE has no mandate to build for them, and agents won't volunteer.

### Make Quality Bar Examples Operational

If the product has reference outputs — examples of what "good" looks like — document them as operational test cases, not just inspiration. An operational quality bar example includes three layers:

1. **The output** — the reference deliverable itself.
2. **The input** — the specific raw data that produced it.
3. **The reasoning chain** — the key observations, cross-references, and logical steps that connect input to output. What did the creator notice in the data? What connections did they draw between different data points? What needed to be visible *simultaneously* to produce the insight?

The reasoning chain is what makes the example useful to the SWE. Without it, the SWE sees the output and designs an architecture that "should" produce something similar. With it, the SWE can verify that the proposed data flow preserves the specific connections the output depends on.

An example that only shows the output is a north star — it tells you where to aim but not how to get there. An example that shows input → reasoning → output is a test case — it tells you exactly what the architecture must preserve.

### Specify What's Out

The "Out of Scope" section is as important as any feature section. It tells the developer: don't build this, don't plan for this, don't architect around this. It also prevents scope creep during development when someone (including you) thinks "wouldn't it be nice if..."

Out of scope means out of scope for this version. It does not mean never. It means: not now, and do not design the current architecture to accommodate it unless doing so is free.

## PRD Structure

A PRD for this build process includes:

1. **Overview** — What this is, in plain language. One paragraph.
2. **Visual Design Language** (if the product has a UI) — Describe it here. Reference existing products if helpful. Be specific about colors, typography, icon style. The developer and the designer need to see the same thing. For CLI tools, data pipelines, or backend services, omit this section entirely.
3. **Screen Inventory** (if the product has a UI) — Every screen the product has, named and briefly described. This becomes the map.
4. **Feature Sections** — One section per major feature. Each section includes: what the user sees, how they interact, what happens on edge cases, and enough specificity that the SWE can infer the data model.
5. **Data Model** — Entities, their attributes, their relationships. This is the section where the PRD speaks directly to the developer.
6. **Non-Functional Requirements** — Performance, security, resilience, and scale expectations stated in human terms. Not mechanisms — experiences.
7. **Technical Constraints** — Platform, frameworks, deployment target, dependencies allowed or prohibited.
8. **Out of Scope** — What is explicitly not in this version.
9. **Decisions Log** — Resolved tradeoffs with rationale and date.

## The Quality Bar

A practitioner in the problem domain reads the PRD and thinks: "This person understands the problem." A developer reads the PRD and thinks: "I can build this without a follow-up meeting."

If either audience would have questions the PRD doesn't answer, it's not ready for the XRD stage.
