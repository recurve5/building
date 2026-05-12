#!/usr/bin/env bash
set -euo pipefail

# Detection: ghost reference
# Scans for references to Hard Kill decisions

RUN_DIR="$1"
TASK_ID="$2"
MILESTONE_DIR="$3"

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

DECISIONS="$MILESTONE_DIR/DECISIONS.md"
[ -f "$DECISIONS" ] || exit 0

# Extract Hard Kill entries
KILLED=$(grep -i 'hard kill\|killed\|rejected.*permanently' "$DECISIONS" 2>/dev/null | sed 's/.*: //' | head -10 || true)
[ -z "$KILLED" ] && exit 0

# Check recent changes for references to killed concepts
CHANGED_FILES=$(git -C "$PROJECT_ROOT" diff --name-only HEAD 2>/dev/null || true)
[ -z "$CHANGED_FILES" ] && exit 0

GHOSTS=""
while IFS= read -r killed_item; do
  [ -z "$killed_item" ] && continue
  KEYWORD=$(echo "$killed_item" | tr '[:upper:]' '[:lower:]' | cut -d' ' -f1-3)
  [ -z "$KEYWORD" ] && continue
  while IFS= read -r changed; do
    if git -C "$PROJECT_ROOT" diff HEAD -- "$changed" 2>/dev/null | grep -qi "$KEYWORD"; then
      GHOSTS="${GHOSTS}${changed} references killed concept: ${killed_item}\n"
    fi
  done <<< "$CHANGED_FILES"
done <<< "$KILLED"

if [ -n "$GHOSTS" ]; then
  echo -e "Ghost references found:\n$GHOSTS" >&2
  exit 1
fi

exit 0
