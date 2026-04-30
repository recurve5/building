# Task 019: LLM Client

**Track:** C
**Phase:** C1
**Status:** done
**Depends on:** Task 007, Task 015
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.3 (Layer 2 checks), Decision 3 (Anthropic API, Sonnet tier), Decision 11 (per-check token limits), XRD Q4 (model ID), XRD Section 10 (FINDING-2 -- redaction, FINDING-4 -- API key protection), DAY-ZERO.md Section 7 (LLMClient), DAY-ZERO.md Section 12 (SecretLocation)

## What to Build

The Anthropic API client wrapper and the secret redaction utility. Two modules:

**`src/llm/client.ts`** -- LLMClient implementation:
- Wraps the Anthropic Messages API.
- Validates `ANTHROPIC_API_KEY` at construction.
- Configurable model via `ANTHROPIC_MODEL` env var (default: `claude-sonnet-4-20250514`).
- Token counting for input evidence.
- Batching when evidence exceeds the per-check token limit (default 8K, max 16K).
- Retry with exponential backoff (3 attempts).
- Token usage tracking per call.
- API key sanitization in all error messages.

**`src/llm/redact.ts`** -- Secret redaction utility:
- `redactSecrets(text: string, secrets: SecretLocation[]): string` -- replaces known secret values with `[REDACTED:pattern-type]`.
- Defense-in-depth regex scan for common patterns on all outbound payloads regardless of Layer 1 results.

## Files

- Create: `tools/building-audit/src/llm/client.ts`
- Create: `tools/building-audit/src/llm/redact.ts`
- Create: `tools/building-audit/test/llm/client.test.ts`
- Create: `tools/building-audit/test/llm/redact.test.ts`
- Do not touch: `src/checks/`, `src/scanner/`

## Contracts

Implements `LLMClient` interface (DAY-ZERO.md Section 7).

**Redaction API:**
```typescript
function redactSecrets(text: string, secrets: SecretLocation[]): string
```

The client is injected into the check runner (Task 007) and passed to Layer 2 checks.

## Acceptance Criteria

1. `query()` sends a message to the Anthropic API and returns content + usage.
2. When `ANTHROPIC_API_KEY` is missing, throws a clear error at construction.
3. Retries failed API calls up to 3 times with exponential backoff.
4. After 3 failures, throws an error that the check runner catches.
5. Token usage is tracked and returned per call.
6. When evidence exceeds the per-check token limit, batches into multiple calls and merges results.
7. Logs a warning when batching occurs.
8. API key value is stripped from all error messages (replaced with `[REDACTED]`).
9. `ANTHROPIC_MODEL` env var overrides the default model.
10. `redactSecrets` replaces known secret values with `[REDACTED:pattern-type]`.
11. Defense-in-depth regex scan catches common secret patterns even without SecretLocation data.

## Tests

- [x] L2-001: API unreachable -- check marked error (client throws after retries)
- [x] L2-002: Retry with exponential backoff -- 3 attempts then error
- [x] L2-003: Token usage tracked per check
- [x] L2-004: Secret redaction in evidence payloads
- [x] CLI-016: API key not leaked in error messages
- [x] PCP-003: Evidence exceeds token limit -- batching occurs

## Notes

Depends on Task 015 (Resource Drain) because the secret redaction utility needs `SecretLocation[]` data that Resource Drain produces. The check runner coordinates this: Layer 1 runs first, then secret locations are passed to the LLM client for redaction.

The `@anthropic-ai/sdk` package should be added to `package.json` as a dependency. This is the official Anthropic SDK.

## Completed

**Date:** 2026-04-13
**Deviations:** None. The `redactSecrets` function from `json-builder.ts` was replicated in `src/llm/redact.ts` as a standalone module per the task spec, since both the report builder and the LLM client need redaction. The `_setSleep`/`_resetSleep` test hooks were added to avoid real timer delays in retry tests.
**Insight/Implication:** The Anthropic SDK's `messages.create` returns a `Message` type with a `content` array of blocks. Filtering for `TextBlock` type is required. **Implication:** Layer 2 checks should expect plain text responses from `LLMClient.query()`, not structured JSON — any structured parsing is the check's responsibility.
**Decisions made during this task:** None.
