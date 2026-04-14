# Design Pass Starter

Read `~/building/orchestrator.md` and `~/building/prompts/design-agent.md`. You are the orchestrator. Run a design pass on the project named below.

A design pass is a milestone whose entry-point agent is design-agent, not product-agent. It is only valid on a project that already has a running product — you need something to react to. If the project has never shipped, stop and tell the human to run the normal pipeline first.

## What to do

1. **Create the milestone directory.** `m<next>-<project>-design-pass/`. Use the existing milestone numbering for this project.

2. **Capture the current state.** Start the product (ask the human for the URL if you don't already know it). Use Playwright MCP to capture screenshots of every top-level surface — routes, panels, modals, empty states, loading states, error states. Save them in the milestone directory under `screenshots/`.

3. **Check for existing design assets.** Look for `design-tokens.md` at the project root, brand assets (logos, icons, mark files), and any prototype files from prior design passes. If any exist, include them in design-agent's context.

4. **Spin up design-agent in Audit + Redesign mode.** Input: the screenshots, the prior milestone's PRD and First-Use Walkthrough, any existing design assets, and any reference images the human provided.

5. **Gate the output.** Design-agent returns the token file, prototype files, audit report, and Tier 3 decisions. Route Tier 3 items through product-agent per the relay protocol. Do not advance to Stage 3 (XRD) until the human has approved the token file and the prototypes, and all Tier 3 items are resolved.

6. **Continue the pipeline normally.** Once design-agent's output is approved, run Stage 3 (XRD) through Stage 10 (Smoke Test) as for any other milestone. The SWE decomposes the design work into fix-list tasks that reconcile the existing source code against the new token system. Stage 10 runs both the functional smoke test and design-agent in enforcement mode against the running product.

7. **Watch for oversized fix lists.** If the task decomposition exceeds the swe-agent's 30-task scaling signal, stop and propose sub-decomposition — `m<n>-<project>-design-tokens` establishes the system and applies it to the most-used surface, `m<n+1>-<project>-design-<next-surface>` applies to the next, and so on. Each sub-milestone produces a user-touchable improvement and gets its own smoke test. This avoids a Big Bang visual redesign.

---

*Specify which project to run the design pass on below this line.*
