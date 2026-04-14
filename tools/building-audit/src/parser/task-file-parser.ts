// Task file parser: markdown -> ParsedTaskFile | ParseError
// Uses unified/remark-parse to parse markdown AST, then walks it.

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Root, Content, Heading, List, ListItem, Paragraph, Text, InlineCode, Code } from 'mdast';
import type {
  ParsedTaskFile,
  ParseError,
  AcceptanceCriterion,
  TestEntry,
  CompletedSection,
} from '../types/index.js';

/**
 * Parse a task file markdown string into structured data.
 * Never throws -- returns ParseError for all failure cases.
 */
export function parseTaskFile(filePath: string, content: string): ParsedTaskFile | ParseError {
  try {
    return parseTaskFileInternal(filePath, content);
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    return { file: filePath, reason: `Unexpected error: ${reason}` };
  }
}

function parseTaskFileInternal(filePath: string, content: string): ParsedTaskFile | ParseError {
  // Guard: empty file
  if (!content || content.trim().length === 0) {
    return { file: filePath, reason: 'Empty file' };
  }

  // Guard: binary content (check for null bytes)
  if (content.includes('\0')) {
    return { file: filePath, reason: 'Binary content detected' };
  }

  const tree = unified().use(remarkParse).parse(content);

  // Extract sections by heading
  const sections = extractSections(tree);

  // Parse title from first h1
  const titleNode = tree.children.find(
    (n): n is Heading => n.type === 'heading' && n.depth === 1
  );
  if (!titleNode) {
    return { file: filePath, reason: 'Missing task title (no h1 heading found)' };
  }

  const titleText = extractInlineText(titleNode);
  const titleMatch = titleText.match(/^Task\s+(\d+)\s*:\s*(.+)$/i);
  if (!titleMatch) {
    // Try fix variant title: "Task NNN: Fix — ..."
    const fixTitleMatch = titleText.match(/^Task\s+(\d+)\s*:\s*Fix\s*[—–-]\s*(.+)$/i);
    if (!fixTitleMatch) {
      return { file: filePath, reason: `Missing task number in title: "${titleText}"` };
    }
  }

  // Parse frontmatter (bold-label fields right after the title)
  const frontmatter = parseFrontmatter(tree, titleNode);

  // Variant detection per DAY-ZERO.md Section 1
  const hasTrack = frontmatter.has('Track');
  const hasReworkOf = frontmatter.has('Rework of');

  let variant: 'full' | 'fix';
  if (hasTrack) {
    variant = 'full';
  } else if (hasReworkOf) {
    variant = 'fix';
  } else {
    return { file: filePath, reason: 'Cannot determine template variant: no Track or Rework of field found' };
  }

  // Extract task number and short name from title
  const taskNumber = extractTaskNumber(titleText);
  const shortName = extractShortName(titleText);

  if (taskNumber === null) {
    return { file: filePath, reason: `Missing task number in title: "${titleText}"` };
  }

  // Parse status
  const statusRaw = (frontmatter.get('Status') ?? '').trim().toLowerCase();
  const validStatuses = ['not started', 'in progress', 'done', 'blocked'] as const;
  const status = validStatuses.includes(statusRaw as any)
    ? (statusRaw as typeof validStatuses[number])
    : 'not started';

  // Parse dependsOn
  const dependsOn = parseDependsOn(frontmatter.get('Depends on') ?? '');

  // Parse context
  const context = parseContext(tree, titleNode);

  // Parse sections
  const whatToBuild = variant === 'full' ? (getSectionContent(sections, 'What to Build', tree, content) ?? null) : null;
  const whatToFix = variant === 'fix' ? (getSectionContent(sections, 'What to Fix', tree, content) ?? null) : null;

  // Validate required sections
  if (variant === 'full' && whatToBuild === null && !sections.has('What to Build')) {
    return { file: filePath, reason: 'Missing required section: What to Build' };
  }
  if (variant === 'fix' && whatToFix === null && !sections.has('What to Fix')) {
    return { file: filePath, reason: 'Missing required section: What to Fix' };
  }

  const files = parseFilesSection(sections, tree, content);
  const contracts = getSectionRawContent(sections, 'Contracts', tree, content);
  const acceptanceCriteria = parseAcceptanceCriteria(sections, tree, content);
  const tests = parseTests(sections, tree, content);
  const deployment = getSectionContent(sections, 'Deployment', tree, content);
  const executionPlan = getSectionContent(sections, 'Execution Plan', tree, content);
  const notes = getSectionContent(sections, 'Notes', tree, content);
  const completed = parseCompletedSection(sections, tree, content);

  return {
    filePath,
    variant,
    taskNumber,
    shortName,
    track: variant === 'full' ? (frontmatter.get('Track') ?? '').trim() || null : null,
    phase: variant === 'full' ? (frontmatter.get('Phase') ?? '').trim() || null : null,
    status,
    dependsOn,
    context,
    reworkOf: variant === 'fix' ? (frontmatter.get('Rework of') ?? '').trim() || null : null,
    whatToBuild,
    whatToFix,
    files,
    contracts: contracts ?? null,
    acceptanceCriteria,
    tests,
    deployment: deployment ?? null,
    executionPlan: executionPlan ?? null,
    notes: notes ?? null,
    completed,
  };
}

