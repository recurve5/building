# SDM Codebase Context — building-audit

Pre-XRD assessment. The SWE reads this before proposing architecture.

## 1. What Exists

### Project Structure

`~/building/` is a documentation-and-prompts repository. It contains no application source code, no `package.json`, no `tsconfig.json`, no `src/` directory. The entire repo is markdown files organized as follows:

```
~/building/
  CLAUDE.md                    — Master build file (project instructions)
  decisions.md                 — Cross-project decisions (25 entries)
  orchestrator.md              — Pipeline definition
  task-template.md             — Task file format spec (the parser contract)
  starter-prompt.md            — Build kickoff template
  writing-failure-modes.md     — Writing quality guide
  .gitignore                   — Ignores .DS_Store and .claude/
  prompts/                     — Agent prompt definitions (12 files)
    task-agent.md
    sdm-agent.md
    product-agent.md
    swe-agent.md
    peer-review-agent.md
    tester-agent.md
    security-agent.md
    cost-agent.md
    smoke-test-protocol.md
    stress-test-protocol.md
    performance-agent.md
    failure-mode-audit.md
  docs/                        — Reference documentation (4 files)
    agent-failure-modes.md     — The 19 failure modes (audit source of truth)
    build-process.md
    automation.md
    roadmap.md
  milestones/
    building-audit/
      brief.md
      PRD.md
      DECISIONS.md
      OPEN-ITEMS.md
      tasks/                   — Empty (pre-build)
```

### Key Assets the Tool Reads

**`docs/agent-failure-modes.md`** — 19 failure modes across three loop levels. This is the source-of-truth catalog that the audit tool enforces. Each mode has: name, description, cause, and detection guidance. The detection guidance is prose, not rules — the audit tool must translate it into mechanical checks (Layer 1) or structured LLM prompts (Layer 2).

**`task-template.md`** — Defines two task file variants (full and fix). Includes one complete example (Task 003: StreakService). The parser must handle both variants. The format is markdown with bold-prefix frontmatter fields (`**Track:**`, `**Phase:**`, etc.) and `##`-level section headers.

**`decisions.md`** — Cross-project decisions. The audit tool's Surface Heresy and Deep Heresy checks parse `[HARD KILL]` tags from DECISIONS.md files. The cross-project decisions.md currently has no Hard Kill entries. Project-level DECISIONS.md files (inside milestone directories) will.

**`prompts/task-agent.md`** — The agent that the commit convention change targets. Currently has no commit message convention. The PRD requires adding `[TASK_ID]` prefix convention here.

### What Does Not Exist

- No TypeScript project infrastructure (no `package.json`, `tsconfig.json`, `node_modules/`)
- No source code of any kind
- No test infrastructure
- No CI/CD configuration
- No existing CLI tools

This is a greenfield TypeScript project being added to a documentation repository. The repo will gain a `src/` directory (or equivalent) and all Node.js project scaffolding.

## 2. What's Fragile

### Task File Format (High Risk)

The task template format is the single most important dependency. The parser must handle:

**Frontmatter fields** — Bold-prefix key-value pairs with inconsistent structure:
- Simple values: `**Track:** A`
- Lists: `**Depends on:** Task 001 (SwiftData models), Task 002 (date utilities)`
- Multi-line with sub-items: The `**Context:**` field has a defaults line followed by a task-specific bullet list
- Empty values: `**Depends on:**` with nothing after it

**Section headers** — `##` level headers with varying names between full and fix variants:
- Full: What to Build, Files, Contracts, Acceptance Criteria, Tests, Deployment, Execution Plan, Notes, Completed
- Fix: What to Fix, Files, Acceptance Criteria, Execution Plan, Completed
- The Files section has sub-items (Create, Modify, Do not touch) prefixed with `- `

**Code blocks inside Contracts** — Can contain markdown-like syntax (headings, bullets) that must not be parsed as section boundaries.

**The Completed section** — Has its own internal structure (date, deviations, insight/implication, decisions) but uses no sub-headers — it's prose with bold labels. This is the hardest section to parse reliably because the sub-structure is implicit.

