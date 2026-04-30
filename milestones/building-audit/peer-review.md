# Peer Review: building-audit

**Reviewer:** Peer Review Agent
**Date:** 2026-04-13
**Inputs:** Brief, PRD, XRD, DECISIONS.md (project), decisions.md (cross-project), security-review.md
**Product type:** Non-UI (CLI tool)

---

## 1. Executive Summary

These documents are ready for development with four issues to resolve first. The PRD and XRD are unusually well-aligned -- nine pre-made decisions in the PRD, three pushback resolutions cleanly reflected in both documents, and security findings addressed with specific architectural mechanisms. The parser-first build strategy is correct. The two-layer architecture is sound.

The issues that must resolve before development are: (1) a failure mode coverage gap -- the brief says 19 failure modes, the agent-failure-modes doc contains 20, and the tool covers 13 directly while 7 have no check, which needs an explicit accounting; (2) the `ProjectContext` interface is missing data that at least two checks require; (3) the Confidence Bluff check claims to "run or check the test suite output" but the architecture has no mechanism for executing tests or reading test results; and (4) the Performance Critical Path and Fluidity checks overlap with Unoptimized Defaults in ways that will produce duplicate findings without a deduplication strategy.

Everything else is buildable as specified.

## 2. Scorecard

| Dimension | PRD | XRD |
|-----------|-----|-----|
| Completeness | Strong | Strong |
| Specificity | Strong -- every check has severity rules, every flag has semantics | Strong -- every module has interfaces, every risk has mitigation |
| Internal consistency | Clean | Clean |
| Cross-document alignment | Strong -- 12 decisions consistently reflected | Strong -- pushback resolutions (D10, D11, D12) properly incorporated |
| Non-functional requirements | Strong -- speed, cost, latency, reliability, determinism, portability all specified | Adequate -- architecture addresses speed (scanner-then-checks) and cost (skip-on-zero-candidates) but does not explicitly address the 30-second budget |
| Security posture | Strong after security review integration | Strong -- Section 10 resolves all High findings with specific mechanisms |

## 3. Issues Table

### High Severity

