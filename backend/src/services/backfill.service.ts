import { backfillJobModel } from "../database/models/backfillJob.model.js";
import { runBackfill, type BackfillJobConfig, type BackfillDeps } from "./backfillOrchestrator.js";
import { logger } from "../utils/logger.js";

export class BackfillService {
  private activeJobs = new Map<string, { abort: () => void }>();

  async startBackfillForSource(sourceId: string, config: Omit<BackfillJobConfig, "completedChunks">, deps: Omit<BackfillDeps, "onEvent">): Promise<string> {
    if (this.activeJobs.has(sourceId)) {
      throw new Error(`A backfill is already running for source ${sourceId}`);
    }

    const previousJob = await backfillJobModel.getLatestForSource(sourceId);
    let completedChunks: number[] = [];
    
    if (previousJob && (previousJob.status === "STOPPED" || previousJob.status === "FAILED")) {
      try {
        completedChunks = JSON.parse(previousJob.completed_chunks);
      } catch {
        completedChunks = [];
      }
    }

    const job = await backfillJobModel.create({
      source_id: sourceId,
      status: "PENDING",
      range_start: config.rangeStart,
      range_end: config.rangeEnd,
      chunk_size: config.chunkSize,
      completed_chunks: JSON.stringify(completedChunks),
      failed_chunks: "[]",
    });

    const jobId = job.id!;

    let abortFlag = false;
    this.activeJobs.set(sourceId, {
      abort: () => { abortFlag = true; }
    });

    // Run asynchronously
    setImmediate(async () => {
      try {
        await backfillJobModel.updateStatus(jobId, "RUNNING");
        
        const fullDeps: BackfillDeps = {
          ...deps,
          processChunk: async (chunk) => {
            if (abortFlag) throw new Error("AbortRequested");
            await deps.processChunk(chunk);
          },
          onEvent: (event) => {
            // Ideally we could persist progress here if needed
          }
        };

        const result = await runBackfill({ ...config, completedChunks }, fullDeps);

        if (abortFlag) {
          await backfillJobModel.updateStatus(jobId, "STOPPED", {
            completed_chunks: JSON.stringify(result.completedChunks),
            failed_chunks: JSON.stringify(result.failedChunks),
          });
        } else {
          await backfillJobModel.updateStatus(jobId, result.failedChunks.length > 0 ? "FAILED" : "COMPLETED", {
            completed_chunks: JSON.stringify(result.completedChunks),
            failed_chunks: JSON.stringify(result.failedChunks),
          });
        }
      } catch (err) {
        logger.error({ sourceId, jobId, err }, "Backfill crashed completely");
        await backfillJobModel.updateStatus(jobId, "FAILED");
      } finally {
        this.activeJobs.delete(sourceId);
      }
    });

    return jobId;
  }

  async stopBackfillForSource(sourceId: string): Promise<void> {
    const active = this.activeJobs.get(sourceId);
    if (!active) {
      throw new Error(`No active backfill for source ${sourceId}`);
    }
    active.abort();
  }

  async getBackfillStatus(sourceId: string) {
    const job = await backfillJobModel.getLatestForSource(sourceId);
    if (!job) return null;
    return {
      id: job.id,
      sourceId: job.source_id,
      status: job.status,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      rangeStart: job.range_start,
      rangeEnd: job.range_end,
      chunkSize: job.chunk_size,
    };
  }
}

export const backfillService = new BackfillService();
