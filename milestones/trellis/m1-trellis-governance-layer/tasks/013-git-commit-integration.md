# Task 013: Git Commit Integration

**Track:** B
**Phase:** B2 (state management — git layer)
**Status:** not started
**Depends on:** 003, 004
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: PRD Section 3.5 (Git Commit Strategy), XRD Section 4 (Quality Bar Trace — gate commit), D0-1 (state.json)

## What to Build

TypeScript utilities for Trellis-specific git operations. These are used by the orchestrator skill (Task 008) to commit state at boundaries.

Implement in `tools/trellis/src/git.ts`:

1. **`commitStageComplete(runDir: string, stage: number, stageName: string, milestoneDir: string): string`** — Commit state.json + stage artifacts. Returns commit hash. Message format: `[trellis] Stage N complete: <stage name>`.

2. **`commitHalt(runDir: string, reason: string): string`** — Commit state.json + halt context. Message format: `[trellis] Run halted: <reason>`.

3. **`commitOverride(runDir: string, stage: number, overrideFile: string): string`** — Commit override file + updated state.json. Returns commit hash (the revert target). Message format: `[trellis] Override: stage <N> — <short reason>`.

4. **`commitRunStart(runDir: string, runId: string): string`** — Commit initial state. Message format: `[trellis] Run started: <run-id>`.

5. **`commitMorningAfter(runDir: string): string`** — Commit morning-after.md. Message format: `[trellis] Morning-after: <run-id>`.

### Files Included in Commits

| Commit Type | Files |
|------------|-------|
| Stage complete | `.building/runs/<id>/state.json`, `.building/runs/<id>/events/*` (new events), milestone artifacts produced in that stage |
| Halt | `.building/runs/<id>/state.json`, `.building/runs/<id>/events/*`, `.building/runs/<id>/detections/*` (if detection-triggered halt) |
| Override | `.building/runs/<id>/overrides/<file>`, `.building/runs/<id>/state.json` |
| Run start | `.building/runs/<id>/state.json`, `.building/runs/<id>/events/001-run_started.json` |
| Morning-after | `.building/runs/<id>/morning-after.md`, `.building/runs/<id>/confidence/*` |

## Files

- Create: `tools/trellis/src/git.ts`
- Create: `tools/trellis/test/git.test.ts`
- Modify: `tools/trellis/src/index.ts` (add exports)
- Do not touch: `tools/building-audit/`

## Contracts

### commitStageComplete

```typescript
async function commitStageComplete(
  runDir: string,
  stage: number,
  stageName: string,
  milestoneDir: string
): Promise<string>  // returns commit hash
```

All commit functions use `simple-git` (already a dependency of building-audit, add to trellis package.json) or shell out to `git` via child_process. They:
- Stage only the specified files (not `git add .`).
- Create the commit with the formatted message.
- Return the commit hash.
- Throw if the commit fails.

## Acceptance Criteria

1. Stage-complete commit includes state.json and relevant events (STATE-016).
2. Halt commit includes state.json and detection records (STATE-017).
3. Override commit includes override file and state.json (STATE-018).
4. Commit messages match the documented format.
5. Only specified files are included in each commit (no stray files).
6. Each commit function returns the commit hash.
7. Post-milestone outputs (performance review, SDM reassessment) are included in the appropriate stage-complete commit if they exist (POST-001, POST-004).

## Tests

- [ ] STATE-016: Git commit on stage completion
- [ ] STATE-017: Git commit on halt
- [ ] STATE-018: Override produces dedicated commit
- [ ] Commit messages match format
- [ ] Only specified files are staged
- [ ] POST-001: Performance findings committed but don't block
- [ ] POST-002/003: Security findings in appropriate commit

## Notes

Tests run in temporary git repos. Each test:
1. Creates a temp directory and initializes a git repo.
2. Creates the necessary file structure.
3. Calls the commit function.
4. Asserts on `git log` output and `git show` for file contents.

The simple-git library is preferred over raw child_process for testability, but either approach is acceptable. If using child_process, wrap in an async function that captures stdout/stderr.

Override commits are particularly important: they are the revert target if the user judges the override was wrong. Each override must have its own identifiable commit so `git revert <hash>` targets exactly the override and its state change.