| # | Category | Description | Technical Consequence | Recommendation |
|---|----------|-------------|----------------------|----------------|
| 1 | Gap | **Failure mode coverage accounting is incomplete.** The brief says "19 failure modes." The `agent-failure-modes.md` document contains 20 failure modes. The PRD covers 13 with checks (9 Layer 1, 7 Layer 2 -- counting Surface Heresy, Deep Heresy, and Document Heresy as three checks for one failure mode "Heresy"). Seven failure modes have no check: Loop of Despair, Context Amnesia, Precondition Ghost, Heroic Unblock, Architecture Mirror, Lossy Middleman, Spec Without Shoes, Closed-Loop Build, Big Bang Integration, Process Drift. Neither document explains which failure modes are excluded and why. | A user reading the brief expects all 19 (or 20) failure modes to be enforced. When 7+ are missing from the report, that is silent degradation (per Decision 20). Josh will wonder whether the tool is incomplete or whether those modes are genuinely undetectable. | Add a "Coverage Map" section to the PRD that lists all 20 failure modes, maps each to its check (or checks), and explicitly marks the ones that are out of scope for v1 with a one-line reason (e.g., "Loop of Despair -- requires real-time session monitoring, not static analysis"). The report should include this map so Josh sees what is and is not covered. Tier 2 -- the SWE and Product can resolve this without human input. |
| 2 | Gap | **ProjectContext is missing data that checks require.** The XRD defines `ProjectContext` with `taskFiles`, `gitLog`, `decisions`, `sourceFiles`, and `rawFiles`. But: (a) Dependency Grab needs the initial `package.json` content and the current `package.json` content -- `rawFiles` only stores current files, not historical versions; (b) Fragility Metrics' modification coupling needs a mapping from files to the tasks that touched them, which requires joining `gitLog` (commit -> taskId) with commit file lists -- this join is not precomputed in `ProjectContext`; (c) Confidence Bluff needs test execution results, which are not in `ProjectContext` at all (see Issue 3). | Checks that need data not in `ProjectContext` will either fail at runtime, compute it themselves (violating the "compute once in scanner" principle), or silently skip findings. | Expand `ProjectContext` to include: `packageJsonHistory: { initial: string; current: string }` (or generalize to `fileHistory` for any file at two points), and `fileToTaskMapping: Map<string, number[]>` (precomputed from gitLog). Address test results per Issue 3. Tier 2. |
| 3 | Gap | **Confidence Bluff has no mechanism to verify "all tests pass" claims.** PRD Section 3.2.6 says: "'All tests pass' -- runs or checks the test suite output for that task's declared tests. If any are failing, critical finding." The XRD architecture has no test runner, no test result reader, and `ProjectContext` has no test results field. The scanner reads files and git history but does not execute tests or parse test output files. The PRD's own First-Use Walkthrough example shows: "Tests/Services/WeeklyStreakTests.swift has 2 failing tests in latest run" -- but there is no "latest run" stored anywhere the tool can read. | Confidence Bluff cannot verify its highest-value claim ("all tests pass") and will either silently skip this sub-check or produce false negatives. This is the check that catches the most dangerous failure mode -- an agent that lies about completion. | Two options: (a) Confidence Bluff actually executes the test suite (adds complexity, time, and a subprocess dependency -- likely out of scope for v1). (b) Confidence Bluff checks for the existence of test result files (JUnit XML, vitest JSON output) and parses them if present. If no test results are available, the check flags "all tests pass" claims as "unverifiable" (severity: warning) rather than attempting to confirm or deny. Option (b) is consistent with the tool's static analysis philosophy. The PRD's walkthrough example should be updated to reflect what the tool can actually verify. Tier 2. |
| 4 | Unstated Assumption | **The 30-second mechanical audit budget has no architectural enforcement.** The PRD says "--mechanical completes in under 30 seconds on a project with 500 source files and 50 task files." The XRD does not address this. The check runner iterates checks sequentially. Each check calls the TypeScript analyzer, which parses every source file into an AST. If the analyzer runs per-check rather than once upfront, 9 checks x 500 files = 4,500 AST parses, which will not complete in 30 seconds. The scanner is described as computing `ProjectContext` once, which implies AST parsing happens once, but the XRD does not explicitly confirm this or benchmark it. | If the architecture accidentally re-parses files per check, the 30-second budget is blown on the first real project. The NFR is stated but not traceable to an architectural guarantee. | Confirm explicitly in the XRD that the TypeScript analyzer runs once during the scanner phase, stores results in `ProjectContext.sourceFiles`, and checks consume pre-analyzed data. Add a timing log per-check (the PRD mentions "logs a timing warning" for checks over 10 seconds) and confirm the runner implements it. Tier 2. |

### Medium Severity

