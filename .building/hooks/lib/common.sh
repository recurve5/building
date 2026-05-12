#!/usr/bin/env bash
# Shared library for gate check scripts.
# Source this at the top of every gate script.

CHECKS=()
FAILURES=()
START_TIME=$(date +%s%N 2>/dev/null || date +%s)

check() {
  local name="$1"
  local result="$2"
  local message="${3:-}"
  local msg_json
  if [ -z "$message" ]; then
    msg_json="null"
  else
    msg_json="\"$(echo "$message" | sed 's/"/\\"/g')\""
  fi
  local passed_json
  if [ "$result" = "pass" ]; then
    passed_json="true"
  else
    passed_json="false"
  fi
  CHECKS+=("{\"name\":\"$name\",\"passed\":$passed_json,\"message\":$msg_json}")
  if [ "$result" = "fail" ]; then
    FAILURES+=("$name: $message")
  fi
}

output_result() {
  local gate_name="$1"
  local end_time
  end_time=$(date +%s%N 2>/dev/null || date +%s)
  local duration=0
  if [[ "$end_time" =~ ^[0-9]+$ ]] && [[ "$START_TIME" =~ ^[0-9]+$ ]]; then
    if [ ${#end_time} -gt 10 ] && [ ${#START_TIME} -gt 10 ]; then
      duration=$(( (end_time - START_TIME) / 1000000 ))
    else
      duration=$(( (end_time - START_TIME) * 1000 ))
    fi
  fi
  local passed
  if [ ${#FAILURES[@]} -eq 0 ]; then
    passed="true"
  else
    passed="false"
  fi
  local checks_json
  checks_json=$(IFS=,; echo "${CHECKS[*]}")

  echo "{\"gate\":\"$gate_name\",\"passed\":$passed,\"checks\":[$checks_json],\"duration_ms\":$duration}"

  if [ ${#FAILURES[@]} -gt 0 ]; then
    for f in "${FAILURES[@]}"; do echo "$f" >&2; done
    exit 1
  fi
}

check_file_exists() {
  local check_name="$1"
  local file_path="$2"
  local desc="${3:-$file_path}"
  if [ -f "$file_path" ]; then
    check "$check_name" "pass" ""
  else
    check "$check_name" "fail" "$desc not found"
  fi
}

count_words() {
  wc -w < "$1" | tr -d ' '
}

milestone_dir() {
  local run_dir="$1"
  local milestone
  milestone=$(jq -r '.milestone' "$run_dir/state.json")
  local project_root
  project_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  # Search for the milestone directory
  local found
  found=$(find "$project_root/milestones" -type d -name "$milestone" 2>/dev/null | head -1)
  if [ -n "$found" ]; then
    echo "$found"
  else
    echo ""
  fi
}
