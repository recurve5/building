#!/usr/bin/env bash
set -euo pipefail

# Detection: decision conflict
# Checks DECISIONS.md for contradictory entries on the same topic

RUN_DIR="$1"
TASK_ID="$2"
MILESTONE_DIR="$3"

DECISIONS="$MILESTONE_DIR/DECISIONS.md"
[ -f "$DECISIONS" ] || exit 0

# Extract decision entries (lines starting with ## or ###)
ENTRIES=$(grep -E '^#{2,3}\s' "$DECISIONS" 2>/dev/null || true)
[ -z "$ENTRIES" ] && exit 0

# Simple contradiction check: look for pairs with opposing keywords
# (e.g., "use X" and "do not use X", "enable" and "disable")
CONFLICTS=0
while IFS= read -r entry; do
  TOPIC=$(echo "$entry" | sed 's/^#* *//' | tr '[:upper:]' '[:lower:]')
  # Check for "not" or "don't" or "disable" variants
  if echo "$TOPIC" | grep -qE 'not |don.t |disable|remove|kill'; then
    KEYWORD=$(echo "$TOPIC" | sed 's/not //;s/don.t //;s/disable //;s/remove //;s/kill //')
    KEYWORD=$(echo "$KEYWORD" | cut -d' ' -f1-3)
    POSITIVE_MATCH=$(echo "$ENTRIES" | grep -iv 'not \|don.t \|disable\|remove\|kill' | grep -ci "$KEYWORD" 2>/dev/null || true)
    if [ "${POSITIVE_MATCH:-0}" -gt 0 ]; then
      CONFLICTS=$((CONFLICTS + 1))
    fi
  fi
done <<< "$ENTRIES"

if [ "$CONFLICTS" -gt 0 ]; then
  echo "DECISIONS.md has $CONFLICTS potential contradictions" >&2
  exit 1
fi

exit 0
