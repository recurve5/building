# Test Plan: building-audit

## 1. Overview

### Scope

This test plan covers the `building-audit` CLI tool -- a TypeScript CLI that enforces the 19 agent failure modes from `agent-failure-modes.md` as mechanical and LLM-assisted checks. The plan covers:

- Task file parser (full and fix template variants)
- 9 Layer 1 checks (deterministic, no LLM)
- 7 Layer 2 checks (evidence gathering deterministic, LLM response mocked)
- Project scanner and ProjectContext assembly
- Report builder (JSON + terminal output)
- CLI interface (flags, exit codes, error handling)
- End-to-end pipeline (synthetic project with known violations)

### Automation Strategy

All tests are automated. No manual verification steps. The tool is a CLI with no UI.

- **Unit tests:** Parser, individual checks, report builder, analyzers
- **Integration tests:** Scanner assembling ProjectContext, check runner executing checks against real fixtures, CLI producing correct exit codes and output
- **End-to-end tests:** Full pipeline against a synthetic project directory

Layer 2 tests mock the Anthropic API. The `LLMClient` interface is injected, and tests provide canned responses. Evidence gathering (the code phase) is tested deterministically. Prompt construction is tested by asserting on the prompt string passed to the mock. LLM response handling is tested with mock responses covering each ruling outcome (positive finding, clean, ambiguous, error).

### Test Framework

Vitest (per XRD Choice 1). TypeScript-native, Jest-compatible API, fast execution.

### ID Convention

`[AREA]-[NNN]` where AREA is a short code for the feature area:

| Area Code | Feature |
|-----------|---------|
| PRS | Task file parser |
| TC | Test Cheat check |
| SC | Scope Creep check |
| DG | Dependency Grab check |
| PA | Premature Abstraction check |
| SH | Surface Heresy check |
| CB | Confidence Bluff check |
| FM | Fragility Metrics check |
| RD | Resource Drain check |
| UD | Unoptimized Defaults check |
| GR | Ghost Refactor check (L2) |
| CSB | Clean Slate Bias check (L2) |
| DH | Deep Heresy check (L2) |
| DOH | Document Heresy check (L2) |
| PCP | Performance Critical Path check (L2) |
| RF | React Fluidity check (L2) |
| RS | Refactoring Signals check (L2) |
| SCN | Scanner / ProjectContext |
| RPT | Report builder |
| CLI | CLI interface |
| E2E | End-to-end |

---

## 2. Test Cases by Feature Area

### 2.1 Task File Parser

**Priority rationale:** The parser is the foundation. Scope Creep, Confidence Bluff, Dependency Grab, and git attribution all depend on parsed task data. A parser bug silently corrupts downstream checks -- a wrong file list in the parsed output makes Scope Creep report false positives or miss real violations. This is the first thing built and the most thoroughly tested.

#### Full Template Parsing

**PRS-001: Parse full template -- happy path (Task 003 example)**
- **Preconditions:** A task file matching the Task 003 StreakService example from `task-template.md`.
- **Steps:**
  1. Pass the file content to the parser.
- **Expected Result:** Returns a `ParsedTaskFile` with:
  - `variant` = `'full'`
  - `taskNumber` = 3
  - `shortName` = `'StreakService — Daily Habit Streaks'`
  - `track` = `'A'`
  - `phase` = `'A1'`
  - `status` = `'not started'`
  - `dependsOn` = `[1, 2]`
  - `context.defaults` contains `'project CLAUDE.md'`, `'DECISIONS.md'`, `'DAY-ZERO.md'`
  - `context.taskSpecific` contains `'Sources/Models/Habit.swift'`, `'Sources/Models/DayEntry.swift'`, `'Decision #8'`
  - `files.create` = `['Sources/Services/StreakService.swift', 'Tests/Services/StreakServiceTests.swift']`
  - `files.modify` = `[]` (or contains `'none'` normalized to empty)
  - `files.doNotTouch` = `['Sources/Models/']`
  - `contracts` contains the Swift function signature code block
  - `acceptanceCriteria` has 7 items, each with correct `number` and `text`
  - `tests` has 6 entries with IDs `ST-001` through `ST-006`, all `checked` = `false`
  - `executionPlan` is non-null
  - `notes` is non-null

**PRS-002: Parse full template -- variant detection via Track field**
- **Preconditions:** A task file with `**Track:** B` in frontmatter.
- **Steps:**
  1. Pass the file content to the parser.
- **Expected Result:** `variant` = `'full'`. [XRD] Variant detection uses presence of `**Track:**` field per XRD Q1.

**PRS-003: Parse full template -- all status values**
- **Preconditions:** Four task files, one per status: `not started`, `in progress`, `done`, `blocked`.
- **Steps:**
  1. Parse each file.
- **Expected Result:** Each returns the correct `status` value.

**PRS-004: Parse full template -- Depends on with multiple tasks**
- **Preconditions:** A task file with `**Depends on:** Task 001 (models), Task 002 (utilities), Task 005`.
- **Steps:**
  1. Parse the file.
- **Expected Result:** `dependsOn` = `[1, 2, 5]`.

**PRS-005: Parse full template -- Depends on "none"**
- **Preconditions:** A task file with `**Depends on:** none`.
- **Steps:**
  1. Parse the file.
- **Expected Result:** `dependsOn` = `[]`.

**PRS-006: Parse full template -- Completed section with sub-structure**
- **Preconditions:** A task file with a Completed section containing:
  ```
  **Date:** 2026-04-10
  **Deviations:** Added an extra helper method for date normalization.
  **Insight/Implication:** The streak logic needed a special case...
  **Decisions made during this task:** Decision: use computed property. Rationale: ...
  ```
- **Steps:**
  1. Parse the file.
- **Expected Result:** `completed.date` = `'2026-04-10'`, `completed.deviations` contains deviation text, `completed.insightImplication` contains insight text, `completed.decisions` contains decision text.

**PRS-007: Parse full template -- Completed section with no anchors** [XRD]
- **Preconditions:** A task file with a Completed section containing free-form text without bold-label anchors.
- **Steps:**
  1. Parse the file.
- **Expected Result:** `completed` is non-null. `completed.date` = `null`, `completed.deviations` = `null`, `completed.insightImplication` = `null`, `completed.decisions` = `null`. Raw text is accessible. Parser logs a parse warning but does not fail. Per XRD Q2.

#### Fix Template Parsing

**PRS-008: Parse fix template -- happy path**
- **Preconditions:** A fix task file with `**Rework of:**`, `**Status:**`, `**Context:**`, What to Fix, Files (Modify, Do not touch), Acceptance Criteria, Execution Plan, Completed.
- **Steps:**
  1. Pass the file content to the parser.
