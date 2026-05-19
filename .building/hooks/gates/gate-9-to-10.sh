#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"

# Gate: stage-9-to-10
# Checks: all tasks complete, security code review clean, building-audit mechanical pass

RUN_DIR="$1"
MILESTONE_DIR="$2"
# BUILDING_HOME provided by gate-check.sh via environment

# Check all tasks complete (from state.json)
if [ -f "$RUN_DIR/state.json" ]; then
  INCOMPLETE=$(jq '[.tasks | to_entries[] | select(.value.status != "complete")] | length' "$RUN_DIR/state.json" 2>/dev/null || echo "-1")
  if [ "$INCOMPLETE" -eq 0 ]; then
    check "all-tasks-complete" "pass" ""
  elif [ "$INCOMPLETE" -eq -1 ]; then
    check "all-tasks-complete" "fail" "Could not parse tasks from state.json"
  else
    check "all-tasks-complete" "fail" "$INCOMPLETE tasks not yet complete"
  fi
else
  check "all-tasks-complete" "fail" "state.json not found"
fi

# Check security code review
SEC_CODE="$MILESTONE_DIR/security-code-review.md"
if [ -f "$SEC_CODE" ]; then
  UNRESOLVED=$(grep -cEi '(critical|high).*unresolved|unresolved.*(critical|high)' "$SEC_CODE" 2>/dev/null || true)
  UNRESOLVED="${UNRESOLVED:-0}"
  if [ "$UNRESOLVED" -gt 0 ]; then
    check "security-code-review-clean" "fail" "$UNRESOLVED unresolved Critical/High findings in security code review"
  else
    check "security-code-review-clean" "pass" ""
  fi
else
  check "security-code-review-clean" "fail" "security-code-review.md not found"
fi

# Invoke building-audit --mechanical
AUDIT_BIN="$BUILDING_HOME/tools/building-audit/dist/bin/building-audit.js"
if [ -f "$AUDIT_BIN" ]; then
  MILESTONE_NAME=$(basename "$MILESTONE_DIR")
  AUDIT_OUTPUT=$(mktemp)
  if node "$AUDIT_BIN" --mechanical --milestone "$MILESTONE_NAME" --output "$AUDIT_OUTPUT" 2>/dev/null; then
    CRITICAL=$(jq '.summary.critical // 0' "$AUDIT_OUTPUT" 2>/dev/null || echo "0")
    if [ "$CRITICAL" -gt 0 ]; then
      check "building-audit-mechanical" "fail" "building-audit found $CRITICAL critical issues"
    else
      check "building-audit-mechanical" "pass" ""
    fi
  else
    check "building-audit-mechanical" "fail" "building-audit exited with error"
  fi
  rm -f "$AUDIT_OUTPUT"
else
  check "building-audit-mechanical" "fail" "building-audit not built — run bootstrap first"
fi

output_result "stage-9-to-10" "$RUN_DIR" "9"
