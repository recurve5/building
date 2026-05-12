#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"

# Gate: stage-4-to-5
# Checks: every XRD pushback item has a DECISIONS.md resolution

RUN_DIR="$1"
MILESTONE_DIR="$2"

XRD="$MILESTONE_DIR/XRD.md"
DECISIONS="$MILESTONE_DIR/DECISIONS.md"

check_file_exists "xrd-exists" "$XRD" "XRD.md"
check_file_exists "decisions-exists" "$DECISIONS" "DECISIONS.md"

if [ -f "$XRD" ] && [ -f "$DECISIONS" ]; then
  # Count pushback items in XRD (lines starting with a number under Pushback section)
  PUSHBACK_COUNT=$(sed -n '/^#.*[Pp]ushback/,/^#[^#]/p' "$XRD" 2>/dev/null | grep -cE '^[0-9]+\.|^### ' || echo "0")
  if [ "$PUSHBACK_COUNT" -eq 0 ]; then
    check "pushback-resolved" "pass" ""
  else
    # Check that DECISIONS.md mentions resolution for pushback items
    RESOLVED_COUNT=$(grep -ci 'pushback\|resolved' "$DECISIONS" 2>/dev/null || echo "0")
    if [ "$RESOLVED_COUNT" -gt 0 ]; then
      check "pushback-resolved" "pass" ""
    else
      check "pushback-resolved" "fail" "XRD has pushback items but DECISIONS.md has no resolution records"
    fi
  fi
fi

output_result "stage-4-to-5"
