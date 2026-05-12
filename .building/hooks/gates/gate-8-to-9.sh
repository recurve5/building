#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"

# Gate: stage-8-to-9
# Checks: DAY-ZERO.md exists, task files exist

RUN_DIR="$1"
MILESTONE_DIR="$2"

check_file_exists "day-zero-exists" "$MILESTONE_DIR/DAY-ZERO.md" "DAY-ZERO.md"

TASKS_DIR="$MILESTONE_DIR/tasks"
if [ -d "$TASKS_DIR" ]; then
  TASK_COUNT=$(find "$TASKS_DIR" -name '*.md' -type f | wc -l | tr -d ' ')
  if [ "$TASK_COUNT" -gt 0 ]; then
    check "tasks-exist" "pass" ""
  else
    check "tasks-exist" "fail" "Tasks directory exists but contains no task files"
  fi
else
  check "tasks-exist" "fail" "Tasks directory not found at $TASKS_DIR"
fi

output_result "stage-8-to-9"
