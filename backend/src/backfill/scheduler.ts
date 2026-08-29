import type { ScheduledChunk, TaskStatus } from "./types.js";

const LEASE_DURATION_MS = 5 * 60 * 1000;

interface LeaseEntry {
  chunkKey: string;
  expiresAt: number;
}

export class LeaseManager {
  private leases = new Map<string, LeaseEntry>();

  acquireLease(chunk: ScheduledChunk): string {
    const leaseId = `lease-${chunk.taskId}-${chunk.chunkIndex}-${Date.now()}`;
    const expiresAt = Date.now() + LEASE_DURATION_MS;

    const existingKey = `${chunk.taskId}:${chunk.chunkIndex}`;
    const existing = this.leases.get(existingKey);

    if (existing && existing.expiresAt > Date.now()) {
      throw new Error(
        `Chunk ${existingKey} is already leased`
      );
    }

    this.leases.set(existingKey, { chunkKey: existingKey, expiresAt });
    return leaseId;
  }

  releaseLease(taskId: string, chunkIndex: number): void {
    const key = `${taskId}:${chunkIndex}`;
    this.leases.delete(key);
  }

  isLeased(taskId: string, chunkIndex: number): boolean {
    const key = `${taskId}:${chunkIndex}`;
    const lease = this.leases.get(key);
    if (!lease) return false;

    if (lease.expiresAt <= Date.now()) {
      this.leases.delete(key);
      return false;
    }

    return true;
  }

  getExpiredLeases(): string[] {
    const expired: string[] = [];
    const now = Date.now();

    for (const [key, lease] of this.leases) {
      if (lease.expiresAt <= now) {
        expired.push(key);
        this.leases.delete(key);
      }
    }

    return expired;
  }
}

export class BackfillScheduler {
  private chunks: ScheduledChunk[];
  private leaseManager: LeaseManager;
  private statusMap: Map<string, TaskStatus>;

  constructor(chunks: ScheduledChunk[]) {
    this.chunks = chunks;
    this.leaseManager = new LeaseManager();
    this.statusMap = new Map();

    for (const chunk of chunks) {
      this.statusMap.set(this.chunkKey(chunk), chunk.status);
    }
  }

  private chunkKey(chunk: ScheduledChunk): string {
    return `${chunk.taskId}:${chunk.chunkIndex}`;
  }

  /**
   * Get the next batch of chunks eligible for execution.
   * Chunks are eligible if they are "ready" (not leased, not running, not completed).
   */
  getEligibleChunks(limit: number): ScheduledChunk[] {
    const eligible: ScheduledChunk[] = [];

    for (const chunk of this.chunks) {
      if (eligible.length >= limit) break;

      const key = this.chunkKey(chunk);
      const status = this.statusMap.get(key);

      if (
        (status === "pending" || status === "ready" || status === "paused") &&
        !this.leaseManager.isLeased(chunk.taskId, chunk.chunkIndex)
      ) {
        eligible.push(chunk);
      }
    }

    return eligible;
  }

  /**
   * Lease a chunk for execution. Returns the lease ID.
   */
  leaseChunk(chunk: ScheduledChunk): string {
    const leaseId = this.leaseManager.acquireLease(chunk);
    const key = this.chunkKey(chunk);
    this.statusMap.set(key, "leased");

    chunk.leaseId = leaseId;
    chunk.leaseExpiresAt = new Date(Date.now() + LEASE_DURATION_MS);

    return leaseId;
  }

  /**
   * Mark a chunk as running.
   */
  markRunning(chunk: ScheduledChunk): void {
    const key = this.chunkKey(chunk);
    this.statusMap.set(key, "running");
  }

  /**
   * Mark a chunk as completed.
   */
  markCompleted(chunk: ScheduledChunk, checksum?: string): void {
    const key = this.chunkKey(chunk);
    this.statusMap.set(key, "completed");
    chunk.status = "completed";
    chunk.checksum = checksum;

    this.leaseManager.releaseLease(chunk.taskId, chunk.chunkIndex);
  }

  /**
   * Mark a chunk as failed. If retries remain, it goes back to "pending".
   */
  markFailed(chunk: ScheduledChunk): void {
    const key = this.chunkKey(chunk);
    chunk.attempts++;

    if (chunk.attempts < chunk.maxAttempts) {
      this.statusMap.set(key, "pending");
      chunk.status = "pending";
    } else {
      this.statusMap.set(key, "failed");
      chunk.status = "failed";
    }

    this.leaseManager.releaseLease(chunk.taskId, chunk.chunkIndex);
  }

  /**
   * Pause all running/leased chunks.
   */
  pauseAll(): void {
    for (const chunk of this.chunks) {
      const key = this.chunkKey(chunk);
      const status = this.statusMap.get(key);
      if (status === "running" || status === "leased") {
        this.statusMap.set(key, "paused");
        chunk.status = "paused";
        this.leaseManager.releaseLease(chunk.taskId, chunk.chunkIndex);
      }
    }
  }

  /**
   * Resume all paused chunks.
   */
  resumeAll(): void {
    for (const chunk of this.chunks) {
      const key = this.chunkKey(chunk);
      const status = this.statusMap.get(key);
      if (status === "paused") {
        this.statusMap.set(key, "ready");
        chunk.status = "ready";
      }
    }
  }

  /**
   * Get progress summary.
   */
  getProgress(): {
    total: number;
    completed: number;
    failed: number;
    running: number;
    pending: number;
    paused: number;
    percent: number;
  } {
    let completed = 0;
    let failed = 0;
    let running = 0;
    let pending = 0;
    let paused = 0;

    for (const chunk of this.chunks) {
      const key = this.chunkKey(chunk);
      const status = this.statusMap.get(key);
      switch (status) {
        case "completed":
          completed++;
          break;
        case "failed":
          failed++;
          break;
        case "running":
        case "leased":
          running++;
          break;
        case "paused":
          paused++;
          break;
        default:
          pending++;
      }
    }

    const total = this.chunks.length;
    return {
      total,
      completed,
      failed,
      running,
      pending,
      paused,
      percent: total === 0 ? 100 : Math.round((completed / total) * 100),
    };
  }

  /**
   * Cleanup expired leases.
   */
  cleanupExpiredLeases(): string[] {
    return this.leaseManager.getExpiredLeases();
  }
}
