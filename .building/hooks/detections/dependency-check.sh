#!/usr/bin/env bash
set -euo pipefail

# Detection: dependency grab
# Checks if package.json has new dependencies not declared in the task

RUN_DIR="$1"
TASK_ID="$2"
MILESTONE_DIR="$3"

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Check if any package.json was modified
PKG_CHANGES=$(git -C "$PROJECT_ROOT" diff --name-only HEAD 2>/dev/null | grep 'package\.json$' || true)

if [ -z "$PKG_CHANGES" ]; then
  exit 0
fi

# Check task file for dependency authorization
TASK_FILE=$(find "$MILESTONE_DIR/tasks" -name "${TASK_ID}-*" -type f 2>/dev/null | head -1)
if [ -z "$TASK_FILE" ]; then
  exit 0
fi

# If task mentions dependencies/packages, it's authorized
if grep -qi 'dependenc\|package\|npm install' "$TASK_FILE" 2>/dev/null; then
  exit 0
fi

echo "package.json modified without dependency authorization in task $TASK_ID" >&2
exit 1