// ---- Helpers ----

/**
 * Extract all text from inline content nodes (Text, InlineCode, etc.)
 */
function extractInlineText(node: Heading | Paragraph): string {
  return (node.children as Content[])
    .map((child) => {
      if (child.type === 'text') return (child as Text).value;
      if (child.type === 'inlineCode') return (child as InlineCode).value;
      if (child.type === 'strong' || child.type === 'emphasis') {
        return (child as any).children
          .map((c: any) => (c.type === 'text' ? c.value : c.type === 'inlineCode' ? c.value : ''))
          .join('');
      }
      return '';
    })
    .join('');
}

/**
 * Build a map of section name -> heading node index
 */
function extractSections(tree: Root): Map<string, number> {
  const sections = new Map<string, number>();
  for (let i = 0; i < tree.children.length; i++) {
    const node = tree.children[i];
    if (node.type === 'heading' && node.depth >= 2) {
      const text = extractInlineText(node).trim();
      sections.set(text, i);
    }
  }
  return sections;
}

/**
 * Get the index of the next heading at the same or higher level after startIdx
 */
function findSectionEnd(tree: Root, startIdx: number): number {
  const startNode = tree.children[startIdx] as Heading;
  const depth = startNode.depth;
  for (let i = startIdx + 1; i < tree.children.length; i++) {
    const node = tree.children[i];
    if (node.type === 'heading' && (node as Heading).depth <= depth) {
      return i;
    }
  }
  return tree.children.length;
}

/**
 * Get content nodes between a section heading and the next heading
 */
function getSectionNodes(sections: Map<string, number>, sectionName: string, tree: Root): Content[] {
  const idx = sections.get(sectionName);
  if (idx === undefined) return [];
  const endIdx = findSectionEnd(tree, idx);
  return tree.children.slice(idx + 1, endIdx);
}

/**
 * Get section content as trimmed text. Returns undefined if section not found.
 */
function getSectionContent(
  sections: Map<string, number>,
  sectionName: string,
  tree: Root,
  content: string
): string | undefined {
  const idx = sections.get(sectionName);
  if (idx === undefined) return undefined;
  const endIdx = findSectionEnd(tree, idx);
  const nodes = tree.children.slice(idx + 1, endIdx);
  if (nodes.length === 0) return '';

  const startPos = nodes[0].position!.start.offset!;
  const endPos = nodes[nodes.length - 1].position!.end.offset!;
  return content.slice(startPos, endPos).trim();
}

/**
 * Get raw section content preserving code blocks (for Contracts section).
 */
function getSectionRawContent(
  sections: Map<string, number>,
  sectionName: string,
  tree: Root,
  content: string
): string | undefined {
  return getSectionContent(sections, sectionName, tree, content);
}

