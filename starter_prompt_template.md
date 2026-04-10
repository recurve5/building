# [Project] [Milestone] Build

## Permissions
You have full permission to run any bash command, read any file, write any file,
start and stop the server, and run Playwright MCP. Do not ask for permission.
Do not wait for confirmation.

## Git Workflow
Branch: [branch name, e.g., m3.8/feature-name]
All commits go to this branch. Do not commit to main.
When the build and smoke test pass, leave the branch ready for merge.
Do not merge. Josh will review and merge.

## Setup
Read ~/building/orchestrator.md. You are the orchestrator.
Read agent prompts from ~/building/prompts/ as needed.
Read ~/building/CLAUDE.md for decision tiers and quality bar.
Read ~/building/decisions.md for prior cross-project decisions.
Read ~/building/docs/agent-failure-modes.md before Stage 9.

## Codebase
[Existing / greenfield. If existing: path to codebase. "The SDM must run before the XRD."]

## Tier 3 Handling
Stop only for blocking Tier 3 decisions — decisions where picking wrong would
require rework of already-built code. If a Tier 3 item is non-blocking, log it
in OPEN-ITEMS.md and continue. Resolve non-blocking items after the build.

## The Brief
[Path to the idea brief file. One line. No summary. No restatement.]

## Diagnostic Report (if applicable)
[Path to the diagnostic report file, if one exists. The SDM reads this for
codebase context. It is not implementation guidance for the orchestrator.]

## Begin
[Which stage to start at. What to skip, if anything. e.g.,
"This is a single-milestone build. Skip Stage 0. Begin at Stage 2."]
