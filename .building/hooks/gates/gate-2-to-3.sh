#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"

# Gate: stage-2-to-3
# Checks: PRD exists with required sections, DECISIONS.md present, no unresolved Tier 3

RUN_DIR="$1"
MILESTONE_DIR="$2"

PRD="$MILESTONE_DIR/PRD.md"
check_file_exists "prd-exists" "$PRD" "PRD.md"

if [ -f "$PRD" ]; then
  for section in "Overview" "Gate Enforcement" "State Persistence" "Morning-After" "Bootstrap" "Decisions"; do
    if grep -qi "^#.*$section" "$PRD" 2>/dev/null; then
      check "prd-section-$section" "pass" ""
    else
      check "prd-section-$section" "fail" "PRD missing section: $section"
    fi
  done
fi

check_file_exists "decisions-exists" "$MILESTONE_DIR/DECISIONS.md" "DECISIONS.md"

OPEN_ITEMS="$MILESTONE_DIR/OPEN-ITEMS.md"
if [ -f "$OPEN_ITEMS" ]; then
  UNRESOLVED=$(grep -ci 'tier 3\|unresolved' "$OPEN_ITEMS" 2>/dev/null || echo "0")
  if [ "$UNRESOLVED" -gt 0 ]; then
    check "no-unresolved-tier3" "fail" "OPEN-ITEMS.md has $UNRESOLVED potential unresolved Tier 3 items"
  else
    check "no-unresolved-tier3" "pass" ""
  fi
else
  check "no-unresolved-tier3" "pass" ""
fi

output_result "stage-2-to-3" "$RUN_DIR" "2"
