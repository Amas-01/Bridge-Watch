import { spawn } from "node:child_process";
import path from "node:path";
import { logger } from "../utils/logger.js";

export interface BackupResult {
  success: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}

export interface RestoreValidationResult extends BackupResult {}

const SCRIPTS_DIR = path.resolve(process.cwd(), "..", "scripts", "backup");

/**
 * Runs a shell script to completion, capturing stdout/stderr rather than
 * inheriting them, so callers (e.g. an admin API route or a scheduled job)
 * can inspect or log the result programmatically instead of only relying
 * on raw process output.
 */
function runScript(scriptName: string, env: NodeJS.ProcessEnv): Promise<BackupResult> {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawn("bash", [scriptPath], {
      env: { ...process.env, ...env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      logger.error({ err, scriptName }, "Failed to spawn backup script");
      resolve({
        success: false,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr: stderr || err.message,
      });
    });

    child.on("close", (code) => {
      const success = code === 0;
      const durationMs = Date.now() - startedAt;

      if (success) {
        logger.info({ scriptName, durationMs }, "Backup script completed successfully");
      } else {
        logger.error({ scriptName, code, durationMs, stderr }, "Backup script failed");
      }

      resolve({ success, durationMs, stdout, stderr });
    });
  });
}

/**
 * Triggers a database backup via scripts/backup/pg_backup.sh.
 *
 * Requires POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD and
 * BACKUP_S3_BUCKET to already be present in the process environment (or
 * passed via `env`); the underlying script validates them and fails fast
 * if any are missing.
 */
export async function triggerBackup(
  env: NodeJS.ProcessEnv = {},
): Promise<BackupResult> {
  return runScript("pg_backup.sh", env);
}

/**
 * Triggers a restore-validation run via scripts/backup/restore_validate.sh.
 * Restores the latest backup into a scratch database, validates it, and
 * tears the scratch database down again (unless KEEP_RESTORED_DB=true is
 * passed in `env`).
 */
export async function triggerRestoreValidation(
  env: NodeJS.ProcessEnv = {},
): Promise<RestoreValidationResult> {
  return runScript("restore_validate.sh", env);
}