# DAY-ZERO: Trellis M1 — Governance Layer

Every task in this milestone reads this file before starting. It defines the shared interfaces, schemas, conventions, and verified assumptions that cross-task dependencies rely on.

---

## D0-1: state.json Schema

The single source of truth for a Trellis run. Lives at `.building/runs/<run-id>/state.json`.

```typescript
interface TrellisState {
  /** Format: YYYYMMDDTHHMMZ-<7-char-hex> */
  run_id: string;

  /** Project name, lowercase with hyphens */
  project: string;

  /**
   * Exact filesystem directory name of the current milestone.
   * Must match the m<N>-<project>-<goal> directory name so building-audit's
   * --milestone flag works correctly.
   */
  milestone: string;

  /** SHA-256 hex digest of the brief file content */
  brief_hash: string;

  /** Current pipeline stage (0-11). The stage the run is currently in or was last working on. */
  current_stage: number;

  /** Per-stage status records */
  stages: Record<string, StageRecord>;

  /** Per-task status records. Keys are zero-padded task numbers ("001", "002", etc.) */
  tasks: Record<string, TaskRecord>;

  /** Whether the run is halted */
  halted: boolean;

  /** Human-readable halt reason, null when not halted */
  halt_reason: string | null;

  /** Stage numbers that were overridden (as strings: "3", "5") */
  overrides: string[];

  /** Detection record filenames (without path) */
  detections: string[];

  /** Schema version for forward compatibility */
  version: 1;
}

interface StageRecord {
  status: "not_started" | "in_progress" | "complete" | "skipped";
  started: string | null;    // ISO 8601 timestamp
  completed: string | null;  // ISO 8601 timestamp
  gate_passed: boolean;
}

interface TaskRecord {
  status: "not_started" | "in_progress" | "complete" | "blocked";
  attempts: number;
}
```

### Valid State Transitions

```
INIT -> current_stage: 0, stages["0"].status: "in_progress"

STAGE_ACTIVE -> GATE_CHECKING:
  Triggered by writing current_stage to N+1 (hook intercepts).

GATE_PASS:
  stages[N].status: "complete", stages[N].gate_passed: true,
  stages[N+1].status: "in_progress", current_stage: N+1

GATE_FAIL:
  Write is blocked. No state change.

OVERRIDE:
  Override file written + stage number added to overrides[].
  Re-write triggers gate which sees override and passes.

HALT:
  halted: true, halt_reason: "...", current_stage unchanged.

RESUME (from halted):
  halted: false, halt_reason: null.
  Only valid via user action (/build --resume).

COMPLETE:
  Final stage gate passes. No further transitions.
```

### Invalid Transitions (hook rejects)

- Skipping a stage (current_stage jumps by more than 1)
- Going backward without explicit rollback
- Advancing from halted state without resuming first
- Setting both halted: true and a "complete" final stage

### Milestone Field Convention

The `milestone` field must be the exact directory name (e.g., `"m1-trellis-governance-layer"`), not a display name or abbreviation. This is required for building-audit's `--milestone` flag compatibility (SDM Constraint 3).

---

## D0-2: Event Schema

Events are individual numbered JSON files in `.building/runs/<run-id>/events/`. Filename format: `NNN-<event-type>.json` where NNN is zero-padded to 3 digits (or more if >999 events).

```typescript
interface TrellisEvent {
  /** ISO 8601 UTC timestamp */
  timestamp: string;

  /** Event type identifier */
  event: EventType;

  /** Pipeline stage this event relates to (null for run-level events) */
  stage: number | null;

  /** Task number this event relates to (null for stage-level events) */
  task: string | null;

  /** Event-specific payload */
  data: Record<string, unknown>;
}

type EventType =
  | "run_started"
  | "stage_started"
  | "stage_complete"
  | "gate_passed"
  | "gate_failed"
  | "gate_overridden"
  | "task_started"
  | "task_complete"
  | "task_failed"
  | "detection_fired"
  | "halt"
  | "resume"
  | "morning_after_generated"
  | "context_exhaustion";
```

### Event Data Payloads

```typescript
// gate_passed / gate_failed
{ gate_name: string; checks_run: string[]; failures?: string[]; duration_ms: number }

// task_complete
{ task_id: string; artifacts_produced: string[] }

// detection_fired
{ detection_name: string; failure_mode: string; severity: "tier2" | "tier3"; task_id: string }

// halt
{ halt_reason: string; recoverable: boolean }

// stage_complete
{ artifacts_produced: string[]; duration_minutes: number }
```

