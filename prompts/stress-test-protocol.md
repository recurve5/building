# Stress Test Protocol

You verify that the product holds up under sustained use and adverse conditions. The smoke test (Stage 10) asks "does it work?" The stress test (Stage 11) asks "does it keep working?"

## When This Runs

After the final milestone's smoke test passes. Stage 11 runs once per project, not per milestone. The product is functionally complete — every walkthrough step passes. Now you verify it doesn't degrade under pressure.

**Design rationale:** Running stress tests per-milestone would be expensive and many resilience issues only manifest at full-system scale. A memory leak in milestone 1's parser may only become visible when milestone 3's features exercise the parser under sustained load. A race condition between two components may only surface when both milestones' code is integrated. The smoke test catches functional regressions per-milestone. The stress test catches resilience issues at full-system scope. This means resilience problems baked into early milestones aren't caught until the stress test — that's the tradeoff. For projects with high resilience risk (real-time systems, long-running services, high-concurrency products), consider running abbreviated stress tests per-milestone. That's a Tier 2 decision logged in the project's DECISIONS.md.

## Prerequisites

Before starting:
1. The product must be running. Same prerequisite as Stage 10 — the human starts the server and provides the URL/port.
2. The test plan (Stage 6) must include a stress test section specifying: which non-functional requirements to verify, what load parameters to use, and what thresholds define pass/fail.
3. For infrastructure-level stress tests (load generation, concurrent connections), confirm the necessary tools are available. If not, tell the human what to install and wait for confirmation.

## What You Test

### 1. Memory and Resource Leaks

Perform the product's core action repeatedly in a sustained loop. The target: a session equivalent to 30-60 minutes of real usage.

- **For web apps:** Navigate through the primary user flow 20+ times. Upload and process documents repeatedly. Open and close views. Track whether the page's memory footprint grows monotonically.
- **For APIs/CLIs:** Run the primary operation in a loop with varied inputs. Monitor process memory between iterations.
- **For long-running services:** Start the service and let it handle a sustained workload. Check memory, file handle count, and connection pool state at intervals.

**Pass criteria:** Resource usage stabilizes. Growth is sublinear relative to operations performed. No unbounded growth in memory, file handles, database connections, or temp files.

**Fail criteria:** Resource usage grows linearly or faster with operations. The product slows measurably after sustained use. The system runs out of a resource (disk, memory, connections) during the test window.

### 2. Concurrent Operations

Perform multiple operations simultaneously to surface race conditions and data integrity issues.

- **For web apps:** Open the product in multiple tabs or sessions. Perform the same operation concurrently (two uploads at once, two edits to the same resource, concurrent searches while an import runs).
- **For APIs:** Send concurrent requests to the same endpoint. Send requests that read and write the same resource simultaneously.
- **For file-based products:** Trigger concurrent reads and writes to the same files. Test whether file locks prevent corruption or whether the product silently produces corrupt output.

**Pass criteria:** Each concurrent operation completes correctly or fails with an informative error. No data corruption. No silent partial writes. No deadlocks.

**Fail criteria:** Data corruption (merged writes, lost updates, partial records). Deadlocks or hangs. Silent incorrect results from race conditions — one operation overwrites another's work without error.

### 3. Error Recovery and Timeouts

Force failure conditions and verify the product recovers gracefully.

- **Network failures:** Disconnect from external services mid-operation (kill network to an API, database, or external dependency). Does the product surface the error or hang? Does it recover when the service returns?
- **Timeout behavior:** Send requests that trigger long-running operations. Do they complete within the PRD's performance budget? If they exceed it, does the product timeout and inform the user, or hang indefinitely?
- **Malformed input at scale:** Submit a batch of inputs where some are valid and some are malformed (wrong types, missing fields, oversized payloads, null values in required fields). Does the product handle each individually, or does one bad input poison the batch?
- **Disk full / quota exceeded:** If the product writes to disk (uploads, caches, logs), what happens when storage is exhausted? Does it fail gracefully or corrupt existing data?

**Pass criteria:** Every failure mode produces a user-visible error or graceful degradation (per Decision 20 — no silent degradation). The product recovers without restart when the external condition resolves. No corruption of existing data from a failed operation.

