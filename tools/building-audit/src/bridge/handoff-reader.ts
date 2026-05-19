import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { HandoffHeader } from './types.js';

/**
 * Read and parse the handoff-header block from a handoff.md file.
 * Returns null if the file doesn't exist, has no header block,
 * or any required field is missing/unparseable.
 */
export function readHandoffHeader(runDir: string): HandoffHeader | null {
  const filePath = join(runDir, 'handoff.md');
  if (!existsSync(filePath)) {
    return null;
  }

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  // Find the first ```handoff-header ... ``` block
  const blockStart = content.indexOf('```handoff-header');
  if (blockStart === -1) {
    return null;
  }

  // Move past the opening fence line
  const afterFence = content.indexOf('\n', blockStart);
  if (afterFence === -1) {
    return null;
  }

  const blockEnd = content.indexOf('```', afterFence + 1);
  if (blockEnd === -1) {
    return null;
  }

  const blockContent = content.slice(afterFence + 1, blockEnd);

  // Parse key-value lines
  const kvMap = new Map<string, string>();
  for (const line of blockContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      return null; // malformed line
    }
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    if (key === '' || value === '') {
      return null; // malformed line
    }
    kvMap.set(key, value);
  }

  // Extract and validate all required fields
  const runId = kvMap.get('run_id');
  const project = kvMap.get('project');
  const milestone = kvMap.get('milestone');
  const stageRaw = kvMap.get('stage');
  const stageName = kvMap.get('stage_name');
  const haltedRaw = kvMap.get('halted');
  const haltReasonRaw = kvMap.get('halt_reason');
  const completedTasksRaw = kvMap.get('completed_tasks');
  const remainingTasksRaw = kvMap.get('remaining_tasks');
  const currentTaskRaw = kvMap.get('current_task');
  const nextStep = kvMap.get('next_step');

  // All fields must be present
  if (
    runId === undefined ||
    project === undefined ||
    milestone === undefined ||
    stageRaw === undefined ||
    stageName === undefined ||
    haltedRaw === undefined ||
    haltReasonRaw === undefined ||
    completedTasksRaw === undefined ||
    remainingTasksRaw === undefined ||
    currentTaskRaw === undefined ||
    nextStep === undefined
  ) {
    return null;
  }

  // Parse numeric fields
  const currentStage = parseInt(stageRaw, 10);
  const completedTaskCount = parseInt(completedTasksRaw, 10);
  const remainingTaskCount = parseInt(remainingTasksRaw, 10);

  if (isNaN(currentStage) || isNaN(completedTaskCount) || isNaN(remainingTaskCount)) {
    return null;
  }

  const currentTaskNumber = currentTaskRaw === 'none' ? null : parseInt(currentTaskRaw, 10);
  if (currentTaskNumber !== null && isNaN(currentTaskNumber)) {
    return null;
  }

  return {
    runId,
    project,
    milestone,
    currentStage,
    currentStageName: stageName,
    halted: haltedRaw === 'true',
    haltReason: haltReasonRaw === 'none' ? null : haltReasonRaw,
    completedTaskCount,
    remainingTaskCount,
    currentTaskNumber,
    nextStep,
  };
}
