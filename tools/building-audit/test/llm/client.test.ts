import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicLLMClient, _setSleep, _resetSleep } from '../../src/llm/client.js';

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});


describe('AnthropicLLMClient', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env['ANTHROPIC_API_KEY'] = 'test-api-key-12345';
    vi.clearAllMocks();
    // Use instant sleep in tests to avoid real delays
    _setSleep(async () => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    _resetSleep();
  });

  describe('constructor', () => {
    it('throws when ANTHROPIC_API_KEY is missing', () => {
      delete process.env['ANTHROPIC_API_KEY'];
      expect(() => new AnthropicLLMClient()).toThrow('ANTHROPIC_API_KEY environment variable is required');
    });

    it('constructs successfully with API key present', () => {
      expect(() => new AnthropicLLMClient()).not.toThrow();
    });
  });

  describe('query', () => {
    it('returns content and usage from a successful API call (L2-003)', async () => {
      const client = new AnthropicLLMClient();
      const mockCreate = (client as any).client.messages.create;
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'The code looks fine.' }],
        usage: { input_tokens: 100, output_tokens: 25 },
      });

      const result = await client.query('Analyze this code');
      expect(result.content).toBe('The code looks fine.');
      expect(result.usage).toEqual({ input: 100, output: 25 });
    });

    it('retries on failure with exponential backoff (L2-002)', async () => {
      const client = new AnthropicLLMClient();
      const mockCreate = (client as any).client.messages.create;

      mockCreate
        .mockRejectedValueOnce(new Error('rate limit'))
        .mockRejectedValueOnce(new Error('rate limit'))
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Success on third try.' }],
          usage: { input_tokens: 50, output_tokens: 10 },
        });

      const result = await client.query('Test prompt');
      expect(result.content).toBe('Success on third try.');
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('throws after 3 failed attempts (L2-001)', async () => {
      const client = new AnthropicLLMClient();
      const mockCreate = (client as any).client.messages.create;

      mockCreate
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockRejectedValueOnce(new Error('fail 3'));

      await expect(client.query('Test prompt')).rejects.toThrow(
        'LLM query failed after 3 attempts',
      );
    });

    it('tracks token usage per call (L2-003)', async () => {
      const client = new AnthropicLLMClient();
      const mockCreate = (client as any).client.messages.create;

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response 1' }],
        usage: { input_tokens: 200, output_tokens: 50 },
      });

      const result = await client.query('Prompt 1');
      expect(result.usage.input).toBe(200);
      expect(result.usage.output).toBe(50);
    });
  });

  describe('secret redaction (L2-004)', () => {
    it('redacts known secrets from prompts before sending', async () => {
      const client = new AnthropicLLMClient([
        {
          filePath: 'config.ts',
          line: 1,
          endLine: 1,
          patternType: 'aws-key',
          maskedValue: 'AKIA...WXYZ',
        },
      ]);
      const mockCreate = (client as any).client.messages.create;
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'OK' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await client.query('Check this key: AKIA...WXYZ');

      const sentPrompt = mockCreate.mock.calls[0][0].messages[0].content;
      expect(sentPrompt).not.toContain('AKIA...WXYZ');
      expect(sentPrompt).toContain('[REDACTED:aws-key]');
    });

    it('applies defense-in-depth regex on outbound payloads', async () => {
      const client = new AnthropicLLMClient();
      const mockCreate = (client as any).client.messages.create;
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'OK' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await client.query('Found key: AKIAIOSFODNN7EXAMPLE in code');

      const sentPrompt = mockCreate.mock.calls[0][0].messages[0].content;
      expect(sentPrompt).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(sentPrompt).toContain('[REDACTED:aws-key]');
    });
  });

  describe('API key protection (CLI-016)', () => {
    it('strips API key from error messages', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-very-secret-key-value';
      const client = new AnthropicLLMClient();
      const mockCreate = (client as any).client.messages.create;

      mockCreate.mockRejectedValue(
        new Error('Invalid key: sk-ant-very-secret-key-value'),
      );

      try {
        await client.query('test');
      } catch (e: any) {
        expect(e.message).not.toContain('sk-ant-very-secret-key-value');
        expect(e.message).toContain('[REDACTED]');
      }
    });
  });

  describe('batching (PCP-003)', () => {
    it('batches when evidence exceeds token limit', async () => {
      const client = new AnthropicLLMClient();
      const mockCreate = (client as any).client.messages.create;

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Batch result' }],
        usage: { input_tokens: 50, output_tokens: 10 },
      });

      // Create a prompt that exceeds 100 token limit (100 * 4 = 400 chars)
      // Use sections separated by double newlines
      const sections = Array.from({ length: 10 }, (_, i) =>
        `Section ${i}: ${'x'.repeat(100)}`,
      );
      const largePrompt = sections.join('\n\n');

      const result = await client.query(largePrompt, 100);

      // Should have been split into multiple calls
      expect(mockCreate.mock.calls.length).toBeGreaterThan(1);
      expect(result.usage.input).toBeGreaterThan(0);
      expect(result.usage.output).toBeGreaterThan(0);
      expect(result.content).toContain('Batch result');
    });

    it('merges token usage across batches', async () => {
      const client = new AnthropicLLMClient();
      const mockCreate = (client as any).client.messages.create;

      let callCount = 0;
      mockCreate.mockImplementation(async () => {
        callCount++;
        return {
          content: [{ type: 'text', text: `Part ${callCount}` }],
          usage: { input_tokens: 100, output_tokens: 25 },
        };
      });

      const sections = Array.from({ length: 10 }, (_, i) =>
        `Section ${i}: ${'x'.repeat(100)}`,
      );
      const largePrompt = sections.join('\n\n');

      const result = await client.query(largePrompt, 100);

      const numCalls = mockCreate.mock.calls.length;
      expect(result.usage.input).toBe(numCalls * 100);
      expect(result.usage.output).toBe(numCalls * 25);
    });
  });

  describe('model configuration', () => {
    it('uses ANTHROPIC_MODEL env var when set', () => {
      process.env['ANTHROPIC_MODEL'] = 'claude-haiku-4-5-20251001';
      const client = new AnthropicLLMClient();
      expect((client as any).model).toBe('claude-haiku-4-5-20251001');
    });

    it('defaults to claude-sonnet-4-20250514', () => {
      delete process.env['ANTHROPIC_MODEL'];
      const client = new AnthropicLLMClient();
      expect((client as any).model).toBe('claude-sonnet-4-20250514');
    });
  });
});
