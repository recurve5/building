#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"

# Gate: stage-1-to-2
# Checks: brief file exists with >50 words

RUN_DIR="$1"
MILESTONE_DIR="$2"

BRIEF="$MILESTONE_DIR/brief.md"
if [ -f "$BRIEF" ]; then
  check "brief-exists" "pass" ""
  WORDS=$(count_words "$BRIEF")
  if [ "$WORDS" -gt 50 ]; then
    check "brief-word-count" "pass" ""
  else
    check "brief-word-count" "fail" "Brief has $WORDS words, need >50"
  fi
else
  check "brief-exists" "fail" "Brief file not found at $BRIEF"
  check "brief-word-count" "fail" "Cannot check word count — brief missing"
fi

output_result "stage-1-to-2" "$RUN_DIR" "1"