**Fail criteria:** The product hangs with no indication to the user. A failed operation corrupts previously valid data. The product requires a restart to recover from a transient failure. Errors are swallowed — the operation fails silently and the user doesn't know.

### 4. Boundary Conditions at Scale

Test the limits the PRD defines, and slightly beyond them.

- **Data volume:** If the PRD specifies a scale target (1,000 documents, 10,000 entries, 100 concurrent users), test at that target and at 1.5x. Does performance degrade gracefully or cliff?
- **Input size extremes:** Maximum-length strings, maximum-size file uploads, maximum query complexity. Does the product handle them within the performance budget or fail with a clear message?
- **Rate limits:** If the product calls external APIs, what happens when the API rate-limits the product? Does it queue, retry, back off, or error?
- **Null and empty states at scale:** Delete all items after the product has been populated. Does it return cleanly to the empty state, or does the UI break because it assumed data would always exist?

**Pass criteria:** Performance degrades linearly (not exponentially) as load increases. Hard limits produce clear user-facing messages before the system fails. The product functions correctly at the PRD's stated scale targets.

**Fail criteria:** Performance cliffs (instant degradation past a threshold with no warning). The product crashes at the stated scale target. Hard limits are exceeded silently — the product continues with incorrect or incomplete results.

## How to Execute

### For Web Apps (Playwright MCP)

Use Playwright MCP to script repeated interactions. For concurrency tests, use multiple browser contexts or tabs. Capture screenshots at each test phase as evidence. Monitor browser console for JavaScript errors, memory warnings, and failed network requests.

### For APIs/CLIs (Bash)

Use bash loops, `curl` or `httpie` for API calls, and background processes for concurrency. Capture stdout/stderr for every run. Use system monitoring tools (`ps`, `top`, `lsof`, `netstat`) to check resource state between iterations.

### For Infrastructure

If MCP tools for the cloud provider are available, use them to monitor resource utilization during tests. If not, rely on application-level metrics and state what infrastructure monitoring was unavailable.

## Report Format

```
# Stress Test Report — [Project Name]

**Date:** [date]
**Duration:** [how long the stress test ran]
**Product URL:** [url, if applicable]
**Result:** [PASS — all categories passed / FAIL — N categories failed]

## Summary

[One paragraph: what was tested, what held up, what broke.]

## Results by Category

### Memory and Resource Leaks
**Result:** [PASS/FAIL]
**Method:** [what was done — e.g., "ran primary flow 25 times over 40 minutes"]
**Observations:** [memory trajectory, resource counts, evidence]
**Evidence:** [screenshots, console output, monitoring data]

### Concurrent Operations
**Result:** [PASS/FAIL]
**Method:** [what was done — e.g., "concurrent uploads from 3 browser tabs"]
**Observations:** [data integrity checks, error handling, deadlock checks]
**Evidence:** [screenshots, console output, database state]

### Error Recovery and Timeouts
**Result:** [PASS/FAIL]
**Method:** [what failure conditions were triggered]
**Observations:** [recovery behavior, user-facing error messages, data integrity after recovery]
**Evidence:** [screenshots, console output, error logs]

### Boundary Conditions at Scale
**Result:** [PASS/FAIL]
**Method:** [what limits were tested and at what volume]
**Observations:** [performance characteristics, degradation curve, error handling at limits]
**Evidence:** [timing data, console output, screenshots]

## Failed Tests

### [Category]: [Specific Failure]
**Expected:** [what should have happened]
**Observed:** [what actually happened]
**Evidence:** [screenshot reference, console output]
**Probable cause:** [your assessment]
**Severity:** [Critical — data corruption or loss / High — functionality broken under load / Medium — degraded experience at scale]

## Recommendations

[Prioritized list of fixes for any failures or concerns observed.]
```

## Failure-to-Fix Protocol

When categories fail:

1. Each failure becomes a fix task using the standard task template.
2. Fix tasks include the specific test method to reproduce the failure.
3. After fixes, Stage 11 reruns — all categories, not just the ones that failed. A fix for concurrency might introduce a memory leak.
4. The project is not complete until all stress test categories pass.

## What This Does Not Replace

The stress test does not replace the unit tests, integration tests, or smoke test. Those verify correctness. This verifies resilience. A product that passes the smoke test but fails the stress test works — it just won't keep working. A product that passes the stress test but fails the smoke test is resilient garbage.
