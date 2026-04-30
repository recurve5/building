# Open Items — building-audit

| # | Item | Context | Status |
|---|------|---------|--------|
| 1 | Ground truth capture | The brief requires Josh to run a manual sanity test on the current Nacre build before the building-audit build starts. Every bug found gets documented with: what the bug is, which file(s) it's in, and which failure mode it maps to. This list is the ground truth for validating building-audit's output. Josh is handling this in parallel with the build. | Open — Josh handling |
| 2 | loadAssertionPatterns dedup | `loadAssertionPatterns` is duplicated in `analyzers/typescript-analyzer.ts` and `checks/layer1/test-cheat.ts`, each loading its own `assertion-patterns.json`. The two config files have drifted — analyzer's set is a richer superset. Surgical task: reconcile the JSON, hoist the loader to a shared utility, ensure test-cheat's existing tests still pass. | Open — deferred from [030] |
| 3 | Validate Layer 2 SDK plumbing | The seven Layer 2 checks were dogfooded against `~/building` manually through Claude Code (Decision 22), validating prompts and judgment shape. The actual `LLMClient` SDK wiring (token tracking, structured parsing, retry, redact-before-send) is unit-tested but never exercised end-to-end against real code. Closes when either M2's orchestrator drives Layer 2 through Claude Code, or a paid `--full` run is performed. | Open — pending M2 |
