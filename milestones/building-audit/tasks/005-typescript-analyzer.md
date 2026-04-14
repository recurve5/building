# Task 005: TypeScript Analyzer

**Track:** A
**Phase:** A2
**Status:** done
**Depends on:** Task 001
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.2.1 (Test Cheat -- assertion classification), PRD Section 3.2.4 (Premature Abstraction -- AST needs), XRD Section 3 (AnalyzedFile interface), XRD Risk 2 (AST scope), DAY-ZERO.md Section 4 (AnalyzedFile), DAY-ZERO.md Section 11 (LanguageAnalyzer)

## What to Build

The TypeScript/JavaScript analyzer that parses source files using `@typescript-eslint/typescript-estree` and produces `AnalyzedFile` objects. This is the language-specific analysis layer -- checks consume `AnalyzedFile` objects, not raw ASTs.

The analyzer must extract:
- Import and export declarations
- Function declarations with parameter info, return types, line ranges
- Class declarations with implements, extends, methods
- Interface declarations with extends and method signatures
- Test function detection (`describe`/`it`/`test` call expressions) with assertion classification
- All identifiers (for Clean Slate Bias similarity matching)
- Line count

## Files

- Create: `tools/building-audit/src/analyzers/typescript-analyzer.ts`
- Create: `tools/building-audit/src/analyzers/types.ts` — LanguageAnalyzer interface
- Create: `tools/building-audit/test/analyzers/typescript-analyzer.test.ts`
- Do not touch: `src/types/index.ts`, `src/parser/`

## Contracts

**Input:** File path (string), file content (string).

**Output:** `AnalyzedFile` per DAY-ZERO.md Section 4.

Implements the `LanguageAnalyzer` interface from DAY-ZERO.md Section 11:
```typescript
class TypeScriptAnalyzer implements LanguageAnalyzer {
  language = 'typescript';
  extensions = ['.ts', '.tsx', '.js', '.jsx'];
  parseFile(filePath: string, content: string): AnalyzedFile;
}
```

## Acceptance Criteria

1. Parses a TypeScript file and returns an `AnalyzedFile` with correct imports, exports, functions, classes, interfaces, and line count.
2. Detects test functions from `it()`, `test()`, and `describe()` call expressions and populates `testFunctions`.
3. Classifies assertions by strength: `toEqual`/`toBe`/`toStrictEqual` -> strong; `toBeDefined`/`toBeTruthy`/`toBeInstanceOf` -> weak; no assertions -> absent. Classification matches DAY-ZERO.md Section 4 rules.
4. Extracts function parameter names and types.
5. Extracts class `implements` and `extends` relationships.
6. Extracts interface `extends` and method signatures.
7. Returns empty `testFunctions` array for non-test files.
8. Handles `.ts`, `.tsx`, `.js`, `.jsx` file extensions.
9. Handles files with syntax errors gracefully (returns partial analysis or error, does not throw).
10. Collects all identifiers for similarity matching.

## Tests

- [x] TC-001: All-weak assertions with correctness-implying name (data layer -- assertion classification)
- [x] TC-003: Mixed strong and weak assertions (data layer -- assertion classification)
- [x] TC-004: No assertions in test body (data layer -- assertion classification)
- [x] TC-005: Strong assertions only (data layer -- assertion classification)
- [x] PA-001: Interface with single implementation (data layer -- interface/class extraction)
- [x] PA-002: Interface with multiple implementations (data layer)

## Notes

Per XRD Risk 2: build the analyzer incrementally. Start with what Test Cheat needs (test function detection and assertion classification). Expand as subsequent checks reveal requirements. The `AnalyzedFile` interface is designed for additive growth.

Per XRD Choice 5: do not wrap ESLint plugins. Build assertion classification directly from the AST. The patterns are well-defined and wrapping ESLint plugins would introduce version coupling.

The `@typescript-eslint/typescript-estree` package is used for parsing (not the full `@typescript-eslint/parser` which is ESLint-oriented). It provides the AST without requiring ESLint configuration.

## Execution Plan

1. Create `src/analyzers/types.ts` — LanguageAnalyzer interface.
2. Create `src/analyzers/assertion-patterns.json` — strong/weak classification config per Decision 21.
3. Create `src/analyzers/typescript-analyzer.ts` — TypeScriptAnalyzer class implementing LanguageAnalyzer. Uses typescript-estree to parse TS/JS, extracts imports, exports, functions, classes, interfaces, test functions with assertion classification, identifiers, and line count. Handles parse errors gracefully.
4. Create test fixtures: sample-module.ts, test-weak-assertions.ts, test-mixed-assertions.ts, test-no-assertions.ts, test-strong-assertions.ts, interface-single-impl.ts, interface-multi-impl.ts, malformed.ts, sample-js.js.
5. Create `test/analyzers/typescript-analyzer.test.ts` — 20 tests covering all acceptance criteria and required test IDs (TC-001, TC-003, TC-004, TC-005, PA-001, PA-002).
6. Exclude test/fixtures from tsconfig.json (fixtures include intentionally malformed files).
7. Run tests, fix type errors, verify all pass.

## Completed

**Date:** 2026-04-13

**Deviations:** Excluded `test/fixtures` from tsconfig.json `exclude` array. The malformed.ts fixture (intentional syntax errors for graceful error handling tests) and other fixture files with incomplete type references caused tsc errors during typecheck. This is a standard practice for test fixtures that represent invalid input.

**Insight/Implication:** The `@typescript-eslint/typescript-estree` type system uses `TSEmptyBodyFunctionExpression` for abstract/interface method implementations, which requires explicit type narrowing when extracting method info from class bodies. **Implication:** any future code that walks class members must check for `FunctionExpression` explicitly rather than assuming `member.value` is always a full function expression.

**Decisions made during this task:** None. All implementation choices followed existing decisions (Decision 21 for assertion patterns in JSON config, Decision 15 for single-pass AST parsing).
