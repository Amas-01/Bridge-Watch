#!/usr/bin/env bash
set -euo pipefail

# Compress the command logs written by CI/release workflow steps.
# This script does not execute arbitrary commands; it only archives files that
# workflow steps have already written into COMMAND_LOG_DIR.

log_dir="${COMMAND_LOG_DIR:-${RUNNER_TEMP:-/tmp}/bridge-watch-command-logs}"
archive_dir="${COMMAND_LOG_ARCHIVE_DIR:-${RUNNER_TEMP:-/tmp}/bridge-watch-command-log-archives}"
workflow="${GITHUB_WORKFLOW:-local}"
job="${GITHUB_JOB:-local}"
run_id="${GITHUB_RUN_ID:-local}"
run_attempt="${GITHUB_RUN_ATTEMPT:-1}"
sha="${GITHUB_SHA:-unknown}"
ref="${GITHUB_REF_NAME:-unknown}"
created_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

safe_workflow="$(printf '%s' "$workflow" | tr '[:upper:] /:' '[:lower:]---' | tr -cd 'a-z0-9._-')"
safe_job="$(printf '%s' "$job" | tr '[:upper:] /:' '[:lower:]---' | tr -cd 'a-z0-9._-')"
archive_name="command-logs-${safe_workflow}-${safe_job}-${run_id}-${run_attempt}.tar.gz"

mkdir -p "$log_dir" "$archive_dir"

if [ ! -f "$log_dir/MANIFEST.tsv" ]; then
  printf 'created_at_utc\tworkflow\tjob\trun_id\trun_attempt\tref\tsha\n' > "$log_dir/MANIFEST.tsv"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$created_at" "$workflow" "$job" "$run_id" "$run_attempt" "$ref" "$sha" >> "$log_dir/MANIFEST.tsv"
fi

find "$log_dir" -type f -name '*.log' -print | sort > "$log_dir/FILES.txt"
tar -czf "$archive_dir/$archive_name" -C "$log_dir" .

printf 'COMMAND_LOG_ARCHIVE=%s\n' "$archive_dir/$archive_name" >> "${GITHUB_ENV:-/dev/null}"
printf 'COMMAND_LOG_ARCHIVE_NAME=%s\n' "$archive_name" >> "${GITHUB_ENV:-/dev/null}"
printf 'archive_path=%s\n' "$archive_dir/$archive_name" >> "${GITHUB_OUTPUT:-/dev/null}"
printf 'archive_name=%s\n' "$archive_name" >> "${GITHUB_OUTPUT:-/dev/null}"
