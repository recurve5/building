// Project scanner: assembles ProjectContext from all parsers and analyzers.
// Orchestrates data gathering; runs AST parsing once (Decision 15).
// Enforces milestone scoping (Decision 18) and path validation (FINDING-3).

import { readdir, readFile, stat, access } from 'fs/promises';
import { join, resolve, relative, sep } from 'path';
import { parseTaskFile } from '../parser/task-file-parser.js';
import { parseDecisions } from '../parser/decisions-parser.js';
import { getGitLog, buildFileToTaskMapping, type GitLogOptions } from './git-client.js';
import { TypeScriptAnalyzer } from '../analyzers/typescript-analyzer.js';
import type {
  ProjectContext,
  ParsedTaskFile,
  ParseError,
  TestResultFile,
} from '../types/index.js';

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const RAW_EXTENSIONS = new Set(['.md', '.json', '.yaml', '.yml', '.toml']);

interface ScanTiming {
  taskParsing: number;
  gitHistory: number;
  astAnalysis: number;
  assembly: number;
  total: number;
}

/**
 * Scan a project directory and assemble a complete ProjectContext.
 *
 * @param projectPath - Absolute path to the project root.
 * @param milestone - Optional milestone directory name (e.g., "m1-nacre-docx-ingestion").
 * @param conventionStartHash - Optional commit hash where [TASK_ID] convention was adopted (Decision 19).
 */
