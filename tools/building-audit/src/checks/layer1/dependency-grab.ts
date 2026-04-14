import type { Check, CheckResult, Finding, ProjectContext } from '../types.js';
import { registerCheck } from '../registry.js';

// ---------------------------------------------------------------------------
// Dependency Grab Check
// ---------------------------------------------------------------------------
// Diffs package.json history to find added dependencies not justified in any
// task's Contracts section. Runtime deps = warning, devDeps = info.

interface PackageDeps {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function parseDeps(raw: string | null): PackageDeps {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as PackageDeps;
  } catch {
    return {};
  }
}

function addedKeys(
  initial: Record<string, string> | undefined,
  current: Record<string, string> | undefined,
): string[] {
  const before = new Set(Object.keys(initial ?? {}));
  const after = Object.keys(current ?? {});
  return after.filter((k) => !before.has(k));
}

function isJustified(depName: string, taskFiles: ProjectContext['taskFiles']): boolean {
  for (const task of taskFiles) {
    if (task.contracts && task.contracts.includes(depName)) {
      return true;
    }
  }
  return false;
}

const dependencyGrab: Check = {
  name: 'dependency-grab',
  layer: 1,

  async run(context: ProjectContext): Promise<CheckResult> {
    const { packageJsonHistory, taskFiles } = context;
    const initial = parseDeps(packageJsonHistory.initial);
    const current = parseDeps(packageJsonHistory.current);

    const findings: Finding[] = [];

    // Runtime dependencies
    const addedRuntime = addedKeys(initial.dependencies, current.dependencies);
    for (const dep of addedRuntime) {
      if (!isJustified(dep, taskFiles)) {
        findings.push({
          file: 'package.json',
          location: 'dependencies',
          description: `Runtime dependency "${dep}" was added but is not justified in any task's Contracts section.`,
          suggestion: `Add justification for "${dep}" in the relevant task's Contracts section, or remove the dependency.`,
          evidence: { dependency: dep, type: 'runtime', tasksChecked: taskFiles.map((t) => t.taskNumber) },
        });
      }
    }

    // Dev dependencies
    const addedDev = addedKeys(initial.devDependencies, current.devDependencies);
    for (const dep of addedDev) {
      if (!isJustified(dep, taskFiles)) {
        findings.push({
          file: 'package.json',
          location: 'devDependencies',
          description: `Dev dependency "${dep}" was added but is not justified in any task's Contracts section.`,
          suggestion: `Add justification for "${dep}" in the relevant task's Contracts section, or remove the dependency.`,
          evidence: { dependency: dep, type: 'dev', tasksChecked: taskFiles.map((t) => t.taskNumber) },
        });
      }
    }

    // Determine severity: highest among findings
    const hasRuntime = findings.some((f) => (f.evidence as Record<string, unknown>)?.['type'] === 'runtime');
    const severity = findings.length === 0 ? 'clean' : hasRuntime ? 'warning' : 'info';

    return {
      name: 'dependency-grab',
      layer: 1,
      status: 'completed',
      severity,
      findings,
      errorMessage: null,
    };
  },
};

registerCheck(dependencyGrab);

export { dependencyGrab };
