#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"

# Gate: stage-3-to-4
# Checks: XRD exists, security review exists, no Critical/High unresolved

RUN_DIR="$1"
MILESTONE_DIR="$2"

check_file_exists "xrd-exists" "$MILESTONE_DIR/XRD.md" "XRD.md"
check_file_exists "security-review-exists" "$MILESTONE_DIR/security-review.md" "security-review.md"

SEC_REVIEW="$MILESTONE_DIR/security-review.md"
if [ -f "$SEC_REVIEW" ]; then
  # Look for unresolved Critical or High findings
  UNRESOLVED=$(grep -cEi '(critical|high).*unresolved|unresolved.*(critical|high)' "$SEC_REVIEW" 2>/dev/null || true)
  UNRESOLVED="${UNRESOLVED:-0}"
  if [ "$UNRESOLVED" -gt 0 ]; then
    check "security-findings-clean" "fail" "$UNRESOLVED unresolved Critical/High security findings"
  else
    check "security-findings-clean" "pass" ""
  fi
else
  check "security-findings-clean" "fail" "Cannot check — security-review.md missing"
fi

output_result "stage-3-to-4" "$RUN_DIR" "3"
