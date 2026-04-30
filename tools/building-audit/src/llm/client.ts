import Anthropic from '@anthropic-ai/sdk';
import type { LLMClient, LLMResponse, SecretLocation } from '../types/index.js';
import { redactSecrets, defenseInDepthRedact } from './redact.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_INPUT_TOKENS = 8192;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Anthropic API client implementing the LLMClient interface.
 *
 * Features:
 * - Retry with exponential backoff (3 attempts)
 * - Token usage tracking per call
 * - Evidence batching when payloads exceed per-check token limits
 * - API key sanitization in error messages
 * - Secret redaction on all outbound payloads
 */
export class AnthropicLLMClient implements LLMClient {
  private client: Anthropic;
  private model: string;
  private apiKey: string;
  private secretLocations: SecretLocation[];

  constructor(secretLocations: SecretLocation[] = []) {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY environment variable is required. Set it before running in --full mode.',
      );
    }
    this.apiKey = apiKey;
    this.model = process.env['ANTHROPIC_MODEL'] || DEFAULT_MODEL;
    this.secretLocations = secretLocations;
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Send a prompt to the Anthropic API and return the response.
   * Applies secret redaction before sending, retries on failure.
   */
  async query(prompt: string, maxInputTokens?: number): Promise<LLMResponse> {
    const limit = maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS;

    // Redact secrets from the prompt before sending
    let safePrompt = redactSecrets(prompt, this.secretLocations);
    // Defense-in-depth: run regex scan regardless
    safePrompt = defenseInDepthRedact(safePrompt);

    // Estimate token count (rough: 1 token ≈ 4 chars for English text)
    const estimatedTokens = Math.ceil(safePrompt.length / 4);

    if (estimatedTokens > limit) {
      // Batch the prompt into chunks
      return this.batchQuery(safePrompt, limit);
    }

    return this.singleQuery(safePrompt);
  }

  /**
   * Update secret locations (e.g., after Layer 1 completes).
   */
  setSecretLocations(locations: SecretLocation[]): void {
    this.secretLocations = locations;
  }

  private async singleQuery(prompt: string): Promise<LLMResponse> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        });

        const content = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n');

        return {
          content,
          usage: {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          },
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < MAX_RETRIES) {
          const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
          console.warn(
            `[llm-client] Attempt ${attempt}/${MAX_RETRIES} failed: ${this.sanitizeError(lastError.message)}. Retrying in ${backoff}ms...`,
          );
          await _sleep(backoff);
        }
      }
    }

    throw new Error(
      `LLM query failed after ${MAX_RETRIES} attempts: ${this.sanitizeError(lastError?.message ?? 'unknown error')}`,
    );
  }

  /**
   * Batch a large prompt by splitting into chunks and merging results.
   */
  private async batchQuery(prompt: string, limit: number): Promise<LLMResponse> {
    const charsPerChunk = limit * 4; // rough token-to-char estimate
    const chunks: string[] = [];

    // Split on double newlines to preserve logical sections
    const sections = prompt.split('\n\n');
    let currentChunk = '';

    for (const section of sections) {
      if (currentChunk.length + section.length + 2 > charsPerChunk && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = section;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + section;
      }
    }
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    // If we couldn't split meaningfully, fall back to single query
    if (chunks.length <= 1) {
      console.warn('[llm-client] WARNING: Evidence exceeds token limit but cannot be split. Sending as-is.');
      return this.singleQuery(prompt);
    }

    console.warn(
      `[llm-client] WARNING: Evidence exceeds ${limit} token limit. Batching into ${chunks.length} calls.`,
    );

    let totalInput = 0;
    let totalOutput = 0;
    const contents: string[] = [];

    for (const chunk of chunks) {
      const response = await this.singleQuery(chunk);
      contents.push(response.content);
      totalInput += response.usage.input;
      totalOutput += response.usage.output;
    }

    return {
      content: contents.join('\n\n---\n\n'),
      usage: { input: totalInput, output: totalOutput },
    };
  }

  /**
   * Strip API key from error messages to prevent leakage.
   */
  private sanitizeError(message: string): string {
    if (this.apiKey) {
      return message.replaceAll(this.apiKey, '[REDACTED]');
    }
    return message;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Overridable sleep for testing. */
let _sleep = defaultSleep;
export function _setSleep(fn: (ms: number) => Promise<void>): void {
  _sleep = fn;
}
export function _resetSleep(): void {
  _sleep = defaultSleep;
}
