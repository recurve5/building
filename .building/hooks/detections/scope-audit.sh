#!/usr/bin/env bash
set -euo pipefail

# Detection: scope creep
# Checks if files changed outside the task's declared Files section

RUN_DIR="$1"
TASK_ID="$2"
MILESTONE_DIR="$3"

# PROJECT_DIR provided by detection-check.sh via environment

# Find the task file
TASK_FILE=$(find "$MILESTONE_DIR/tasks" -name "${TASK_ID}-*" -type f 2>/dev/null | head -1)
if [ -z "$TASK_FILE" ]; then
  exit 0
fi

# Extract declared files from the task's Files section
DECLARED_FILES=$(sed -n '/^## Files/,/^## /p' "$TASK_FILE" 2>/dev/null | grep -E '^\s*-\s*(Create|Modify|Do not touch):' | sed 's/.*: `\(.*\)`.*/\1/' | sed "s/.*: \`//" | sed "s/\`.*//" || true)

if [ -z "$DECLARED_FILES" ]; then
  exit 0
fi

# Check git diff for uncommitted changes
CHANGED_FILES=$(git -C "$PROJECT_DIR" diff --name-only HEAD 2>/dev/null || true)

if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

# Check for files changed that aren't in the declared list
OUT_OF_SCOPE=""
while IFS= read -r changed; do
  MATCHED=0
  while IFS= read -r declared; do
    [ -z "$declared" ] && continue
    if [[ "$changed" == *"$declared"* ]] || [[ "$declared" == *"$changed"* ]]; then
      MATCHED=1
      break
    fi
  done <<< "$DECLARED_FILES"
  if [ "$MATCHED" -eq 0 ]; then
    OUT_OF_SCOPE="${OUT_OF_SCOPE}${changed}\n"
  fi
done <<< "$CHANGED_FILES"

if [ -n "$OUT_OF_SCOPE" ]; then
  echo "Files changed outside task scope: $(echo -e "$OUT_OF_SCOPE" | head -3 | tr '\n' ', ')" >&2
  exit 1
fi

exit 0
