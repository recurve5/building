#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"

# Gate: stage-6-to-7
# Checks: test plan exists, feature coverage present, stress test section present

RUN_DIR="$1"
MILESTONE_DIR="$2"

check_file_exists "test-plan-exists" "$MILESTONE_DIR/test-plan.md" "test-plan.md"

PLAN="$MILESTONE_DIR/test-plan.md"
if [ -f "$PLAN" ]; then
  if grep -qi 'feature\|coverage\|test.*case\|acceptance' "$PLAN" 2>/dev/null; then
    check "feature-coverage" "pass" ""
  else
    check "feature-coverage" "fail" "Test plan has no feature coverage section"
  fi

  if grep -qi 'stress' "$PLAN" 2>/dev/null; then
    check "stress-tests" "pass" ""
  else
    check "stress-tests" "fail" "Test plan has no stress test section"
  fi
else
  check "feature-coverage" "fail" "Cannot check — test-plan.md missing"
  check "stress-tests" "fail" "Cannot check — test-plan.md missing"
fi

output_result "stage-6-to-7"
