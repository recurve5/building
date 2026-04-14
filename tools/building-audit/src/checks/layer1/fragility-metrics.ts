import type { Check, CheckResult, Finding, ProjectContext } from '../types.js';
import { registerCheck } from '../registry.js';

// ---------------------------------------------------------------------------
// Fragility Metrics Check
// ---------------------------------------------------------------------------
// File length, function length, modification coupling, TODO density,
// test setup ratio.

const TODO_PATTERN = /\b(TODO|HACK|FIXME)\b/gi;

// Thresholds
const FILE_LENGTH_INFO = 300;
const FILE_LENGTH_WARNING = 500;
const FUNCTION_LENGTH_INFO = 50;
const FUNCTION_LENGTH_WARNING = 100;
const COUPLING_WARNING = 5;
const TODO_DENSITY_WARNING = 5; // per 100 lines
const TEST_SETUP_RATIO_WARNING = 0.8;

const fragilityMetrics: Check = {
  name: 'fragility-metrics',
  layer: 1,

  async run(context: ProjectContext): Promise<CheckResult> {
    const { sourceFiles, rawFiles, fileToTaskMapping } = context;
    const findings: Finding[] = [];

    for (const [filePath, analyzed] of sourceFiles) {
      // File length
      if (analyzed.lineCount >= FILE_LENGTH_WARNING) {
        findings.push({
          file: filePath,
          location: 'entire file',
          description: `File is ${analyzed.lineCount} lines (threshold: ${FILE_LENGTH_WARNING}).`,
          suggestion: `Consider splitting this file into smaller modules.`,
          evidence: { metric: 'file-length', value: analyzed.lineCount, threshold: FILE_LENGTH_WARNING, severity: 'warning' },
        });
      } else if (analyzed.lineCount >= FILE_LENGTH_INFO) {
        findings.push({
          file: filePath,
          location: 'entire file',
          description: `File is ${analyzed.lineCount} lines (threshold: ${FILE_LENGTH_INFO}).`,
          suggestion: `Monitor file growth. Consider splitting if complexity increases.`,
          evidence: { metric: 'file-length', value: analyzed.lineCount, threshold: FILE_LENGTH_INFO, severity: 'info' },
        });
      }

      // Function length
      const allFunctions = [
        ...analyzed.functions,
        ...analyzed.classes.flatMap((c) => c.methods),
      ];
      for (const fn of allFunctions) {
        const length = fn.endLine - fn.startLine;
        if (length >= FUNCTION_LENGTH_WARNING) {
          findings.push({
            file: filePath,
            location: `lines ${fn.startLine}-${fn.endLine}`,
            description: `Function "${fn.name}" is ${length} lines (threshold: ${FUNCTION_LENGTH_WARNING}).`,
            suggestion: `Extract sub-functions to reduce complexity.`,
            evidence: { metric: 'function-length', functionName: fn.name, value: length, threshold: FUNCTION_LENGTH_WARNING, severity: 'warning' },
          });
        } else if (length >= FUNCTION_LENGTH_INFO) {
          findings.push({
            file: filePath,
            location: `lines ${fn.startLine}-${fn.endLine}`,
            description: `Function "${fn.name}" is ${length} lines (threshold: ${FUNCTION_LENGTH_INFO}).`,
            suggestion: `Monitor function growth.`,
            evidence: { metric: 'function-length', functionName: fn.name, value: length, threshold: FUNCTION_LENGTH_INFO, severity: 'info' },
          });
        }
      }

      // Modification coupling
      const taskIds = fileToTaskMapping.get(filePath);
      if (taskIds && taskIds.length >= COUPLING_WARNING) {
        findings.push({
          file: filePath,
          location: 'entire file',
          description: `File was modified by ${taskIds.length} tasks (threshold: ${COUPLING_WARNING}).`,
          suggestion: `High modification coupling suggests this file has too many responsibilities. Consider splitting.`,
          evidence: { metric: 'modification-coupling', value: taskIds.length, threshold: COUPLING_WARNING, taskIds },
        });
      }

      // Test setup ratio (test files only)
      if (analyzed.testFunctions.length > 0) {
        let totalAssertionLines = 0;
        let totalTestLines = 0;
        for (const tf of analyzed.testFunctions) {
          const testLength = tf.endLine - tf.startLine;
          totalTestLines += testLength;
          totalAssertionLines += tf.assertions.length;
        }
        if (totalTestLines > 0) {
          const setupRatio = 1 - (totalAssertionLines / totalTestLines);
          if (setupRatio >= TEST_SETUP_RATIO_WARNING) {
            findings.push({
              file: filePath,
              location: 'test file',
              description: `Test file has ${Math.round(setupRatio * 100)}% setup-to-assertion ratio (threshold: ${Math.round(TEST_SETUP_RATIO_WARNING * 100)}%).`,
              suggestion: `High setup ratio suggests tests are testing implementation details or need shared fixtures.`,
              evidence: { metric: 'test-setup-ratio', value: setupRatio, threshold: TEST_SETUP_RATIO_WARNING, totalTestLines, totalAssertionLines },
            });
          }
        }
      }
    }

    // TODO/HACK/FIXME density from raw files (source + md)
    for (const [filePath, content] of rawFiles) {
      const lines = content.split('\n');
      const lineCount = lines.length;
      if (lineCount === 0) continue;

      const matches = content.match(TODO_PATTERN);
      const todoCount = matches ? matches.length : 0;
      const density = (todoCount / lineCount) * 100;

      if (density >= TODO_DENSITY_WARNING) {
        findings.push({
          file: filePath,
          location: 'entire file',
          description: `TODO/HACK/FIXME density is ${density.toFixed(1)} per 100 lines (threshold: ${TODO_DENSITY_WARNING}).`,
          suggestion: `Resolve or file tasks for outstanding TODOs.`,
          evidence: { metric: 'todo-density', value: density, threshold: TODO_DENSITY_WARNING, todoCount, lineCount },
        });
      }
    }

    // Also scan sourceFiles content via rawFiles for TODOs
    for (const [filePath, analyzed] of sourceFiles) {
      if (rawFiles.has(filePath)) continue; // already scanned
      // sourceFiles may not have raw content, skip if not available
    }

    // Determine severity: highest among findings
    let severity: CheckResult['severity'] = 'clean';
    if (findings.length > 0) {
      const hasWarning = findings.some(
        (f) => (f.evidence as Record<string, unknown>)?.['severity'] === 'warning' ||
               (f.evidence as Record<string, unknown>)?.['metric'] === 'modification-coupling' ||
               (f.evidence as Record<string, unknown>)?.['metric'] === 'todo-density' ||
               (f.evidence as Record<string, unknown>)?.['metric'] === 'test-setup-ratio',
      );
      severity = hasWarning ? 'warning' : 'info';
    }

    return {
      name: 'fragility-metrics',
      layer: 1,
      status: 'completed',
      severity,
      findings,
      errorMessage: null,
    };
  },
};

registerCheck(fragilityMetrics);

export { fragilityMetrics };
