import { describe, it, expect } from 'vitest';
import { redactSecrets, defenseInDepthRedact } from '../../src/llm/redact.js';
import type { SecretLocation } from '../../src/types/index.js';

describe('redactSecrets', () => {
  it('replaces known secret masked values with [REDACTED:type]', () => {
    const secrets: SecretLocation[] = [
      {
        filePath: 'config.ts',
        line: 10,
        endLine: 10,
        patternType: 'aws-key',
        maskedValue: 'AKIA...WXYZ',
      },
    ];
    const text = 'Found key: AKIA...WXYZ in the config';
    const result = redactSecrets(text, secrets);
    expect(result).toBe('Found key: [REDACTED:aws-key] in the config');
  });

  it('handles multiple secrets in the same text', () => {
    const secrets: SecretLocation[] = [
      { filePath: 'a.ts', line: 1, endLine: 1, patternType: 'aws-key', maskedValue: 'AKIA...WXYZ' },
      { filePath: 'b.ts', line: 5, endLine: 5, patternType: 'github-token', maskedValue: 'ghp_...abcd' },
    ];
    const text = 'Keys: AKIA...WXYZ and ghp_...abcd found';
    const result = redactSecrets(text, secrets);
    expect(result).toBe('Keys: [REDACTED:aws-key] and [REDACTED:github-token] found');
  });

  it('returns text unchanged when no secrets match', () => {
    const text = 'No secrets here';
    const result = redactSecrets(text, []);
    expect(result).toBe('No secrets here');
  });

  it('applies defense-in-depth regex after secret replacement', () => {
    const text = 'Key: AKIAIOSFODNN7EXAMPLE';
    const result = redactSecrets(text, []);
    expect(result).toBe('Key: [REDACTED:aws-key]');
  });
});

describe('defenseInDepthRedact', () => {
  it('redacts AWS access key IDs', () => {
    const text = 'aws key: AKIAIOSFODNN7EXAMPLE';
    expect(defenseInDepthRedact(text)).toBe('aws key: [REDACTED:aws-key]');
  });

  it('redacts GitHub personal access tokens', () => {
    const text = 'token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
    expect(defenseInDepthRedact(text)).toBe('token: [REDACTED:github-token]');
  });

  it('redacts sk- API keys (48+ chars)', () => {
    const key = 'sk-' + 'a'.repeat(48);
    const text = `api_key: ${key}`;
    expect(defenseInDepthRedact(text)).toBe('api_key: [REDACTED:api-key]');
  });

  it('redacts AWS secret access key assignments', () => {
    const text = 'aws_secret_access_key = ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd';
    expect(defenseInDepthRedact(text)).toBe('[REDACTED:aws-secret]');
  });

  it('redacts high-entropy token assignments', () => {
    const hex64 = 'a'.repeat(64);
    const text = `token = "${hex64}"`;
    expect(defenseInDepthRedact(text)).toBe('[REDACTED:high-entropy]');
  });

  it('does not redact short or non-matching strings', () => {
    const text = 'normal variable = 42';
    expect(defenseInDepthRedact(text)).toBe('normal variable = 42');
  });
});
