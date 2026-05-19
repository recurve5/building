import { writeFileSync, renameSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import type { HandoffPayload } from './types.js';
import { HANDOFF_HEADER_KEYS } from './types.js';

const MAX_CHARS = 15_000;
const TRUNCATED_COMPLETED_COUNT = 10;

function renderHeader(payload: HandoffPayload): string {
  const lines = [
    '```handoff-header',
    `run_id: ${payload.runId}`,
    `project: ${payload.project}`,
    `milestone: ${payload.milestone}`,
    `stage: ${payload.stage}`,
    `stage_name: ${payload.stageName}`,
    `halted: ${payload.halted}`,
    `halt_reason: ${payload.haltReason ?? 'none'}`,
    `completed_tasks: ${payload.completedTasks.length}`,
    `remaining_tasks: ${payload.remainingTasks.length}`,
    `current_task: ${payload.currentTask?.number ?? 'none'}`,
    `next_step: ${payload.nextStep}`,
    '```',
  ];
  return lines.join('\n');
}

function renderTaskList(tasks: HandoffPayload['completedTasks']): string {
  if (tasks.length === 0) return '_None_';
  return tasks
    .map((t, i) => `${i + 1}. Task ${t.number} — ${t.shortName} (${t.status})`)
    .join('\n');
}

function renderBody(payload: HandoffPayload, truncate: boolean): string {
  const sections: string[] = [];

  // 1. Run Identity
  sections.push(
    `## 1. Run Identity\n\n` +
    `- **Run ID:** ${payload.runId}\n` +
    `- **Project:** ${payload.project}\n` +
    `- **Milestone:** ${payload.milestone}\n` +
    `- **Project Dir:** ${payload.projectDir}\n` +
    `- **State Dir:** ${payload.stateDir}`,
  );

  // 2. Pipeline Position
  sections.push(
    `## 2. Pipeline Position\n\n` +
    `- **Stage:** ${payload.stage} — ${payload.stageName}\n` +
    `- **Halted:** ${payload.halted}` +
    (payload.halted && payload.haltReason ? ` (${payload.haltReason})` : '') + '\n' +
    `- **Overrides:** ${payload.stageOverrides.length > 0 ? payload.stageOverrides.map(o => `Stage ${o.stage}: ${o.reason}`).join('; ') : 'none'}`,
  );

  // 3. Task Progress
  {
    let completedTasks = payload.completedTasks;
    let truncationNote = '';
    if (truncate && completedTasks.length > TRUNCATED_COMPLETED_COUNT) {
      const omitted = completedTasks.length - TRUNCATED_COMPLETED_COUNT;
      completedTasks = completedTasks.slice(-TRUNCATED_COMPLETED_COUNT);
      truncationNote = `\n\n_${omitted} earlier completed tasks omitted for brevity._\n`;
    }

    const currentStr = payload.currentTask
      ? `Task ${payload.currentTask.number} — ${payload.currentTask.shortName} (${payload.currentTask.status})`
      : '_None_';

    const remediationStr = payload.remediationTasks.length > 0
      ? payload.remediationTasks
          .map((t, i) => `${i + 1}. Task ${t.number} — ${t.shortName} (${t.status}, from task ${t.originatingTask})`)
          .join('\n')
      : '_None_';

    sections.push(
      `## 3. Task Progress\n\n` +
      `### Completed Tasks\n\n` +
      renderTaskList(completedTasks) +
      truncationNote + '\n\n' +
      `### Current Task\n\n` +
      currentStr + '\n\n' +
      `### Remaining Tasks\n\n` +
      renderTaskList(payload.remainingTasks) + '\n\n' +
      `### Remediation Tasks\n\n` +
      remediationStr,
    );
  }

  // 4. Decisions Made This Session
  {
    const decisionsStr = payload.decisions.length > 0
      ? payload.decisions
          .map((d, i) => `${i + 1}. **${d.decision}** — ${d.rationale}`)
          .join('\n')
      : '_None_';
    sections.push(`## 4. Decisions Made This Session\n\n${decisionsStr}`);
  }

  // 5. Open Items
  {
    const itemsStr = payload.openItems.length > 0
      ? payload.openItems
          .map(item => `- ${item.description} — ${item.context}`)
          .join('\n')
      : '_None_';
    sections.push(`## 5. Open Items\n\n${itemsStr}`);
  }

  // 6. Audit Summary
  {
    let auditStr: string;
    if (payload.auditSummary) {
      const s = payload.auditSummary;
      const l1Detail = s.l1Findings.length > 0
        ? s.l1Findings.map(f => `  - Task ${f.taskId}: ${f.check} → ${f.action} (${f.filePath})`).join('\n')
        : '  _None_';
      const l2Detail = s.l2Findings.length > 0
        ? s.l2Findings.map(f => `  - ${f.check} → ${f.action}`).join('\n')
        : '  _None_';
      auditStr =
        `- **L1 Findings** (${s.l1Findings.length}):\n${l1Detail}\n` +
        `- **L2 Findings** (${s.l2Findings.length}):\n${l2Detail}\n` +
        `- **Detection Files:** ${s.detectionFiles.length > 0 ? s.detectionFiles.join(', ') : 'none'}`;
    } else {
      auditStr = '_No audit run this session._';
    }
    sections.push(`## 6. Audit Summary\n\n${auditStr}`);
  }

  // 7. Git Checkpoints
  {
    const checkpointsStr = payload.gitCheckpoints.length > 0
      ? payload.gitCheckpoints.map(c => `- ${c.type}: ${c.ref}`).join('\n')
      : '_None_';
    sections.push(`## 7. Git Checkpoints\n\n${checkpointsStr}`);
  }

  // 8. Artifact Paths
  {
    const artifactsStr = payload.artifactPaths.length > 0
      ? payload.artifactPaths.map(p => `- ${p}`).join('\n')
      : '_None_';
    sections.push(`## 8. Artifact Paths\n\n${artifactsStr}`);
  }

  // 9. Next Step
  sections.push(`## 9. Next Step\n\n**${payload.nextStep}**`);

  return sections.join('\n\n');
}

export function renderHandoff(payload: HandoffPayload): string {
  const header = renderHeader(payload);
  const body = renderBody(payload, false);
  const full = `${header}\n\n${body}`;

  if (full.length <= MAX_CHARS) {
    return full;
  }

  // Re-render with truncation
  const truncatedBody = renderBody(payload, true);
  return `${header}\n\n${truncatedBody}`;
}

export function writeHandoff(runDir: string, payload: HandoffPayload): void {
  const content = renderHandoff(payload);
  const tmpPath = join(runDir, 'handoff.md.tmp');
  const finalPath = join(runDir, 'handoff.md');
  const continuePath = join(runDir, 'continue');

  writeFileSync(tmpPath, content, 'utf-8');
  renameSync(tmpPath, finalPath);
  writeFileSync(continuePath, '/build --resume', 'utf-8');
}

export function removeContinueFile(runDir: string): void {
  const continuePath = join(runDir, 'continue');
  if (existsSync(continuePath)) {
    unlinkSync(continuePath);
  }
}
