/**
 * Timeline event types and interfaces for the Recent Activity Timeline
 */

export type TimelineEventType = "bridge" | "asset" | "alert" | "transaction" | "health";

export type TimelineEventSeverity = "info" | "warning" | "critical";

export type TimelineEventStatus = "active" | "resolved" | "pending" | "completed" | "failed";

/**
 * Base timeline event interface
 */
export interface BaseTimelineEvent {
  id: string;
  type: TimelineEventType;
  timestamp: string;
  title: string;
  description: string;
  severity?: TimelineEventSeverity;
  status?: TimelineEventStatus;
  metadata?: Record<string, unknown>;
}

/**
 * Bridge-related timeline event
 */
export interface BridgeTimelineEvent extends BaseTimelineEvent {
  type: "bridge";
  bridgeName: string;
  bridgeStatus: "healthy" | "degraded" | "down" | "unknown";
  totalValueLocked?: number;
  mismatchPercentage?: number;
}

/**
 * Asset-related timeline event
 */
export interface AssetTimelineEvent extends BaseTimelineEvent {
  type: "asset";
  assetSymbol: string;
  assetName?: string;
  healthScore?: number;
  priceChange?: number;
}

/**
 * Alert-related timeline event
 */
export interface AlertTimelineEvent extends BaseTimelineEvent {
  type: "alert";
  severity: TimelineEventSeverity;
  assetSymbol?: string;
  bridgeName?: string;
  alertType?: string;
}

/**
 * Transaction-related timeline event
 */
export interface TransactionTimelineEvent extends BaseTimelineEvent {
  type: "transaction";
  status: TimelineEventStatus;
  txHash: string;
  bridge: string;
  asset: string;
  amount: number;
  sourceChain: string;
  destinationChain: string;
}

/**
 * Health score update timeline event
 */
export interface HealthTimelineEvent extends BaseTimelineEvent {
  type: "health";
  assetSymbol: string;
  previousScore: number;
  currentScore: number;
  trend: "improving" | "stable" | "deteriorating";
}

/**
 * Union type for all timeline events
 */
export type TimelineEvent =
  | BridgeTimelineEvent
  | AssetTimelineEvent
  | AlertTimelineEvent
  | TransactionTimelineEvent
  | HealthTimelineEvent;

/**
 * Timeline filter options
 */
export interface TimelineFilters {
  types: TimelineEventType[];
  severities: TimelineEventSeverity[];
  statuses: TimelineEventStatus[];
  searchQuery: string;
  dateFrom?: string;
  dateTo?: string;
  assetSymbol?: string;
  bridgeName?: string;
}

/**
 * Timeline display mode
 */
export type TimelineDisplayMode = "compact" | "expanded";

/**
 * Timeline sort options
 */
export type TimelineSortOrder = "newest" | "oldest";
