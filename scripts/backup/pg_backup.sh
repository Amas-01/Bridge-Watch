#!/usr/bin/env bash
#
# pg_backup.sh
#
# Creates a compressed pg_dump of the TimescaleDB schema (structure + data)
# and uploads it to configured cloud storage (S3-compatible).
#
# Required environment variables (matching Bridge-Watch's .env.example convention):
#   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
#   BACKUP_S3_BUCKET                                 - target bucket
#   BACKUP_S3_PREFIX                                 - optional key prefix (default: "db-backups")
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY          - or an assumed IAM role in CI
#
# Optional environment variables:
#   BACKUP_RETENTION_DAYS  - days of backups to keep in S3 (default: 30)
#   BACKUP_SCHEMAS         - comma separated list of schemas to dump (default: all)
#
# Usage:
#   ./pg_backup.sh

set -euo pipefail

log() {
  echo "[pg_backup] $(date -u +'%Y-%m-%dT%H:%M:%SZ') - $*"
}

fail() {
  echo "[pg_backup] ERROR: $*" >&2
  exit 1
}

# --- Validate required env vars -------------------------------------------
: "${POSTGRES_HOST:?POSTGRES_HOST is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"

# Map to libpq's expected env vars for pg_dump
export PGHOST="${POSTGRES_HOST}"
export PGPORT="${POSTGRES_PORT:-5432}"
export PGDATABASE="${POSTGRES_DB}"
export PGUSER="${POSTGRES_USER}"
export PGPASSWORD="${POSTGRES_PASSWORD:-}"

BACKUP_S3_PREFIX="${BACKUP_S3_PREFIX:-db-backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
WORKDIR="$(mktemp -d)"
DUMP_FILE="${WORKDIR}/${PGDATABASE}_${TIMESTAMP}.dump"
COMPRESSED_FILE="${DUMP_FILE}.gz"

cleanup() {
  rm -rf "${WORKDIR}"
}
trap cleanup EXIT

command -v pg_dump >/dev/null 2>&1 || fail "pg_dump not found on PATH"
command -v aws >/dev/null 2>&1 || fail "aws CLI not found on PATH"

# --- Build pg_dump args -----------------------------------------------------
DUMP_ARGS=(-Fc --no-owner --no-privileges -f "${DUMP_FILE}")

if [[ -n "${BACKUP_SCHEMAS:-}" ]]; then
  IFS=',' read -ra SCHEMAS <<< "${BACKUP_SCHEMAS}"
  for schema in "${SCHEMAS[@]}"; do
    DUMP_ARGS+=(--schema="${schema}")
  done
  log "Restricting dump to schemas: ${BACKUP_SCHEMAS}"
else
  log "Dumping all schemas in ${PGDATABASE}"
fi

# --- Dump --------------------------------------------------------------------
log "Starting pg_dump for database '${PGDATABASE}' on host '${PGHOST}'"
pg_dump "${DUMP_ARGS[@]}"
log "pg_dump complete: ${DUMP_FILE} ($(du -h "${DUMP_FILE}" | cut -f1))"

# --- Compress ------------------------------------------------------------
gzip -9 "${DUMP_FILE}"
log "Compressed backup: ${COMPRESSED_FILE} ($(du -h "${COMPRESSED_FILE}" | cut -f1))"

# --- Checksum for restore-time integrity verification -----------------------
CHECKSUM_FILE="${COMPRESSED_FILE}.sha256"
sha256sum "${COMPRESSED_FILE}" | awk '{print $1}' > "${CHECKSUM_FILE}"

# --- Upload ------------------------------------------------------------------
S3_KEY="${BACKUP_S3_PREFIX}/${PGDATABASE}/$(basename "${COMPRESSED_FILE}")"
S3_CHECKSUM_KEY="${S3_KEY}.sha256"

log "Uploading backup to s3://${BACKUP_S3_BUCKET}/${S3_KEY}"
aws s3 cp "${COMPRESSED_FILE}" "s3://${BACKUP_S3_BUCKET}/${S3_KEY}" --only-show-errors
aws s3 cp "${CHECKSUM_FILE}" "s3://${BACKUP_S3_BUCKET}/${S3_CHECKSUM_KEY}" --only-show-errors

log "Upload complete."

# --- Retention cleanup (best-effort, does not fail the job) ------------------
log "Pruning backups older than ${BACKUP_RETENTION_DAYS} days"
CUTOFF_EPOCH=$(( $(date -u +%s) - BACKUP_RETENTION_DAYS * 86400 ))

aws s3api list-objects-v2 \
  --bucket "${BACKUP_S3_BUCKET}" \
  --prefix "${BACKUP_S3_PREFIX}/${PGDATABASE}/" \
  --query "Contents[?LastModified!=null].[Key,LastModified]" \
  --output text 2>/dev/null | while read -r KEY LASTMOD _TIME; do
    [[ -z "${KEY:-}" ]] && continue
    OBJ_EPOCH=$(date -u -d "${LASTMOD} ${_TIME}" +%s 2>/dev/null || echo 0)
    if [[ "${OBJ_EPOCH}" -gt 0 && "${OBJ_EPOCH}" -lt "${CUTOFF_EPOCH}" ]]; then
      log "Deleting expired backup: ${KEY}"
      aws s3 rm "s3://${BACKUP_S3_BUCKET}/${KEY}" --only-show-errors || true
    fi
  done

log "Backup job finished successfully."