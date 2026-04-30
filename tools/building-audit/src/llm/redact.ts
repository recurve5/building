import type { SecretLocation } from '../types/index.js';

/**
 * Replace known secret values in text with [REDACTED:pattern-type].
 * Also runs defense-in-depth regex patterns for common secrets
 * regardless of whether SecretLocation data is provided.
 */
export function redactSecrets(text: string, secrets: SecretLocation[]): string {
  let result = text;

  // Phase 1: Replace known secrets from Layer 1 scan
  for (const secret of secrets) {
    if (secret.maskedValue) {
      result = result.replaceAll(secret.maskedValue, `[REDACTED:${secret.patternType}]`);
    }
  }

  // Phase 2: Defense-in-depth regex scan for common secret patterns
  result = defenseInDepthRedact(result);

  return result;
}

/**
 * Defense-in-depth regex scan catches common secret patterns
 * even without SecretLocation data. Runs on all outbound LLM payloads.
 */
export function defenseInDepthRedact(text: string): string {
  let result = text;
  // AWS access key IDs
  result = result.replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED:aws-key]');
  // GitHub personal access tokens
  result = result.replace(/ghp_[A-Za-z0-9]{36}/g, '[REDACTED:github-token]');
  // Generic API keys (sk- prefix, 48+ chars)
  result = result.replace(/sk-[A-Za-z0-9]{48,}/g, '[REDACTED:api-key]');
  // AWS secret access keys (40 char base64-like after common prefixes)
  result = result.replace(/(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*[A-Za-z0-9/+=]{40}/g, '[REDACTED:aws-secret]');
  // Generic high-entropy strings that look like tokens (64+ hex chars)
  result = result.replace(/(?:token|secret|password|key)\s*[=:]\s*["']?[a-f0-9]{64,}["']?/gi, '[REDACTED:high-entropy]');
  return result;
}
