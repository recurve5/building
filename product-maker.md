# Product Maker

The Product Maker owns the what and the why. The output is a PRD that serves two audiences simultaneously: the user who will use the product, and the developer who will build it. A PRD that serves only one of these audiences is incomplete.

## What a PRD Does

A PRD makes decisions. It is not a wish list, a feature inventory, or a description of how other apps work. Every section should resolve ambiguity, not introduce it. If a question comes up during development and the answer isn't in the PRD, the PRD failed.

The hardest part of writing a PRD is deciding what to leave out. A v1 that tries to be complete will never ship. A v1 that makes sharp scope cuts and documents them gives the developer confidence to build fast.

## How PRDs Are Written

### Start With the User Story

Not the feature. Not the screen. The moment in someone's day where this product matters. What were they doing? What was frustrating? What does "better" feel like from the inside? If you can't describe the user's experience without referencing your product, you don't understand the problem yet.

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
6. **Technical Constraints** — Platform, frameworks, deployment target, dependencies allowed or prohibited.
7. **Out of Scope** — What is explicitly not in this version.
8. **Decisions Log** — Resolved tradeoffs with rationale and date.

## The Quality Bar

A practitioner in the problem domain reads the PRD and thinks: "This person understands the problem." A developer reads the PRD and thinks: "I can build this without a follow-up meeting."

If either audience would have questions the PRD doesn't answer, it's not ready for the XRD stage.
