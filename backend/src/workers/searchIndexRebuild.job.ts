import type { Job } from "bullmq";
import { logger } from "../utils/logger.js";
import { SearchService } from "../services/search.service.js";

export async function processSearchIndexRebuild(job: Job): Promise<void> {
  const { full = false } = (job.data ?? {}) as { full?: boolean };
  logger.info({ jobId: job.id, full }, "Starting search index rebuild job");

  const searchService = new SearchService();

  try {
    if (full) {
      await searchService.rebuildSearchIndex();
      logger.info({ jobId: job.id }, "Full search index rebuild completed");
    } else {
      const status = await searchService.getIndexStatus();
      const staleTypes = status
        .filter((s) => {
          if (s.status === "error") return true;
          if (!s.lastIndexed) return true;
          const ageMs = Date.now() - new Date(s.lastIndexed).getTime();
          return ageMs > 5 * 60 * 1000;
        })
        .map((s) => s.entityType as "asset" | "bridge" | "incident" | "alert");

      if (staleTypes.length === 0) {
        logger.info({ jobId: job.id }, "Search index is fresh — nothing to rebuild");
        return;
      }

      await searchService.rebuildSearchIndex(staleTypes);
      logger.info({ jobId: job.id, rebuiltTypes: staleTypes }, "Incremental search index rebuild completed");
    }
  } catch (error) {
    logger.error({ jobId: job.id, error }, "Search index rebuild job failed");
    throw error;
  }
}
