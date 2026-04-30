// Shared helpers for HARD KILL detection across surface-heresy (Layer 1)
// and document-heresy (Layer 2). Both checks parse decision text into
// searchable terms and need to recognize the DECISIONS.md file itself.

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'were', 'been', 'have', 'will',
  'would', 'could', 'should', 'their', 'there', 'about', 'which',
  'when', 'what', 'them', 'then', 'than', 'into', 'also', 'each',
  'other', 'some', 'hard', 'kill', 'remove', 'decision',
]);

/**
 * Extract searchable terms from a decision text.
 * Extracts: backtick identifiers, quoted strings, PascalCase/camelCase
 * words, and significant 4+ char words (excluding stop words).
 */
export function extractTerms(text: string): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();

  const add = (term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 3) return;
    if (seen.has(trimmed.toLowerCase())) return;
    seen.add(trimmed.toLowerCase());
    terms.push(trimmed);
  };

  for (const m of text.matchAll(/`([^`]+)`/g)) add(m[1]);
  for (const m of text.matchAll(/["']([^"']+)["']/g)) add(m[1]);
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g)) add(m[1]);
  for (const m of text.matchAll(/\b([a-z]+(?:[A-Z][a-z]+)+)\b/g)) add(m[1]);
  for (const m of text.matchAll(/\b([a-zA-Z]{4,})\b/g)) {
    if (!STOP_WORDS.has(m[1].toLowerCase())) add(m[1]);
  }

  return terms;
}

export function isDecisionsFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith('decisions.md') || lower.includes('/decisions.md');
}
