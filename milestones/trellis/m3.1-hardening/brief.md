# Brief: M3.1 Hardening — Bug Fixes, Contract Compliance, and Process Gaps

## The Problem

An external review of M2 and M3 found 3 bugs in shipped code, 4 significant gaps that will cause rework when the orchestrator integrates, and 4 structural weaknesses in the review gates themselves. The bugs are silent — tests pass because they test what was built, not what was specified. The process gaps mean this class of bug will recur in future milestones unless the gates change.

The specific failures:

1. The remediation depth guard — the subsystem designed to prevent infinite remediation chains — is dead code. `runPostTaskAudit` hardcodes depth to 0 and never calls `getRemediationDepth`. Six decisions reference this guard. It doesn't function.

2. The event writer overwrites files instead of appending. Two `session_boundary` events in the same run: the second silently destroys the first. The spec, task file, and test plan all specify timestamped filenames. The implementation ignores all three.

3. The HandoffPayload type was simplified during implementation without logging decisions. Structured `l1Findings` (per-task, per-check detail) became a bare count. Override reasons were dropped. The morning-after report and resume flow lose the information they need.

4. The finalized milestone report destroys candidate data — the evidence the LLM was evaluating when it rendered judgment. Post-mortem analysis can see what was decided but not what was decided about.

5. No CLI entry points exist for bridge modules. The orchestrator calls these via subprocess. The functions are unreachable in production. The smoke test didn't catch it because it tested functions directly.

6. `block` and `escalate` action types produce identical orchestrator behavior but force unnecessary branching. The distinction is provenance metadata, not control flow.

7. M3 types and test scaffolding leaked into the M2 codebase before M2 closed. The `fileReference` parameter on `appendDetection` pushes plain strings into a `Detection[]` array — any consumer calling `.taskId` on those elements will throw.

Beyond the code bugs, the review gates that should have caught these didn't:

8. Peer reviews resolved their own findings instead of requiring the originator to respond. 10 of 12 M3 findings were self-resolved.

9. SDM reviews confirmed file placement without assessing interface stability, test scalability, or I/O model fit.

10. Smoke tests validated the code against itself. No test checks that the implementation matches the DAY-ZERO contract. Every HandoffPayload test passes because it uses the divergent field names.

11. DECISIONS.md captured design-time decisions only. Implementation-time simplifications (renaming fields, flattening types, dropping fields) were never logged. The decision record describes intent, not what was built.

## What This Milestone Delivers

Three categories of work:

### 1. Bug fixes (findings 1, 2, 3)

**Remediation depth wiring.** Wire `getRemediationDepth` into `runPostTaskAudit`. The function needs the task's `reworkOf` field (or the full parsed task) to walk the remediation chain. Add an integration test that calls `runPostTaskAudit` with a remediation task and asserts depth is non-zero — not another unit test of `getRemediationDepth` in isolation, but a test of the assembled call path.

**Event writer timestamped filenames.** Change `${safe}.json` to `${timestamp}-${safe}.json` where timestamp uses millisecond precision (e.g., `2026-05-19T083012.456Z-session_boundary.json`). Update all consumers that read events by filename to glob `*-<eventType>.json` instead of reading `<eventType>.json` directly.

**HandoffPayload contract restoration.** Restore structured types where information was lost: `l1Findings` returns to `Array<{ taskId, check, action, filePath }>`, `stageOverrides` returns to `Array<{ stage: number; reason: string }>`, `remediationTasks` entries regain `originatingTask`. Ratify harmless simplifications (field renames like `stage` vs `currentStage`) by updating the DAY-ZERO contract to match the implementation. Log each change as a Tier 2 decision.

### 2. Significant fixes (findings 4, 5, 6, 7)

**Preserve candidate data in finalized reports.** Merge candidate data into the finalized report so the permanent record contains both what was evaluated and what was decided. Each check entry carries both `candidates` (what the LLM saw) and `judgments` (what it concluded). One file, richer schema.

**CLI entry points for bridge modules.** Add thin CLI wrappers that the orchestrator can invoke via subprocess. Handoff writer accepts payload via stdin (not CLI args — avoids ARG_MAX limits on large payloads). Handoff reader writes header JSON to stdout. Add a smoke test that invokes them via `execFileSync` to verify the actual invocation path.

