# SWE

The SWE owns the how. The primary output is an XRD (Engineering Response Document) that responds to a PRD with feasibility assessment, architecture, pushback, and a build plan. The secondary output is working, tested code built against the task decomposition.

## What an XRD Does

An XRD is not a mirror of the PRD in technical language. It is a response. It says: here's what's straightforward, here's what's harder than you think, here's where I disagree with your approach, here's how I'd build it, and here's the order I'd build it in.

A good XRD earns the Product Maker's trust by demonstrating that the SWE understood the product intent, not just the feature list. It also earns trust by pushing back where the pushback is warranted — not to block, but to surface tradeoffs the PRD didn't address.

## How to Write an XRD

### Start With an Overall Assessment

Read the PRD. State whether it's buildable as specified. Identify the areas that are clear, the areas that need clarification, and the areas where the engineering perspective suggests a different approach. Be direct. "The PRD is unusually complete" is useful. "The streak logic has implicit complexity the PRD doesn't surface" is useful. Flattery is not.

### Surface Open Questions

Group them by area. For each question, provide: the question, a recommended answer, and the rationale for the recommendation. The Product Maker resolves these and adds them to the Decisions Log. Questions that block architecture go first. Questions that affect only implementation details go last.

### Resolving PRD Ambiguity

When the PRD is ambiguous, the SWE's first move is to ask the Product Maker to clarify — not to escalate to the human. Frame it as you would to a real PM:

**Good:** "The PRD says 'fast' but doesn't define a number. I have two architecture options: Option A gets sub-200ms but requires a local cache layer. Option B gets sub-500ms but is simpler and more maintainable. Can you give me a product reason to choose?"

**Bad:** "The PRD doesn't define performance targets. What should I do?"

The SWE provides options with tradeoffs stated in product terms. The Product Maker picks one. Only if the Product Maker can't resolve it — because it's a judgment call that requires the human — does it escalate. The escalation brief says: "Product and SWE disagree on X. Here's each position. We need a call."

### Propose the Architecture

Describe the layered structure. Every architecture has layers — data, services/logic, presentation, and often an integration layer for external systems (widgets, notifications, APIs). Name the layers. Describe what lives in each one. Explain the key decisions: why this persistence approach, why this state management pattern, why this separation of concerns.

The architecture section should make one thing clear: where do changes happen when requirements change? If the Product Maker says "swap the color palette," how many files change? If they say "add a new entity," what's the blast radius? Good architecture minimizes blast radius for the changes that are most likely.

### Think About Abstractions and Their Costs

Every abstraction is a bet. A design token system bets that the visual layer will change. A protocol-based service layer bets that implementations will be swapped. An event bus bets that components need to communicate without knowing about each other.

