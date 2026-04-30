# Task 001: Project Scaffold

**Track:** A
**Phase:** A1
**Status:** done
**Depends on:** none
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: SDM context (`milestones/building-audit/sdm-context.md`), XRD Section 3 (Architecture), XRD Choice 1 (Vitest), XRD Choice 2 (Commander), XRD Choice 3 (source location)

## What to Build

The project skeleton at `~/building/tools/building-audit/`. This task creates the directory structure, configuration files, and CLI entry point shell. No business logic -- just the scaffold that all subsequent tasks build on.

## Files

- Create: `tools/building-audit/package.json`
- Create: `tools/building-audit/tsconfig.json`
- Create: `tools/building-audit/vitest.config.ts`
- Create: `tools/building-audit/bin/building-audit.ts`
- Create: `tools/building-audit/src/cli/index.ts`
- Create: `tools/building-audit/src/types/index.ts`
- Create: `tools/building-audit/test/fixtures/.gitkeep`
- Create: `tools/building-audit/test/factories/index.ts`
- Modify: `~/building/.gitignore` — add `tools/building-audit/node_modules/`, `tools/building-audit/dist/`, `tools/building-audit/coverage/`
- Do not touch: any files outside `tools/building-audit/` and `.gitignore`

## Contracts

All shared type definitions from DAY-ZERO.md Sections 1-12 are exported from `src/types/index.ts`. This file is the single import point for types across the project.

The CLI entry point (`bin/building-audit.ts`) uses `commander` to parse flags:
- `--mechanical` / `--full` (one required, mutually exclusive)
- `--milestone <name>`
- `--output <path>`
- `--verbose`
- `--convention-start <hash>` (Decision 19)
- `--version`
- `--help`

The entry point validates flags and exits with code 2 on invalid input. It does not yet wire the pipeline (that is Task 027).

`package.json` must:
- Set `name` to `building-audit`
- Set `version` to `1.0.0`
- Set `bin` to point to the compiled CLI entry point
- Pin `simple-git >= 3.16.0` (XRD Section 10, FINDING-5)
- Include `commander`, `unified`, `remark-parse`, `@typescript-eslint/parser`, `@typescript-eslint/typescript-estree` as dependencies
- Include `vitest`, `typescript` as devDependencies
- Set `engines.node` to `>=18`

## Acceptance Criteria

1. `npm install` succeeds in `tools/building-audit/` with no errors.
2. `npx tsc --noEmit` succeeds with no type errors.
3. `npx vitest run` succeeds (placeholder test passes).
4. `building-audit --help` prints usage with all flags described and exits with code 0.
5. `building-audit --version` prints `building-audit v1.0.0` and exits with code 0.
6. `building-audit` with no mode flag prints usage to stderr and exits with code 2.
7. `building-audit --mechanical --full` prints an error and exits with code 2.
8. All shared types from DAY-ZERO.md compile without errors when imported from `src/types/index.ts`.
9. `simple-git` version in `package.json` is pinned to `>= 3.16.0`.

## Tests

- [x] CLI-003: Neither --mechanical nor --full -- prints usage, exit 2
- [x] CLI-004: Both --mechanical and --full -- invalid, exit 2
- [x] CLI-009: --version prints version and exits
- [x] CLI-010: --help prints usage and exits

## Notes

Per XRD Choice 3, the source lives in `~/building/tools/building-audit/` to keep the documentation repo root clean. This establishes the `tools/` convention for future CLI tools.

Per XRD Section 10 (Resolution for FINDING-5), `simple-git` must be pinned to `>= 3.16.0` to patch known CVEs.

The `src/types/index.ts` file exports all interfaces from DAY-ZERO.md. Subsequent tasks import types from this file.

## Execution Plan

1. Create directory structure: `tools/building-audit/` with `bin/`, `src/cli/`, `src/types/`, `test/fixtures/`, `test/factories/`.
2. Write `package.json` with all specified dependencies, `simple-git >= 3.16.0`, bin entry point, and engine constraint.
3. Write `tsconfig.json` targeting ES2022 with Node16 module resolution.
4. Write `vitest.config.ts` with node environment, test include pattern.
5. Write `src/types/index.ts` exporting all DAY-ZERO.md interfaces (Sections 1-12).
6. Write `src/cli/index.ts` with Commander-based arg parsing: `--mechanical`, `--full` (mutually exclusive, one required), `--milestone`, `--output`, `--verbose`, `--convention-start`, `--version`, `--help`. Exit 2 on invalid input.
7. Write `bin/building-audit.ts` as thin entry point importing CLI module.
8. Write `test/factories/index.ts` with factory functions for all core types.
9. Write `test/cli.test.ts` covering CLI-003, CLI-004, CLI-009, CLI-010.
10. Create `test/fixtures/.gitkeep`.
11. Update `.gitignore` with `node_modules/`, `dist/`, `coverage/` entries.
12. Run `npm install`, `npx tsc --noEmit`, `npx vitest run` and verify all pass.

## Completed

**Date:** 2026-04-13

**Deviations:** Added `@types/node` to devDependencies (not listed in task spec but required for TypeScript to resolve `process`, `node:module`, and other Node.js globals). This is a standard TypeScript project requirement.

**Insight/Implication:** The task spec listed dependencies but omitted `@types/node`, which is a necessary implicit dependency for any Node.js TypeScript project. **Implication:** Future task specs for TypeScript projects should include `@types/node` in devDependencies to avoid a false-start cycle during scaffold setup.

**Decisions made during this task:** None (Tier 1 only — `@types/node` addition is standard practice).
