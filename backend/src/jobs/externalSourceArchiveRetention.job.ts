import { externalSourceResponseArchiveService } from "../services/externalSourceResponseArchive.service.js";
import { logger } from "../utils/logger.js";

/**
 * Retention sweep for the External Source Response Archive (#1162).
 *
 * Deletes archived responses past their `expires_at` horizon. Rows on legal
 * hold (`expires_at IS NULL`) are left in place. Scheduled daily; also
 * reachable on demand via `POST /api/v1/sources/response-archive/prune`.
 */
export async function runExternalSourceArchiveRetentionJob(): Promise<void> {
  logger.info("Running external source response archive retention job");
  try {
    const deleted = await externalSourceResponseArchiveService.pruneExpired();
    logger.info({ deleted }, "External source response archive retention job complete");
  } catch (error) {
    logger.error({ error }, "External source response archive retention job failed");
    throw error;
  }
}
