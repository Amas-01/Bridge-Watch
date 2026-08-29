export type TaskStatus =
  | "pending"
  | "ready"
  | "leased"
  | "running"
  | "completed"
  | "failed"
  | "paused"
  | "cancelled";

export interface BackfillTask {
  id: string;
  sourceType: string;
  from: number;
  to: number;
  dependencies: string[];
  finalityRequirement: number;
  decoderEpoch?: string;
  priority: number;
  targetView?: string;
  metadata?: Record<string, unknown>;
}

export interface ScheduledChunk {
  taskId: string;
  chunkIndex: number;
  from: number;
  to: number;
  status: TaskStatus;
  leaseId?: string;
  leaseExpiresAt?: Date;
  attempts: number;
  maxAttempts: number;
  checksum?: string;
}

export interface BackfillPlan {
  id: string;
  tasks: BackfillTask[];
  edges: Array<{ from: string; to: string }>;
  scheduledChunks: ScheduledChunk[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BackfillDAG {
  tasks: Map<string, BackfillTask>;
  adjacency: Map<string, Set<string>>;
  reverseAdjacency: Map<string, Set<string>>;
}

export interface CapacityBudget {
  totalRatePerSecond: number;
  reservedForLive: number;
  availableForBackfill: number;
  currentBackfillUsage: number;
}

export interface CompletenessReport {
  totalExpected: number;
  totalCompleted: number;
  missingRanges: Array<{ from: number; to: number }>;
  isComplete: boolean;
}

export interface OutputVerification {
  taskId: string;
  liveChecksum: string;
  backfillChecksum: string;
  match: boolean;
  differences?: string[];
}