/**
 * Parse bold-label frontmatter fields from nodes between h1 and first h2
 */
function parseFrontmatter(tree: Root, titleNode: Heading): Map<string, string> {
  const result = new Map<string, string>();
  const titleIdx = tree.children.indexOf(titleNode);

  for (let i = titleIdx + 1; i < tree.children.length; i++) {
    const node = tree.children[i];
    if (node.type === 'heading') break; // stop at next heading

    if (node.type === 'paragraph') {
      const text = nodeToRawText(node);
      // Match **Label:** value patterns
      const lines = text.split('\n');
      for (const line of lines) {
        const match = line.match(/^\*\*(.+?):\*\*\s*(.*)/);
        if (match) {
          result.set(match[1].trim(), match[2].trim());
        }
      }
    }

    if (node.type === 'list') {
      // Context defaults/task-specific are in a list
      // Don't parse list items as frontmatter
    }
  }

  return result;
}

/**
 * Get raw text from a paragraph node by reconstructing from children
 */
function nodeToRawText(node: Content): string {
  if (node.type === 'text') return (node as Text).value;
  if (node.type === 'inlineCode') return `\`${(node as InlineCode).value}\``;
  if (node.type === 'break') return '\n';
  if ('children' in node) {
    return (node as any).children.map((c: Content) => {
      if (c.type === 'text') return (c as Text).value;
      if (c.type === 'inlineCode') return `\`${(c as InlineCode).value}\``;
      if (c.type === 'break') return '\n';
      if (c.type === 'strong') {
        const inner = (c as any).children.map((cc: any) => cc.value ?? '').join('');
        return `**${inner}**`;
      }
      if (c.type === 'emphasis') {
        const inner = (c as any).children.map((cc: any) => cc.value ?? '').join('');
        return `*${inner}*`;
      }
      if (c.type === 'link') {
        const inner = (c as any).children.map((cc: any) => cc.value ?? '').join('');
        return inner;
      }
      return '';
    }).join('');
  }
  return '';
}