**Ambiguity in the template spec:** The template shows the Completed section structure in the Conventions section at the bottom of `task-template.md`, not in the template body itself. The template body has a `## Completed` placeholder only in the fix variant. The full template does not show a Completed section in its body — it's described in the Conventions section as something added when the task is done. The parser must handle task files both with and without a Completed section.

**No real task files exist yet.** The template has one example (Task 003) but no actual task files from a real build. The parser will be tested against synthetic data derived from the template, not against battle-tested real files. The first real test is when the tool runs against an actual project.

### Failure Mode Catalog (Medium Risk)

`docs/agent-failure-modes.md` is a prose document, not structured data. The 19 failure modes are `##`-level headers with free-form text. Mapping these to check names requires a manual translation table, not parsing. If the failure mode catalog gains new modes or renames existing ones, the audit tool needs manual updates. This is acceptable for 1.0 but should be noted.

### Git History Dependency (Low Risk)

Several checks depend on git history (Scope Creep, Ghost Refactor, Fragility Metrics). The tool assumes a clean git history with the `[TASK_ID]` commit convention. Projects built before this convention exists will produce warnings for every commit. This is by design (PRD Section 3.5) but worth noting for the SWE.

## 3. Change Surface

### New Files (the tool itself)

The building-audit tool adds an entire TypeScript application to `~/building/`. This is the largest change surface:

- Project scaffolding: `package.json`, `tsconfig.json`, `.eslintrc` or equivalent
- Source code: `src/` directory with parser, checks, CLI, report formatter
- Tests: colocated or in `tests/` directory
- Binary entry point: `bin/` or similar for the `building-audit` CLI command

**Recommendation:** The source code should live in a dedicated subdirectory (e.g., `~/building/tools/building-audit/` or `~/building/building-audit/`) rather than polluting the root with `src/`, `node_modules/`, etc. The root of `~/building/` is a documentation project. Mixing application source code at the root level would create confusion about what `~/building/` is.

### Modified Files

**`prompts/task-agent.md`** — The PRD requires adding the `[TASK_ID]` commit message convention. This is a small, scoped addition. The current task-agent.md has no commit convention at all.

**`.gitignore`** — Will need `node_modules/`, `dist/`, and potentially `coverage/` entries added.

### Files That Must Not Change

All other prompts, docs, and build system files. The audit tool reads these as inputs — it does not modify them.

## 4. Patterns and Conventions

### Repository Organization

The repo uses a flat top-level structure with purpose-named directories:
- `prompts/` — Agent definitions
- `docs/` — Reference documentation
- `milestones/` — Per-milestone project directories

There is no existing convention for where application source code lives because none exists yet. The SWE must establish this convention. The milestone directory convention (`m<number>-<project>-<goal>/`) applies to build artifacts, not source code.

### Markdown Format

All documentation follows consistent conventions:
- `#` for document title
- `##` for major sections
- `###` for subsections
- Bold-prefix fields for metadata (`**Field:** value`)
- Pipe tables for structured data
- Fenced code blocks with language tags

The task template uses this same markdown style. The parser should use `unified`/`remark` as specified in the PRD's technical constraints.

### Decision and Decision Logging

Decisions use a table format with `#`, Decision, Rationale, Date columns. Hard Kill entries are tagged `[HARD KILL]`. Deferred entries are tagged `[DEFERRED]`. The Surface Heresy check must parse this specific format.

### File Naming

Markdown files use lowercase-kebab-case: `agent-failure-modes.md`, `task-agent.md`, `build-process.md`. Task files use number-prefix-kebab-case: `001-swiftdata-models.md`.

## 5. Constraints

### Task Template Format Is the Parser Contract

The parser must implement against `task-template.md` as-is. Specific constraints the SWE must account for:

1. **Two variants, shared sections.** The full and fix templates share some sections (Files, Acceptance Criteria, Execution Plan, Completed) but differ in others (What to Build vs. What to Fix, Track/Phase/Depends on vs. Rework of). The parser must detect which variant a file uses.

2. **Bold-prefix frontmatter is not standard markdown frontmatter.** It cannot be parsed with YAML frontmatter parsers. Each field is a markdown paragraph starting with `**FieldName:**`. The Context field spans multiple lines with bullet sub-items.

