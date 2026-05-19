#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"

# Gate: stage-0-to-1
# Checks: milestone list exists, human confirmation event recorded

RUN_DIR="$1"
MILESTONE_DIR="$2"

# Check milestone list exists (milestone directories under PROJECT_STATE/milestones/)
if [ -d "$PROJECT_STATE/milestones" ] && [ "$(find "$PROJECT_STATE/milestones" -mindepth 1 -maxdepth 1 -type d -name 'm*' 2>/dev/null | wc -l | tr -d ' ')" -gt 0 ]; then
  check "milestone-list-exists" "pass" ""
else
  check "milestone-list-exists" "fail" "No milestone directories found under milestones/"
fi

# Check human confirmation event
if [ -d "$RUN_DIR/events" ] && grep -rl '"run_started"' "$RUN_DIR/events/" >/dev/null 2>&1; then
  check "human-confirmation" "pass" ""
else
  check "human-confirmation" "fail" "No run_started event found — human confirmation required"
fi

output_result "stage-0-to-1" "$RUN_DIR" "0"