**Collapse block/escalate into single action type.** The policy table returns `escalate` for all Tier 3 findings. Add a `source` field to the finding record (`contextual_promotion`, `policy_default`, `depth_limit`, `unknown_check`) so provenance is preserved as metadata, not control flow. If a future milestone needs to re-split behavior, the `source` field provides the information to do so.

**Guard the mixed-type detections array.** `appendDetection`'s `fileReference` parameter pushes strings into what consumers expect to be `Detection[]`. Add a runtime type guard or document the union type explicitly so consumers check `typeof element === 'string'` before accessing Detection fields. Log the M2/M3 scope contamination as a decision in M2's DECISIONS.md.

### 3. Process fixes (findings 8, 9, 10, 11)

**Peer review structural rule.** The reviewer may not resolve their own findings. Findings marked "Issue" require an originator response before resolution. Findings marked "Info" (observations that don't require action) need no response. This is a prompt change to the peer-review-agent, not a code change. Log as a Tier 2 rule in building-level DECISIONS.md.

**SDM review checklist.** The SDM-agent prompt gains a structural checklist: dependency direction, test scalability, interface-contract stability, I/O model fit. Items are conditional — "if the milestone introduces new public types, verify they match the DAY-ZERO contract." The checklist prompts investigation; it doesn't replace it. Log as a Tier 2 rule.

**Contract-compliance test suite.** For each type defined in the DAY-ZERO contract, write a compile-time test that constructs an object using the contract's field names and asserts it type-checks against the implementation's interface. If the contract says `currentStage` and the code says `stage`, the test file won't compile. This runs alongside functional tests in the smoke test. The DAY-ZERO document remains the source of truth; the tests enforce it mechanically.

**Implementation decisions audit task.** Every milestone's task list gains a final task before smoke test: read the diff between XRD/DAY-ZERO contracts and the actual implementation, identify every divergence, log each as a Tier 2 decision in DECISIONS.md with rationale. Additionally, add a convention that implementation-time Tier 2 decisions get logged in the task's completed section immediately — the audit task consolidates them.

## What This Does Not Cover

- New features. This milestone adds no new capability to Trellis. It fixes bugs, restores contract compliance, and hardens the review process.
- Retroactive M2/M3 milestone boundary cleanup. The M3 types in M2's codebase are documented, not removed. Removal is high-effort and risks breaking imports.
- Automated contract-test generation from DAY-ZERO documents. The contract tests are hand-written. Generation is a tooling improvement for a later milestone.
- Changes to the pipeline stage structure. The 12-stage pipeline is unchanged. Only the agents' prompts and review checklists are modified.

## Resolved Assumptions

1. **HandoffPayload: restore vs. ratify.** Structured data that downstream consumers need (l1Findings detail, override reasons, originatingTask) is restored. Cosmetic renames (stage vs currentStage) are ratified by updating the contract to match the code. The code is not renamed back.

2. **Event filename format.** Millisecond-precision ISO timestamps, colons replaced with nothing: `20260519T083012456Z-session_boundary.json`. No sequence number — millisecond precision is sufficient for the single-process execution model.

3. **CLI invocation uses stdin, not CLI args.** The orchestrator pipes JSON to stdin. This avoids ARG_MAX limits and keeps the shell invocation simple. The reader writes to stdout.

4. **block is removed from the Action union type.** The type becomes `'generate-task' | 'escalate'`. The one code path that returned `block` (contextual checks with critical severity) now returns `escalate` with `source: 'contextual_promotion'`.

5. **Contract-compliance tests are compile-time, not runtime.** They construct objects and assign them to typed variables. If field names diverge, TypeScript rejects the assignment. No runtime assertions needed.

6. **Candidate data is merged into the finalized report, not preserved as a separate file.** One file per check with both `candidates` and `judgments` fields. Avoids doubling the audit file count.

## Open Assumptions

1. **Whether `runPostTaskAudit`'s signature change (adding reworkOf or the full parsed task) should be a breaking change or an optional parameter.** The only consumer is the not-yet-built orchestrator, so a required parameter is free today. But if M2 tests call `runPostTaskAudit` without the new parameter, they'll need updating. Flag for SWE-agent to assess the blast radius.

2. **Whether the SDM checklist items should be enforced by a gate script or by prompt convention.** A gate script can verify that the SDM review document contains all required sections. A prompt convention relies on the agent following instructions. The gate script is more reliable but adds implementation scope. Flag for SWE-agent.
