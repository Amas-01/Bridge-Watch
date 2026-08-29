# Database Backup & Restore Pipeline

## Overview

This document describes the automated backup strategy for the TimescaleDB
database, covering schema and analytics historical state (metric trends).
Prior to this change, there was no automated backup process — a database
failure would have resulted in permanent loss of historical metrics.

## Components

| Component | Path | Purpose |
|---|---|---|
| Backup script | `scripts/backup/pg_backup.sh` | Runs `pg_dump`, compresses, uploads to S3, prunes old backups |
| Restore/validation script | `scripts/backup/restore_validate.sh` | Restores latest backup into a scratch DB and validates it |
| Backup service | `backend/src/services/backupService.ts` | Thin TS wrapper around the two scripts, so results can be inspected/logged programmatically (e.g. from an admin route or scheduled job) rather than only as raw process output |
| CI workflow | `.github/workflows/db-backup.yml` | Schedules the backup job weekly (Sundays, 03:00 UTC) |

## Database migrations

None required. This feature only adds backup/restore tooling around the
existing schema — it does not alter any tables, columns, or hypertables.

## How it works

1. **Backup**: `pg_backup.sh` runs `pg_dump` in custom (`-Fc`) format, which
   supports selective/parallel restore. The output is gzip-compressed and
   uploaded to `s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/$POSTGRES_DB/`, along
   with a `.sha256` checksum file for integrity verification at restore time.
2. **Retention**: after each successful upload, the script prunes objects
   older than `BACKUP_RETENTION_DAYS` (default 30) from the same prefix.
3. **Schedule**: the GitHub Actions workflow runs the backup script weekly.
   It can also be triggered manually via `workflow_dispatch`.
4. **Restore validation**: `restore_validate.sh` downloads the latest (or a
   specified) backup, verifies its checksum, restores it into a disposable
   database (`<db>_restore_validate` by default), and checks that tables —
   and TimescaleDB hypertables, if applicable — came back intact. It cleans
   up the scratch database afterward unless `KEEP_RESTORED_DB=true`.

## Required configuration

Reuses the existing `POSTGRES_*` variables already defined in
`.env.example` (`POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`,
`POSTGRES_USER`, `POSTGRES_PASSWORD`). Add the following new ones for
backup storage — suggested addition to `.env.example`:

```
# -----------------------------------------------------------------------------
# Database Backups
# -----------------------------------------------------------------------------
BACKUP_S3_BUCKET=
BACKUP_S3_PREFIX=db-backups
BACKUP_RETENTION_DAYS=30
```

Set the equivalents as repository secrets for the CI workflow: `POSTGRES_HOST`,
`POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`,
`BACKUP_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`.

## Running locally

```bash
export POSTGRES_HOST=localhost POSTGRES_DB=bridge_watch POSTGRES_USER=bridge_watch POSTGRES_PASSWORD=secret
export BACKUP_S3_BUCKET=my-backups-bucket
./scripts/backup/pg_backup.sh
```

To verify a backup actually restores cleanly:

```bash
export SOURCE_DATABASE=bridge_watch
./scripts/backup/restore_validate.sh
```

## Recovery runbook (manual, full restore)

In a real incident, restoring into the *live* database name (not a scratch
DB) requires care:

1. Confirm the target Postgres instance is reachable and no application
   traffic is being written to it (put the app in maintenance mode).
2. Download the desired backup and checksum from S3, verify the checksum.
3. Create a new database, or drop/recreate the existing one if you are
   certain you want to fully overwrite it.
4. Run `pg_restore --no-owner --no-privileges -d <target_db> <dump_file>`.
5. Run the same validation queries used in `restore_validate.sh` to confirm
   table and hypertable counts look correct before resuming traffic.

## Testing this pipeline

- CI runs the backup weekly; a failed run raises a workflow annotation.
- Recommend periodically (e.g. monthly) running `restore_validate.sh`
  manually or via a second scheduled workflow, to confirm backups are not
  just being created but are actually restorable — an untested backup is
  not a real backup.
- `backend/src/services/backupService.ts` is covered by unit tests at
  `backend/tests/unit/services/backupService.test.ts`, mocking
  `child_process` to verify success, script-failure, and spawn-failure
  paths without touching a real database or S3 bucket.