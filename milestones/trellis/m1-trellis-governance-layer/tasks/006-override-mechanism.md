# Task 006: Override Mechanism

**Track:** A
**Phase:** A1 (gate scripts — override extension)
**Status:** not started
**Depends on:** 005
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-5 (Gate Check Result Format, Override Handling section), PRD Section 2.4 (Override Mechanism), Decision 29 (Reversible Boldness)

## What to Build

Add override handling to the gate check scripts and implement the override file writing utility. When a gate fails, an override can bypass it if:
1. An override file exists at `.building/runs/<run-id>/overrides/<stage>-<timestamp>.md`
2. The stage number is in state.json's `overrides[]` array

Both conditions must be met. The override is recorded, not hidden — the gate result JSON includes the original failures even when overridden.

### Components

1. **Override check logic in `.building/hooks/lib/common.sh`** — A shared function that gate scripts call after their checks fail. Looks for override file + flag.

2. **TypeScript override utility in `tools/trellis/src/override.ts`** — Functions for writing override files and updating state.json's overrides array.

3. **Update all 11 gate scripts** to call the override check when their primary checks fail.

## Files

- Create: `tools/trellis/src/override.ts`
- Create: `tools/trellis/test/override.test.ts`
- Modify: `.building/hooks/lib/common.sh` (add override check function)
- Modify: `.building/hooks/gates/gate-0-to-1.sh` through `gate-10-to-done.sh` (add override call)
- Modify: `tools/trellis/src/index.ts` (add exports)
- Do not touch: `tools/building-audit/`

## Contracts

### Override File Format

```markdown
# Override: Stage <N>

**Timestamp:** <ISO 8601>
**Gate:** <gate-name>
**Overridden by:** <"orchestrator" or "user">

## What Failed

<list of failed gate checks>

## Justification

<why the override is justified>

## Risk Accepted

<one sentence describing the risk>
```

### TypeScript API

```typescript
function writeOverride(
  runDir: string,
  stage: number,
  gateName: string,
  failures: string[],
  justification: string,
  risk: string,
  overriddenBy: "orchestrator" | "user"
): string  // returns override filename

function addOverrideToState(
  runDir: string,
  stage: number
): void  // reads state, adds stage to overrides[], writes state
```

### Bash Override Check

```bash
# In common.sh
check_override() {
  local stage="$1"
  local run_dir="$2"
  # Returns 0 if valid override exists (file + flag), 1 otherwise
}
```

## Acceptance Criteria

1. A gate that fails normally passes when a valid override exists (GATE-028).
2. A gate fails when override flag is set but no override file exists (GATE-029).
3. A gate fails when override file exists but flag is not set in state.json (GATE-030).
4. The gate result JSON includes original failures even when overridden (passed: true, but checks[] shows the failures).
5. Override files are written in the correct format with all required fields.
6. `addOverrideToState` correctly updates the overrides array without corrupting other state.

## Tests

- [ ] GATE-028: Override allows a failing gate to pass
- [ ] GATE-029: Override fails with file missing but flag set
- [ ] GATE-030: Override fails with file present but flag not set
- [ ] Override file contains all required sections
- [ ] addOverrideToState preserves existing state while adding override

## Notes

Per Decision 29 (Reversible Boldness), the orchestrator-LLM is permitted to self-override. The override is committed to git immediately after writing, creating a revert point. The `overriddenBy` field distinguishes orchestrator overrides (autonomous) from user overrides (via `/build --override`).

The override check in gate scripts is the LAST thing that runs. The gate performs all its normal checks, collects all failures, and only then checks for an override. This ensures the gate result always contains the full picture of what failed, regardless of whether the override bypasses it.
