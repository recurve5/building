# Smoke Test Protocol

You execute the PRD's First-Use Walkthrough against the running product. You are verifying that the product works for a user, not that the code passes tests. The interaction mechanism depends on the product type: Playwright MCP for UI products, bash commands for CLI/API products, platform MCP tools for configuration-heavy products (analytics dashboards, webhook setups, integration configurations).

## Prerequisites

Before starting:
1. Confirm the server is running. Ask the human: "Start the server. Tell me the URL and port when it's running." Do not proceed until confirmed.
2. Confirm Playwright MCP is available. If Playwright tools are not in your tool list, tell the human to install it: `claude mcp add --scope user playwright -- npx @playwright/mcp@latest`

## Interaction Protocol

Use Playwright MCP tools to interact with the product:

- **Navigate:** Open the product URL. Wait for the page to load.
- **Click:** Click elements by text content, role, or CSS selector. Prefer text content — it matches what the user sees.
- **Type:** Type into input fields, text areas, chat boxes. Wait for the input to be accepted.
- **Read:** Read page content, element text, response messages. Capture the full text, not just presence.
- **Screenshot:** Take a screenshot after each step as evidence. Name them sequentially: `smoke-01.png`, `smoke-02.png`, etc.
- **Wait:** Wait for elements to appear, for responses to complete, for ingestion to finish. Some steps require patience — a model generating a response, a file being processed, an index being built.

## Evaluation Protocol

For each walkthrough step:

1. **Perform the action** described in the walkthrough.
2. **Observe the result** — read the actual page content, not just check for element presence.
3. **Evaluate against the walkthrough's expected outcome:**
   - If the walkthrough says "the user sees their documents listed," check that the documents are actually listed with real names and details — not an empty state or error message.
   - If the walkthrough says "the model demonstrates knowledge of the document," capture the full response text and evaluate: does the response reference specific facts, themes, or details from the document? A response that lists document names without content knowledge is a FAIL.
   - If the walkthrough says "the user sees a degradation indicator when X fails," trigger X and verify the indicator appears.
4. **Take a screenshot** as evidence.
5. **Record the result:** PASS, FAIL, or BLOCKED.

### Judging Model Responses

You are a model evaluating another model's output. You can judge quality, not just presence. When the walkthrough expects the product's model to demonstrate knowledge:

- **PASS:** The response references specific content from the document — facts, figures, themes, quotes, relationships between entities, or analytical observations that could only come from reading the document.
- **FAIL:** The response acknowledges the document exists but doesn't demonstrate knowledge of its content. Listing filenames, stating document types, or giving generic summaries that could apply to any document.
- **FAIL:** The response says it can't see the document, doesn't have access, or produces an error.
- **FAIL:** The response is about something unrelated to the document the user asked about.

Capture the full response text in the report so the failure can be diagnosed.

## Report Format

```
# Smoke Test Report — [Milestone Name]

**Product URL:** [url]
**Date:** [date]
**Result:** [PASS — all steps passed / FAIL — N of M steps failed]

| Step | Action | Expected | Observed | Result |
|------|--------|----------|----------|--------|
| 1    | ...    | ...      | ...      | PASS   |
| 2    | ...    | ...      | ...      | FAIL   |

## Failed Steps

### Step N: [walkthrough step description]
**Expected:** [what the walkthrough says the user should see]
**Observed:** [what actually happened — full text of any model response]
**Evidence:** [screenshot reference]
**Probable cause:** [your assessment of why it failed — wiring issue, config error, missing data, model prompt gap, etc.]
```

## Failure-to-Fix Protocol

When steps fail:

1. Each failed step becomes a bug report. Use the standard task template format.
2. The bug report includes: what was expected, what was observed, screenshot evidence, and your assessment of the probable cause.
3. The orchestrator creates fix tasks and runs them through Stage 9 (Build).
4. After fixes are built, Stage 10 reruns — all steps, not just the ones that failed. A fix for Step 3 might break Step 7.
5. The milestone is not complete until all walkthrough steps pass in a single run.

## Common Gotchas

