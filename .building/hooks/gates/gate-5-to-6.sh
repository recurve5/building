#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"

# Gate: stage-5-to-6
# Checks: peer review exists, no unresolved high-severity issues

RUN_DIR="$1"
MILESTONE_DIR="$2"

check_file_exists "peer-review-exists" "$MILESTONE_DIR/peer-review.md" "peer-review.md"

REVIEW="$MILESTONE_DIR/peer-review.md"
if [ -f "$REVIEW" ]; then
  UNRESOLVED_HIGH=$(grep -cEi 'high.*unresolved|unresolved.*high' "$REVIEW" 2>/dev/null || true)
  UNRESOLVED_HIGH="${UNRESOLVED_HIGH:-0}"
  if [ "$UNRESOLVED_HIGH" -gt 0 ]; then
    check "peer-review-clean" "fail" "$UNRESOLVED_HIGH unresolved high-severity peer review issues"
  else
    check "peer-review-clean" "pass" ""
  fi
else
  check "peer-review-clean" "fail" "Cannot check — peer-review.md missing"
fi

output_result "stage-5-to-6" "$RUN_DIR" "5"
