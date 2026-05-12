# Task 005: Gate Check Scripts

**Track:** A
**Phase:** A1 (standalone gate scripts)
**Status:** not started
**Depends on:** 003
**Context:**
- Defaults: project CLAUDE.md, DECISIONS.md, DAY-ZERO.md
- Task-specific: D0-5 (Gate Check Result Format), D0-8 (Bash Conventions), D0-9 (building-audit Integration Contract), PRD Section 2.2 (Gate Definitions), `orchestrator.md` (pipeline stages)

## What to Build

Standalone bash gate check scripts — one per stage transition. Each script checks whether the conditions for advancing from stage N to stage N+1 are met by inspecting the milestone directory and run state. Scripts are testable in isolation with fixture directories; no hook wiring yet.

Also build the shared utility library (`.building/hooks/lib/common.sh`) and the building-audit integration test.

### Gate Scripts to Implement

| Script | Gate | Checks |
|--------|------|--------|
| `gate-0-to-1.sh` | Stage 0->1 | Milestone list exists. Human confirmation event recorded. |
| `gate-1-to-2.sh` | Stage 1->2 | Brief file exists with >50 words. |
| `gate-2-to-3.sh` | Stage 2->3 | PRD exists with required sections. DECISIONS.md present. No unresolved Tier 3 in OPEN-ITEMS.md. |
| `gate-3-to-4.sh` | Stage 3->4 | XRD exists. Security review exists. No Critical/High findings unresolved. |
| `gate-4-to-5.sh` | Stage 4->5 | Every XRD pushback item has a DECISIONS.md resolution. |
| `gate-5-to-6.sh` | Stage 5->6 | Peer review exists. No unresolved high-severity issues. |
| `gate-6-to-7.sh` | Stage 6->7 | Test plan exists. Feature coverage present. Stress test section present. |
| `gate-7-to-8.sh` | Stage 7->8 | SDM review exists (or SDM stage skipped for greenfield). |
| `gate-8-to-9.sh` | Stage 8->9 | DAY-ZERO.md exists. Task files exist. |
| `gate-9-to-10.sh` | Stage 9->10 | All tasks complete. Security code review exists, no Critical/High findings. Invokes building-audit --mechanical. |
| `gate-10-to-done.sh` | Stage 10->done | Smoke test report exists with all steps passing. |

### Shared Library

`.building/hooks/lib/common.sh` provides:
- `check()` function (from D0-8 template)
- `output_result()` function (emits GateResult JSON)
- `read_state()` helper (calls node utility to parse state.json)
- `milestone_dir()` helper (derives milestone directory from state)
- `check_file_exists()` helper
- `count_words()` helper

## Files

- Create: `.building/hooks/lib/common.sh`
- Create: `.building/hooks/gates/gate-0-to-1.sh` through `gate-10-to-done.sh` (11 files)
- Create: `tools/trellis/test/gates.test.ts` (integration tests invoking bash scripts)
- Create: `tools/trellis/test/fixtures/` directory with per-gate test fixtures
- Create: `tools/trellis/test/audit-integration.test.ts` (building-audit output format test)
- Modify: `tools/trellis/src/index.ts` (export any helper functions used by gate tests)
- Do not touch: `tools/building-audit/`

## Contracts

Each gate script:
- Receives two arguments: `$1` = run directory path, `$2` = milestone directory path
- Outputs GateResult JSON to stdout (D0-5 format)
- Exits 0 on pass, non-zero on fail
- Writes human-readable failure messages to stderr

The common.sh library is sourced by each gate script:
```bash
source "$(dirname "$0")/../lib/common.sh"
```

## Acceptance Criteria

1. Each of the 11 gate scripts passes when its conditions are met (GATE-001, 004, 007, 010, 013, 015, 017, 019, 020, 021, 023, 026).
2. Each gate script fails with a descriptive message when conditions are not met (GATE-002, 003, 005, 006, 008, 009, 011, 012, 014, 016, 018, 022, 024, 025, 027).
3. Gate 9->10 invokes building-audit and parses its JSON output.
4. The building-audit integration test verifies the output format matches D0-9.
5. All gate scripts output valid GateResult JSON to stdout.
6. All gate scripts use `set -euo pipefail`.
7. Test fixtures cover both pass and fail cases for every gate.

## Tests

- [ ] GATE-001: Stage 0->1 passes with milestone list and confirmation
- [ ] GATE-002: Stage 0->1 fails without milestone list
- [ ] GATE-003: Stage 0->1 fails without human confirmation
- [ ] GATE-004: Stage 1->2 passes with >50 word brief
- [ ] GATE-005: Stage 1->2 fails with <=50 word brief
- [ ] GATE-006: Stage 1->2 fails with missing brief
- [ ] GATE-007: Stage 2->3 passes with complete PRD
- [ ] GATE-008: Stage 2->3 fails with missing PRD section
- [ ] GATE-009: Stage 2->3 fails with unresolved Tier 3
- [ ] GATE-010: Stage 3->4 passes with XRD and clean security review
- [ ] GATE-011: Stage 3->4 fails without XRD
- [ ] GATE-012: Stage 3->4 fails with unresolved Critical finding
- [ ] GATE-013: Stage 4->5 passes with all pushback resolved
- [ ] GATE-014: Stage 4->5 fails with unresolved pushback
- [ ] GATE-015: Stage 5->6 passes with clean peer review
- [ ] GATE-016: Stage 5->6 fails with unresolved high-severity issue
- [ ] GATE-017: Stage 6->7 passes with complete test plan
- [ ] GATE-018: Stage 6->7 fails without stress test section
- [ ] GATE-019: Stage 7->8 passes with SDM review
- [ ] GATE-020: Stage 7->8 passes when SDM skipped
- [ ] GATE-021: Stage 8->9 passes with DAY-ZERO and tasks
- [ ] GATE-022: Stage 8->9 fails without DAY-ZERO
- [ ] GATE-023: Stage 9->10 passes with all tasks complete and clean security
- [ ] GATE-024: Stage 9->10 fails with incomplete task
- [ ] GATE-025: Stage 9->10 fails with unresolved High security finding
- [ ] GATE-026: Stage 10->done passes with passing smoke test
- [ ] GATE-027: Stage 10->done fails with failing smoke test step
- [ ] building-audit output format matches D0-9 contract

## Notes

Gate scripts are invoked by the test harness using `child_process.execSync` from TypeScript. The tests create fixture directories matching the expected milestone structure, invoke the gate script, and assert on exit code + stdout JSON + stderr messages.

For the PRD section check (gate-2-to-3), the required sections are: Overview, Gate Enforcement, State Persistence, Morning-After Summary, Bootstrap and Handoff, Decisions Log. Use simple `grep` for section header presence — this is a sanity check, not a content quality check.

For the security review finding check (gates 3->4 and 9->10), parse the markdown for severity markers. Convention: findings are listed under headings containing "Critical", "High", "Medium", or "Low", with resolution status ("Resolved", "Unresolved", "Open").

Gate 9->10 is the most complex. It checks three things independently: all tasks complete (from state.json), security code review clean (from milestone directory), and building-audit mechanical pass (subprocess invocation). If building-audit is not installed, the check should fail with a message telling the user to run bootstrap.
