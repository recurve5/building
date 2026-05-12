#!/usr/bin/env bash
set -euo pipefail

# Router: Claude Code PreToolUse hook for Write tool
# Dispatches to gate scripts when state.json stage advancement is detected.
# Exit 0 = allow write, Exit 2 = block write.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path')

# Fast path: only gate state.json in run directories
if [[ ! "$FILE_PATH" =~ \.building/runs/[^/]+/state\.json$ ]]; then
  exit 0
fi

# Extract the run directory from the file path
RUN_DIR=$(dirname "$FILE_PATH")

# Read proposed new state from the write content
PROPOSED_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content')
PROPOSED_STAGE=$(echo "$PROPOSED_CONTENT" | jq -r '.current_stage')
PROPOSED_HALTED=$(echo "$PROPOSED_CONTENT" | jq -r '.halted')

# If state.json doesn't exist yet (first write), allow it
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Read current state from disk
CURRENT_STAGE=$(jq -r '.current_stage' "$FILE_PATH")
CURRENT_HALTED=$(jq -r '.halted' "$FILE_PATH")

# No stage change — allow the write (task updates, halt/resume, etc.)
if [ "$PROPOSED_STAGE" = "$CURRENT_STAGE" ]; then
  exit 0
fi

# Validate transition
STAGE_DELTA=$((PROPOSED_STAGE - CURRENT_STAGE))

if [ "$STAGE_DELTA" -lt 0 ]; then
  echo "Gate check blocked: cannot go backward from stage $CURRENT_STAGE to $PROPOSED_STAGE" >&2
  exit 2
fi

if [ "$STAGE_DELTA" -gt 1 ]; then
  echo "Gate check blocked: cannot skip stages ($CURRENT_STAGE to $PROPOSED_STAGE)" >&2
  exit 2
fi

if [ "$CURRENT_HALTED" = "true" ]; then
  echo "Gate check blocked: cannot advance stage while halted — resume first" >&2
  exit 2
fi

# Stage advancing by 1 — dispatch to the correct gate script
SCRIPT_DIR="$(dirname "$0")/gates"
GATE_SCRIPT="$SCRIPT_DIR/gate-${CURRENT_STAGE}-to-${PROPOSED_STAGE}.sh"

# Special case: stage 10 to 11 uses gate-10-to-done
if [ "$CURRENT_STAGE" = "10" ]; then
  GATE_SCRIPT="$SCRIPT_DIR/gate-10-to-done.sh"
fi

if [ ! -f "$GATE_SCRIPT" ]; then
  echo "Gate check blocked: no gate script for stage $CURRENT_STAGE to $PROPOSED_STAGE" >&2
  exit 2
fi

# Determine milestone directory from state
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MILESTONE=$(jq -r '.milestone' "$FILE_PATH")
MILESTONE_DIR=$(find "$PROJECT_ROOT/milestones" -type d -name "$MILESTONE" 2>/dev/null | head -1)

if [ -z "$MILESTONE_DIR" ]; then
  echo "Gate check blocked: milestone directory '$MILESTONE' not found" >&2
  exit 2
fi

# Run the gate script
GATE_OUTPUT=$(bash "$GATE_SCRIPT" "$RUN_DIR" "$MILESTONE_DIR" 2>/tmp/trellis-gate-stderr.txt) || {
  GATE_EXIT=$?
  # Pass through stderr from gate script
  if [ -f /tmp/trellis-gate-stderr.txt ]; then
    cat /tmp/trellis-gate-stderr.txt >&2
    rm -f /tmp/trellis-gate-stderr.txt
  fi
  exit 2
}

rm -f /tmp/trellis-gate-stderr.txt
echo "$GATE_OUTPUT"
exit 0
