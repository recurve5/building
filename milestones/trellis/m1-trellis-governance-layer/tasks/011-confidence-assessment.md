# Task 011: Confidence Assessment

**Track:** C
**Phase:** C2 (confidence)
**Status:** not started
**Depends on:** 003, 004
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-6 (Confidence Schema), PRD Section 4.4 (Confidence Assessment)

## What to Build

A TypeScript module that reads gate results, detection records, and override files to classify each artifact's confidence as Verified or Partial. Writes per-artifact confidence JSON files to `.building/runs/<run-id>/confidence/`.

Implement in `tools/trellis/src/confidence.ts`:

1. **`assessConfidence(runDir: string): ConfidenceAssessment[]`** — Evaluate all artifacts and return their confidence levels.

2. **`writeConfidenceFiles(runDir: string, assessments: ConfidenceAssessment[]): void`** — Write individual JSON files per artifact.

3. **`classifyArtifact(artifact: string, events: TrellisEvent[], overrides: string[], detections: string[]): ConfidenceAssessment`** — Classify a single artifact.

### Artifact-to-Stage Mapping

| Artifact | Relevant Stages | Verified When | Partial When |
|----------|----------------|---------------|-------------|
| prd | 2 | Gate 2->3 passed, no overrides, no detections | Override at stage 2, or detection during stage 2 |
| xrd | 3 | Gate 3->4 passed, no overrides, no detections | Override at stage 3 |
| test-plan | 6 | Gate 6->7 passed cleanly | Override at stage 6 |
| build | 9 | Gate 9->10 passed, no failure-mode detections during build | Any detection during stage 9 (even if fixed) |
| security | 3, 9.5 | Both security reviews clean | Any Critical/High found (even if resolved) |

## Files

- Create: `tools/trellis/src/confidence.ts`
- Create: `tools/trellis/test/confidence.test.ts`
- Create: `tools/trellis/test/fixtures/mixed-confidence/` (fixture with clean PRD but partial build)
- Modify: `tools/trellis/src/index.ts` (add exports)
- Do not touch: `tools/building-audit/`

## Contracts

### assessConfidence

```typescript
function assessConfidence(runDir: string): ConfidenceAssessment[]
// Reads: state.json, events/, overrides/, detections/
// Returns: one assessment per artifact
```

### ConfidenceAssessment (from D0-6)

```typescript
interface ConfidenceAssessment {
  artifact: string;
  level: "verified" | "partial";
  reasons: string[];
}
```

## Acceptance Criteria

1. Per-artifact confidence levels are independent (MAFTER-005).
2. An override in a stage marks that artifact as Partial (MAFTER-006).
3. A detection during an artifact's production marks it as Partial even if fixed (MAFTER-007).
4. Clean pass with no overrides or detections produces Verified.
5. Confidence files are written as valid JSON matching the ConfidenceAssessment schema.
6. A run with mixed confidence (clean PRD, partial build) produces different levels for different artifacts.

## Tests

- [ ] MAFTER-005: Confidence is per-artifact, not per-run
- [ ] MAFTER-006: Override produces Partial
- [ ] MAFTER-007: Detection (even if fixed) produces Partial
- [ ] All-clean run produces all Verified
- [ ] Mixed run produces appropriate mix

## Notes

The confidence assessment is invoked by the orchestrator at run completion or halt, before morning-after generation. The morning-after reads the confidence files from disk.

The binary nature (Verified/Partial) is intentional — Decision 5 in the PRD. Don't add nuance here. The user either trusts the artifact fully or needs to look closer.

This task references quality bar examples: the acceptance criteria for MAFTER-005 through MAFTER-007 are directly traced from the test plan, which traces from the PRD. This is the task that closes the quality bar loop for the reporting track.
