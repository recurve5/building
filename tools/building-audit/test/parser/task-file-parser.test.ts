import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTaskFile } from '../../src/parser/task-file-parser.js';
import type { ParsedTaskFile, ParseError } from '../../src/types/index.js';

function readFixture(name: string): string {
  return readFileSync(join(__dirname, '..', 'fixtures', name), 'utf-8');
}

function readEdgeCase(name: string): string {
  return readFileSync(join(__dirname, '..', 'fixtures', 'task-edge-cases', name), 'utf-8');
}

function isParsed(result: ParsedTaskFile | ParseError): result is ParsedTaskFile {
  return 'variant' in result;
}

function isError(result: ParsedTaskFile | ParseError): result is ParseError {
  return 'reason' in result;
}

describe('Task File Parser', () => {
  // PRS-001: Parse full template -- happy path (Task 003 example)
  it('PRS-001: parses the Task 003 StreakService example correctly', () => {
    const content = readFixture('task-003-streak.md');
    const result = parseTaskFile('tasks/003-streak-service.md', content);

    expect(isParsed(result)).toBe(true);
    if (!isParsed(result)) return;

    expect(result.variant).toBe('full');
    expect(result.taskNumber).toBe(3);
    expect(result.shortName).toBe('StreakService — Daily Habit Streaks');
    expect(result.track).toBe('A');
    expect(result.phase).toBe('A1');
    expect(result.status).toBe('not started');
    expect(result.dependsOn).toEqual([1, 2]);
    expect(result.context.defaults).toEqual(['project CLAUDE.md', 'DECISIONS.md', 'DAY-ZERO.md']);
    expect(result.context.taskSpecific.length).toBeGreaterThan(0);
    expect(result.reworkOf).toBeNull();

    // What to Build
    expect(result.whatToBuild).toBeTruthy();
    expect(result.whatToBuild).toContain('StreakService');
    expect(result.whatToFix).toBeNull();

    // Files
    expect(result.files.create).toContain('Sources/Services/StreakService.swift');
    expect(result.files.create).toContain('Tests/Services/StreakServiceTests.swift');
    expect(result.files.doNotTouch.length).toBeGreaterThan(0);

    // Contracts -- must preserve code blocks
    expect(result.contracts).toBeTruthy();
    expect(result.contracts).toContain('func dailyStreak');

    // Acceptance criteria -- 7 items
    expect(result.acceptanceCriteria).toHaveLength(7);
    expect(result.acceptanceCriteria[0].number).toBe(1);
    expect(result.acceptanceCriteria[0].text).toContain('streak returns 7');
    expect(result.acceptanceCriteria[6].number).toBe(7);

    // Tests -- 6 items
    expect(result.tests).toHaveLength(6);
    expect(result.tests[0].testId).toBe('ST-001');
    expect(result.tests[0].description).toContain('consecutive days');
    expect(result.tests[0].checked).toBe(false);

    // Execution Plan
    expect(result.executionPlan).toBeTruthy();

    // Notes
    expect(result.notes).toBeTruthy();
    expect(result.notes).toContain('DECISIONS.md #8');

    // Completed (not present in this fixture)
    expect(result.completed).toBeNull();
  });

  // PRS-002: Parse full template -- variant detection via Track field
  it('PRS-002: detects full template variant via Track field', () => {
    const content = readFixture('task-003-streak.md');
    const result = parseTaskFile('test.md', content);

    expect(isParsed(result)).toBe(true);
    if (!isParsed(result)) return;
    expect(result.variant).toBe('full');
    expect(result.track).toBe('A');
  });

  // PRS-003: Parse full template -- all status values
  it('PRS-003: handles all valid status values', () => {
    const statuses = ['not started', 'in progress', 'done', 'blocked'] as const;
    for (const status of statuses) {
      const content = `# Task 001: Test\n\n**Track:** A\n**Phase:** A1\n**Status:** ${status}\n**Depends on:** none\n\n## What to Build\n\nSomething.\n\n## Files\n\n- Create: \`src/test.ts\`\n\n## Acceptance Criteria\n\n1. It works.\n`;
      const result = parseTaskFile('test.md', content);
      expect(isParsed(result)).toBe(true);
      if (isParsed(result)) {
        expect(result.status).toBe(status);
      }
    }
  });

  // PRS-004: Parse full template -- Depends on with multiple tasks
  it('PRS-004: parses multiple dependencies', () => {
    const content = readEdgeCase('multiple-depends.md');
    const result = parseTaskFile('test.md', content);

    expect(isParsed(result)).toBe(true);
    if (!isParsed(result)) return;
    expect(result.dependsOn).toEqual([1, 5, 10]);
  });

  // PRS-005: Parse full template -- Depends on "none"
  it('PRS-005: parses Depends on "none" as empty array', () => {
    const content = `# Task 001: Test\n\n**Track:** A\n**Phase:** A1\n**Status:** not started\n**Depends on:** none\n\n## What to Build\n\nSomething.\n\n## Files\n\n- Create: \`src/test.ts\`\n\n## Acceptance Criteria\n\n1. It works.\n`;
    const result = parseTaskFile('test.md', content);

    expect(isParsed(result)).toBe(true);
    if (!isParsed(result)) return;
    expect(result.dependsOn).toEqual([]);
  });

  // PRS-006: Parse full template -- Completed section with sub-structure
  it('PRS-006: parses Completed section with bold-label anchors', () => {
    const content = readFixture('task-fix-example.md');
    const result = parseTaskFile('test.md', content);

    expect(isParsed(result)).toBe(true);
    if (!isParsed(result)) return;
    expect(result.completed).not.toBeNull();
    expect(result.completed!.date).toBe('2026-04-10');
    expect(result.completed!.deviations).toBe('None.');
    expect(result.completed!.insightImplication).toContain('Force-unwrapping arrays');
    expect(result.completed!.decisions).toBe('None.');
  });

  // PRS-007: Parse full template -- Completed section with no anchors
  it('PRS-007: parses Completed section without anchors (sub-fields null, warning)', () => {
    const content = readEdgeCase('completed-no-anchors.md');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = parseTaskFile('test.md', content);

    expect(isParsed(result)).toBe(true);
    if (!isParsed(result)) return;
    expect(result.completed).not.toBeNull();
    expect(result.completed!.date).toBeNull();
    expect(result.completed!.deviations).toBeNull();
    expect(result.completed!.insightImplication).toBeNull();
    expect(result.completed!.decisions).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('parse-warning'));

    warnSpy.mockRestore();
  });

  // PRS-008: Parse fix template -- happy path
  it('PRS-008: parses a fix task correctly', () => {
    const content = readFixture('task-fix-example.md');
    const result = parseTaskFile('test.md', content);

    expect(isParsed(result)).toBe(true);
    if (!isParsed(result)) return;
    expect(result.variant).toBe('fix');
    expect(result.taskNumber).toBe(12);
    expect(result.shortName).toContain('Fix');
    expect(result.reworkOf).toBe('Smoke test step 3');
    expect(result.track).toBeNull();
    expect(result.phase).toBeNull();
    expect(result.whatToBuild).toBeNull();
    expect(result.whatToFix).toBeTruthy();
    expect(result.whatToFix).toContain('widget crashes');
  });

  // PRS-009: Fix template -- variant detection via Rework of field
  it('PRS-009: detects fix template variant via Rework of field', () => {
    const content = readFixture('task-fix-example.md');
    const result = parseTaskFile('test.md', content);

    expect(isParsed(result)).toBe(true);
    if (!isParsed(result)) return;
    expect(result.variant).toBe('fix');
    expect(result.reworkOf).toBeTruthy();
  });

  // PRS-010: Missing optional sections
  it('PRS-010: handles missing optional sections (Deployment, Notes) as null', () => {
    const content = `# Task 001: Minimal\n\n**Track:** A\n**Phase:** A1\n**Status:** not started\n**Depends on:** none\n\n## What to Build\n\nSomething minimal.\n\n## Files\n\n- Create: \`src/min.ts\`\n\n## Acceptance Criteria\n\n1. It works.\n`;
    const result = parseTaskFile('test.md', content);

    expect(isParsed(result)).toBe(true);
    if (!isParsed(result)) return;
    expect(result.deployment).toBeNull();
    expect(result.notes).toBeNull();
    expect(result.contracts).toBeNull();
    expect(result.executionPlan).toBeNull();
    expect(result.completed).toBeNull();
  });

  // PRS-011: Extra whitespace and inconsistent heading levels
  it('PRS-011: handles extra whitespace and inconsistent heading levels', () => {
    const content = readEdgeCase('extra-whitespace.md');
    const result = parseTaskFile('test.md', content);

    expect(isParsed(result)).toBe(true);
    if (!isParsed(result)) return;
    expect(result.taskNumber).toBe(50);
    expect(result.track).toBe('B');
    expect(result.status).toBe('in progress');
    expect(result.dependsOn).toEqual([]);
  });

  // PRS-012: Inline code in section headers
  it('PRS-012: handles inline code in title', () => {
    const content = readEdgeCase('inline-code-heading.md');
    const result = parseTaskFile('test.md', content);

    expect(isParsed(result)).toBe(true);
    if (!isParsed(result)) return;
    expect(result.taskNumber).toBe(130);
    expect(result.shortName).toContain('code');
  });

  // PRS-013: Frontmatter fields with no value
  it('PRS-013: handles empty frontmatter values', () => {
    const content = readEdgeCase('empty-frontmatter-values.md');
    const result = parseTaskFile('test.md', content);

    expect(isParsed(result)).toBe(true);
    if (!isParsed(result)) return;
    expect(result.track).toBeNull();
    expect(result.phase).toBeNull();
    expect(result.dependsOn).toEqual([]);
  });

  // PRS-014: Code blocks inside Contracts containing markdown syntax
  it('PRS-014: code blocks inside Contracts do not create false section headers', () => {
    const content = readEdgeCase('code-blocks-in-contracts.md');
    const result = parseTaskFile('test.md', content);

    expect(isParsed(result)).toBe(true);
    if (!isParsed(result)) return;
    expect(result.contracts).toBeTruthy();
    expect(result.contracts).toContain('## This is NOT a heading');
    expect(result.contracts).toContain('After the code blocks');

    // Acceptance Criteria should still be parsed (not swallowed into Contracts)
    expect(result.acceptanceCriteria).toHaveLength(1);
  });

  // PRS-015: Files section -- both inline and multi-line formats
  it('PRS-015: parses both inline and multi-line Files section formats', () => {
    const content = readEdgeCase('multiline-files.md');
    const result = parseTaskFile('test.md', content);

    expect(isParsed(result)).toBe(true);
    if (!isParsed(result)) return;
    expect(result.files.create).toContain('src/parser/main.ts');
    expect(result.files.create).toContain('src/parser/helpers.ts');
    expect(result.files.create).toContain('src/parser/types.ts');
    expect(result.files.modify).toHaveLength(2);
    expect(result.files.doNotTouch).toContain('src/config.ts');
  });

  // PRS-016: Acceptance criteria numbering
  it('PRS-016: preserves acceptance criteria numbering', () => {
    const content = readFixture('task-003-streak.md');
    const result = parseTaskFile('test.md', content);

    expect(isParsed(result)).toBe(true);
    if (!isParsed(result)) return;
    for (let i = 0; i < result.acceptanceCriteria.length; i++) {
      expect(result.acceptanceCriteria[i].number).toBe(i + 1);
    }
  });

  // PRS-017: Tests section with checked items
  it('PRS-017: parses checked and unchecked test items', () => {
    const content = readEdgeCase('checked-tests.md');
    const result = parseTaskFile('test.md', content);

    expect(isParsed(result)).toBe(true);
    if (!isParsed(result)) return;
    expect(result.tests).toHaveLength(3);
    expect(result.tests[0].testId).toBe('CT-001');
    expect(result.tests[0].checked).toBe(true);
    expect(result.tests[1].testId).toBe('CT-002');
    expect(result.tests[1].checked).toBe(false);
    expect(result.tests[2].testId).toBe('CT-003');
    expect(result.tests[2].checked).toBe(true);
  });

  // PRS-018: Completely invalid file -- not markdown
  it('PRS-018: returns ParseError for binary content', () => {
    const binaryContent = 'Some text\0with null\0bytes';
    const result = parseTaskFile('test.bin', binaryContent);

    expect(isError(result)).toBe(true);
    if (!isError(result)) return;
    expect(result.reason).toContain('Binary content');
  });

  // PRS-019: Missing required section -- What to Build
  it('PRS-019: returns ParseError for missing What to Build section', () => {
    const content = `# Task 001: Missing Section\n\n**Track:** A\n**Phase:** A1\n**Status:** not started\n**Depends on:** none\n\n## Files\n\n- Create: \`src/test.ts\`\n`;
    const result = parseTaskFile('test.md', content);

    expect(isError(result)).toBe(true);
    if (!isError(result)) return;
    expect(result.reason).toContain('What to Build');
  });

  // PRS-020: File matching neither template variant
  it('PRS-020: returns ParseError for file with neither Track nor Rework of', () => {
    const content = readEdgeCase('no-variant.md');
    const result = parseTaskFile('test.md', content);

    expect(isError(result)).toBe(true);
    if (!isError(result)) return;
    expect(result.reason).toContain('variant');
  });

  // PRS-021: Missing task number in title
  it('PRS-021: returns ParseError for missing task number in title', () => {
    const content = readEdgeCase('missing-task-number.md');
    const result = parseTaskFile('test.md', content);

    expect(isError(result)).toBe(true);
    if (!isError(result)) return;
    expect(result.reason).toContain('Missing task number');
  });

  // PRS-022: Empty file
  it('PRS-022: returns ParseError for empty file', () => {
    const result = parseTaskFile('empty.md', '');
    expect(isError(result)).toBe(true);
    if (!isError(result)) return;
    expect(result.reason).toContain('Empty file');

    const result2 = parseTaskFile('whitespace.md', '   \n  \n  ');
    expect(isError(result2)).toBe(true);
    if (!isError(result2)) return;
    expect(result2.reason).toContain('Empty file');
  });
});
