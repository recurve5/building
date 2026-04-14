import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDecisions } from '../../src/parser/decisions-parser.js';
import type { DecisionEntry } from '../../src/types/index.js';

function readFixture(name: string): string {
  return readFileSync(join(__dirname, '..', 'fixtures', name), 'utf-8');
}

describe('Decisions Parser', () => {
  // AC1: Parses standard table format into DecisionEntry[]
  it('AC1: parses standard DECISIONS.md table into DecisionEntry[]', () => {
    const content = readFixture('decisions-with-kills.md');
    const entries = parseDecisions(content);

    expect(entries.length).toBe(9);

    // Check first entry
    expect(entries[0]).toEqual({
      number: 1,
      decision: 'Use SQLite for local persistence',
      rationale: 'Embedded, no server, good enough for v1.',
      date: '2026-03-08',
      tags: [],
    });
  });

  // AC2: Detects [HARD KILL] in Decision column
  it('AC2: detects [HARD KILL] tag in Decision column', () => {
    const content = readFixture('decisions-with-kills.md');
    const entries = parseDecisions(content);

    const entry2 = entries.find(e => e.number === 2);
    expect(entry2).toBeDefined();
    expect(entry2!.tags).toContain('HARD KILL');

    const entry6 = entries.find(e => e.number === 6);
    expect(entry6).toBeDefined();
    expect(entry6!.tags).toContain('HARD KILL');
  });

  // AC3: Detects [DEFERRED] tag in Decision or Rationale column
  it('AC3: detects [DEFERRED] tag in Decision or Rationale column', () => {
    const content = readFixture('decisions-with-kills.md');
    const entries = parseDecisions(content);

    // Entry 4 has [DEFERRED] in Decision column
    const entry4 = entries.find(e => e.number === 4);
    expect(entry4).toBeDefined();
    expect(entry4!.tags).toContain('DEFERRED');

    // Entry 7 has [DEFERRED] in Rationale column
    const entry7 = entries.find(e => e.number === 7);
    expect(entry7).toBeDefined();
    expect(entry7!.tags).toContain('DEFERRED');
  });

  // AC4: Returns correct fields for each entry
  it('AC4: returns correct number, decision, rationale, and date fields', () => {
    const content = readFixture('decisions-with-kills.md');
    const entries = parseDecisions(content);

    const entry5 = entries.find(e => e.number === 5);
    expect(entry5).toBeDefined();
    expect(entry5!.number).toBe(5);
    expect(entry5!.decision).toBe('Git attribution uses commit convention');
    expect(entry5!.rationale).toBe('Enables per-task Scope Creep detection.');
    expect(entry5!.date).toBe('2026-03-15');
    expect(entry5!.tags).toEqual([]);
  });

  // AC5: Handles DECISIONS.md with no Hard Kill entries
  it('AC5: handles file with no Hard Kill entries -- all tags are empty arrays', () => {
    const content = `# Decisions

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Use TypeScript | Type safety. | 2026-01-01 |
| 2 | Use Vitest | Fast and modern. | 2026-01-02 |
`;
    const entries = parseDecisions(content);
    expect(entries.length).toBe(2);
    expect(entries[0].tags).toEqual([]);
    expect(entries[1].tags).toEqual([]);
  });

  // AC6: Handles empty or missing content
  it('AC6: returns empty array for empty content', () => {
    expect(parseDecisions('')).toEqual([]);
    expect(parseDecisions('   ')).toEqual([]);
    expect(parseDecisions('\n\n')).toEqual([]);
  });

  // AC7: Handles non-standard formatting gracefully
  it('AC7: handles extra whitespace in table cells', () => {
    const content = `| # | Decision | Rationale | Date |
|---|----------|-----------|------|
|  1  |   Extra spaces   |   Still works   |  2026-01-01  |
`;
    const entries = parseDecisions(content);
    expect(entries.length).toBe(1);
    expect(entries[0].number).toBe(1);
    expect(entries[0].decision).toBe('Extra spaces');
    expect(entries[0].rationale).toBe('Still works');
  });

  it('AC7: skips rows with missing columns', () => {
    const content = `| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Valid entry | Has all columns | 2026-01-01 |
| bad row |
| 2 | Also valid | Four columns present | 2026-01-02 |
`;
    const entries = parseDecisions(content);
    expect(entries.length).toBe(2);
    expect(entries[0].number).toBe(1);
    expect(entries[1].number).toBe(2);
  });

  it('AC7: skips rows with non-numeric decision numbers', () => {
    const content = `| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| abc | Bad number | Rationale | 2026-01-01 |
| 1 | Good entry | Rationale | 2026-01-01 |
`;
    const entries = parseDecisions(content);
    expect(entries.length).toBe(1);
    expect(entries[0].number).toBe(1);
  });

  it('AC7: skips rows with empty decision text', () => {
    const content = `| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 |  | Empty decision | 2026-01-01 |
| 2 | Non-empty | Rationale | 2026-01-02 |
`;
    const entries = parseDecisions(content);
    expect(entries.length).toBe(1);
    expect(entries[0].number).toBe(2);
  });

  // Multiple tables across sections
  it('handles multiple tables under different section headers', () => {
    const content = readFixture('decisions-with-kills.md');
    const entries = parseDecisions(content);

    // Fixture has 3 tables with entries 1-3, 4-7, 8-9
    expect(entries.length).toBe(9);
    const numbers = entries.map(e => e.number);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  // Entry with both tags
  it('detects both [HARD KILL] and [DEFERRED] on the same entry', () => {
    const content = readFixture('decisions-with-kills.md');
    const entries = parseDecisions(content);

    const entry9 = entries.find(e => e.number === 9);
    expect(entry9).toBeDefined();
    expect(entry9!.tags).toContain('HARD KILL');
    expect(entry9!.tags).toContain('DEFERRED');
    expect(entry9!.tags.length).toBe(2);
  });

  // Parses real decisions.md format (from ~/building/decisions.md)
  it('parses real-world decisions.md with enriched rationale format', () => {
    const content = `# Decisions

## Foundational Tenets

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 8 | Abstractions must be earned | Every abstraction is a bet on future change. For v1 of any project, the default is fewer abstractions. | 2026-03-08 |
| 15 | Non-functional requirements are product requirements | **Insight:** Agents build features that work correctly but ignore performance. **Implication:** Non-functional requirements are not technical nice-to-haves. **Decision:** Every PRD includes non-functional requirements. | 2026-03-14 |
`;
    const entries = parseDecisions(content);
    expect(entries.length).toBe(2);
    expect(entries[0].number).toBe(8);
    expect(entries[1].number).toBe(15);
    expect(entries[1].rationale).toContain('**Insight:**');
    expect(entries[1].tags).toEqual([]);
  });

  // --- Test IDs from task file ---

  // SH-004: No Hard Kill entries in DECISIONS.md -- clean
  it('SH-004: returns entries with empty tags when no Hard Kill entries present', () => {
    const content = `| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Use SQLite | Simple. | 2026-01-01 |
| 2 | Use Vitest | Fast. | 2026-01-02 |
`;
    const entries = parseDecisions(content);
    expect(entries.length).toBe(2);
    const allTagsEmpty = entries.every(e => e.tags.length === 0);
    expect(allTagsEmpty).toBe(true);
  });

  // SH-005: No DECISIONS.md file -- check degrades gracefully (data layer)
  it('SH-005: returns empty array for null/undefined-like input', () => {
    // The parser receives content as string. When file is missing,
    // the caller passes empty string. Parser must not crash.
    expect(parseDecisions('')).toEqual([]);
  });

  // DH-002: No Hard Kill entries -- clean, LLM not called (data layer)
  it('DH-002: returns no HARD KILL tags when none present in file', () => {
    const content = `# Decisions

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Keep it simple | Less is more. | 2026-01-01 |
| 2 | [DEFERRED] Advanced feature | Not for v1. | 2026-01-02 |
`;
    const entries = parseDecisions(content);
    const hardKillEntries = entries.filter(e => e.tags.includes('HARD KILL'));
    expect(hardKillEntries.length).toBe(0);
    // DEFERRED is still detected
    const deferredEntries = entries.filter(e => e.tags.includes('DEFERRED'));
    expect(deferredEntries.length).toBe(1);
  });

  // Content with no tables at all
  it('returns empty array for markdown with no tables', () => {
    const content = `# Decisions

This file has no tables yet.

Just some text and headers.

## Section Two

More text.
`;
    expect(parseDecisions(content)).toEqual([]);
  });
});
