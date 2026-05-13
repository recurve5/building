#!/usr/bin/env bash
set -euo pipefail

# Detection router: called by the /build skill via Bash tool after task completion.
# Receives BUILDING_HOME, PROJECT_DIR, PROJECT_STATE as environment variables.
# Arguments: $1 = state_json_path, $2 = task_id, $3 = attempts, $4 = project_dir

source "$(dirname "$0")/lib/common.sh"
resolve_project_paths

STATE_JSON="$1"
COMPLETING_TASK="$2"
ATTEMPTS="${3:-1}"

if [ ! -f "$STATE_JSON" ]; then
  exit 0
fi

RUN_DIR=$(dirname "$STATE_JSON")

# Determine milestone directory from state
MILESTONE=$(jq -r '.milestone' "$STATE_JSON")
MILESTONE_DIR="$PROJECT_STATE/milestones/$MILESTONE"

if [ ! -d "$MILESTONE_DIR" ]; then
  exit 0
fi

# Run detection scripts
DETECTIONS_DIR="$BUILDING_HOME/.building/hooks/detections"
DETECTED=0

for script in "$DETECTIONS_DIR"/*.sh; do
  [ -f "$script" ] || continue

  STDERR_FILE=$(mktemp)
  if ! bash "$script" "$RUN_DIR" "$COMPLETING_TASK" "$MILESTONE_DIR" "$PROJECT_DIR" 2>"$STDERR_FILE"; then
    DETECTION_NAME=$(basename "$script" .sh)
    DETECTION_MSG=$(cat "$STDERR_FILE")

    mkdir -p "$RUN_DIR/detections"
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
