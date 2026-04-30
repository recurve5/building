# Task 002: Task File Parser

**Track:** A
**Phase:** A1
**Status:** done
**Depends on:** Task 001
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: `~/building/task-template.md` (the parser contract), PRD Section 3.1 (parser spec), XRD Q1/Q2/Q3 (variant detection, Completed parsing, Files parsing), SDM Section 5 (constraints)

## What to Build

The task file parser: a module that takes markdown content and returns a `ParsedTaskFile` or a `ParseError`. Uses `unified`/`remark-parse` to parse markdown into an AST, then walks the AST to extract structured data.

This is the foundation module. Scope Creep, Confidence Bluff, Dependency Grab, and git attribution all depend on it.

Implements `src/parser/task-file-parser.ts` with:
- A public function `parseTaskFile(filePath: string, content: string): ParsedTaskFile | ParseError`
- Variant detection per DAY-ZERO.md Section 1 rules
- Full template parsing (all fields)
- Fix template parsing (all fields)
- Edge case handling per PRD Section 3.1 and the edge cases below

## Files

- Create: `tools/building-audit/src/parser/task-file-parser.ts`
- Create: `tools/building-audit/test/parser/task-file-parser.test.ts`
- Create: `tools/building-audit/test/fixtures/task-003-streak.md` — verbatim Task 003 example from `task-template.md`
- Create: `tools/building-audit/test/fixtures/task-fix-example.md` — constructed fix task
- Create: `tools/building-audit/test/fixtures/task-malformed.md` — deliberately broken file
- Create: `tools/building-audit/test/fixtures/task-edge-cases/` — directory with edge case files
- Do not touch: `src/types/index.ts` (types already defined in Task 001)

## Contracts

Input: raw markdown string + file path.

Output: `ParsedTaskFile` (DAY-ZERO.md Section 1) or `ParseError` (DAY-ZERO.md Section 6).

The parser is consumed by the scanner (Task 006) which calls it once per task file.

## Acceptance Criteria

1. Parses the Task 003 StreakService example and returns a `ParsedTaskFile` with all fields matching the expected values (variant, taskNumber, shortName, track, phase, status, dependsOn, context, files, contracts, acceptanceCriteria with 7 items, tests with 6 items, executionPlan, notes).
2. Parses a fix task and returns `variant = 'fix'` with `reworkOf` populated, `track = null`, `phase = null`, `whatToFix` populated, `whatToBuild = null`.
3. Detects full template via presence of `**Track:**` field.
4. Detects fix template via presence of `**Rework of:**` and absence of `**Track:**`.
5. Returns `ParseError` for files matching neither template variant.
6. Parses Completed section with bold-label anchors into structured sub-fields.
7. Parses Completed section without anchors: sub-fields are null, raw text accessible, parse warning logged.
8. Handles missing optional sections (Deployment, Notes) as null without error.
9. Handles extra whitespace and inconsistent heading levels.
10. Handles code blocks inside Contracts without treating their contents as section headers.
11. Handles `**Depends on:**` with empty value as `dependsOn = []`.
12. Handles both inline and multi-line Files section formats.
13. Returns `ParseError` for empty files, binary content, and files missing required sections.
14. Never throws -- all error cases return `ParseError`.

## Tests

- [ ] PRS-001: Parse full template -- happy path (Task 003 example)
- [ ] PRS-002: Parse full template -- variant detection via Track field
- [ ] PRS-003: Parse full template -- all status values
- [ ] PRS-004: Parse full template -- Depends on with multiple tasks
- [ ] PRS-005: Parse full template -- Depends on "none"
- [ ] PRS-006: Parse full template -- Completed section with sub-structure
- [ ] PRS-007: Parse full template -- Completed section with no anchors
- [ ] PRS-008: Parse fix template -- happy path
- [ ] PRS-009: Fix template -- variant detection via Rework of field
- [ ] PRS-010: Missing optional sections
- [ ] PRS-011: Extra whitespace and inconsistent heading levels
- [ ] PRS-012: Inline code in section headers
- [ ] PRS-013: Frontmatter fields with no value
- [ ] PRS-014: Code blocks inside Contracts containing markdown syntax
- [ ] PRS-015: Files section -- both inline and multi-line formats
- [ ] PRS-016: Acceptance criteria numbering
- [ ] PRS-017: Tests section with checked items
- [ ] PRS-018: Completely invalid file -- not markdown
- [ ] PRS-019: Missing required section -- What to Build
- [ ] PRS-020: File matching neither template variant
- [ ] PRS-021: Missing task number in title
- [ ] PRS-022: Empty file

## Execution Plan

1. My understanding: Build a parser module that takes raw markdown content + file path and returns either a `ParsedTaskFile` (matching the interface in `src/types/index.ts`) or a `ParseError`. The parser uses `unified`/`remark-parse` to produce an AST, then walks it to extract frontmatter fields, section content, and structured sub-sections (files, acceptance criteria, tests, completed). Variant detection uses the presence of `**Track:**` (full) vs `**Rework of:**` (fix) in frontmatter. The parser never throws.
2. Planned approach: Create `src/parser/task-file-parser.ts` with one public function `parseTaskFile`. Internally: (a) guard against empty/binary content, (b) parse AST with remark, (c) extract h1 title for task number and short name, (d) parse bold-label frontmatter from nodes between h1 and first h2, (e) detect variant, (f) extract each section by heading name, (g) parse structured sub-sections (files, AC, tests, completed). Create 11 fixture files and 22 tests covering all PRS-001 through PRS-022.
3. Expected result: One parser module, one test file, 11 fixtures (1 happy path full template, 1 fix template, 1 malformed, 8 edge cases). All 22 tests passing.
4. Ambiguity: None after reading DAY-ZERO.md and task-template.md.

## Notes

This is the most-tested module in the project. The parser's reliability determines the tool's reliability. Per PRD: "If the parser is brittle, half the checks break."

The Task 003 fixture must be the verbatim example from `task-template.md` -- not a modified version. This is the canonical test case.

Decision 8: Parse errors are reported, not fatal. A malformed task file does not crash the tool.

## Completed

**Date:** 2026-04-13
**Deviations:** None. All 22 tests implemented as specified. No dependencies added beyond what was already in package.json.
**Insight/Implication:** Remark-parse does not natively parse GFM task list checkboxes (`- [x]`) without a plugin. Rather than adding a dependency (Dependency Grab), the parser strips `[ ]`/`[x]` prefixes from list item text manually. Also, trailing-whitespace lines in markdown produce `break` nodes in the AST rather than separate paragraphs, which means frontmatter fields on consecutive lines with trailing spaces end up in a single paragraph node. **Implication:** Any downstream consumer that generates markdown for the parser (e.g., test factories) should be aware that remark's AST grouping depends on whitespace patterns. The parser handles both cases.
**Decisions made during this task:** None.
