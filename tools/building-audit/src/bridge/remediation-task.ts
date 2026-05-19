// Remediation task file generator.
// DAY-ZERO contract 2.8. Creates fix-variant task files from audit findings.

import { readdir, mkdir, writeFile } from 'fs/promises';
import { join, basename, extname } from 'path';
import type { RemediationTaskSpec } from './types.js';

/**
 * Generate a fix-variant task file from a classified audit finding.
 *
 * Reads existing task files in `<milestonePath>/tasks/` to determine the
 * next sequential number. Writes the task file and returns its number and path.
 */
export async function generateRemediationTask(
  milestonePath: string,
  spec: RemediationTaskSpec,
): Promise<{ taskNumber: number; filePath: string }> {
  const tasksDir = join(milestonePath, 'tasks');

  // Ensure tasks/ directory exists
  await mkdir(tasksDir, { recursive: true });

  // Determine next sequential number
  const taskNumber = await getNextTaskNumber(tasksDir);

  // Build filename
  const fileName = buildFileName(taskNumber, spec.checkName, spec.finding.file);
  const filePath = join(tasksDir, fileName);

  // Render and write the task file
  const content = renderTaskFile(taskNumber, spec);
  await writeFile(filePath, content, 'utf-8');

  return { taskNumber, filePath };
}

/**
 * Scan the tasks directory for existing task files and return the next number.
 * If no tasks exist, returns 1.
 */
async function getNextTaskNumber(tasksDir: string): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(tasksDir);
  } catch {
    // Directory doesn't exist yet (will be created by caller)
    return 1;
  }

  let maxNumber = 0;
  for (const entry of entries) {
    const match = entry.match(/^(\d+)-/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNumber) {
        maxNumber = num;
      }
    }
  }

  return maxNumber + 1;
}

/**
 * Build the task file name.
 * Format: `<NNN>-fix-<checkName>-<context>.md`
 * Context is the finding's file basename without extension, truncated to 30 chars.
 */
function buildFileName(
  taskNumber: number,
  checkName: string,
  findingFile: string,
): string {
  const paddedNum = String(taskNumber).padStart(3, '0');
  const context = basename(findingFile, extname(findingFile))
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);

  return `${paddedNum}-fix-${checkName}-${context}.md`;
}

/**
 * Render the fix-variant task file markdown.
 * Must round-trip through parseTaskFile successfully.
 */
function renderTaskFile(taskNumber: number, spec: RemediationTaskSpec): string {
  const paddedNum = String(taskNumber).padStart(3, '0');
  const paddedOrigin = String(spec.originatingTaskNumber).padStart(3, '0');
  const shortDesc = buildShortDescription(spec);

  const lines: string[] = [
    `# Task ${paddedNum}: Fix — ${shortDesc}`,
    '',
    `**Rework of:** ${paddedOrigin}`,
    `**Status:** not started`,
    `**Context:**`,
    `- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md`,
    `- Task-specific: audit finding from ${spec.checkName} check`,
    '',
    `## What to Fix`,
    '',
    `The ${spec.checkName} check (severity: ${spec.severity}) found an issue in \`${spec.finding.file}\` at ${spec.finding.location}.`,
    '',
    `**Problem:** ${spec.finding.description}`,
    '',
    `**Suggested fix:** ${spec.finding.suggestion}`,
    '',
    `## Files`,
    '',
    `- Modify: \`${spec.finding.file}\``,
    '',
    `## Acceptance Criteria`,
    '',
    `1. The specific issue identified by the ${spec.checkName} check in \`${spec.finding.file}\` is resolved.`,
    `2. All acceptance criteria from the originating task (${paddedOrigin}) still pass.`,
    '',
    `## Audit Finding`,
    '',
    `**Check:** ${spec.checkName}`,
    `**Severity:** ${spec.severity}`,
    `**File:** \`${spec.finding.file}\``,
    `**Location:** ${spec.finding.location}`,
    `**Description:** ${spec.finding.description}`,
    `**Suggestion:** ${spec.finding.suggestion}`,
    '',
  ];

  return lines.join('\n');
}

/**
 * Build a short description for the task title from the finding.
 */
function buildShortDescription(spec: RemediationTaskSpec): string {
  // Use check name and file context for a concise title
  const fileContext = basename(spec.finding.file, extname(spec.finding.file));
  return `${spec.checkName} in ${fileContext}`;
}