### Numbering Convention

- List existing files in events/ directory
- New event number = max existing number + 1
- If directory is empty, start at 001
- If a gap exists (e.g., 001, 002, 004), next is max+1 (005), not the gap filler

---

## D0-3: Hook Interface Contract

All Trellis hooks are Claude Code `PreToolUse` hooks on the `Write` tool, configured in `.claude/settings.local.json`.

### Input

The hook script receives the tool call as JSON on stdin. Full schema (verified by spike):

```json
{
  "cwd": "/path/to/project",
  "hook_event_name": "PreToolUse",
  "permission_mode": "default",
  "session_id": "abc123",
  "tool_input": {
    "content": "proposed file content",
    "file_path": "/absolute/path/to/file"
  },
  "tool_name": "Write",
  "tool_use_id": "toolu_xyz",
  "transcript_path": "/path/to/transcript.jsonl"
}
```

### Output (VERIFIED — exit 2 is the only blocking code)

- **Exit code 0:** Allow the write to proceed.
- **Exit code 2:** Block the write. The agent receives stderr as the failure message. The file is NOT modified on disk.
- **Exit code 1, 3+:** Non-blocking error. Stderr is logged but the **write proceeds**. Do NOT use exit 1 to block gates.

All gate check logic must use `exit 2` to deny a write.

### Environment

