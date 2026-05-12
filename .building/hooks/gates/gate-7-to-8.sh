#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"

# Gate: stage-7-to-8
# Checks: SDM review exists (or SDM stage skipped for greenfield)

RUN_DIR="$1"
MILESTONE_DIR="$2"

# Check if SDM stage was skipped
SDM_SKIPPED="false"
if [ -f "$RUN_DIR/state.json" ]; then
  SDM_STATUS=$(jq -r '.stages["7"].status // "not_started"' "$RUN_DIR/state.json" 2>/dev/null || echo "not_started")
  if [ "$SDM_STATUS" = "skipped" ]; then
    SDM_SKIPPED="true"
  fi
fi

if [ "$SDM_SKIPPED" = "true" ]; then
  check "sdm-review" "pass" ""
elif [ -f "$MILESTONE_DIR/sdm-review.md" ]; then
  check "sdm-review" "pass" ""
else
  check "sdm-review" "fail" "SDM review not found and stage not marked as skipped"
fi

output_result "stage-7-to-8"