| # | Category | Description | Technical Consequence | Recommendation |
|---|----------|-------------|----------------------|----------------|
| 5 | Architecture-Product Mismatch | **Performance Critical Path and Fluidity overlap with Unoptimized Defaults, creating duplicate findings.** Unoptimized Defaults (Layer 1) checks for missing debounce on scroll/resize, non-virtualized lists, and missing LIMIT clauses. Fluidity (Layer 2) checks for re-render triggers, non-virtualized lists, and missing debounce. Performance Critical Path (Layer 2) assesses call chains with I/O. A non-virtualized list in a React component will produce findings from both Unoptimized Defaults and Fluidity. Missing debounce will show up in both. The report will contain duplicate findings about the same code from different checks. | Josh sees the same issue reported multiple times, eroding trust in the report's signal-to-noise ratio. The summary severity counts are inflated by duplicates. | Either: (a) Remove overlapping patterns from Unoptimized Defaults when the same pattern is covered by a Layer 2 check (Unoptimized Defaults handles non-framework patterns; Layer 2 handles framework-specific ones), or (b) add a deduplication pass in the report builder that merges findings with the same file+location across checks. Option (a) is cleaner. Tier 2. |
| 6 | Gap | **The `--milestone` flag scoping mechanism is underspecified for git history.** PRD Section 3.5 says --milestone scopes the audit to a specific milestone directory. XRD Section 3 says the scanner "filters which directories and commits to include." But: how does the scanner know which commits belong to a milestone? Task files are in the milestone directory, but commits are in the git log. The scanner needs a start-commit and end-commit for the milestone. Neither document specifies how these are determined. Options: (a) use the first and last commit that references a task ID from the milestone's task files, (b) use a tag or branch convention, (c) scope only file-based checks (task files, source in the milestone directory) and run git checks against the full history. | Without a defined mechanism, --milestone will either ignore git history (missing Scope Creep findings for that milestone) or scan the full git history (making --milestone meaningless for git-dependent checks). | Specify the mechanism. Recommendation: option (a) -- the scanner identifies all task IDs in the milestone's `tasks/` directory, then filters `gitLog` to commits whose `taskId` matches one of those IDs, plus commits with no taskId that touch files in the milestone directory. Commits with no taskId outside the milestone directory are excluded. Tier 2. |
| 7 | Gap | **DecisionEntry shape missing from ProjectContext consumption path.** The XRD defines `DecisionEntry` with a `tags` array (`'HARD KILL' | 'DEFERRED'`), but the DECISIONS.md parser (Task A4) is not described in enough detail to know how it detects tags. The PRD says "entries tagged [HARD KILL]" but the actual DECISIONS.md format (as seen in the project's own decisions.md and milestone DECISIONS.md) uses inline text in the Rationale column, not a structured tag field. The parser needs to extract tags from free-text rationale, which is a non-trivial parsing problem. | Surface Heresy and Deep Heresy depend on correctly identifying Hard Kill entries. If the parser misses them because the tag format is not what the code expects, these checks silently report clean on a codebase with active heresy. | Specify the tag detection rules in the XRD's DECISIONS.md parser section (Task A4). The current cross-project decisions.md does not use `[HARD KILL]` tags -- it uses the enriched taxonomy (Insight/Implication/Decision) in the rationale column. The parser must handle both: explicit `[HARD KILL]` tags AND detection from rationale text that describes permanent rejection. Alternatively, require that all Hard Kill decisions use the `[HARD KILL]` tag and add that to the DECISIONS.md conventions. Tier 2. |
| 8 | Non-Functional Requirement Gap | **No specification for what happens when the project has no task files.** Josh might run `building-audit --mechanical` against a project that uses the building system's conventions but has no tasks yet (early in a milestone), or against a project that does not use the building system at all. The tool's behavior is undefined. Checks that depend on task files (Scope Creep, Confidence Bluff, Dependency Grab) have nothing to check. | The tool either crashes, produces an empty report with no useful signal, or runs only the task-independent checks without telling Josh that task-dependent checks were skipped. | When zero task files are found, the tool should: (a) log a clear message ("No task files found. Task-dependent checks skipped."), (b) run task-independent checks (Premature Abstraction, Resource Drain, Unoptimized Defaults, Fragility Metrics), (c) mark task-dependent checks as `skipped` with a reason. This makes the tool useful even outside the building system's conventions. Tier 2. |

### Low Severity

| # | Category | Description | Technical Consequence | Recommendation |
|---|----------|-------------|----------------------|----------------|
| 9 | Clarity | **The brief says 19 failure modes; agent-failure-modes.md has 20.** Process Drift was likely added after the brief was written. The PRD inherits "19" from the brief without verifying. | Cosmetic but causes confusion when someone counts and gets a different number. | Update the PRD to say "20 failure modes" or specify the exact count with a reference. |
| 10 | Clarity | **AnalyzedFile.testFunctions comment says "present only in test files" but the interface does not enforce this.** The field is always present in the TypeScript type. | A check that reads `testFunctions` from a non-test file gets an empty array, which is fine functionally but could lead to confusion during development. | Make the comment more precise: "empty array for non-test files" rather than "present only in test files." |
| 11 | Clarity | **Solo Developer Fallback order puts D1-D2 before C-track but D3 depends on both B and C tracks.** The XRD's sequential order is: "...B10 -> D1 -> D2 -> C1 -> C2 through C8 -> D3 -> D4." D1 (Report builder) can start after B1 since it only needs the CheckResult interface, but D2 (Terminal formatter) needs to format Layer 2 output which does not exist until C-track completes. | D2 would be built against Layer 1 output only and would need updates after C-track to handle Layer 2 display (the "Gathering evidence... LLM review..." progress lines). | Move D2 after C-track in the solo fallback order, or note that D2 will need a second pass for Layer 2 formatting. |

## 4. User-Experience Gaps

### My Independent First-Use Sequence (from brief alone)

Before reading the PRD, here is what I expect Josh's first 30 minutes to look like:

1. **Install.** `npm install -g building-audit` or clone and `npm link`. Josh expects a single command.
2. **First run -- mechanical mode.** `cd ~/projects/nacre && building-audit --mechanical`. Josh expects it to auto-detect the project structure (task files, DECISIONS.md, git history). He does not want to configure anything.
3. **First confusion: where are my task files?** The brief says tasks live in `tasks/` or `m<N>-<project>-<goal>/tasks/`. Josh's project might have a different structure. Does the tool find them? What if some are in the root and some in milestone directories?
4. **Reading results.** Josh expects terminal output that tells him the worst problems first. He does not want to open a JSON file to understand whether the audit found anything important.
5. **Second run -- full mode.** `building-audit --full`. Josh needs to have `ANTHROPIC_API_KEY` set. If he does not, he expects a clear error, not a crash. He wants to know how much the LLM pass cost after it runs.
6. **Scoping to a milestone.** `building-audit --mechanical --milestone m1-nacre-docx-ingestion`. Josh expects this to only look at that milestone's artifacts and commits.
7. **Second confusion: commit attribution.** Josh's existing project does not use `[TASK_ID]` prefixes in commit messages. Every commit produces a Scope Creep warning. Josh wonders whether the tool is useful against projects built before the convention was adopted. He wants a way to either (a) suppress the commit attribution warnings for legacy projects, or (b) fall back to milestone-boundary scoping (Option B from the brief) when commit prefixes are absent.
8. **Comparing against ground truth.** Josh has his manual sanity test results. He compares them to the report. He looks for: bugs he found that the tool missed, and bugs the tool found that he missed. The report format should make this comparison straightforward -- findings should be grappable by file path or failure mode name.

### Comparison Against PRD Walkthrough

The PRD's First-Use Walkthrough covers steps 1-6 well. Step 7 (existing projects without commit convention) and step 8 (ground truth comparison) are gaps:

**Gap A (Medium): Legacy projects without commit attribution.** The PRD requires `[TASK_ID]` prefixes and treats missing prefixes as Scope Creep findings. The brief explicitly surfaces Option B (milestone-boundary scoping) as a fallback. The PRD chose Option A and closed the door on Option B. But Josh's first real use case is Nacre, which was built before this convention. Every commit in Nacre will produce a warning. The tool's first run against its primary validation target will be noisy with false positives from the missing convention. This is not a fatal issue -- the warnings are technically correct (the commits cannot be attributed) -- but it degrades the first-run experience. **Recommendation:** Add a `--no-commit-attribution` flag or detect when >90% of commits lack task ID prefixes and switch to milestone-boundary scoping automatically with a message explaining why. Alternatively, document this limitation prominently so Josh knows what to expect on the first run.

**Gap B (Low): Ground truth comparison workflow.** The PRD mentions the ground truth as an open item (Decision 2) but does not describe how Josh would compare the report against his manual findings. The JSON report is greppable, and findings have file paths, so the mechanical comparison is possible. But neither document describes a recommended workflow. This is acceptable for v1 -- Josh can figure it out -- but a `--compare` flag that takes a ground truth file and produces a coverage diff would be a natural v2 feature.

## 5. Insights and Implications

**Insight:** The coverage gap (Issue 1) reveals a tension between the brief's framing ("enforces the 19 failure modes") and the tool's actual capability. Roughly one-third of the failure modes (Loop of Despair, Context Amnesia, Precondition Ghost, Heroic Unblock, Architecture Mirror, Lossy Middleman, Spec Without Shoes, Closed-Loop Build, Big Bang Integration, Process Drift) are process or design failure modes that cannot be detected by static analysis of completed artifacts. They manifest during execution, at design time, or across session boundaries. The tool enforces the failure modes that leave evidence in code and task files. The ones it cannot enforce leave evidence only in the process itself.

**Implication:** The PRD and brief should be explicit about this boundary. The tool is a post-hoc evidence auditor, not a real-time process enforcer. The failure modes it does not cover are the ones that require live monitoring, session replay, or design review -- all of which are different tools. Framing the tool as "enforces all 19 failure modes" sets an expectation it cannot meet. Framing it as "catches every failure mode that leaves evidence in artifacts" is accurate and still compelling.

**Insight:** The Confidence Bluff check (Issue 3) is the most ambitious check in the tool and the hardest to make work. It tries to verify free-text claims in task Completed sections against actual project state. The mechanical part (file existence, test file presence) is straightforward. The subjective part ("all tests pass," "implements the acceptance criteria correctly") requires either running the tests (expensive, complex) or parsing test results (fragile, depends on output format). The PRD's walkthrough example shows a finding that requires test execution data the architecture does not produce.

**Implication:** Scope Confidence Bluff to what the architecture can actually verify in v1: file existence, code structure claims (function signatures, class existence), and the presence of test files covering declared test IDs. Claims about test results and behavioral correctness should be flagged as "unverifiable by static analysis" rather than producing false clean results. This is honest degradation per Decision 20.

**Insight:** Three of the XRD's pushback resolutions (Decisions 10, 11, 12) are cleanly handled. Decision 10 (defer gitleaks) simplifies the build and removes the subprocess risk. Decision 11 (per-check token limits) is a pragmatic compromise. Decision 12 (rename to react-fluidity) is the right call. The pushback-to-resolution cycle worked well here -- the SWE identified real problems and the product owner resolved them without over-engineering.

**Implication:** The pushback process is calibrated correctly. No action needed.

## 6. Strengths

**The two-layer architecture is the right design.** Separating deterministic checks from LLM judgment, with cost proportional to risk (Decision 7), makes the tool cheap enough to run frequently and expensive only when there is something to evaluate. The skip-on-zero-candidates pattern means a clean project costs nothing in Layer 2.

**The parser-first strategy is correct and well-defended.** Both documents recognize the parser as the highest-risk, highest-dependency component and prioritize it accordingly. The XRD's Risk 1 analysis is honest about the gap between synthetic test data and real task files. The mitigation (defensive parsing, parse_errors array, data-driven fixes after first real run) is pragmatic.

**The security review integration is thorough.** XRD Section 10 addresses both High findings with specific mechanisms: `execFile`/`spawn` with argument arrays (not `exec` with string interpolation), `simple-git >= 3.16.0` pinning, Layer 1 before Layer 2 ordering for secret redaction, `redactSecrets` utility applied to API payloads and report evidence, and API key sanitization in error handling. The mechanisms are traceable to build plan tasks.

**The Day Zero contracts are comprehensive.** Eight interfaces defined before any track starts. The `ProjectContext` pattern (compute once, consume many) is the right approach for a multi-check pipeline. The contracts give each track a stable foundation.

**The report schema as a contract (Decision 5) is forward-thinking.** Defining additive-only evolution rules for the JSON schema means the report can be consumed by future tooling without breaking changes. This costs nothing now and prevents a class of problems later.

**The quality bar trace is well-executed.** The XRD traces the Test Cheat finding from the PRD's walkthrough through every architectural layer, confirming data survival at each stage. The trace is specific (line numbers, AST nodes, severity logic location) and verifiable.

**Exit code semantics (Decision 9) are clean.** 0/1/2 for clean/findings/error is simple, scriptable, and sufficient.

**Choice 5 (no ESLint plugin wrapping in v1) is the right call.** Running ESLint programmatically against a project the tool did not create introduces version conflicts, config resolution, and fragility. Building assertion classification from the AST directly is more work but more reliable.

## 7. Recommended Next Steps

1. **Resolve Issue 1 (failure mode coverage map).** Add to the PRD. This is a documentation task, not an architecture change. Can be done in under an hour.
2. **Resolve Issue 2 (ProjectContext expansion).** Add `packageJsonHistory` and `fileToTaskMapping` to the interface. Update the scanner description. Affects Day Zero contracts.
3. **Resolve Issue 3 (Confidence Bluff scoping).** Decide between running tests and parsing results vs. flagging test claims as unverifiable. Update the PRD walkthrough example to match. Update XRD if architecture changes.
4. **Resolve Issue 4 (30-second budget traceability).** Confirm in the XRD that AST parsing runs once in the scanner. Add timing infrastructure description to the check runner.
5. **Address Issue 5 (finding overlap/dedup) and Issue 6 (milestone git scoping).** These are Tier 2 -- the SWE can resolve during task decomposition.
6. **Address Gap A (legacy project experience).** Decide whether to add a flag, auto-detect, or document. This affects the first-run experience against Nacre, the tool's primary validation target.
7. **Proceed to test plan.** After issues 1-4 are resolved, the documents are ready for test plan creation and task decomposition.

---

**High-severity issues requiring resolution before development:** Issues 1, 2, 3, 4.

**Tier 3 items:** None. All issues have clear resolution paths that do not require product judgment -- they are Tier 2 decisions the SWE and Product can resolve together.
