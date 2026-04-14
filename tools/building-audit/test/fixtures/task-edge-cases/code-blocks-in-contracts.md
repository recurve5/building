# Task 040: Code Block Contracts

**Track:** A
**Phase:** A2
**Status:** not started
**Depends on:** none
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md

## What to Build

A module that has code blocks in its contracts section.

## Files

- Create: `src/example.ts`

## Contracts

The module exposes:
```typescript
## This is NOT a heading
export function process(input: string): Result {
  // ## Also not a heading
  return { value: input };
}
```

And also:
```python
# Another code block with ## inside
def helper():
    ## Not a heading either
    pass
```

After the code blocks, this text is still part of Contracts.

## Acceptance Criteria

1. Code blocks do not break section parsing.

## Tests

- [ ] CB-001: Code block handling
