import type {
  Check,
  CheckResult,
  ProjectContext,
  LLMClient,
  SecretLocation,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const checks: Check[] = [];

/** Register a check. Checks are run in registration order within their layer. */
export function registerCheck(check: Check): void {
  checks.push(check);
}

/** Return registered checks, optionally filtered by layer. */
export function getChecks(layer?: 1 | 2): Check[] {
  if (layer === undefined) return [...checks];
  return checks.filter((c) => c.layer === layer);
}

/**
 * Clear the registry. Intended for test isolation only —
 * production code never calls this.
 */
export function clearRegistry(): void {
  checks.length = 0;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface RunChecksResult {
  results: CheckResult[];
  secretLocations: SecretLocation[];
}

/**
 * Execute all registered checks in the correct order:
 *   1. All Layer 1 checks (order not significant).
 *   2. Extract SecretLocation[] from the Resource Drain result.
 *   3. If mode is 'full', run Layer 2 checks sequentially with the LLM client.
 *      Layer 2 checks are skipped when no LLM client is provided.
 *   4. In 'mechanical' mode, Layer 2 checks are skipped.
 *
 * Per-check error handling: a throwing check produces a CheckResult with
 * status='error'. Other checks continue.
 *
 * Per-check timing: duration is logged. A warning is emitted if >10 s.
 */
export async function runChecks(
  context: ProjectContext,
  mode: 'mechanical' | 'full',
  llmClient?: LLMClient,
): Promise<RunChecksResult> {
  const results: CheckResult[] = [];
  let secretLocations: SecretLocation[] = [];

  // --- Layer 1 --------------------------------------------------------
  const layer1 = getChecks(1);
  for (const check of layer1) {
    const result = await executeCheck(check, context, undefined);
    results.push(result);
  }

  // Extract secret locations from Resource Drain result (if present).
  const resourceDrainResult = results.find((r) => r.name === 'resource-drain');
  if (resourceDrainResult && resourceDrainResult.status === 'completed') {
    secretLocations = extractSecretLocations(resourceDrainResult);
  }

  // --- Layer 2 --------------------------------------------------------
  const layer2 = getChecks(2);

  if (mode === 'mechanical') {
    // Skip all Layer 2 checks in mechanical mode.
    for (const check of layer2) {
      results.push({
        name: check.name,
        layer: 2,
        status: 'skipped',
        severity: 'clean',
        findings: [],
        errorMessage: null,
      });
    }
  } else {
    // Full mode — run Layer 2 sequentially.
    if (!llmClient) {
      // No LLM client provided: skip Layer 2 checks.
      for (const check of layer2) {
        results.push({
          name: check.name,
          layer: 2,
          status: 'skipped',
          severity: 'clean',
          findings: [],
          errorMessage: null,
        });
      }
    } else {
      for (const check of layer2) {
        const result = await executeCheck(check, context, llmClient);
        results.push(result);
      }
    }
  }

  return { results, secretLocations };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SLOW_CHECK_THRESHOLD_MS = 10_000;

/** Run a single check with error handling and timing. */
async function executeCheck(
  check: Check,
  context: ProjectContext,
  llmClient: LLMClient | undefined,
): Promise<CheckResult> {
  const start = performance.now();
  let result: CheckResult;

  try {
    result = await check.run(context, llmClient);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    result = {
      name: check.name,
      layer: check.layer,
      status: 'error',
      severity: 'clean',
      findings: [],
      errorMessage: message,
    };
  }

  const durationMs = performance.now() - start;
  const durationFormatted = (durationMs / 1000).toFixed(2);

  // Logging — intentionally uses console so it appears in stderr.
  if (durationMs > SLOW_CHECK_THRESHOLD_MS) {
    console.warn(
      `[check-runner] WARNING: ${check.name} took ${durationFormatted}s (exceeds ${SLOW_CHECK_THRESHOLD_MS / 1000}s threshold)`,
    );
  } else {
    console.log(`[check-runner] ${check.name} completed in ${durationFormatted}s`);
  }

  return result;
}

/**
 * Extract SecretLocation[] from the Resource Drain check result.
 * The check stores them in `finding.evidence.secretLocations`.
 */
function extractSecretLocations(result: CheckResult): SecretLocation[] {
  const locations: SecretLocation[] = [];
  for (const finding of result.findings) {
    if (finding.evidence && Array.isArray(finding.evidence['secretLocations'])) {
      locations.push(...(finding.evidence['secretLocations'] as SecretLocation[]));
    }
  }
  return locations;
}