function extractTaskNumber(title: string): number | null {
  const match = title.match(/^Task\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

function extractShortName(title: string): string {
  // "Task 003: StreakService — Daily Habit Streaks" -> "StreakService — Daily Habit Streaks"
  // "Task 005: Fix — Broken widget" -> "Fix — Broken widget"
  const match = title.match(/^Task\s+\d+\s*:\s*(.+)$/i);
  return match ? match[1].trim() : title.trim();
}

function parseDependsOn(value: string): number[] {
  if (!value || value.trim().toLowerCase() === 'none' || value.trim() === '') {
    return [];
  }
  const numbers: number[] = [];
  // Match "Task 001", "Task 002", or just numbers
  const matches = value.matchAll(/(?:Task\s+)?(\d+)/gi);
  for (const m of matches) {
    numbers.push(parseInt(m[1], 10));
  }
  return numbers;
}

/**
 * Parse context section: defaults and task-specific lists
 */
function parseContext(tree: Root, titleNode: Heading): { defaults: string[]; taskSpecific: string[] } {
  const result: { defaults: string[]; taskSpecific: string[] } = { defaults: [], taskSpecific: [] };
  const titleIdx = tree.children.indexOf(titleNode);

  // Find the list after Context: in frontmatter area (before first h2)
  for (let i = titleIdx + 1; i < tree.children.length; i++) {
    const node = tree.children[i];
    if (node.type === 'heading') break;

    if (node.type === 'list') {
      for (const item of (node as List).children) {
        const text = listItemToText(item);
        if (text.match(/^Defaults?\s*(\(.*?\))?\s*:/i)) {
          const afterColon = text.replace(/^Defaults?\s*(\(.*?\))?\s*:\s*/i, '');
          result.defaults = splitContextItems(afterColon);
        } else if (text.match(/^Task[- ]specific\s*:/i)) {
          const afterColon = text.replace(/^Task[- ]specific\s*:\s*/i, '');
          result.taskSpecific = splitContextItems(afterColon);
        }
      }
    }
  }

  return result;
}

function splitContextItems(text: string): string[] {
  // Split on commas, but respect backtick-wrapped paths
  return text.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

function listItemToText(item: ListItem): string {
  return item.children
    .map((child) => {
      if (child.type === 'paragraph') return nodeToRawText(child);
      if (child.type === 'list') return '';
      return '';
    })
    .join(' ')
    .trim();
}

/**
 * Parse the Files section into create/modify/doNotTouch arrays
 */
function parseFilesSection(
  sections: Map<string, number>,
  tree: Root,
  content: string
): { create: string[]; modify: string[]; doNotTouch: string[] } {
  const result: { create: string[]; modify: string[]; doNotTouch: string[] } = {
    create: [],
    modify: [],
    doNotTouch: [],
  };

  const nodes = getSectionNodes(sections, 'Files', tree);
  if (nodes.length === 0) return result;

  for (const node of nodes) {
    if (node.type === 'list') {
      for (const item of (node as List).children) {
        const text = listItemToText(item);
        const subItems = getSubListItems(item);

        if (text.match(/^Create\s*:/i)) {
          const afterColon = text.replace(/^Create\s*:\s*/i, '').trim();
          if (afterColon && afterColon.toLowerCase() !== 'none') {
            result.create.push(...parseFilePaths(afterColon));
          }
          // Also grab sub-list items
          for (const sub of subItems) {
            result.create.push(...parseFilePaths(sub));
          }
        } else if (text.match(/^Modify\s*:/i)) {
          const afterColon = text.replace(/^Modify\s*:\s*/i, '').trim();
          if (afterColon && afterColon.toLowerCase() !== 'none') {
            result.modify.push(...parseFilePathsWithAnnotations(afterColon));
          }
          for (const sub of subItems) {
            result.modify.push(...parseFilePathsWithAnnotations(sub));
          }
        } else if (text.match(/^Do not touch\s*:/i)) {
          const afterColon = text.replace(/^Do not touch\s*:\s*/i, '').trim();
          if (afterColon && afterColon.toLowerCase() !== 'none') {
            result.doNotTouch.push(...parseFilePathsWithAnnotations(afterColon));
          }
          for (const sub of subItems) {
            result.doNotTouch.push(...parseFilePathsWithAnnotations(sub));
          }
        }
      }
    }
  }

  return result;
}

function getSubListItems(item: ListItem): string[] {
  const results: string[] = [];
  for (const child of item.children) {
    if (child.type === 'list') {
      for (const subItem of (child as List).children) {
        results.push(listItemToText(subItem));
      }
    }
  }
  return results;
}

/**
 * Parse file paths from text. Handles backtick-wrapped and bare paths.
 */
function parseFilePaths(text: string): string[] {
  if (!text.trim()) return [];
  // Split by commas first
  const parts = text.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  return parts.map(extractPathFromText).filter((p) => p.length > 0);
}

function parseFilePathsWithAnnotations(text: string): string[] {
  if (!text.trim()) return [];
  // For modify/do-not-touch, paths may have annotations like "(owned by Task 001)"
  const parts = text.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  return parts.map(extractPathFromText).filter((p) => p.length > 0);
}

function extractPathFromText(text: string): string {
  // Try backtick-wrapped path
  const backtickMatch = text.match(/`([^`]+)`/);
  if (backtickMatch) return backtickMatch[1];
  // Strip annotations in parentheses
  const stripped = text.replace(/\s*\(.*?\)\s*/g, '').trim();
  // If it looks like a path (contains / or .), return it
  if (stripped.match(/[./]/)) return stripped;
  // If it's just a word like "none", skip
  if (stripped.toLowerCase() === 'none') return '';
  return stripped;
}

/**
 * Parse acceptance criteria from numbered list
 */
function parseAcceptanceCriteria(
  sections: Map<string, number>,
  tree: Root,
  _content: string
): AcceptanceCriterion[] {
  const nodes = getSectionNodes(sections, 'Acceptance Criteria', tree);
  const criteria: AcceptanceCriterion[] = [];

  for (const node of nodes) {
    if (node.type === 'list') {
      let num = 1;
      for (const item of (node as List).children) {
        const text = listItemToText(item);
        if (text.trim()) {
          // Check if text starts with a number
          const numMatch = text.match(/^(\d+)\.\s*(.*)/);
          if (numMatch) {
            criteria.push({ number: parseInt(numMatch[1], 10), text: numMatch[2].trim() });
          } else {
            criteria.push({ number: num, text: text.trim() });
          }
          num++;
        }
      }
    } else if (node.type === 'paragraph') {
      // Numbered paragraphs (1. xxx\n2. yyy)
      const text = nodeToRawText(node);
      const lines = text.split('\n');
      for (const line of lines) {
        const numMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          criteria.push({ number: parseInt(numMatch[1], 10), text: numMatch[2].trim() });
        }
      }
    }
  }

  return criteria;
}

/**
 * Parse test entries from checkbox list.
 * Handles both native GFM checkboxes (item.checked) and text-based [ ]/[x] prefixes.
 */
function parseTests(
  sections: Map<string, number>,
  tree: Root,
  _content: string
): TestEntry[] {
  const nodes = getSectionNodes(sections, 'Tests', tree);
  const tests: TestEntry[] = [];

  for (const node of nodes) {
    if (node.type === 'list') {
      for (const item of (node as List).children) {
        let text = listItemToText(item);
        let checked = item.checked === true;

        // Handle text-based checkbox prefix when remark doesn't parse GFM checkboxes
        const checkboxMatch = text.match(/^\[([ xX])\]\s*(.*)/);
        if (checkboxMatch) {
          checked = checkboxMatch[1].toLowerCase() === 'x';
          text = checkboxMatch[2];
        }

        // Parse "TEST-ID: description" or "TEST-ID — description"
        const match = text.match(/^([A-Za-z]+-\d+)\s*[:\u2014\u2013-]\s*(.+)/);
        if (match) {
          tests.push({ testId: match[1], description: match[2].trim(), checked });
        } else if (text.trim()) {
          // Fallback: use text as both id and description
          tests.push({ testId: text.trim(), description: text.trim(), checked });
        }
      }
    }
  }

  return tests;
}

/**
 * Parse the Completed section with bold-label anchors
 */
function parseCompletedSection(
  sections: Map<string, number>,
  tree: Root,
  content: string
): CompletedSection | null {
  const rawContent = getSectionContent(sections, 'Completed', tree, content);
  if (rawContent === undefined) return null;
  if (!rawContent.trim()) return null;

  const text = rawContent.trim();

  // Check for bold-label anchors
  const hasAnchors = /\*\*Date:\*\*|\*\*Deviations:\*\*|\*\*Insight\/Implication:\*\*|\*\*Decisions made during this task:\*\*/.test(text);

  if (!hasAnchors) {
    // No anchors but has content: raw text, sub-fields null
    console.warn(`[parse-warning] Completed section in file has content but no bold-label anchors`);
    return {
      date: null,
      deviations: null,
      insightImplication: null,
      decisions: null,
    };
  }

  return {
    date: extractAnchorValue(text, 'Date'),
    deviations: extractAnchorValue(text, 'Deviations'),
    insightImplication: extractAnchorValue(text, 'Insight/Implication'),
    decisions: extractAnchorValue(text, 'Decisions made during this task'),
  };
}

/**
 * Extract the value after a bold-label anchor like **Label:** up to the next anchor or end
 */
function extractAnchorValue(text: string, label: string): string | null {
  const escapedLabel = label.replace(/\//g, '\\/');
  const pattern = new RegExp(`\\*\\*${escapedLabel}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*(?:Date|Deviations|Insight\\/Implication|Decisions made during this task):\\*\\*|$)`);
  const match = text.match(pattern);
  if (!match) return null;
  const value = match[1].trim();
  return value || null;
}
