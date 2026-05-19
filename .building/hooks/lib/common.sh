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

check_override() {
  local stage="$1"
  local run_dir="$2"

  # Both conditions must be met: override file exists AND flag in state.json
  local has_file="false"
  local has_flag="false"

  if [ -d "$run_dir/overrides" ]; then
    local override_files
    override_files=$(find "$run_dir/overrides" -name "${stage}-*" -type f 2>/dev/null | head -1)
    if [ -n "$override_files" ]; then
      has_file="true"
    fi
  fi

  if [ -f "$run_dir/state.json" ]; then
    local in_overrides
    in_overrides=$(jq --arg s "$stage" '[.overrides[] | select(. == $s)] | length' "$run_dir/state.json" 2>/dev/null || echo "0")
    if [ "$in_overrides" -gt 0 ]; then
      has_flag="true"
    fi
  fi

  if [ "$has_file" = "true" ] && [ "$has_flag" = "true" ]; then
    return 0
  fi
  return 1
}

output_result() {
  local gate_name="$1"
  local run_dir="${2:-}"
  local stage="${3:-}"
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
  elif [ -n "$run_dir" ] && [ -n "$stage" ] && check_override "$stage" "$run_dir"; then
    passed="true"
  else
    passed="false"
  fi

  local checks_json
  checks_json=$(IFS=,; echo "${CHECKS[*]}")

  echo "{\"gate\":\"$gate_name\",\"passed\":$passed,\"checks\":[$checks_json],\"duration_ms\":$duration}"

  if [ "$passed" = "false" ]; then
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

derive_project_name() {
  local dir="$1"
  dir="${dir%/}"
  local name
  name=$(basename "$dir")
  name=$(echo "$name" | tr '[:upper:]' '[:lower:]')
  name=$(echo "$name" | tr ' _' '-')
  name=$(echo "$name" | sed 's/[^a-z0-9-]//g')
  name=$(echo "$name" | sed 's/--*/-/g')
  name=$(echo "$name" | sed 's/^-//;s/-$//')

  if [ -z "$name" ]; then
    echo "ERROR: Cannot derive project name from directory '$(basename "$dir")'" >&2
    return 1
  fi
  echo "$name"
}

resolve_project_paths() {
  if [ -z "${BUILDING_HOME:-}" ] || [ -z "${PROJECT_DIR:-}" ] || [ -z "${PROJECT_STATE:-}" ]; then
    echo "ERROR: BUILDING_HOME, PROJECT_DIR, and PROJECT_STATE must be set" >&2
    exit 1
  fi
  PROJECT_NAME=$(derive_project_name "$PROJECT_DIR")
  export PROJECT_DIR PROJECT_NAME PROJECT_STATE
}