3. **The Files section has three sub-lists** (Create, Modify, Do not touch) that are `- ` prefixed items under the `## Files` header. The sub-list labels themselves are not headers — they're list item prefixes (e.g., `- Create: file1, file2`). In the example, some entries are multi-line with explanatory text after the colon.

4. **Code blocks in Contracts are opaque.** The parser must skip content inside fenced code blocks when scanning for section headers. A `## Something` inside a code block is not a section header.

5. **The Completed section is optional.** Tasks in `not started` or `in progress` status will not have it. The parser must not require it.

6. **Acceptance Criteria are a numbered list.** Each item starts with a number and period. The parser must extract the number and the text.

7. **Tests are a checkbox list.** Each item follows `- [ ] TEST_ID: description` or `- [x] TEST_ID: description`. The parser must extract the test ID, description, and checked status.

8. **Real-world task files may deviate from the template.** The PRD specifies that malformed files produce parse errors, not crashes. The parser must be defensive: missing sections are null, unrecognized sections are ignored, malformed fields produce per-file warnings.

### No External Binaries

Per PRD Decision 4 and cross-project Decision 3, no external binaries requiring separate installation. `gitleaks` is optional with graceful degradation. Everything else must be npm packages or custom code.

### Language-Agnostic Core, TypeScript-Specific Analyzers

The PRD specifies that the architecture should separate language-specific analyzers (AST parsing for TS/JS) from language-agnostic checks (task file parsing, git attribution, heresy detection). The SWE should plan for this separation even though 1.0 only ships TS/JS.

### The `[TASK_ID]` Commit Convention Does Not Exist Yet

The convention is part of this project's deliverables (added to `task-agent.md`). Projects audited by the tool that were built before this convention will have zero task-attributed commits. The tool must handle this gracefully — every commit produces a warning, but the tool does not crash or produce misleading results.

### 8K Token Limit Per Layer 2 Check

Each LLM check stays under 8K input tokens. If evidence exceeds 8K, the check batches and logs a warning. The SWE must design the evidence-gathering phase to produce bounded output and implement the batching logic.

## 6. Recommendations

### Source Code Location

Place the tool's source in `~/building/tools/building-audit/` rather than at the repo root. This keeps the documentation project clean and allows for future tools under `~/building/tools/`. The `package.json`, `tsconfig.json`, and all application files live inside this directory.

Alternative: `~/building/building-audit/` at the top level. Simpler path, but mixes a single tool directory with the system-level directories (`prompts/`, `docs/`, `milestones/`).

This is a Tier 2 decision for the SWE. Either works. The SWE should pick one and document why.

### Parser-First Development

The task file parser is the foundation — half the Layer 1 checks depend on it. Build and thoroughly test the parser before any checks. The PRD agrees (Section 3.1: "This is the first thing built and the most thoroughly tested").

The parser's test suite should include:
- The full template example (Task 003) from `task-template.md`
- A constructed fix task variant
- Edge cases from PRD Section 3.1 (missing sections, extra whitespace, code blocks in Contracts, empty frontmatter values)
- A deliberately malformed file to verify graceful degradation

### Commit Convention Addition to task-agent.md

The modification to `task-agent.md` is small and safe. Add the `[TASK_ID]` prefix requirement to the existing "How You Work" section, step 3 (Build) or as a new convention under "Scope Rules." The addition should be 2-3 lines.

### No Existing Code to Conflict With

This is a greenfield addition. There is no existing architecture to conflict with, no patterns to accidentally override, no fragile code to break. The primary risk is not conflict — it is that the tool's source code organization sets the precedent for all future tools in this repo. The SWE should establish conventions (directory structure, test organization, build tooling) that a second tool could follow.

### Fit Assessment

The proposed tool fits the existing project well. It reads the project's documentation artifacts as inputs and produces a standalone report. It does not modify any existing files except the small `task-agent.md` addition. The change surface is almost entirely additive — new files, new directory, new capabilities.

The one structural concern: this repository will become a hybrid — part documentation system, part application code. The SWE should ensure the boundary between "build system docs" and "build system tools" is clear in the directory structure.
