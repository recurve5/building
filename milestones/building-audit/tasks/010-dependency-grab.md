# Task 010: Dependency Grab Check

**Track:** B
**Phase:** B2
**Status:** done
**Depends on:** Task 007
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.2.3 (Dependency Grab spec), Decision 4 (minimal dependencies)

## What to Build

The Dependency Grab Layer 1 check. Diffs `package.json` between the project's initial commit and HEAD. Every added dependency is checked against task Contracts sections. A dependency not justified in any task's contracts is a finding.

Severity:
- Warning for runtime dependencies (`dependencies`).
- Info for devDependencies.

## Files

- Create: `tools/building-audit/src/checks/layer1/dependency-grab.ts`
- Create: `tools/building-audit/test/checks/layer1/dependency-grab.test.ts`
- Do not touch: `src/scanner/`, `src/parser/`

## Contracts

Implements `Check` interface (DAY-ZERO.md Section 3).

Consumes `ProjectContext.packageJsonHistory` (initial and current package.json), `ProjectContext.taskFiles` (contracts sections for justification matching).

## Acceptance Criteria

1. New runtime dependency not in any task contracts produces a warning finding.
2. New devDependency not in contracts produces an info finding.
3. Dependency justified in a task's contracts section produces no finding.
4. No package.json changes produces no findings.
5. Missing initial package.json (new project) treats all current dependencies as "added" and checks against contracts.
6. Finding includes the dependency name, whether it is runtime or dev, and which tasks' contracts were checked.

## Tests

- [x] DG-001: New runtime dependency not in any task contracts -- warning
- [x] DG-002: New devDependency not in contracts -- info
- [x] DG-003: Dependency justified in task contracts -- clean
- [x] DG-004: No package.json changes -- clean

## Notes

The contract justification matching is a text search: if a task's contracts section contains the package name, the dependency is considered justified. This is deliberately simple -- exact matching, not semantic analysis.

## Execution Plan

1. Parse initial and current package.json from `packageJsonHistory`.
2. Diff `dependencies` and `devDependencies` keys to find additions.
3. For each added dependency, text-search all task `contracts` sections.
4. Unjustified runtime deps = warning, unjustified devDeps = info.
5. Handle null/missing package.json gracefully.

## Completed

**Date:** 2026-04-13
**Deviations:** None. Added two additional edge-case tests (null initial, both null).
**Insight/Implication:** None.
**Decisions made during this task:** None.