- **Working directory:** Project root (where `.claude/` lives).
- **Shell:** bash (invoked via the hook runner, not the user's shell).
- **Available tools:** bash builtins, coreutils (cat, grep, wc, sed, awk, find, test, sort, head, tail, tr, cut, dirname, basename, mktemp, mv), jq, git, node.
- **Timeout:** 30 seconds per hook invocation. Exceeding this is treated as non-zero exit.
- **Stderr:** Used for failure messages. Keep under 500 characters for readability in the agent's context.

### Fast Path

Every hook script must check the file path first. If the path does not match the hook's target pattern, exit 0 immediately. This ensures non-relevant writes are not slowed down.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Read tool input from stdin
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path')

# Fast path: only care about state.json in run directories
if [[ ! "$FILE_PATH" =~ \.building/runs/[^/]+/state\.json$ ]]; then
  exit 0
fi

# ... gate check logic ...
```

### settings.local.json Hook Entry Format

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash .building/hooks/gate-check.sh"
          }
        ]
      },
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash .building/hooks/detection-check.sh"
          }
        ]
      }
    ]
  }
}
```

**Note:** Hooks go in `.claude/settings.local.json`, not `.claude/settings.json`. This is a public OSS repo; settings.json is committed and would affect all users (SDM Constraint 6).

---

## D0-4: Detection Record Format

Detection records live at `.building/runs/<run-id>/detections/`. Filename: `<task-id>-<failure-mode>.md`.

```markdown
# Detection: <failure-mode-name>

**Task:** <task-id> — <task-name>
**Failure Mode:** <failure-mode-name>
**Severity:** Tier 2 | Tier 3
**Detected At:** <ISO 8601 timestamp>
**Resolution:** unresolved | fixed | overridden

## Evidence

<What the check found. File paths, diff excerpts, pattern matches.>

## Context

<Why this matters. Reference to the failure mode definition.>

## Resolution Notes

<Filled in when resolved. What was done to fix it.>
```

### Severity Classification

| Detection | Severity | On Detection |
|-----------|----------|-------------|
| scope-audit (scope creep) | Tier 2 | Block task completion. Orchestrator fixes. |
| dependency-check (dependency grab) | Tier 2 | Block task completion. Orchestrator fixes. |
| attempt-counter (loop of despair) | Tier 2 | Halt the current task. |
| decision-conflict | Tier 2 | Block task completion. Orchestrator resolves. |
| ghost-reference | Tier 2 | Block task completion. Orchestrator removes reference. |

Tier 3 detections (reserved for future: closed-loop build, deep heresy, architecture decisions) halt the run and require user action.

---

## D0-5: Gate Check Result Format

Gate scripts output JSON to stdout (consumed by the hook router). Exit code determines pass/fail; stdout provides structured detail.

```typescript
interface GateResult {
  /** Gate identifier: "stage-0-to-1", "stage-2-to-3", etc. */
  gate: string;

  /** Whether all checks passed */
  passed: boolean;

  /** Individual checks that were run */
  checks: GateCheck[];

  /** Wall-clock duration of the gate check */
  duration_ms: number;
}

interface GateCheck {
  /** Check name: "milestone-list-exists", "prd-sections-complete", etc. */
  name: string;

  /** Whether this individual check passed */
  passed: boolean;

  /** Human-readable failure message (null on pass) */
  message: string | null;
}
```

### Override Handling in Gate Scripts

When a gate runs:
1. Execute all checks normally.
2. If any check fails, look for an override: `overrides/<stage>-*.md` file exists AND the stage number is in state.json's `overrides[]` array.
3. If both conditions met: set `passed: true` but include the failures in `checks[]` (they're recorded, not hidden).
4. If override file exists but flag not set (or vice versa): gate fails.

---

## D0-6: Morning-After Template

The morning-after is generated from files on disk, not LLM memory. It reads:
- `.building/runs/<run-id>/state.json`
- `.building/runs/<run-id>/events/*.json`
- `.building/runs/<run-id>/detections/*.md`
- `.building/runs/<run-id>/overrides/*.md`
- `.building/runs/<run-id>/confidence/*.json`

### Section Ordering

1. **Header** (always present): project, milestone, run ID, duration, result
2. **What Shipped** (present when any stage completed): list of artifacts produced
3. **What Stopped** (present only when halted): stage, reason, action needed
4. **Gates Overridden** (present only when overrides exist): per-override detail
5. **Failure Modes Detected** (present only when detections exist): per-detection detail
6. **Confidence** (always present): per-artifact table
7. **Decisions Made** (present only when Tier 2 decisions recorded): list
8. **Open Items** (present only when Tier 3 items exist): list
9. **Stats** (always present): counts

### Conditional Inclusion

A section appears ONLY if it has content. Empty sections are omitted entirely. A clean run produces: Header, What Shipped, Confidence, Stats.

### Result Classification

- **SHIPPED:** Final stage gate passed. All done.
- **HALTED:** Run stopped due to Tier 3 detection, gate failure, context exhaustion, or external dependency failure.
- **PARTIAL:** Run completed some but not all milestones (multi-milestone runs where a later milestone halted).

### Confidence Schema

Per-artifact confidence files in `.building/runs/<run-id>/confidence/`:

```typescript
interface ConfidenceAssessment {
  artifact: string;        // "prd", "xrd", "test-plan", "build", "security"
  level: "verified" | "partial";
  reasons: string[];       // Why this level. Empty array for verified-clean.
}
```

**Verified:** Gate passed without override, no failure-mode detections during production, no high-severity review issues.

**Partial:** Any of: override used, detection fired (even if fixed), review surfaced issues.

---

## D0-7: Directory Layout

### Bootstrap Creates

```
.building/
  runs/                     # Empty on bootstrap. Populated per run.
  hooks/
    gate-check.sh           # Router script for gate enforcement
    detection-check.sh      # Router script for failure-mode detection
    lib/                    # Shared utilities for hook scripts
      common.sh             # Bash helpers (JSON parsing, path checks)
  config.json               # Trellis configuration (project name, version)
```

### Per-Run Directory (created on /build <brief>)

```
.building/runs/<run-id>/
  state.json
  events/
  overrides/
  detections/
  confidence/
  morning-after.md          # Generated at run end or halt
```

### Trellis TypeScript Package

```
tools/trellis/
  package.json
  tsconfig.json
  src/
    state.ts                # State read/write utilities
    events.ts               # Event log utilities
    run.ts                  # Run ID generation, directory scaffold
    morning-after.ts        # Morning-after generation
    confidence.ts           # Confidence assessment
    types.ts                # Re-export of all Trellis types
  test/
    state.test.ts
    events.test.ts
    run.test.ts
    morning-after.test.ts
    confidence.test.ts
  dist/                     # Compiled output
```

---

## D0-8: Bash Conventions

This project has no existing bash scripts. These conventions apply to all hook scripts and gate checks.

### Header

Every script starts with:

```bash
#!/usr/bin/env bash
set -euo pipefail
```

### Error Output

- **Stderr** for human-readable failure messages (consumed by the agent).
- **Stdout** for structured JSON output (consumed by the hook router or tests).
- Exit code 0 = success/pass. Non-zero = failure/block.

### Path References

All paths are relative to the project root. Scripts assume the working directory is the project root. Use `$PROJECT_ROOT` variable when clarity helps, but do not depend on it being set externally — derive it:

```bash
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
```

### Dependencies

Scripts may use ONLY:
- bash builtins
- coreutils: cat, grep, wc, sed, awk, find, test, sort, head, tail, tr, cut, dirname, basename, mktemp, mv, date, rm, mkdir, cp, ls, echo, printf
- jq (for JSON parsing)
- git
- node (for invoking TypeScript utilities via `node tools/trellis/dist/...`)

No homebrew-specific tools, no Python, no npm-executed scripts (except via explicit node invocation).

### Template for Gate Check Scripts

```bash
#!/usr/bin/env bash
set -euo pipefail

# Gate: stage-N-to-M
# Checks: [list of checks this gate performs]

GATE_NAME="stage-N-to-M"
CHECKS=()
FAILURES=()
START_TIME=$(date +%s%N)

check() {
  local name="$1"
  local result="$2"   # "pass" or "fail"
  local message="$3"  # failure message, empty on pass
  CHECKS+=("{\"name\":\"$name\",\"passed\":$([ "$result" = "pass" ] && echo true || echo false),\"message\":$([ -z "$message" ] && echo null || echo "\"$message\"")}")
  if [ "$result" = "fail" ]; then
    FAILURES+=("$name: $message")
  fi
}

# ... run checks using check() function ...

# Output result
END_TIME=$(date +%s%N)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))
PASSED=$([ ${#FAILURES[@]} -eq 0 ] && echo true || echo false)

echo "{\"gate\":\"$GATE_NAME\",\"passed\":$PASSED,\"checks\":[$(IFS=,; echo "${CHECKS[*]}")],\"duration_ms\":$DURATION}"

if [ ${#FAILURES[@]} -gt 0 ]; then
  for f in "${FAILURES[@]}"; do echo "$f" >&2; done
  exit 1
fi
```

---

## D0-9: building-audit Integration Contract

Trellis wraps building-audit. It does NOT import building-audit as a library (SDM Constraint 1: building-audit calls `process.exit()`).

### Invocation

```bash
node tools/building-audit/dist/bin/building-audit.js --mechanical --milestone <milestone-name> --output /tmp/audit-result.json
```

Or for per-file candidates:

```bash
node tools/building-audit/dist/bin/building-audit.js --dump-candidates /tmp/candidates/ --milestone <milestone-name>
```

### Prerequisites

`tools/building-audit/node_modules` must exist. Bootstrap verifies this and runs `npm install` if needed (SDM Constraint 2).

### Output Contract (pinned)

The gate scripts depend on this structure from building-audit's JSON output:

```typescript
// From tools/building-audit/src/types/index.ts — AuditReport
{
  checks: Array<{
    name: string;          // e.g., "scope-creep", "test-cheat"
    layer: 1 | 2;
    status: "completed" | "skipped" | "error";
    severity: "critical" | "warning" | "info" | "clean";
    findings: Array<{
      file: string;
      location: string;
      description: string;
      suggestion: string;
    }>;
  }>;
  summary: {
    critical: number;
    warning: number;
  };
}
```

An integration test must verify this structure against building-audit's actual output on a known fixture. If building-audit's output format changes, that test breaks before gate scripts silently misparse.

### Check Names (pinned)

Layer 1: `test-cheat`, `scope-creep`, `dependency-grab`, `premature-abstraction`, `surface-heresy`, `confidence-bluff`, `fragility-metrics`, `resource-drain`, `unoptimized-defaults`.

---

## D0-10: Slash Command and Skill Conventions

Trellis exposes user-facing functionality through a Claude Code skill registered as a slash command.

### /build Command Family

| Command | Action |
|---------|--------|
| `/build <brief-path>` | Start a new run |
| `/build --status` | Print current run status |
| `/build --override <stage> --reason "..."` | Override a gate |
| `/build --bootstrap` | First-time setup |
| `/build --resume [run-id]` | Resume a halted run |

The skill file lives at `.claude/skills/build.md` (or equivalent Claude Code skill location). It reads state.json and invokes the orchestrator logic.

---

## D0-11: Sub-Agent Definitions

Sub-agents live in `.claude/agents/`. Each definition file specifies the agent's role, what context it receives, and what it produces.

### Context Curation Rules

| Sub-agent | Receives | Does NOT receive |
|-----------|----------|------------------|
| Peer reviewer | PRD, XRD, DECISIONS.md | Task files, source code |
| Task auditor | Task file, git diff for that task, DAY-ZERO.md | Other tasks, PRD |
| Security reviewer | XRD architecture section, source code, dependency manifests | PRD, task files |
| SDM | XRD, source code tree structure, milestone history | Individual task details |

Sub-agents are invoked sequentially. If any validator produces a blocking finding, subsequent validators are skipped (early exit).

---

## Verified Assumptions

### VA-1: PreToolUse Hooks Block Writes

Claude Code `PreToolUse` hooks fire before the tool executes. A non-zero exit code blocks the write — the file is never modified. The hook receives the tool input (including file path and proposed content) as JSON on stdin.

**Status:** Documented Claude Code behavior (XRD Risk #2 marked RESOLVED). Must be verified in Task 001 spike.

### VA-2: Hook Path Filtering

Claude Code hooks can match on tool name ("Write") but may not support glob-based path filtering in the matcher itself. The hook script must handle path filtering internally via the fast-path pattern (D0-3).

**Status:** Assumed. Verified in Task 001 spike.

### VA-3: Sub-Agent File Access

Sub-agents (`.claude/agents/`) have filesystem access and can read project files. If they cannot, the orchestrator must inline file content in the invocation prompt.

**Status:** Assumed. Verified in Task 012 (orchestrator skill).

---

## Cross-Reference: Test Plan IDs to Tasks

| Task | Name | Test Plan IDs Covered |
|------|------|----------------------|
| 001 | Hook Behavior Spike | HOOK-001, HOOK-003, HOOK-004, HOOK-008 (manual spike verification) |
| 002 | Package Scaffold | (type compilation only) |
| 003 | State Management | STATE-001 through STATE-007, STATE-015 |
| 004 | Event Log | STATE-008, STATE-009, STATE-010 |
| 005 | Gate Check Scripts | GATE-001 through GATE-027, building-audit integration |
| 006 | Override Mechanism | GATE-028, GATE-029, GATE-030 |
| 007 | Hook Wiring | HOOK-001 through HOOK-008, STATE-012, STATE-013, STATE-014 |
| 008 | Orchestrator Skill | (integration — sub-agent context curation verified by inspection) |
| 009 | Detection Hooks | DETECT-001 through DETECT-013 |
| 010 | Morning-After | MAFTER-001 through MAFTER-004, MAFTER-008 through MAFTER-012 |
| 011 | Confidence | MAFTER-005, MAFTER-006, MAFTER-007 |
| 012 | Bootstrap | BOOT-001 through BOOT-008 |
| 013 | Git Commits | STATE-016, STATE-017, STATE-018, POST-001 through POST-004 |
| 014 | Stress + Quality Bar | STRESS-001 through STRESS-007, quality bar verification |

---

## User-Story Walkthrough Verification

Starting from an empty directory, walking through every step to reach the first task's acceptance criteria. This verifies no orphaned preconditions exist.

### Step 1: A developer clones the building repo

**Starting state:** Fresh clone. `tools/building-audit/` exists. No `.building/` directory. `.claude/settings.local.json` has only permissions.

**What they need:** Trellis installed and governing their next build.

### Step 2: Task 001 — Hook Behavior Spike

**Preconditions:** A Claude Code session in the repo. No prior Trellis state.
**What happens:** Developer creates a test hook script, adds a temporary hook entry to settings.local.json, verifies hook behavior. Documents findings.
**Produces:** spike-report.md with verified hook behavior. DAY-ZERO D0-3 updated if needed.
**Verification:** No orphaned precondition. This task starts from zero.

### Step 3: Task 002 — Package Scaffold

**Preconditions:** Task 001 complete (spike confirms hooks work, proceed with architecture).
**What happens:** Create `tools/trellis/` with package.json, tsconfig.json, types.ts.
**Produces:** A compilable TypeScript package with all Trellis interfaces.
**Verification:** Depends only on Task 001 (go/no-go). Types come from DAY-ZERO, not from a prior task's output.

### Step 4: Tasks 003 + 004 — State + Events (parallelizable)

**Preconditions:** Task 002 complete (package scaffold exists, types available).
**What happens:** Implement state read/write/validate and event read/write/number.
**Produces:** Working state.ts, events.ts, run.ts with passing tests.
**Verification:** Both depend only on Task 002 (types). They don't depend on each other.

### Step 5: Task 005 — Gate Check Scripts

**Preconditions:** Task 003 complete (gate scripts need to read state.json via the TS utility, invoked by `node`).
**What happens:** Write 11 bash gate scripts + shared library + test fixtures.
**Produces:** Standalone gate scripts that pass/fail based on fixture directories.
**Verification:** Gate scripts invoke `node tools/trellis/dist/...` to read state — Task 003 must be built. Correct.

### Step 6: Task 006 — Override Mechanism

**Preconditions:** Task 005 complete (override extends existing gate scripts).
**What happens:** Add override handling to gate scripts + TS override utility.
**Produces:** Gates that can be overridden when file + flag both present.
**Verification:** Modifies gate scripts from Task 005. Correct dependency.

### Step 7: Task 007 — Hook Wiring

**Preconditions:** Tasks 005, 006, and 001 complete.
**What happens:** Build the gate-check.sh router that dispatches to individual gate scripts. Wire into settings.local.json permanently.
**Produces:** Working hook that fires on state.json writes, dispatches to correct gate, blocks on failure.
**Verification:** Needs gate scripts (005), override handling (006), and spike findings (001) for the stdin format. All satisfied.

### Step 8: Task 008 — Orchestrator Skill

**Preconditions:** Tasks 003, 004, 007 complete.
**What happens:** Write the Claude Code skill file and sub-agent definitions.
**Produces:** `/build` command family. Sub-agent definitions in `.claude/agents/`.
**Verification:** Needs state utilities (003), event utilities (004), and working hook wiring (007). All satisfied.

### Step 9: Task 009 — Detection Hooks

**Preconditions:** Tasks 007, 003, 004 complete.
**What happens:** Build detection-check.sh router and 5 detection scripts.
**Produces:** Failure-mode detection on task completion writes.
**Verification:** Needs hook wiring (007) for the hook entry pattern, state utilities (003) for reading state, event utilities (004) for attempt-counter. All satisfied.

### Step 10: Tasks 010 + 011 — Morning-After + Confidence (parallelizable)

**Preconditions:** Tasks 003, 004 complete.
**What happens:** Build morning-after generator and confidence assessor.
**Produces:** Markdown generation from disk artifacts. Per-artifact confidence files.
**Verification:** Both need state and event utilities. Neither depends on hooks or gates. Correct — these are pure reporting logic.

### Step 11: Task 012 — Bootstrap

**Preconditions:** Tasks 002, 005, 007 complete.
**What happens:** Implement `/build --bootstrap` — creates .building/, installs hooks, verifies deps.
**Produces:** Working bootstrap that sets up a project for Trellis.
**Verification:** Needs the package (002) to install, gate scripts (005) to copy into .building/hooks/, and hook wiring format (007) for settings.local.json. All satisfied.

### Step 12: Task 013 — Git Commit Integration

**Preconditions:** Tasks 003, 004 complete.
**What happens:** Build git commit utilities for stage complete, halt, override, run start.
**Produces:** Functions that create correctly formatted Trellis commits.
**Verification:** Needs state and event types. Does not depend on hooks or gates — it's called by the orchestrator. Correct.

### Step 13: Task 014 — Stress Tests and Quality Bar

**Preconditions:** Tasks 005, 007, 009, 010, 003, 004 complete.
**What happens:** Run stress tests against all components. Verify quality bar.
**Produces:** Stress test results. Quality bar confirmation.
**Verification:** Needs gate scripts (005) for fast-path timing, hooks (007) for integration stress, detections (009) for detection stress, morning-after (010) for generation timing, state+events (003, 004) for atomic write and numbering tests. All satisfied.

### Orphaned Precondition Check

Every task's dependencies are satisfied by prior tasks in the build order. No task references a file or utility that isn't produced by a declared dependency. The build order (001 -> 002 -> 003/004 -> 005 -> 006 -> 007 -> 008/009/010/011/012/013 -> 014) respects all dependency edges.

**Potential concern:** Task 005 (gate scripts) invokes building-audit as a subprocess. building-audit must be installed (npm install + tsc). This is NOT a task dependency — it's an environment dependency handled by bootstrap (Task 012). For testing in Task 005, the test fixtures mock building-audit's output or the test setup runs npm install in building-audit. This is documented in Task 005's notes.

**Potential concern:** Task 012 (bootstrap) copies gate scripts from Task 005 and detection scripts from Task 009 into .building/hooks/. But Task 009 depends on Task 007 which depends on Task 005. In the sequential build order, Task 012 runs after Task 009, so both are available. Verified.

No orphaned preconditions found.