- **Expected Result:** Returns a `ParsedTaskFile` with:
  - `variant` = `'fix'`
  - `reworkOf` is non-null
  - `track` = `null`
  - `phase` = `null`
  - `whatToFix` is non-null
  - `whatToBuild` = `null`
  - `files.create` = `[]` (fix tasks don't have Create)
  - `contracts` = `null`
  - `tests` = `[]`
  - `deployment` = `null`

**PRS-009: Fix template -- variant detection via Rework of field** [XRD]
- **Preconditions:** A fix task file with `**Rework of:** smoke test step 3`.
- **Steps:**
  1. Parse the file.
- **Expected Result:** `variant` = `'fix'`. Variant detected by presence of `**Rework of:**` and absence of `**Track:**`. Per XRD Q1.

#### Edge Cases

**PRS-010: Missing optional sections**
- **Preconditions:** A full template task file with no Deployment section, no Notes section.
- **Steps:**
  1. Parse the file.
- **Expected Result:** `deployment` = `null`, `notes` = `null`. No error. No parse warning.

**PRS-011: Extra whitespace and inconsistent heading levels**
- **Preconditions:** A task file where `## What to Build` is written as `### What to Build` and sections have extra blank lines between them.
- **Steps:**
  1. Parse the file.
- **Expected Result:** Parser still extracts all sections correctly. Heading level mismatch does not break parsing.

**PRS-012: Inline code in section headers**
- **Preconditions:** A task file with a header like `` ## `What to Build` ``.
- **Steps:**
  1. Parse the file.
- **Expected Result:** Parser recognizes the section despite inline code formatting.

**PRS-013: Frontmatter fields with no value**
- **Preconditions:** A task file where `**Depends on:**` has nothing after it (empty).
- **Steps:**
  1. Parse the file.
- **Expected Result:** `dependsOn` = `[]`. No error.

**PRS-014: Code blocks inside Contracts containing markdown syntax**
- **Preconditions:** A task file where the Contracts section contains a code block with `## Some Heading` and `**bold text**` inside the code fence.
- **Steps:**
  1. Parse the file.
- **Expected Result:** The Contracts field contains the raw code block including the markdown-like content. The parser does not treat the code block contents as markdown structure.

**PRS-015: Files section -- both inline and multi-line formats** [XRD]
- **Preconditions:** Two task files. File A has `- Create: file1.ts, file2.ts` (inline). File B has:
  ```
  - Create:
    - `src/services/foo.ts`
    - `src/services/bar.ts`
  ```
- **Steps:**
  1. Parse both files.
- **Expected Result:** Both produce `files.create` arrays with the correct file paths. Per XRD Q3.

**PRS-016: Acceptance criteria numbering**
- **Preconditions:** A task file with 5 numbered acceptance criteria.
- **Steps:**
  1. Parse the file.
- **Expected Result:** `acceptanceCriteria` has 5 entries. Each has the correct `number` (1-5) and `text`.

**PRS-017: Tests section with checked items**
- **Preconditions:** A task file where 2 of 4 test entries are checked (`[x]`).
- **Steps:**
  1. Parse the file.
- **Expected Result:** `tests` has 4 entries. 2 have `checked` = `true`, 2 have `checked` = `false`. Each has the correct `testId` and `description`.

#### Negative Cases

**PRS-018: Completely invalid file -- not markdown**
- **Preconditions:** A file containing binary data or a JSON blob.
- **Steps:**
  1. Pass the content to the parser.
- **Expected Result:** Returns a `ParseError` with file path and reason. Does not throw. Per Decision 8.

**PRS-019: Missing required section -- What to Build (full) / What to Fix (fix)**
- **Preconditions:** A full template task file with no "What to Build" section.
- **Steps:**
  1. Parse the file.
- **Expected Result:** Returns a `ParseError` with reason indicating the missing section.

**PRS-020: File matching neither template variant**
- **Preconditions:** A markdown file that has headings but no `**Track:**` or `**Rework of:**` field.
- **Steps:**
  1. Parse the file.
- **Expected Result:** Returns a `ParseError` with reason indicating unrecognized template.

**PRS-021: Missing task number in title**
- **Preconditions:** A file with `# Task: No Number Here`.
- **Steps:**
  1. Parse the file.
- **Expected Result:** Returns a `ParseError` with reason.

**PRS-022: Empty file**
- **Preconditions:** An empty file (0 bytes).
- **Steps:**
  1. Pass empty content to the parser.
- **Expected Result:** Returns a `ParseError`. Does not throw.

---

### 2.2 Layer 1 Checks

#### 2.2.1 Test Cheat (test-cheat)

**Priority rationale:** Test Cheat catches the failure mode where agents weaken assertions instead of fixing code. A wrong assertion classification means the tool either misses a cheat (false negative) or flags legitimate tests (false positive). Both erode trust.

**TC-001: All-weak assertions with correctness-implying name -- critical**
- **Preconditions:** A test file containing:
  ```typescript
  it('calculates streak correctly', () => {
    const result = calculateStreak(entries);
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result).toBeTruthy();
  });
  ```
  Analyzed by the TypeScript analyzer.
- **Steps:**
  1. Run the test-cheat check against a ProjectContext containing this file.
- **Expected Result:** One finding. Severity: critical. Description mentions all assertions are weak and the test name implies correctness. File path and line number present. Suggestion recommends asserting specific values.

**TC-002: All-weak assertions with non-correctness name -- warning**
- **Preconditions:** A test file with `it('renders component', () => { expect(component).toBeDefined(); })`.
- **Steps:**
  1. Run the test-cheat check.
- **Expected Result:** One finding. Severity: warning (not critical, because the name does not imply correctness).

**TC-003: Mixed strong and weak assertions -- no finding**
- **Preconditions:** A test file with `expect(result).toBeDefined(); expect(result).toEqual(7);`.
- **Steps:**
  1. Run the test-cheat check.
- **Expected Result:** No finding for this test. At least one strong assertion is present.

**TC-004: No assertions in test body -- finding**
- **Preconditions:** A test file with `it('should work', () => { const x = doThing(); })`. No assertion calls.
- **Steps:**
  1. Run the test-cheat check.
- **Expected Result:** One finding. Classification: absent.

**TC-005: Strong assertions only -- clean**
- **Preconditions:** A test file where every test function has at least one `toEqual`, `toBe`, or `toStrictEqual`.
- **Steps:**
  1. Run the test-cheat check.
- **Expected Result:** No findings. Check status: clean.

**TC-006: Correctness-implying name patterns** [XRD]
- **Preconditions:** Test files with names containing "calculates", "returns", "produces", "computes", "generates" -- each with all-weak assertions.
- **Steps:**
  1. Run the test-cheat check.
- **Expected Result:** All flagged as critical. Per PRD Section 3.2.1 and XRD Quality Bar Trace.

**TC-007: Multiple test functions in one file -- findings per function**
- **Preconditions:** A file with 3 test functions: one all-weak (critical name), one no assertions, one all-strong.
- **Steps:**
  1. Run the test-cheat check.
- **Expected Result:** 2 findings (one for the weak, one for the absent). The strong test produces no finding.

#### 2.2.2 Scope Creep (scope-creep)

**SC-001: File modified outside declared scope -- warning**
- **Preconditions:** Task 003 declares `files.modify = ['src/services/streak.ts']`. Git commits with `[003]` prefix touch `src/services/streak.ts` and `src/utils/date.ts`.
- **Steps:**
  1. Run scope-creep check.
- **Expected Result:** One finding for `src/utils/date.ts`. Severity: warning. Description says file was modified but not in task's declared scope.

**SC-002: File in do_not_touch was modified -- critical**
- **Preconditions:** Task 003 declares `files.doNotTouch = ['src/models/']`. A commit with `[003]` modifies `src/models/habit.ts`.
- **Steps:**
  1. Run scope-creep check.
- **Expected Result:** One finding. Severity: critical.

**SC-003: Commit without task ID prefix -- warning**
- **Preconditions:** Git log contains a commit `"fix typo in readme"` with no `[TASK_ID]` prefix.
- **Steps:**
  1. Run scope-creep check.
- **Expected Result:** One finding. Severity: warning. Description notes unattributed commit.

**SC-004: All files within declared scope -- clean**
- **Preconditions:** Task 003 declares create and modify lists. All commits with `[003]` only touch files in those lists.
- **Steps:**
  1. Run scope-creep check.
- **Expected Result:** No findings for task 003.

**SC-005: Legacy project -- auto-detect missing convention** [XRD]
- **Preconditions:** Git log where >90% of commits lack `[TASK_ID]` prefixes. Per Decision 16.
- **Steps:**
  1. Run scope-creep check.
- **Expected Result:** Single info-level note about missing convention. Not a warning per commit.

**SC-006: No task files found -- check skipped**
- **Preconditions:** Project has zero task files. Per Decision 17.
- **Steps:**
  1. Run scope-creep check.
- **Expected Result:** Check status: `skipped`. Reason indicates no task files found.

#### 2.2.3 Dependency Grab (dependency-grab)

**DG-001: New runtime dependency not in any task contracts -- warning**
- **Preconditions:** `package.json` diff between initial commit and HEAD adds `lodash` as a dependency. No task's contracts section mentions `lodash`.
- **Steps:**
  1. Run dependency-grab check.
- **Expected Result:** One finding. Severity: warning. File: `package.json`. Description identifies `lodash` as unjustified.

**DG-002: New devDependency not in contracts -- info**
- **Preconditions:** `package.json` diff adds `@types/lodash` as a devDependency without contract justification.
- **Steps:**
  1. Run dependency-grab check.
- **Expected Result:** One finding. Severity: info.

**DG-003: Dependency justified in task contracts -- clean**
- **Preconditions:** `package.json` adds `simple-git`. Task 003's contracts section references `simple-git`.
- **Steps:**
  1. Run dependency-grab check.
- **Expected Result:** No finding for `simple-git`.

**DG-004: No package.json changes -- clean**
- **Preconditions:** `package.json` unchanged between initial and HEAD.
- **Steps:**
  1. Run dependency-grab check.
- **Expected Result:** No findings.

#### 2.2.4 Premature Abstraction (premature-abstraction)

**PA-001: Interface with single implementation -- info finding**
- **Preconditions:** Source code contains `interface Logger { log(msg: string): void; }` and exactly one class implementing it.
- **Steps:**
  1. Run premature-abstraction check.
- **Expected Result:** One finding. Severity: info. Identifies the interface and its single consumer.

**PA-002: Interface with multiple implementations -- clean**
- **Preconditions:** An interface implemented by 2+ classes.
- **Steps:**
  1. Run premature-abstraction check.
- **Expected Result:** No finding for this interface.

**PA-003: Generic type parameter with single usage -- info**
- **Preconditions:** A function `function wrap<T>(value: T): T { return value; }` called with only one type.
- **Steps:**
  1. Run premature-abstraction check.
- **Expected Result:** One finding. Severity: info.

**PA-004: Passthrough wrapper -- info** [XRD]
- **Preconditions:** A class that wraps another class and delegates every method call without adding behavior.
- **Steps:**
  1. Run premature-abstraction check.
- **Expected Result:** One finding. Severity: info. Notes the wrapper and its single inner call.

#### 2.2.5 Surface Heresy (surface-heresy)

**SH-001: Hard Kill terminology found in source code -- critical**
- **Preconditions:** `DECISIONS.md` contains a `[HARD KILL]` entry killing "ThemeEngine". Source code contains `import { ThemeEngine }`.
- **Steps:**
  1. Run surface-heresy check.
- **Expected Result:** One finding. Severity: critical. Identifies the killed term and the file where it appears.

**SH-002: Hard Kill terminology found in documentation -- warning**
- **Preconditions:** Same kill entry. A markdown doc (not DECISIONS.md) mentions "ThemeEngine".
- **Steps:**
  1. Run surface-heresy check.
- **Expected Result:** One finding. Severity: warning.

**SH-003: Terminology only in DECISIONS.md kill entry -- clean**
- **Preconditions:** "ThemeEngine" appears only in the DECISIONS.md entry that killed it.
- **Steps:**
  1. Run surface-heresy check.
- **Expected Result:** No findings.

**SH-004: No Hard Kill entries in DECISIONS.md -- clean**
- **Preconditions:** DECISIONS.md exists but has no `[HARD KILL]` tags.
- **Steps:**
  1. Run surface-heresy check.
- **Expected Result:** No findings.

**SH-005: No DECISIONS.md file -- check degrades gracefully**
- **Preconditions:** Project directory has no DECISIONS.md.
- **Steps:**
  1. Run surface-heresy check.
- **Expected Result:** Check reports clean (no kills to check against). No error.

#### 2.2.6 Confidence Bluff (confidence-bluff)

**CB-001: "Created [file]" claim -- file exists -- no finding**
- **Preconditions:** Task Completed section says "Created `src/services/streak.ts`". File exists on disk.
- **Steps:**
  1. Run confidence-bluff check.
- **Expected Result:** No finding for this claim.

**CB-002: "Created [file]" claim -- file does not exist -- critical**
- **Preconditions:** Task Completed section says "Created `Sources/Services/WeeklyStreakService.swift`". File does not exist.
- **Steps:**
  1. Run confidence-bluff check.
- **Expected Result:** One finding. Severity: critical. Description says file does not exist at declared path.

**CB-003: "Modified [file]" claim -- file not in git diff for task -- critical**
- **Preconditions:** Task Completed section says "Modified `src/config.ts`". No commit with matching task ID touched `src/config.ts`.
- **Steps:**
  1. Run confidence-bluff check.
- **Expected Result:** One finding. Severity: critical.

**CB-004: Test result claim -- flagged as unverifiable -- warning**
- **Preconditions:** Task Completed section says "All tests pass."
- **Steps:**
  1. Run confidence-bluff check.
- **Expected Result:** One finding. Severity: warning. Description says claim is unverifiable by static analysis. Per Decision 14.

**CB-005: Test result files in standard format parsed as supplementary evidence** [XRD]
- **Preconditions:** Task claims "All tests pass." A `vitest-results.json` file exists with test results.
- **Steps:**
  1. Run confidence-bluff check.
- **Expected Result:** The check parses the test result file and includes it as supplementary evidence in the finding. Per PRD Section 3.2.6.

**CB-006: Function existence claim -- function not in AST -- critical**
- **Preconditions:** Task Completed section claims a class `WeeklyStreakService` was created. AST analysis finds no such declaration.
- **Steps:**
  1. Run confidence-bluff check.
- **Expected Result:** One finding. Severity: critical.

**CB-007: Task with no Completed section -- no findings from this check**
- **Preconditions:** Task file has `status: in progress`, no Completed section.
- **Steps:**
  1. Run confidence-bluff check.
- **Expected Result:** No findings. The check only evaluates claims in Completed sections.

#### 2.2.7 Fragility Metrics (fragility-metrics)

**FM-001: File exceeding length threshold -- warning**
- **Preconditions:** A source file with 500+ lines.
- **Steps:**
  1. Run fragility-metrics check.
- **Expected Result:** Finding for that file. Severity depends on threshold (warning if above threshold, info if approaching).

**FM-002: Function exceeding length threshold -- warning**
- **Preconditions:** A function with 100+ lines.
- **Steps:**
  1. Run fragility-metrics check.
- **Expected Result:** Finding for that function with file path and location.

**FM-003: High modification coupling -- warning**
- **Preconditions:** A file touched by 5+ tasks (determined from git history + task mapping).
- **Steps:**
  1. Run fragility-metrics check.
- **Expected Result:** Finding noting high modification coupling.

**FM-004: TODO/HACK/FIXME density above threshold -- finding**
- **Preconditions:** A file with 10 TODO comments in 100 lines.
- **Steps:**
  1. Run fragility-metrics check.
- **Expected Result:** Finding noting high TODO density.

**FM-005: Test setup complexity -- high setup-to-assertion ratio**
- **Preconditions:** A test file where setup code is 80% of the file and assertions are 20%.
- **Steps:**
  1. Run fragility-metrics check.
- **Expected Result:** Finding noting test setup complexity.

**FM-006: Clean file -- no findings**
- **Preconditions:** A well-structured file under all thresholds.
- **Steps:**
  1. Run fragility-metrics check.
- **Expected Result:** No finding for this file.

#### 2.2.8 Resource Drain (resource-drain)

**RD-001: setInterval without clearInterval -- warning**
- **Preconditions:** Source file with `setInterval(fn, 1000)` and no corresponding `clearInterval`.
- **Steps:**
  1. Run resource-drain check.
- **Expected Result:** One finding. Severity: warning.

**RD-002: addEventListener without removeEventListener -- warning**
- **Preconditions:** Source file with `addEventListener('click', handler)` and no corresponding `removeEventListener`.
- **Steps:**
  1. Run resource-drain check.
- **Expected Result:** One finding. Severity: warning.

**RD-003: Database query without LIMIT -- warning**
- **Preconditions:** Source code containing a SQL query string `SELECT * FROM entries` without LIMIT.
- **Steps:**
  1. Run resource-drain check.
- **Expected Result:** One finding. Severity: warning.

**RD-004: Hardcoded secret pattern -- critical**
- **Preconditions:** Source file with `const key = "AKIAIOSFODNN7EXAMPLE"` (AWS key pattern).
- **Steps:**
  1. Run resource-drain check.
- **Expected Result:** One finding. Severity: critical. Secret value is masked in the finding (first 4 chars + `...` + last 4 chars). Per XRD Section 10, Resolution for FINDING-2.

**RD-005: Proper cleanup present -- clean**
- **Preconditions:** A `useEffect` with `setInterval` in the body and `clearInterval` in the cleanup return.
- **Steps:**
  1. Run resource-drain check.
- **Expected Result:** No finding for this pattern.

**RD-006: Built-in secret patterns cover high-value cases**
- **Preconditions:** Files containing AWS key pattern, GitHub token pattern (`ghp_...`), and a generic high-entropy string.
- **Steps:**
  1. Run resource-drain check (no gitleaks installed).
- **Expected Result:** Findings for each pattern. Report notes that full pattern library was not available (gitleaks not installed). Per Decision 6 and Decision 10.

#### 2.2.9 Unoptimized Defaults (unoptimized-defaults)

**UD-001: Database query without LIMIT or pagination -- warning**
- **Preconditions:** A query `SELECT * FROM users` with no LIMIT or offset.
- **Steps:**
  1. Run unoptimized-defaults check.
- **Expected Result:** One finding. Severity: warning.

**UD-002: Unsanitized input reaching query -- critical**
- **Preconditions:** Code with string interpolation in a SQL query: `` `SELECT * FROM users WHERE name = '${userInput}'` ``.
- **Steps:**
  1. Run unoptimized-defaults check.
- **Expected Result:** One finding. Severity: critical (injection risk).

**UD-003: Unsanitized input reaching shell command -- critical**
- **Preconditions:** Code with `exec(\`rm ${filePath}\`)` where `filePath` comes from user input.
- **Steps:**
  1. Run unoptimized-defaults check.
- **Expected Result:** One finding. Severity: critical.

**UD-004: Missing debounce on scroll/resize handler -- warning**
- **Preconditions:** Code with `window.addEventListener('scroll', handler)` where `handler` is not debounced.
- **Steps:**
  1. Run unoptimized-defaults check.
- **Expected Result:** One finding. Severity: warning.

**UD-005: Query with LIMIT present -- clean**
- **Preconditions:** Code with `SELECT * FROM users LIMIT 50`.
- **Steps:**
  1. Run unoptimized-defaults check.
- **Expected Result:** No finding for this query.

---

### 2.3 Layer 2 Checks

All Layer 2 tests mock the `LLMClient` interface. Each test validates three things independently: (1) the evidence-gathering code phase produces correct candidates, (2) the prompt sent to the LLM contains the expected data, (3) the response handler correctly maps LLM output to findings.

#### 2.3.1 Ghost Refactor (ghost-refactor)

**GR-001: Large diff on non-refactor task -- evidence phase**
- **Preconditions:** ProjectContext with a commit attributed to task 003 (not labeled refactor). The commit has a diff exceeding the configurable line threshold (e.g., 200 lines changed).
- **Steps:**
  1. Run the ghost-refactor code phase.
- **Expected Result:** One candidate identified. Candidate includes the task's "What to Build" section and the diff.

**GR-002: Prompt construction includes task goal and diff**
- **Preconditions:** Same as GR-001. Mock LLMClient captures the prompt.
- **Steps:**
  1. Run ghost-refactor check with mock LLMClient.
- **Expected Result:** Prompt contains the task's "What to Build" text and the diff. Prompt asks whether the rewrite was necessary or stylistic.

**GR-003: LLM rules unnecessary -- warning finding**
- **Preconditions:** Mock LLMClient returns a response indicating the rewrite was unnecessary/stylistic.
- **Steps:**
  1. Run ghost-refactor check.
- **Expected Result:** One finding. Severity: warning.

**GR-004: LLM rules necessary -- clean**
- **Preconditions:** Mock LLMClient returns a response indicating the rewrite was necessary.
- **Steps:**
  1. Run ghost-refactor check.
- **Expected Result:** No finding for this candidate.

**GR-005: Zero candidates -- LLM never called**
- **Preconditions:** All commits have small diffs (below threshold). Per Decision 7.
- **Steps:**
  1. Run ghost-refactor check with mock LLMClient that fails if called.
- **Expected Result:** Check reports clean. Mock LLMClient was not invoked.

#### 2.3.2 Clean Slate Bias (clean-slate-bias)

**CSB-001: Similar function names/signatures detected -- evidence phase**
- **Preconditions:** Codebase with `formatDate(d: Date): string` in two different files.
- **Steps:**
  1. Run clean-slate-bias code phase.
- **Expected Result:** One candidate pair identified.

**CSB-002: LLM confirms duplication -- warning**
- **Preconditions:** Mock LLMClient confirms the two implementations serve the same purpose.
- **Steps:**
  1. Run clean-slate-bias check.
- **Expected Result:** One finding. Severity: warning.

**CSB-003: LLM says related but distinct -- info**
- **Preconditions:** Mock LLMClient says the implementations are related but serve different purposes.
- **Steps:**
  1. Run clean-slate-bias check.
- **Expected Result:** One finding. Severity: info.

**CSB-004: No similar identifiers found -- clean**
- **Preconditions:** No similar function names or signatures across the codebase.
- **Steps:**
  1. Run clean-slate-bias check.
- **Expected Result:** Clean. LLM not called.

#### 2.3.3 Deep Heresy (deep-heresy)

**DH-001: Killed behavior implemented under different name -- critical**
- **Preconditions:** DECISIONS.md has a `[HARD KILL]` for "ThemeEngine" (dynamic runtime theme switching). Code contains a `StyleManager` that dynamically switches themes at runtime. Mock LLMClient confirms the killed behavior is present.
- **Steps:**
  1. Run deep-heresy check.
- **Expected Result:** One finding. Severity: critical.

**DH-002: No Hard Kill entries -- clean, LLM not called**
- **Preconditions:** DECISIONS.md has no `[HARD KILL]` entries.
- **Steps:**
  1. Run deep-heresy check.
- **Expected Result:** Clean. No candidates. LLM not called.

**DH-003: LLM uncertain -- warning**
- **Preconditions:** Mock LLMClient returns uncertain/ambiguous ruling.
- **Steps:**
  1. Run deep-heresy check.
- **Expected Result:** One finding. Severity: warning (not critical).

#### 2.3.4 Document Heresy (document-heresy)

**DOH-001: Killed approach described as active in PRD -- warning**
- **Preconditions:** A `[HARD KILL]` decision killed "calendar view". PRD section says "The calendar view displays..." Mock LLMClient confirms the killed approach is described as active.
- **Steps:**
  1. Run document-heresy check.
- **Expected Result:** One finding. Severity: warning.

**DOH-002: No adjacent terminology found -- clean**
- **Preconditions:** Kill entries have no terminology matches in project documents.
- **Steps:**
  1. Run document-heresy check.
- **Expected Result:** Clean. LLM not called.

#### 2.3.5 Performance Critical Path (performance-critical)

**PCP-001: Deep call chain with I/O -- evidence phase** [XRD]
- **Preconditions:** Codebase with an API route handler that calls through 5+ functions, including a database query and a file read.
- **Steps:**
  1. Run performance-critical code phase.
- **Expected Result:** One candidate chain identified with annotated I/O points.

**PCP-002: LLM assesses perceptible latency -- warning**
- **Preconditions:** Mock LLMClient says the user would perceive latency.
- **Steps:**
  1. Run performance-critical check.
- **Expected Result:** One finding. Severity: warning.

**PCP-003: Evidence exceeds 8K tokens -- batching occurs** [XRD]
- **Preconditions:** A long call chain producing evidence > 8K tokens. Per Decision 11, this check has a 16K limit.
- **Steps:**
  1. Run performance-critical check.
- **Expected Result:** If evidence exceeds the per-check limit, batching occurs and a warning is logged.

#### 2.3.6 React Fluidity (react-fluidity)

**RF-001: Non-React project -- check skipped**
- **Preconditions:** A project with TypeScript files but no React patterns (no JSX, no React imports). Per Decision 12.
- **Steps:**
  1. Run react-fluidity check.
- **Expected Result:** Check status: `skipped`. Reason indicates no React patterns detected.

**RF-002: State change in loop -- candidate found** [XRD]
- **Preconditions:** React component with `setState` called inside a `.forEach` or `.map` loop.
- **Steps:**
  1. Run react-fluidity code phase.
- **Expected Result:** One candidate identified.

**RF-003: LLM says user-perceptible -- warning**
- **Preconditions:** Mock LLMClient assesses the performance issue as user-perceptible.
- **Steps:**
  1. Run react-fluidity check.
- **Expected Result:** One finding. Severity: warning.

#### 2.3.7 Refactoring Signals (refactoring-signals)

**RS-001: Metrics and concerns assembled -- evidence phase**
- **Preconditions:** ProjectContext with modification coupling trends (rising), complexity growth, and Completed sections mentioning structural concerns.
- **Steps:**
  1. Run refactoring-signals code phase.
- **Expected Result:** Evidence includes computed metrics and extracted agent concerns.

**RS-002: LLM assesses yellow (targeted refactoring) -- assessment**
- **Preconditions:** Mock LLMClient responds "proceed with targeted refactoring."
- **Steps:**
  1. Run refactoring-signals check.
- **Expected Result:** Check result contains refactoring assessment = `yellow`.

**RS-003: LLM assesses green -- assessment**
- **Preconditions:** Mock LLMClient responds "proceed as planned."
- **Steps:**
  1. Run refactoring-signals check.
- **Expected Result:** Refactoring assessment = `green`.

**RS-004: LLM assesses red -- assessment**
- **Preconditions:** Mock LLMClient responds "structural rework needed."
- **Steps:**
  1. Run refactoring-signals check.
- **Expected Result:** Refactoring assessment = `red`.

#### Layer 2 Common Behavior

**L2-001: API unreachable -- check marked error, Layer 1 results preserved**
- **Preconditions:** Mock LLMClient throws a connection error. Layer 1 checks have already completed.
- **Steps:**
  1. Run a Layer 2 check.
- **Expected Result:** Check status: `error`. `errorMessage` populated. Layer 1 results are unaffected in the report.

**L2-002: Retry with exponential backoff -- 3 attempts then error**
- **Preconditions:** Mock LLMClient fails on first 3 calls.
- **Steps:**
  1. Run a Layer 2 check.
- **Expected Result:** 3 retry attempts made. After 3 failures, check marked as `error`. Per PRD NFR (Layer 2 latency section).

**L2-003: Token usage tracked per check** [XRD]
- **Preconditions:** Mock LLMClient returns `usage: { input: 4100, output: 800 }`.
- **Steps:**
  1. Run a Layer 2 check.
- **Expected Result:** `CheckResult.tokenUsage` = `{ input: 4100, output: 800 }`.

**L2-004: Secret redaction in evidence payloads** [XRD]
- **Preconditions:** Evidence payload contains an AWS key pattern. Resource Drain (Layer 1) has already flagged it.
- **Steps:**
  1. Run a Layer 2 check that includes this evidence.
- **Expected Result:** The prompt sent to the mock LLMClient has the secret replaced with `[REDACTED:aws-key]`. Per XRD Section 10, Resolution for FINDING-2.

---

### 2.4 Scanner / ProjectContext

**SCN-001: Scanner assembles ProjectContext from valid project**
- **Preconditions:** A project directory with `tasks/` containing 3 task files, a `DECISIONS.md`, TypeScript source files, and a git repository.
- **Steps:**
  1. Run the scanner against the directory.
- **Expected Result:** `ProjectContext` contains:
  - `taskFiles` with 3 entries
  - `parseErrors` empty
  - `gitLog` with commits
  - `decisions` with parsed entries
  - `sourceFiles` with analyzed files
  - `fileToTaskMapping` populated from git history

**SCN-002: Milestone scoping filters correctly**
- **Preconditions:** A project with two milestone directories: `m1-foo/tasks/` (2 tasks) and `m2-bar/tasks/` (3 tasks). Per Decision 18.
- **Steps:**
  1. Run scanner with `--milestone m1-foo`.
- **Expected Result:** `taskFiles` contains only the 2 tasks from `m1-foo`. `gitLog` filtered to commits matching those task IDs plus unattributed commits touching `m1-foo` files.

**SCN-003: Parse errors collected, not fatal**
- **Preconditions:** 5 task files, 1 malformed.
- **Steps:**
  1. Run the scanner.
- **Expected Result:** `taskFiles` has 4 entries. `parseErrors` has 1 entry with file path and reason.

**SCN-004: No task files -- task-dependent context empty**
- **Preconditions:** Project directory with no `tasks/` directory. Per Decision 17.
- **Steps:**
  1. Run the scanner.
- **Expected Result:** `taskFiles` = `[]`. `parseErrors` = `[]`. Scanner does not error. Source files and git history still populated.

**SCN-005: AST parsing runs once -- timing logged** [XRD]
- **Preconditions:** Project with 20 source files. Per Decision 15.
- **Steps:**
  1. Run the scanner. Capture log output.
- **Expected Result:** Log shows timing for each phase (task parsing, git history, AST analysis, assembly). Source files in ProjectContext are pre-analyzed `AnalyzedFile` objects.

**SCN-006: Path validation rejects traversal attempts** [XRD]
- **Preconditions:** `--milestone` value containing `../`. Per XRD Section 10, Resolution for FINDING-3.
- **Steps:**
  1. Run scanner with `--milestone ../../etc`.
- **Expected Result:** Scanner rejects the input. No directory traversal. Exit code 2.

**SCN-007: Empty project directory**
- **Preconditions:** A directory that exists but contains no files and no git repository.
- **Steps:**
  1. Run scanner.
- **Expected Result:** Scanner produces a ProjectContext with empty collections. Does not crash. Reports clear error if no git repo found.

---

### 2.5 Report Builder

**RPT-001: JSON report matches schema**
- **Preconditions:** An array of `CheckResult` objects (mix of clean, findings, errors, skipped) and `ParseError` objects.
- **Steps:**
  1. Pass to report builder.
- **Expected Result:** JSON output matches the `AuditReport` schema (PRD Section 4.3). All required fields present. `version`, `timestamp`, `project`, `mode`, `checks`, `parseErrors`, `summary` all populated.

**RPT-002: Summary severity counts correct**
- **Preconditions:** Check results with 2 critical, 3 warning, 1 info, 2 clean, 1 skipped.
- **Steps:**
  1. Build report.
- **Expected Result:** `summary.critical` = 2, `summary.warning` = 3, `summary.info` = 1, `summary.clean` = 2, `summary.skipped` = 1.

**RPT-003: Top 3 selection -- highest severity first**
- **Preconditions:** Results with 5 critical findings.
- **Steps:**
  1. Build report.
- **Expected Result:** `summary.top3` has exactly 3 entries, all from the critical findings.

**RPT-004: Top 3 with fewer than 3 findings**
- **Preconditions:** Results with 1 finding total.
- **Steps:**
  1. Build report.
- **Expected Result:** `summary.top3` has 1 entry.

**RPT-005: Refactoring assessment null in mechanical mode**
- **Preconditions:** Mode = `mechanical`. No refactoring-signals check result.
- **Steps:**
  1. Build report.
- **Expected Result:** `summary.refactoringAssessment` = `null`.

**RPT-006: Refactoring assessment populated in full mode**
- **Preconditions:** Mode = `full`. Refactoring-signals check returned assessment = `yellow`.
- **Steps:**
  1. Build report.
- **Expected Result:** `summary.refactoringAssessment` = `'yellow'`.

**RPT-007: Token usage present only in full mode**
- **Preconditions:** Mode = `full`. Layer 2 checks have token usage data.
- **Steps:**
  1. Build report.
- **Expected Result:** `tokenUsage` object present with `totalInputTokens`, `totalOutputTokens`, and per-check breakdown.

**RPT-008: Token usage absent in mechanical mode**
- **Preconditions:** Mode = `mechanical`.
- **Steps:**
  1. Build report.
- **Expected Result:** `tokenUsage` field absent or undefined.

**RPT-009: Check severity is highest among findings**
- **Preconditions:** A check with findings: 1 critical, 2 warnings.
- **Steps:**
  1. Build report.
- **Expected Result:** The check's `severity` in the report = `'critical'`.

**RPT-010: Secret values masked in report evidence** [XRD]
- **Preconditions:** A Resource Drain finding with a secret. Per XRD Section 10.
- **Steps:**
  1. Build report.
- **Expected Result:** The finding includes file path and line number but the secret value is masked (first 4 + `...` + last 4 chars).

#### Terminal Output

**RPT-011: Terminal shows critical findings inline**
- **Preconditions:** Report with 2 critical findings and 3 warnings.
- **Steps:**
  1. Generate terminal output (non-verbose).
- **Expected Result:** Critical findings printed with file, location, description, suggestion. Warnings not printed inline.

**RPT-012: Terminal --verbose shows all findings**
- **Preconditions:** Same report. Verbose mode enabled.
- **Steps:**
  1. Generate terminal output (verbose).
- **Expected Result:** All findings (critical, warning, info) printed.

**RPT-013: Terminal progress display during check execution**
- **Preconditions:** Multiple checks running.
- **Steps:**
  1. Observe terminal output during execution.
- **Expected Result:** Each check name and result displayed as it completes (e.g., `test-cheat    3 findings (1 critical, 2 warning)`).

---

### 2.6 CLI Interface

**CLI-001: --mechanical runs Layer 1 only**
- **Preconditions:** Valid project directory.
- **Steps:**
  1. Run `building-audit --mechanical`.
- **Expected Result:** Only Layer 1 checks execute. Report `mode` = `'mechanical'`. No Layer 2 results.

**CLI-002: --full runs Layer 1 + Layer 2**
- **Preconditions:** Valid project directory. `ANTHROPIC_API_KEY` set.
- **Steps:**
  1. Run `building-audit --full`.
- **Expected Result:** Both layers execute. Report `mode` = `'full'`.

**CLI-003: Neither --mechanical nor --full -- prints usage, exit 2**
- **Preconditions:** No mode flag provided.
- **Steps:**
  1. Run `building-audit` with no mode flag.
- **Expected Result:** Usage printed to stderr. Exit code 2.

**CLI-004: Both --mechanical and --full -- invalid, exit 2**
- **Preconditions:** Both flags provided.
- **Steps:**
  1. Run `building-audit --mechanical --full`.
- **Expected Result:** Error message. Exit code 2.

**CLI-005: --full without ANTHROPIC_API_KEY -- Layer 2 skipped**
- **Preconditions:** `ANTHROPIC_API_KEY` not set.
- **Steps:**
  1. Run `building-audit --full`.
- **Expected Result:** Layer 1 completes. Layer 2 reports skipped with message "API unreachable. Set ANTHROPIC_API_KEY or run with --mechanical." Exit code based on Layer 1 results.

**CLI-006: --output sets report file path**
- **Preconditions:** Valid run.
- **Steps:**
  1. Run `building-audit --mechanical --output ./reports/audit.json`.
- **Expected Result:** Report written to `./reports/audit.json`, not the default location.

**CLI-007: Default output path**
- **Preconditions:** No `--output` flag.
- **Steps:**
  1. Run `building-audit --mechanical`.
- **Expected Result:** Report written to `building-audit-report.json` in the current directory.

**CLI-008: --milestone scopes audit**
- **Preconditions:** Project with multiple milestones.
- **Steps:**
  1. Run `building-audit --mechanical --milestone m1-nacre-docx-ingestion`.
- **Expected Result:** Report `milestone` field = `'m1-nacre-docx-ingestion'`. Only tasks and commits within that milestone scope are checked.

**CLI-009: --version prints version and exits**
- **Steps:**
  1. Run `building-audit --version`.
- **Expected Result:** Prints version string (e.g., `building-audit v1.0.0`). Exit code 0.

**CLI-010: --help prints usage and exits**
- **Steps:**
  1. Run `building-audit --help`.
- **Expected Result:** Prints usage with all flags described. Exit code 0.

**CLI-011: --verbose flag**
- **Preconditions:** Audit produces warnings and info findings.
- **Steps:**
  1. Run `building-audit --mechanical --verbose`.
- **Expected Result:** All findings printed to terminal, not just critical.

**CLI-012: Exit code 0 -- no critical findings**
- **Preconditions:** Audit completes with only warning and info findings.
- **Steps:**
  1. Run `building-audit --mechanical`.
- **Expected Result:** Exit code 0. Per Decision 9.

**CLI-013: Exit code 1 -- critical findings present**
- **Preconditions:** Audit completes with at least one critical finding.
- **Steps:**
  1. Run `building-audit --mechanical`.
- **Expected Result:** Exit code 1.

**CLI-014: Exit code 2 -- tool error**
- **Preconditions:** Invalid project directory (does not exist).
- **Steps:**
  1. Run `building-audit --mechanical` in a nonexistent directory.
- **Expected Result:** Clear error message. Exit code 2.

**CLI-015: Invalid --milestone value** [XRD]
- **Preconditions:** `--milestone` points to a directory that does not exist in the project.
- **Steps:**
  1. Run `building-audit --mechanical --milestone nonexistent-milestone`.
- **Expected Result:** Error message. Exit code 2.

**CLI-016: API key not leaked in error messages** [XRD]
- **Preconditions:** `ANTHROPIC_API_KEY` = `sk-ant-secret-value`. API call fails.
- **Steps:**
  1. Run `building-audit --full`. Force an API error.
- **Expected Result:** Error message in report and terminal does not contain `sk-ant-secret-value`. Contains `[REDACTED]` instead. Per XRD Section 10, Resolution for FINDING-4.

---

### 2.7 End-to-End Tests

**E2E-001: Synthetic project with known violations -- mechanical mode**
- **Preconditions:** A synthetic project directory containing:
  - 3 task files (2 full template, 1 fix template) plus 1 malformed task file
  - A `DECISIONS.md` with 1 `[HARD KILL]` entry
  - Source files with: weak test assertions (Test Cheat), files outside task scope in git (Scope Creep), an unjustified dependency (Dependency Grab), a single-implementation interface (Premature Abstraction), killed terminology in source (Surface Heresy), a false file claim in Completed section (Confidence Bluff), a 400-line file with high TODO density (Fragility Metrics), a `setInterval` without cleanup and an AWS key pattern (Resource Drain), an unsanitized SQL query (Unoptimized Defaults)
  - Git history with `[TASK_ID]` prefixed commits plus one unattributed commit
  - At least one check that produces no findings (e.g., Dependency Grab on a dependency that IS justified)
- **Steps:**
  1. Run `building-audit --mechanical` against the synthetic project.
- **Expected Result:**
  - Report written with all 9 Layer 1 checks executed.
  - At least one finding per check that has a violation in the synthetic data.
  - At least one check reports clean.
  - `parse_errors` contains the malformed file.
  - Summary counts match the actual findings.
  - Top 3 populated with highest-severity findings.
  - Exit code 1 (critical findings present).

**E2E-002: Synthetic project -- full mode with mocked LLM**
- **Preconditions:** Same synthetic project. LLMClient mocked at the integration level.
- **Steps:**
  1. Run `building-audit --full`.
- **Expected Result:**
  - Layer 1 results identical to E2E-001.
  - Layer 2 checks execute with mock responses.
  - `refactoringAssessment` populated.
  - `tokenUsage` present in report.
  - Report mode = `'full'`.

**E2E-003: Clean synthetic project -- all checks clean**
- **Preconditions:** A synthetic project with no violations. Well-formed task files, all files within scope, strong test assertions, no killed terminology, no secrets, no unoptimized patterns.
- **Steps:**
  1. Run `building-audit --mechanical`.
- **Expected Result:** All checks report clean. Exit code 0. Summary: 0 critical, 0 warning, 0 info.

**E2E-004: Empty project -- graceful handling**
- **Preconditions:** A project directory with a git repo but no task files, no source files, no DECISIONS.md.
- **Steps:**
  1. Run `building-audit --mechanical`.
- **Expected Result:** Task-dependent checks report `skipped` with reason (per Decision 17). Source-dependent checks report clean (nothing to check). No crashes. Exit code 0.

**E2E-005: Timing check logged per check**
- **Preconditions:** Synthetic project.
- **Steps:**
  1. Run `building-audit --mechanical`. Capture log output.
- **Expected Result:** Each check's execution time logged. Any check exceeding 10 seconds produces a timing warning. Per PRD NFR.

---

## 3. Stress Tests

### Target: Mechanical audit under 30 seconds (PRD NFR: Speed)

**STRESS-001: 500 source files + 50 task files -- mechanical audit**
- **Target:** PRD Section 5, "Speed" -- `--mechanical` completes in under 30 seconds on a project with 500 source files and 50 task files.
- **Category:** Boundary conditions at scale.
- **Method:** Generate a synthetic project with 500 TypeScript source files (each 100-200 lines with functions, classes, imports) and 50 task files (mix of full and fix templates). Initialize a git repo with 200 commits mapped to task IDs. Run `building-audit --mechanical`.
- **Load parameters:** 500 source files, 50 task files, 200 git commits. Single run.
- **Pass threshold:** Total wall-clock time under 30 seconds on the CI runner (or developer machine, measured with `time` command).
- **Fail threshold:** Total wall-clock time exceeds 30 seconds. Any individual check exceeds 10 seconds.

### Target: Parser under 2 seconds for 50 task files (PRD NFR: Speed)

**STRESS-002: Parser performance -- 50 task files**
- **Target:** PRD Section 5, "Speed" -- parser alone completes in under 2 seconds for 50 task files.
- **Category:** Boundary conditions at scale.
- **Method:** Generate 50 task files (varied sizes: 25 full template, 25 fix template, some with large Contracts sections containing multiple code blocks). Time only the parsing phase.
- **Load parameters:** 50 task files. Single run.
- **Pass threshold:** Parser phase completes in under 2 seconds.
- **Fail threshold:** Parser phase exceeds 2 seconds.

### Target: Layer 2 under 2 minutes (PRD NFR: Layer 2 latency)

**STRESS-003: Layer 2 latency -- typical project**
- **Target:** PRD Section 5, "Layer 2 latency" -- Layer 2 phase completes in under 2 minutes for a typical project.
- **Category:** Concurrent operations / timeouts.
- **Method:** Generate a synthetic project that produces candidates for all 7 Layer 2 checks (5-15 total LLM calls expected). Use a mock LLM server with configurable response latency (set to 1-3 seconds per call, simulating real API). Run `building-audit --full`.
- **Load parameters:** 7 Layer 2 checks, 5-15 API calls total, sequential execution (per XRD Choice 6), 1-3 second simulated latency per call.
- **Pass threshold:** Layer 2 phase completes in under 2 minutes.
- **Fail threshold:** Layer 2 phase exceeds 2 minutes. Any single check retries more than 3 times.

### Target: Memory behavior under load

**STRESS-004: Memory stability during large project scan**
- **Target:** PRD Section 5, "Reliability" -- tool never crashes on large input.
- **Category:** Memory/resource leaks.
- **Method:** Run `building-audit --mechanical` against the 500-file synthetic project from STRESS-001. Measure memory usage at start and end of the scan. Run 3 consecutive audits in the same process (if the architecture supports it; otherwise 3 separate invocations and measure peak memory).
- **Load parameters:** 500 source files, 50 task files. 3 consecutive runs.
- **Pass threshold:** Peak memory does not exceed 512 MB. Memory does not grow monotonically across runs.
- **Fail threshold:** Peak memory exceeds 512 MB. Memory grows by more than 50% between run 1 and run 3 (indicates a leak).

### Target: Token batching under large evidence (PRD NFR: Layer 2 cost)

**STRESS-005: Evidence exceeding token limit triggers batching**
- **Target:** PRD Section 5, "Layer 2 cost" -- each LLM check stays under its token limit; exceeding triggers batching.
- **Category:** Boundary conditions at scale.
- **Method:** Create a Performance Critical Path candidate with evidence exceeding 16K tokens (per Decision 11). Run the check and verify batching occurs.
- **Load parameters:** Single check with oversized evidence.
- **Pass threshold:** Check batches the evidence, makes multiple LLM calls, merges results. A warning is logged. Cost stays under $0.50 for the full audit.
- **Fail threshold:** Check sends > 16K tokens in a single API call. Check crashes on oversized evidence.

---

## 4. Implementation Notes

### Test Data Factory

Create a `test/fixtures/` directory with:

- **`createTaskFile(overrides?)`** -- Factory function that returns valid task file markdown. Accepts overrides for any field (status, files, depends on, etc.). Defaults produce a minimal valid full-template task.
- **`createFixTaskFile(overrides?)`** -- Same for fix template variant.
- **`createProjectContext(overrides?)`** -- Factory that builds a `ProjectContext` with sensible defaults: 3 task files, 10 source files, 50 commits, 1 DECISIONS.md. Overrides replace any field.
- **`createGitCommit(overrides?)`** -- Factory for `GitCommit` objects.
- **`createAnalyzedFile(overrides?)`** -- Factory for `AnalyzedFile` objects with configurable test functions, assertions, imports, etc.
- **`createCheckResult(overrides?)`** -- Factory for `CheckResult` objects.

### Fixtures

- **`test/fixtures/task-003-streak.md`** -- The Task 003 example from `task-template.md`, verbatim.
- **`test/fixtures/task-fix-example.md`** -- A constructed fix task file.
- **`test/fixtures/task-malformed.md`** -- A file that looks like a task but is missing required sections.
- **`test/fixtures/task-edge-cases/`** -- Directory with files exercising each parser edge case (PRS-010 through PRS-017).
- **`test/fixtures/synthetic-project/`** -- The full synthetic project for E2E tests (E2E-001 through E2E-004).
- **`test/fixtures/decisions-with-kills.md`** -- A DECISIONS.md with `[HARD KILL]` and `[DEFERRED]` entries.

### Mocking Strategy for LLM

The `LLMClient` interface is the seam. All Layer 2 checks receive an `LLMClient` via dependency injection (constructor parameter or function argument).

```typescript
// Mock for tests
class MockLLMClient implements LLMClient {
  private responses: Map<string, LLMResponse>;
  public calls: { prompt: string; maxInputTokens?: number }[] = [];

  constructor(responses: Map<string, LLMResponse>) {
    this.responses = responses;
  }

  async query(prompt: string, maxInputTokens?: number): Promise<LLMResponse> {
    this.calls.push({ prompt, maxInputTokens });
    // Match response by check name or keyword in prompt
    for (const [key, response] of this.responses) {
      if (prompt.includes(key)) return response;
    }
    return { content: 'clean', usage: { input: 100, output: 50 } };
  }
}
```

Tests assert on:
1. `mock.calls.length` -- how many times the LLM was called (zero for no-candidate checks).
2. `mock.calls[0].prompt` -- what evidence was sent (prompt construction tests).
3. The check result produced from the mock response (response handling tests).

### Test Isolation

- Each test creates its own fixtures or uses factory functions. No shared mutable state between tests.
- File system tests use temporary directories created per test and cleaned up after.
- Git-dependent tests use `simple-git` to initialize temporary repos with scripted commit histories.
- Environment variables (`ANTHROPIC_API_KEY`) are set/unset per test using Vitest's `beforeEach`/`afterEach`.

---

## 5. Priority Order

1. **Parser (PRS-*):** Everything depends on it. A parser bug corrupts all downstream checks. Build and test first. Insight: the parser converts human-readable markdown into machine-readable structures -- the mapping is lossy by nature, and every lossy edge (code blocks inside contracts, inconsistent heading levels, absent sections) is a place where downstream checks will silently get wrong data. Implication: parser tests must cover not just "does it parse" but "does the parsed output contain exactly the data the checks will consume."

2. **Scanner / ProjectContext (SCN-*):** The scanner assembles the data all checks consume. A scanner bug (wrong milestone scoping, missed files, incorrect git filtering) affects every check. Test after parser, before checks.

3. **Layer 1 checks in dependency order:**
   - Test Cheat (TC-*) -- Independent of task data; exercises the TypeScript analyzer path.
   - Scope Creep (SC-*) -- Exercises git-to-task mapping, the core custom value of the tool.
   - Confidence Bluff (CB-*) -- Exercises Completed section parsing + cross-referencing.
   - Surface Heresy (SH-*) -- Exercises DECISIONS.md parser + codebase search.
   - Dependency Grab (DG-*) -- Exercises package.json diffing + contract correlation.
   - Premature Abstraction (PA-*) -- Exercises AST analysis for structural patterns.
   - Fragility Metrics (FM-*) -- Exercises aggregation across multiple signals.
   - Resource Drain (RD-*) -- Exercises pattern matching + secret detection.
   - Unoptimized Defaults (UD-*) -- Exercises pattern matching + injection detection.

4. **Report builder (RPT-*):** Once checks produce results, the report must serialize them correctly. Test after at least 2-3 checks are working to have realistic input.

5. **CLI interface (CLI-*):** The thin entry point. Test after report builder, since CLI tests verify the full pipeline from flags to output file.

6. **Layer 2 checks (GR-*, CSB-*, DH-*, DOH-*, PCP-*, RF-*, RS-*):** Depend on LLMClient infrastructure. Evidence gathering uses the same scanner/analyzer as Layer 1, so it benefits from that being stable. Test after Layer 1 is solid. Layer 2 is the thing to cut if time pressure forces a cut -- the tool ships with `--mechanical` only.

7. **End-to-end (E2E-*):** Integration proof. Run last, after all individual components are tested.

8. **Stress tests (STRESS-*):** Run after the functional test suite passes. These validate non-functional requirements and run as part of Stage 11 (Stress Test) after the final smoke test.

---

## Contradictions Found

None. The PRD and XRD are consistent on all testable claims. The XRD's pushback items (gitleaks deferral, per-check token limits, react-fluidity rename) have been resolved in DECISIONS.md (Decisions 10, 11, 12) and the test plan reflects those resolutions.

## Coverage Confirmation

Every PRD feature section has at least one test case:

| PRD Section | Test Cases |
|-------------|------------|
| 3.1 Task File Parser | PRS-001 through PRS-022 |
| 3.2.1 Test Cheat | TC-001 through TC-007 |
| 3.2.2 Scope Creep | SC-001 through SC-006 |
| 3.2.3 Dependency Grab | DG-001 through DG-004 |
| 3.2.4 Premature Abstraction | PA-001 through PA-004 |
| 3.2.5 Surface Heresy | SH-001 through SH-005 |
| 3.2.6 Confidence Bluff | CB-001 through CB-007 |
| 3.2.7 Fragility Metrics | FM-001 through FM-006 |
| 3.2.8 Resource Drain | RD-001 through RD-006 |
| 3.2.9 Unoptimized Defaults | UD-001 through UD-005 |
| 3.3.1 Ghost Refactor | GR-001 through GR-005 |
| 3.3.2 Clean Slate Bias | CSB-001 through CSB-004 |
| 3.3.3 Deep Heresy | DH-001 through DH-003 |
| 3.3.4 Document Heresy | DOH-001, DOH-002 |
| 3.3.5 Performance Critical Path | PCP-001 through PCP-003 |
| 3.3.6 Fluidity (react-fluidity) | RF-001 through RF-003 |
| 3.3.7 Refactoring Signals | RS-001 through RS-004 |
| 3.4 Report Format | RPT-001 through RPT-013 |
| 3.5 CLI Interface | CLI-001 through CLI-016 |
| 5 Non-Functional Requirements | STRESS-001 through STRESS-005 |
| First-Use Walkthrough Steps 1-7 | CLI-001, CLI-006, CLI-008, CLI-005, E2E-001, E2E-002 |
| Layer 2 common behavior | L2-001 through L2-004 |