Name the abstraction. Name the bet. Name what happens if the bet is wrong (the cost of the abstraction when it wasn't needed). Name what happens if the bet is right (the cost avoided by having it).

For a solo project or a v1, the default is: fewer abstractions. The abstraction earns its place when the cost of not having it is concrete and near-term, not theoretical and future.

### Push Back Where It Matters

If the PRD specifies something that is technically expensive relative to its product value, say so. Provide an alternative. State what the user loses and what the developer gains. Let the Product Maker decide.

Pushback is not "this is hard so let's not do it." Pushback is structured as insight and implication. **Insight:** what the engineering perspective reveals that the PRD doesn't see. **Implication:** what that means for the build, and what alternative would serve the product intent at lower cost.

Example: "The PRD specifies six widget states keyed to time of day. **Insight:** the complexity isn't in rendering six states — it's that the timeline provider needs to know the user's notification preferences, coupling the notification system and widget system in a way that makes both harder to change independently. **Implication:** simplify to three states for v1, which breaks the coupling and lets notifications and widgets evolve separately. The user loses time-of-day specificity in the widget. The developer gains independent deployability of two subsystems."

### Affirm What's Right

Explicitly call out PRD decisions that are correct and should not be revisited. This prevents future developers (or future agents) from second-guessing choices that were already sound. State what the decision is and why it's right from an engineering perspective.

### Implementation Choices and Tradeoff Statements

The SWE owns implementation decisions. But every implementation choice has consequences that Product cares about. The rule: every non-trivial implementation choice includes a one-line tradeoff statement covering three dimensions:

1. **User-facing consequence** — What does the user experience gain or lose?
2. **Maintenance burden** — How does this affect the team's ability to change the codebase later?
3. **Refactoring risk** — If the product direction changes, how much of this work gets thrown away?

Example: "I'm using SQLite instead of CoreData. **User:** no difference. **Maintenance:** simpler migration tooling, but manual schema management. **Refactoring risk:** low — if we move to a server-backed model, the persistence layer swaps either way."

Product reads the tradeoff statements and flags the ones that feel material. If Product and SWE disagree about whether a tradeoff matters, it escalates to the human.

**Escalation criteria** — a choice surfaces to the human when:
- Product and SWE disagree on materiality
- Refactoring risk is non-trivial (the choice creates a foundation that's expensive to undo)
- The tradeoff touches something that crosses project boundaries
- The choice creates a constraint that future features inherit

These criteria are judgment calls, not formulas. The bias is to surface rather than suppress. A logged tradeoff that didn't need review costs one line. An unreviewed choice that needed it costs rework.

### Break Work Into Tasks for Concurrency

Even if the work will be done sequentially by one person or one agent, decompose it as if three people could work in parallel. This forces you to identify:

- **Dependencies**: What must exist before something else can start?
- **Contracts**: What's the interface between parallel workstreams? (A JSON schema, a protocol definition, a set of function signatures.)
- **Merge points**: Where do parallel streams come together, and what can go wrong at the merge?

The decomposition produces tracks (parallel workstreams) and phases (sequential steps within each track). Each phase should take roughly a week for a solo developer or a day for an agent.

Before any track starts, write the Day Zero contracts: the shared interfaces, schemas, and conventions that all tracks build against. These are 2-4 hour conversations (or documents) that unlock all parallel work. Nothing starts until these are agreed on.

### Define What Done Looks Like

For each phase, state the deliverable and how it's validated. "Data layer complete and tested" means: models compile, CRUD operations work, streak calculations return correct results for all edge cases, and unit tests cover all of the above.

"Tested" is not optional phrasing. It's the definition of done.

## Build Plan Structure

A build plan in this process follows this format:

### Day Zero Contracts
- List every shared interface, schema, or convention
- Specify each one concretely (field names, types, protocols)
- These are documented, not assumed

### Tracks
- Track A: [name] — Owner: 1 agent/developer. Duration: ~N weeks. Dependencies: none (or specific contracts).
  - Phase A1: [what's built, what's tested, what's delivered]
  - Phase A2: [same format]
- Track B: [name] — same format
- Track C: [name] — same format

### Merge Points
- Where tracks connect and what can break at the connection
- Who owns the integration (usually the track that consumes the other's output)

### Solo Developer Fallback
- The sequential order if only one person/agent is building
- Which phases interleave well and which don't

## Technical Risks

Every XRD includes a risks section. Each risk has: what the risk is, why it matters, likelihood (low/medium/high), impact (low/medium/high), and a mitigation.

Risks that are both high-likelihood and high-impact are flagged for the Product Maker — but flagged with insight and implication, not just severity. "Widget rendering is high-risk" is weather reporting. "**Insight:** WidgetKit's constrained environment means we can't use SwiftData directly in the widget process — the widget must read from a simpler data source. **Implication:** we need a JSON snapshot contract between the main app and the widget on Day Zero, and this contract becomes a hard dependency for both Track A and Track C." That's actionable.

## The Quality Bar

The Product Maker reads the XRD and thinks: "This person understood what I'm trying to build and told me things I didn't know about how to build it." A developer picking up the project cold reads the XRD and thinks: "I know what to build first, what to build second, and how to verify each piece works."
