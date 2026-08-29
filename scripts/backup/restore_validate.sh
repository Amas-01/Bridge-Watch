#!/usr/bin/env bash
#
# restore_validate.sh
#
# Downloads the latest (or a specified) backup from cloud storage, restores it
# into a scratch database, and runs sanity checks. Intended for developers to
# verify backups are actually restorable, and for periodic CI restore-drills.
#
# Required environment variables (matching Bridge-Watch's .env.example convention):
#   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD
#                                        - Postgres connection (needs a role
#                                          allowed to CREATE DATABASE)
#   BACKUP_S3_BUCKET                    - source bucket
#   BACKUP_S3_PREFIX                    - key prefix (default: "db-backups")
#   SOURCE_DATABASE                     - original database name the backup was taken from
#
# Optional environment variables:
#   RESTORE_DATABASE   - name of the scratch DB to restore into
#                         (default: "${SOURCE_DATABASE}_restore_validate")
#   BACKUP_KEY         - specific S3 key to restore (default: latest for SOURCE_DATABASE)
#   KEEP_RESTORED_DB   - if "true", don't drop the scratch DB afterwards (default: false)
#
# Usage:
#   ./restore_validate.sh

set -euo pipefail

log() {
  echo "[restore_validate] $(date -u +'%Y-%m-%dT%H:%M:%SZ') - $*"
}

fail() {
  echo "[restore_validate] ERROR: $*" >&2
  exit 1
}

: "${POSTGRES_HOST:?POSTGRES_HOST is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
: "${SOURCE_DATABASE:?SOURCE_DATABASE is required}"

# Map to libpq's expected env vars for psql/pg_restore
export PGHOST="${POSTGRES_HOST}"
export PGPORT="${POSTGRES_PORT:-5432}"
export PGUSER="${POSTGRES_USER}"
export PGPASSWORD="${POSTGRES_PASSWORD:-}"

BACKUP_S3_PREFIX="${BACKUP_S3_PREFIX:-db-backups}"
RESTORE_DATABASE="${RESTORE_DATABASE:-${SOURCE_DATABASE}_restore_validate}"
KEEP_RESTORED_DB="${KEEP_RESTORED_DB:-false}"
WORKDIR="$(mktemp -d)"

cleanup() {
  rm -rf "${WORKDIR}"
}
trap cleanup EXIT

command -v pg_restore >/dev/null 2>&1 || fail "pg_restore not found on PATH"
command -v aws >/dev/null 2>&1 || fail "aws CLI not found on PATH"
command -v psql >/dev/null 2>&1 || fail "psql not found on PATH"

# --- Determine which backup to restore --------------------------------------
if [[ -z "${BACKUP_KEY:-}" ]]; then
  log "No BACKUP_KEY given, finding latest backup for ${SOURCE_DATABASE}"
  BACKUP_KEY=$(aws s3api list-objects-v2 \
    --bucket "${BACKUP_S3_BUCKET}" \
    --prefix "${BACKUP_S3_PREFIX}/${SOURCE_DATABASE}/" \
    --query "sort_by(Contents[?ends_with(Key, '.gz')], &LastModified)[-1].Key" \
    --output text)
  [[ -z "${BACKUP_KEY}" || "${BACKUP_KEY}" == "None" ]] && fail "No backups found for ${SOURCE_DATABASE}"
fi

log "Restoring from s3://${BACKUP_S3_BUCKET}/${BACKUP_KEY}"

LOCAL_GZ="${WORKDIR}/backup.dump.gz"
LOCAL_DUMP="${WORKDIR}/backup.dump"

aws s3 cp "s3://${BACKUP_S3_BUCKET}/${BACKUP_KEY}" "${LOCAL_GZ}" --only-show-errors

# --- Checksum verification (best-effort) -------------------------------
if aws s3 cp "s3://${BACKUP_S3_BUCKET}/${BACKUP_KEY}.sha256" "${WORKDIR}/backup.sha256" --only-show-errors 2>/dev/null; then
  EXPECTED_SUM=$(cat "${WORKDIR}/backup.sha256")
  ACTUAL_SUM=$(sha256sum "${LOCAL_GZ}" | awk '{print $1}')
  [[ "${EXPECTED_SUM}" == "${ACTUAL_SUM}" ]] || fail "Checksum mismatch — backup file may be corrupted"
  log "Checksum verified OK"
else
  log "No checksum file found for this backup, skipping integrity check"
fi

gunzip -k "${LOCAL_GZ}" -c > "${LOCAL_DUMP}"

# --- Create scratch database -----------------------------------------------
log "Dropping (if exists) and creating scratch database '${RESTORE_DATABASE}'"
psql -h "${PGHOST}" -U "${PGUSER}" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"${RESTORE_DATABASE}\";"
psql -h "${PGHOST}" -U "${PGUSER}" -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"${RESTORE_DATABASE}\";"

# --- Restore -----------------------------------------------------------------
log "Running pg_restore into '${RESTORE_DATABASE}'"
pg_restore -h "${PGHOST}" -U "${PGUSER}" -d "${RESTORE_DATABASE}" \
  --no-owner --no-privileges --exit-on-error "${LOCAL_DUMP}"

# --- Validation checks ---------------------------------------------------
log "Running validation checks"

TABLE_COUNT=$(psql -h "${PGHOST}" -U "${PGUSER}" -d "${RESTORE_DATABASE}" -t -A \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');")

if [[ "${TABLE_COUNT}" -lt 1 ]]; then
  fail "Validation failed: restored database has no user tables"
fi
log "Validation passed: ${TABLE_COUNT} table(s) found in restored database"

# Spot-check TimescaleDB hypertables survived the restore, if the extension is present
HYPERTABLE_CHECK=$(psql -h "${PGHOST}" -U "${PGUSER}" -d "${RESTORE_DATABASE}" -t -A \
  -c "SELECT count(*) FROM pg_extension WHERE extname = 'timescaledb';" 2>/dev/null || echo "0")

if [[ "${HYPERTABLE_CHECK}" -gt 0 ]]; then
  HYPERTABLE_COUNT=$(psql -h "${PGHOST}" -U "${PGUSER}" -d "${RESTORE_DATABASE}" -t -A \
    -c "SELECT count(*) FROM timescaledb_information.hypertables;" 2>/dev/null || echo "0")
  log "TimescaleDB extension present, ${HYPERTABLE_COUNT} hypertable(s) restored"
fi

# --- Cleanup -----------------------------------------------------------------
if [[ "${KEEP_RESTORED_DB}" != "true" ]]; then
  log "Dropping scratch database '${RESTORE_DATABASE}'"
  psql -h "${PGHOST}" -U "${PGUSER}" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"${RESTORE_DATABASE}\";"
else
  log "KEEP_RESTORED_DB=true, leaving '${RESTORE_DATABASE}' in place for inspection"
fi

log "Restore validation finished successfully."