export async function scanProject(
  projectPath: string,
  milestone?: string,
  conventionStartHash?: string,
): Promise<ProjectContext> {
  const timings: Record<string, number> = {};
  const totalStart = performance.now();

  // 1. Validate project path
  const resolvedPath = resolve(projectPath);
  const pathStat = await stat(resolvedPath).catch(() => null);
  if (!pathStat || !pathStat.isDirectory()) {
    throw new Error(`Project path is not a directory: ${resolvedPath}`);
  }

  // 2. Validate milestone name (FINDING-3: no path separators)
  if (milestone !== undefined) {
    validateMilestoneName(milestone);
  }

  // 3. Discover and parse task files
  const taskStart = performance.now();
  const { taskFiles, parseErrors } = await discoverAndParseTasks(resolvedPath, milestone);
  timings.taskParsing = performance.now() - taskStart;

  // 4. Read git history
  const gitStart = performance.now();
  const gitLogOptions: GitLogOptions = {};
  if (conventionStartHash) {
    gitLogOptions.conventionStartHash = conventionStartHash;
  }
  if (milestone && taskFiles.length > 0) {
    gitLogOptions.milestoneTaskIds = taskFiles.map((t) => t.taskNumber);
  }
  const gitLog = await getGitLog(resolvedPath, gitLogOptions).catch((err) => {
    // Graceful: empty git log if git fails (AC 8)
    logPhase('git-history', `Failed to read git log: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  });
  timings.gitHistory = performance.now() - gitStart;

  // 5. Read DECISIONS.md
  const decisions = await readDecisions(resolvedPath, milestone);

  // 6. Discover and analyze source files
  const astStart = performance.now();
  const sourceFiles = new Map<string, import('../types/index.js').AnalyzedFile>();
  const rawFiles = new Map<string, string>();
  await discoverAndAnalyzeFiles(resolvedPath, milestone, sourceFiles, rawFiles);
  timings.astAnalysis = performance.now() - astStart;

  // 7. Assembly phase
  const assemblyStart = performance.now();

  // Build fileToTaskMapping from git commits
  const fileToTaskMapping = buildFileToTaskMapping(gitLog);

  // Read package.json history
  const packageJsonHistory = await readPackageJsonHistory(resolvedPath, gitLog);

  // Discover test result files
  const testResultFiles = await discoverTestResultFiles(resolvedPath, milestone);

  timings.assembly = performance.now() - assemblyStart;
  timings.total = performance.now() - totalStart;

  // Log timing per phase (Decision 15)
  logTiming(timings);

  return {
    projectPath: resolvedPath,
    milestone: milestone ?? null,
    taskFiles,
    parseErrors,
    gitLog,
    decisions,
    sourceFiles,
    rawFiles,
    packageJsonHistory,
    fileToTaskMapping,
    testResultFiles,
  };
}

// --- Path validation (FINDING-3) ---

function validateMilestoneName(milestone: string): void {
  if (milestone.includes(sep) || milestone.includes('/') || milestone.includes('\\')) {
    throw new Error(`Invalid milestone name: path separators not allowed ("${milestone}")`);
  }
  if (milestone.includes('..')) {
    throw new Error(`Invalid milestone name: directory traversal not allowed ("${milestone}")`);
  }
  if (milestone.trim().length === 0) {
    throw new Error('Invalid milestone name: empty string');
  }
}

function assertWithinProject(filePath: string, projectRoot: string): boolean {
  const resolved = resolve(filePath);
  const rel = relative(projectRoot, resolved);
  // Must not start with ".." (which would mean it's outside the project root)
  return !rel.startsWith('..');
}

// --- Task discovery ---

async function discoverAndParseTasks(
  projectRoot: string,
  milestone?: string,
): Promise<{ taskFiles: ParsedTaskFile[]; parseErrors: ParseError[] }> {
  const taskFiles: ParsedTaskFile[] = [];
  const parseErrors: ParseError[] = [];

  const taskDirs = await findTaskDirectories(projectRoot, milestone);

  for (const dir of taskDirs) {
    if (!assertWithinProject(dir, projectRoot)) continue;

    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      // Directory not readable — skip gracefully
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const filePath = join(dir, entry);

      try {
        const content = await readFile(filePath, 'utf-8');
        const result = parseTaskFile(filePath, content);
        if ('file' in result && 'reason' in result) {
          parseErrors.push(result as ParseError);
        } else {
          taskFiles.push(result as ParsedTaskFile);
        }
      } catch (err) {
        parseErrors.push({
          file: filePath,
          reason: `Failed to read: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  return { taskFiles, parseErrors };
}

async function findTaskDirectories(
  projectRoot: string,
  milestone?: string,
): Promise<string[]> {
  const dirs: string[] = [];

  if (milestone) {
    // Scoped to a specific milestone
    const milestoneTaskDir = join(projectRoot, milestone, 'tasks');
    if (await directoryExists(milestoneTaskDir)) {
      dirs.push(milestoneTaskDir);
    }
    return dirs;
  }

  // Check top-level tasks/ directory
  const topLevelTasks = join(projectRoot, 'tasks');
  if (await directoryExists(topLevelTasks)) {
    dirs.push(topLevelTasks);
  }

  // Check m<N>-*/tasks/ directories
  try {
    const entries = await readdir(projectRoot);
    for (const entry of entries) {
      if (/^m\d+/.test(entry)) {
        const milestoneTaskDir = join(projectRoot, entry, 'tasks');
        if (await directoryExists(milestoneTaskDir)) {
          dirs.push(milestoneTaskDir);
        }
      }
    }
  } catch {
    // Can't read project root — already validated, shouldn't happen
  }

  return dirs;
}

// --- Decisions ---

async function readDecisions(
  projectRoot: string,
  milestone?: string,
): Promise<import('../types/index.js').DecisionEntry[]> {
  // Try milestone-specific DECISIONS.md first, then project-level
  const paths = milestone
    ? [join(projectRoot, milestone, 'DECISIONS.md'), join(projectRoot, 'DECISIONS.md')]
    : [join(projectRoot, 'DECISIONS.md')];

  for (const decisionsPath of paths) {
    try {
      const content = await readFile(decisionsPath, 'utf-8');
      return parseDecisions(content);
    } catch {
      // File not found — try next or return empty
    }
  }

  return [];
}

// --- Source file discovery and analysis ---

async function discoverAndAnalyzeFiles(
  projectRoot: string,
  milestone: string | undefined,
  sourceFiles: Map<string, import('../types/index.js').AnalyzedFile>,
  rawFiles: Map<string, string>,
): Promise<void> {
  const analyzer = new TypeScriptAnalyzer();
  const scanRoot = milestone ? join(projectRoot, milestone) : projectRoot;

  // Walk the directory tree
  const files = await walkDirectory(scanRoot, projectRoot);

  for (const filePath of files) {
    const ext = getExtension(filePath);

    try {
      const content = await readFile(filePath, 'utf-8');
      const relPath = relative(projectRoot, filePath);

      if (TS_EXTENSIONS.has(ext)) {
        const analyzed = analyzer.parseFile(relPath, content);
        sourceFiles.set(relPath, analyzed);
      } else if (RAW_EXTENSIONS.has(ext)) {
        rawFiles.set(relPath, content);
      }
    } catch {
      // Skip unreadable files
    }
  }
}

async function walkDirectory(
  dir: string,
  projectRoot: string,
  results: string[] = [],
): Promise<string[]> {
  if (!assertWithinProject(dir, projectRoot)) return results;

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    // Skip common non-source directories
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'coverage') {
      continue;
    }

    const fullPath = join(dir, entry);
    const entryStat = await stat(fullPath).catch(() => null);
    if (!entryStat) continue;

    if (entryStat.isDirectory()) {
      await walkDirectory(fullPath, projectRoot, results);
    } else if (entryStat.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

// --- Package.json history ---

async function readPackageJsonHistory(
  projectRoot: string,
  gitLog: import('../types/index.js').GitCommit[],
): Promise<{ initial: string | null; current: string | null }> {
  // Current: read from disk
  let current: string | null = null;
  try {
    current = await readFile(join(projectRoot, 'package.json'), 'utf-8');
  } catch {
    // No package.json on disk
  }

  // Initial: from the earliest git commit that touched package.json
  let initial: string | null = null;
  if (gitLog.length > 0) {
    // Find earliest commit that touched package.json
    // gitLog is newest-first, so scan from the end
    for (let i = gitLog.length - 1; i >= 0; i--) {
      if (gitLog[i].filesChanged.includes('package.json')) {
        // We found the earliest commit touching package.json
        // To get the content at that commit, we'd need git show, but we
        // avoid child_process.exec. Instead, store null and note the limitation.
        // The git client uses simple-git, so we could extend it later.
        initial = null;
        break;
      }
    }
  }

  return { initial, current };
}

// --- Test result files ---

async function discoverTestResultFiles(
  projectRoot: string,
  milestone?: string,
): Promise<TestResultFile[]> {
  const results: TestResultFile[] = [];
  const searchDirs = [
    join(projectRoot, 'test-results'),
    join(projectRoot, 'coverage'),
    join(projectRoot, 'reports'),
  ];

  for (const dir of searchDirs) {
    if (!await directoryExists(dir)) continue;
    if (!assertWithinProject(dir, projectRoot)) continue;

    try {
      const entries = await readdir(dir);
      for (const entry of entries) {
        const filePath = join(dir, entry);
        if (entry.endsWith('.xml')) {
          // Potential JUnit XML
          results.push({
            filePath: relative(projectRoot, filePath),
            format: 'junit-xml',
            suites: [], // Parsing deferred to checks that consume this
          });
        } else if (entry.endsWith('.json') && (entry.includes('vitest') || entry.includes('test'))) {
          // Potential vitest JSON
          results.push({
            filePath: relative(projectRoot, filePath),
            format: 'vitest-json',
            suites: [],
          });
        }
      }
    } catch {
      // Can't read directory
    }
  }

  return results;
}

// --- Utilities ---

async function directoryExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filePath.slice(lastDot).toLowerCase();
}

function logPhase(phase: string, message: string): void {
  console.error(`[scanner:${phase}] ${message}`);
}

function logTiming(timings: Record<string, number>): void {
  const entries = Object.entries(timings).map(
    ([phase, ms]) => `${phase}: ${ms.toFixed(0)}ms`,
  );
  console.error(`[scanner:timing] ${entries.join(', ')}`);
}
