#!/usr/bin/env bash
set -euo pipefail

# Detection: loop of despair
# Fires when 3+ task_failed events exist for the same task

RUN_DIR="$1"
TASK_ID="$2"

EVENTS_DIR="$RUN_DIR/events"
[ -d "$EVENTS_DIR" ] || exit 0

FAIL_COUNT=$(grep -rl "\"task_failed\"" "$EVENTS_DIR/" 2>/dev/null | while read -r f; do
  jq -r '.task // ""' "$f" 2>/dev/null
done | grep -c "^${TASK_ID}$" 2>/dev/null || true)

FAIL_COUNT="${FAIL_COUNT:-0}"

if [ "$FAIL_COUNT" -ge 3 ]; then
  echo "Task $TASK_ID has $FAIL_COUNT failed attempts — possible loop of despair" >&2
  exit 1
fi

exit 0
