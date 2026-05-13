#!/usr/bin/env bash
set -euo pipefail

# Gate check router: called by the /build skill via Bash tool.
# Receives BUILDING_HOME, PROJECT_DIR, PROJECT_STATE as environment variables.
# Arguments: $1 = from_stage, $2 = to_stage, $3 = state_json_path

source "$(dirname "$0")/lib/common.sh"
resolve_project_paths

FROM_STAGE="$1"
TO_STAGE="$2"
STATE_JSON="$3"

if [ ! -f "$STATE_JSON" ]; then
  echo "Gate check failed: state.json not found at $STATE_JSON" >&2
  exit 2
fi

CURRENT_STAGE=$(jq -r '.current_stage' "$STATE_JSON")
CURRENT_HALTED=$(jq -r '.halted' "$STATE_JSON")

if [ "$CURRENT_HALTED" = "true" ]; then
  echo "Gate check blocked: cannot advance stage while halted — resume first" >&2
  exit 2
fi

STAGE_DELTA=$((TO_STAGE - FROM_STAGE))

if [ "$STAGE_DELTA" -lt 0 ]; then
  echo "Gate check blocked: cannot go backward from stage $FROM_STAGE to $TO_STAGE" >&2
  exit 2
fi

if [ "$STAGE_DELTA" -gt 1 ]; then
  echo "Gate check blocked: cannot skip stages ($FROM_STAGE to $TO_STAGE)" >&2
  exit 2
fi

# Dispatch to the correct gate script
SCRIPT_DIR="$BUILDING_HOME/.building/hooks/gates"
GATE_SCRIPT="$SCRIPT_DIR/gate-${FROM_STAGE}-to-${TO_STAGE}.sh"

if [ "$FROM_STAGE" = "10" ]; then
  GATE_SCRIPT="$SCRIPT_DIR/gate-10-to-done.sh"
fi

if [ ! -f "$GATE_SCRIPT" ]; then
  echo "Gate check blocked: no gate script for stage $FROM_STAGE to $TO_STAGE" >&2
  exit 2
fi

# Determine milestone directory from state
RUN_DIR=$(dirname "$STATE_JSON")
MILESTONE=$(jq -r '.milestone' "$STATE_JSON")
MILESTONE_DIR="$PROJECT_STATE/milestones/$MILESTONE"

if [ ! -d "$MILESTONE_DIR" ]; then
  echo "Gate check blocked: milestone directory '$MILESTONE' not found at $MILESTONE_DIR" >&2
  exit 2
fi

# Run the gate script
STDERR_FILE=$(mktemp)
GATE_OUTPUT=$(bash "$GATE_SCRIPT" "$RUN_DIR" "$MILESTONE_DIR" 2>"$STDERR_FILE") || {
  GATE_EXIT=$?
  if [ -f "$STDERR_FILE" ]; then
    cat "$STDERR_FILE" >&2
    rm -f "$STDERR_FILE"
  fi
  exit 2
}

rm -f "$STDERR_FILE"
echo "$GATE_OUTPUT"
exit 0
