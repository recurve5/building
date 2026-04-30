// DECISIONS.md parser: markdown table -> DecisionEntry[]
// Parses pipe-delimited tables, extracts [HARD KILL] and [DEFERRED] tags.

import type { DecisionEntry } from '../types/index.js';

/**
 * Parse a DECISIONS.md markdown string into structured DecisionEntry[].
 * Handles multiple tables (under different section headers).
 * Never throws -- returns empty array for empty/malformed input.
 */
export function parseDecisions(content: string): DecisionEntry[] {
  if (!content || content.trim().length === 0) {
    return [];
  }

  const lines = content.split('\n');
  const entries: DecisionEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip non-table lines, header rows, and separator rows
    if (!line.startsWith('|')) continue;
    if (isSeparatorRow(line)) continue;
    if (isHeaderRow(line)) continue;

    const entry = parseTableRow(line);
    if (entry !== null) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * Separator rows contain only pipes, dashes, spaces, and colons.
 * e.g., |---|----------|-----------|------|
 */
function isSeparatorRow(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line);
}

/**
 * Header rows contain the column names: #, Decision, Rationale, Date.
 * We detect by checking if the first data cell (after trimming) is "#".
 */
function isHeaderRow(line: string): boolean {
  const cells = splitTableRow(line);
  if (cells.length < 1) return false;
  return cells[0].trim() === '#';
}

/**
 * Split a pipe-delimited table row into cells.
 * Strips leading/trailing pipes and splits by |.
 */
function splitTableRow(line: string): string[] {
  // Remove leading and trailing pipes, then split
  const stripped = line.replace(/^\|/, '').replace(/\|$/, '');
  return stripped.split('|').map(cell => cell.trim());
}

/**
 * Parse a single table data row into a DecisionEntry, or null if malformed.
 */
function parseTableRow(line: string): DecisionEntry | null {
  const cells = splitTableRow(line);

  // Need at least 4 columns: #, Decision, Rationale, Date
  if (cells.length < 4) return null;

  const numberStr = cells[0].trim();
  const decision = cells[1].trim();
  const rationale = cells[2].trim();
  const date = cells[3].trim();

  // Number must be a valid integer
  const num = parseInt(numberStr, 10);
  if (isNaN(num)) return null;

  // Decision text must be non-empty
  if (decision.length === 0) return null;

  const tags = detectTags(decision, rationale);

  return {
    number: num,
    decision,
    rationale,
    date,
    tags,
  };
}

/**
 * Detect [HARD KILL] and [DEFERRED] tags in decision or rationale text.
 * Tags are bracketed markers: literal "[HARD KILL]" or "[DEFERRED]".
 */
function detectTags(decision: string, rationale: string): ('HARD KILL' | 'DEFERRED')[] {
  const combined = decision + ' ' + rationale;
  const tags: ('HARD KILL' | 'DEFERRED')[] = [];

  if (combined.includes('[HARD KILL]')) {
    tags.push('HARD KILL');
  }
  if (combined.includes('[DEFERRED]')) {
    tags.push('DEFERRED');
  }

  return tags;
}
