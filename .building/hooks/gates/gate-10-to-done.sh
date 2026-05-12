#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"

# Gate: stage-10-to-done
# Checks: smoke test report exists with all steps passing

RUN_DIR="$1"
MILESTONE_DIR="$2"

SMOKE="$MILESTONE_DIR/smoke-test-report.md"
check_file_exists "smoke-test-exists" "$SMOKE" "smoke-test-report.md"

if [ -f "$SMOKE" ]; then
  # Check for failing steps: lines with [ ] (unchecked) or "FAIL" markers
  FAILING=$(grep -cE '^\s*-\s*\[ \]|FAIL' "$SMOKE" 2>/dev/null || true)
  FAILING="${FAILING:-0}"
  FAILING=$(echo "$FAILING" | tr -d '[:space:]')
  if [ "$FAILING" -gt 0 ]; then
    check "smoke-test-passing" "fail" "$FAILING smoke test steps not passing"
  else
    check "smoke-test-passing" "pass" ""
  fi
else
  check "smoke-test-passing" "fail" "Cannot check — smoke-test-report.md missing"
fi

output_result "stage-10-to-done"
