# Task 010: Morning-After Generation

**Track:** C
**Phase:** C1 (reporting)
**Status:** not started
**Depends on:** 003, 004
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-6 (Morning-After Template), PRD Section 4 (Morning-After Summary)

## What to Build

A TypeScript module that generates the morning-after markdown summary from files on disk. It reads the run directory's state.json, events, detections, overrides, and confidence files — never from LLM memory.

Implement in `tools/trellis/src/morning-after.ts`:

1. **`generateMorningAfter(runDir: string): string`** — The main function. Reads all run artifacts and produces the complete morning-after markdown.

2. **`classifyResult(state: TrellisState): "SHIPPED" | "HALTED" | "PARTIAL"`** — Determine run result from state.

3. **`calculateDuration(events: TrellisEvent[]): { hours: number; minutes: number }`** — Compute run duration from first and last event timestamps.

4. **`buildSections(runDir: string): MorningAfterSection[]`** — Build all applicable sections. Sections with no content are excluded.

### Section Generation Rules

| Section | Source | Included When |
|---------|--------|---------------|
| Header | state.json, events | Always |
| What Shipped | events (stage_complete) | Any stage completed |
| What Stopped | state.json (halted=true) | Run halted |
| Gates Overridden | overrides/*.md | Any overrides exist |
| Failure Modes Detected | detections/*.md | Any detections exist |
| Confidence | confidence/*.json | Always |
| Decisions Made | events (Tier 2 decisions) | Any Tier 2 decisions recorded |
| Open Items | state.json or separate file | Any Tier 3 items pending |
| Stats | state.json, events | Always |

## Files

- Create: `tools/trellis/src/morning-after.ts`
- Create: `tools/trellis/test/morning-after.test.ts`
- Create: `tools/trellis/test/fixtures/clean-complete/` (fixture run directory)
- Create: `tools/trellis/test/fixtures/halted-tier3/` (fixture)
- Create: `tools/trellis/test/fixtures/with-overrides/` (fixture)
- Create: `tools/trellis/test/fixtures/with-detections/` (fixture)
- Create: `tools/trellis/test/fixtures/context-exhaustion/` (fixture)
- Modify: `tools/trellis/src/index.ts` (add exports)
- Do not touch: `tools/building-audit/`

## Contracts

### generateMorningAfter

```typescript
function generateMorningAfter(runDir: string): string
// Returns: complete morning-after markdown as a string
// Reads ONLY from the runDir filesystem — no parameters carry pre-summarized data
// All sections are generated from disk artifacts (MAFTER-009)
```

### Output Format

The markdown follows D0-6 section ordering exactly. Empty sections are omitted entirely. The header format:

```markdown
# Morning After: <project> / <milestone>
Run: <run-id>
Duration: <hours>h <minutes>m
Result: SHIPPED | HALTED | PARTIAL

---
```

## Acceptance Criteria

1. A clean completed run produces only Header, What Shipped, Confidence, Stats (MAFTER-001).
2. A halted run includes the What Stopped section (MAFTER-002).
3. A run with overrides includes the Gates Overridden section (MAFTER-003).
4. A run with detections includes the Failure Modes Detected section (MAFTER-004).
5. Empty sections are omitted entirely (MAFTER-008).
6. The morning-after is generated from disk files only, not from passed data (MAFTER-009).
7. Header metadata is correct (MAFTER-010).
8. Stats counts are accurate (MAFTER-011).
9. Context-window exhaustion halt is reported distinctly (MAFTER-012).
10. Generation completes in under 30 seconds for a 100-task run (STRESS-002 precursor).

## Tests

- [ ] MAFTER-001: Clean run produces minimal morning-after
- [ ] MAFTER-002: Halted run includes What Stopped
- [ ] MAFTER-003: Overrides included when present
- [ ] MAFTER-004: Detections included when present
- [ ] MAFTER-008: Empty sections omitted
- [ ] MAFTER-009: Generated from disk files, not passed data
- [ ] MAFTER-010: Header metadata correct
- [ ] MAFTER-011: Stats counts accurate
- [ ] MAFTER-012: Context exhaustion reported distinctly

## Notes

Each test fixture is a complete run directory with state.json, events/, detections/, overrides/, and confidence/ populated to match the test scenario. Fixtures are static and committed.

The morning-after is the user's primary interface with the system. It is read on a phone. Keep formatting clean: no deeply nested markdown, no wide tables, no lines longer than 80 characters. Use bullet lists for items, short sentences for descriptions.

The generation function is invoked by the orchestrator skill (Task 008) at run completion or halt. It writes the result to `.building/runs/<run-id>/morning-after.md`.