- **Server must be running before you start.** You cannot start the server from the sandbox. The human does this.
- **Wait for ingestion.** If the walkthrough involves processing documents, the product may need time to ingest. Don't test document knowledge until ingestion completes. Look for ingestion indicators in the UI.
- **Chat responses take time.** When testing model responses, wait for the full response to appear. Don't evaluate a partial streaming response.
- **Empty states are testable.** The walkthrough's first step often describes what the user sees when nothing exists yet. That empty state is a test — if it shows an error instead of a clean empty state, that's a FAIL.
- **Screenshots are evidence, not decoration.** Every step gets a screenshot. When a step fails, the screenshot is the primary evidence for the bug report.
- **Test degradation paths too.** If the walkthrough includes a failure scenario (wrong format, network down, limit exceeded), trigger the failure and verify the degradation experience. Silent degradation is a FAIL (Decision 20).

## State Preconditions

Most products have multiple states that change what the user sees — a fresh user vs. a returning user, an empty state vs. a populated state, a connected account vs. a disconnected one. The First-Use Walkthrough covers several of these states across its steps. Each step may require the product to be in a specific state before it can be tested.

For each walkthrough step, identify:
- **Required state:** What state must the product be in for this step? (e.g., "no profiles linked," "at least one document ingested," "user has completed onboarding")
- **How to reach it:** How does the tester get the product into that state? (e.g., "use a fresh test account," "delete all documents from the sidebar," "clear local storage and reload")
- **If you can't reach it:** If the required state is unreachable in the running product — no way to reset, no test account available, no way to disconnect a service — mark the step BLOCKED, not PASS. Document what state you tested in and what state you couldn't reach. Code-level verification is not a substitute for live testing unless the smoke test report explicitly notes the substitution and the reason.

This connects to the PRD. Walkthrough steps that depend on specific product states must describe how a tester reaches that state in the running product. If the PRD's walkthrough says "the user has no profiles linked" but the product has no way to unlink a profile, that's a testability gap — surface it during peer review, not at Stage 10.

## For Non-UI Products

For CLI tools, libraries, and APIs, replace Playwright interactions with bash commands:

- **Navigate:** N/A
- **Click/Type:** Run the command with arguments, pipe input, call the API endpoint.
- **Read:** Capture stdout/stderr, parse JSON responses, read output files.
- **Screenshot:** Capture the terminal output as text evidence.
- **Wait:** Wait for long-running processes to complete.

The evaluation and report protocols are identical. The principle is the same — verify the product works for a user, not just that the code passes tests.

## For Configuration-Heavy Products (External Platforms)

For projects whose primary output is configuration in an external platform (PostHog dashboards, Stripe webhook setups, Slack integrations, CI/CD pipelines), use the platform's MCP tools to verify:

- **Query:** Use MCP query tools to check that resources exist with the correct structure (dashboards have the right tiles, actions match the right events, integrations are connected).
- **Verify properties:** Check that configuration details match the spec (chart types, filter settings, event names, message formats, schedule frequencies).
- **Capture evidence:** Save MCP query results as the evidence equivalent of screenshots. Include the full query response in the smoke test report.
- **Manual verification boundary:** Some states cannot be verified via MCP — visual rendering, real-time notification delivery, third-party OAuth flows, scheduled subscription deliveries. For these, the smoke test report lists them under a "Manual Verification Required" section with specific instructions for the human.

The report format is the same as for UI products (step, action, expected, observed, result). The difference is the interaction mechanism: MCP tool calls instead of Playwright actions.

**Stopping for manual verification:** After completing all MCP-verifiable steps, if any steps require manual verification, output: "MCP verification complete. [N of M] steps passed. The following items require manual verification:" followed by the list. Wait for the human to complete manual checks and report results before marking the milestone.

### MCP Prerequisites

Before starting, verify that the required MCP servers are connected. For each MCP server the test plan specifies:
1. Check if the MCP tools are available in the current tool list.
2. If not available, tell the human how to connect it: "This smoke test requires [MCP server name]. Run `[installation command]` to connect it."
3. Do not proceed until all required MCP servers are confirmed.

This follows the same pattern as the Playwright MCP prerequisite check for UI products.
