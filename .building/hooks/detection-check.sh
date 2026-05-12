#!/usr/bin/env bash
set -euo pipefail

# Detection router: fires on task completion in state.json
# Exit 0 = allow write, Exit 2 = block write (detection fired)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path')

# Fast path: only care about state.json in run directories
if [[ ! "$FILE_PATH" =~ \.building/runs/[^/]+/state\.json$ ]]; then
  exit 0
fi

RUN_DIR=$(dirname "$FILE_PATH")

# If state.json doesn't exist yet, allow (initial creation)
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Compare tasks: find any task that changed to "complete"
PROPOSED_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content')
COMPLETING_TASK=""

# Get all task IDs from proposed state where status is "complete"
PROPOSED_COMPLETE=$(echo "$PROPOSED_CONTENT" | jq -r '.tasks | to_entries[] | select(.value.status == "complete") | .key' 2>/dev/null || true)
CURRENT_COMPLETE=$(jq -r '.tasks | to_entries[] | select(.value.status == "complete") | .key' "$FILE_PATH" 2>/dev/null || true)

for task in $PROPOSED_COMPLETE; do
  if ! echo "$CURRENT_COMPLETE" | grep -q "^${task}$" 2>/dev/null; then
    COMPLETING_TASK="$task"
    break
  fi
done

# No task completing — not our concern
if [ -z "$COMPLETING_TASK" ]; then
  exit 0
fi

# Determine milestone directory
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MILESTONE=$(jq -r '.milestone' "$FILE_PATH")
MILESTONE_DIR=$(find "$PROJECT_ROOT/milestones" -type d -name "$MILESTONE" 2>/dev/null | head -1)

if [ -z "$MILESTONE_DIR" ]; then
  exit 0
fi

# Run detection scripts
DETECTIONS_DIR="$(dirname "$0")/detections"
DETECTED=0

for script in "$DETECTIONS_DIR"/*.sh; do
  [ -f "$script" ] || continue

  STDERR_FILE=$(mktemp)
  if ! bash "$script" "$RUN_DIR" "$COMPLETING_TASK" "$MILESTONE_DIR" 2>"$STDERR_FILE"; then
    DETECTION_NAME=$(basename "$script" .sh)
    DETECTION_MSG=$(cat "$STDERR_FILE")

    # Write detection record (D0-4 format)
    DETECTION_FILE="$RUN_DIR/detections/${COMPLETING_TASK}-${DETECTION_NAME}.md"
    cat > "$DETECTION_FILE" << RECORD
# Detection: ${DETECTION_NAME}

**Severity:** tier2
**Task:** ${COMPLETING_TASK}
**Timestamp:** $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Description

${DETECTION_MSG}
RECORD

    echo "Detection fired: $DETECTION_NAME for task $COMPLETING_TASK — $DETECTION_MSG" >&2
    DETECTED=1
  fi
  rm -f "$STDERR_FILE"
done

if [ "$DETECTED" -gt 0 ]; then
  exit 2
fi

exit 0
