# Task 016: Stress Tests

**Track:** G (Integration + Smoke)
**Phase:** 4 (Integration)
**Status:** not started
**Depends on:** 006, 013
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: Test plan Section 4 (Stress Tests), PRD NFR-1 (install speed), NFR-2 (invocation overhead)

## What to Build

Performance and resilience tests that verify the system behaves correctly under load and at scale.

### STRESS-001: State Snapshot Performance

- **Target:** State snapshots (copy state.json to state.json.stage-N) must not add significant latency to stage transitions.
- **Method:** Create a realistic state.json (~10KB). Call snapshotState() 100 times with different stage numbers. Measure per-invocation wall-clock time.
- **Pass:** p95 latency under 5ms.
- **Fail:** p95 exceeds 5ms.

### STRESS-002: Install Idempotency Under Rapid Re-Runs

- **Target:** PRD FR-1 idempotency guarantee.
- **Method:** Run install 10 times in rapid succession. After each, verify skill file is correct and no hook entries exist in settings.json.
- **Pass:** After 10 runs, correct skill file, no Building hooks in settings.json, no corruption.
- **Fail:** Corrupted skill file, unexpected hooks in settings.json, or missing skill file.

### STRESS-003: Large State Directory Handling (100 Projects)

- **Target:** System scales with many projects.
- **Method:** Create 100 project state directories, each with a run. Bootstrap a 101st. Run gate-check for one project.
- **Pass:** Bootstrap under 1 second. Gate-check unaffected by other projects' existence.
- **Fail:** Latency scales with total project count.

### STRESS-004: Gate Script Invocation Latency

- **Target:** Skill-invoked gate checks should complete quickly.
- **Method:** With active run, invoke gate-check.sh 500 times with env vars set (simulating skill's Bash tool call). Measure per-invocation time.
- **Pass:** p95 under 50ms.
- **Fail:** p95 exceeds 50ms.

## Files

- Create: `tools/trellis/test/stress.test.ts`
- Do not touch: any source files

## Contracts

### Measurement Approach

For latency tests, use `performance.now()` or `Date.now()` around `child_process.execSync` calls. Record all measurements, compute p95 from the sorted array.

```typescript
const times: number[] = [];
for (let i = 0; i < 100; i++) {
  const start = performance.now();
  execSync(`BUILDING_HOME=${buildingHome} PROJECT_DIR=${projectDir} PROJECT_STATE=${projectState} bash ${gateScript}`, {
    env: { ...env },
    cwd: projectDir,
  });
  times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
const p95 = times[Math.floor(times.length * 0.95)];
expect(p95).toBeLessThan(50);
```

### Environment Isolation

All stress tests use temp directories. The 100-project test creates 100 state directories under a temp `~/.building/projects/`.

## Acceptance Criteria

1. STRESS-001 passes: state snapshot p95 under 5ms.
2. STRESS-002 passes: 10 rapid installs produce clean result (correct skill file, no hooks).
3. STRESS-003 passes: 100 projects do not affect single-project operations.
4. STRESS-004 passes: gate script invocation p95 under 50ms.

## Tests

- STRESS-001: State Snapshot Performance
- STRESS-002: Install Idempotency Under Rapid Re-Runs
- STRESS-003: Large State Directory Handling (100 Projects)
- STRESS-004: Gate Script Invocation Latency

## Notes

STRESS-001 is P1 and validates that state snapshots do not add meaningful latency to stage transitions. Since snapshots are simple file copies, this should pass easily.

STRESS-002 is P1 but catches subtle bugs in the install script (race conditions, partial writes). With hooks removed, the install is simpler — just a skill file write.

STRESS-003 is P2 and validates that bootstrap and gate checks for one project are unaffected by the existence of many other projects.

STRESS-004 is P1 and validates gate-check.sh invocation latency when called by the skill via Bash tool.

The stress tests may be slow to run (invocations of bash scripts). Consider marking them with a vitest tag so they can be run separately from the unit test suite.
