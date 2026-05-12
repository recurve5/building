# Task 002: Trellis TypeScript Package Scaffold

**Track:** B
**Phase:** B1 (state management)
**Status:** complete
**Depends on:** 001
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-7 (Directory Layout), D0-1 (state.json Schema), `tools/building-audit/package.json` (for convention reference), `tools/building-audit/tsconfig.json`

## What to Build

The `tools/trellis/` TypeScript package with package.json, tsconfig.json, and the type definitions. No logic yet — this is the scaffold that Tasks 003-004 fill in.

## Files

- Create: `tools/trellis/package.json`
- Create: `tools/trellis/tsconfig.json`
- Create: `tools/trellis/src/types.ts` (all Trellis interfaces from DAY-ZERO D0-1, D0-2, D0-5, D0-6)
- Create: `tools/trellis/src/index.ts` (barrel export)
- Do not touch: `tools/building-audit/`

## Contracts

`tools/trellis/src/types.ts` exports all interfaces defined in DAY-ZERO:
- `TrellisState`, `StageRecord`, `TaskRecord` (D0-1)
- `TrellisEvent`, `EventType` (D0-2)
- `GateResult`, `GateCheck` (D0-5)
- `ConfidenceAssessment` (D0-6)

Package configuration mirrors building-audit conventions:
- ESM (`"type": "module"`)
- TypeScript target ES2022, module resolution Node16
- Strict mode enabled
- Vitest for tests
- Build output to `dist/`

## Acceptance Criteria

1. `npm install` in `tools/trellis/` succeeds.
2. `npm run build` (tsc) compiles with no errors.
3. `npm run typecheck` (tsc --noEmit) passes.
4. All DAY-ZERO interfaces are exported from `tools/trellis/src/types.ts`.
5. The package follows the same ESM, target, and module conventions as building-audit.

## Tests

- [ ] Type compilation test: importing all types from the package produces no TypeScript errors.

## Notes

Keep dependencies minimal. This package needs:
- devDependencies: typescript, vitest, @types/node
- No runtime dependencies yet (Tasks 003-004 add them if needed)

The package name in package.json should be `trellis` (matching the building-audit convention of using the tool name, not a scoped package name).
