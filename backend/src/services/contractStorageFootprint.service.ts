import { randomUUID } from "crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type FootprintStatus = "healthy" | "warning" | "critical";
export type FootprintTrend = "increasing" | "decreasing" | "stable";

export interface StorageThresholds {
  warningBytes: number;
  criticalBytes: number;
}

/** Applies to any contract without an explicit override. */
export const DEFAULT_STORAGE_THRESHOLDS: StorageThresholds = {
  warningBytes: 64 * 1024, // 64 KiB
  criticalBytes: 256 * 1024, // 256 KiB
};

export interface RecordSnapshotInput {
  contractId: string;
  label?: string | null;
  ledgerSeq: number;
  persistentEntries: number;
  temporaryEntries: number;
  instanceEntries: number;
  totalSizeBytes: number;
  minRentExpirationLedger?: number | null;
  recordedAt?: Date;
}

export interface ContractStorageSnapshot {
  id: string;
  contractId: string;
  label: string | null;
  ledgerSeq: number;
  persistentEntries: number;
  temporaryEntries: number;
  instanceEntries: number;
  totalSizeBytes: number;
  minRentExpirationLedger: number | null;
  recordedAt: string;
}

export interface ContractFootprintSummary extends ContractStorageSnapshot {
  status: FootprintStatus;
  trend: FootprintTrend;
  growthBytesPerDay: number;
}

export interface FootprintDashboard {
  generatedAt: string;
  totalContracts: number;
  totalSizeBytes: number;
  statusCounts: Record<FootprintStatus, number>;
  contracts: ContractFootprintSummary[];
}

/** Pure so status thresholds can be unit tested without a database. */
export function computeFootprintStatus(
  totalSizeBytes: number,
  thresholds: StorageThresholds = DEFAULT_STORAGE_THRESHOLDS
): FootprintStatus {
  if (totalSizeBytes >= thresholds.criticalBytes) return "critical";
  if (totalSizeBytes >= thresholds.warningBytes) return "warning";
  return "healthy";
}

/** Pure so growth-rate math can be unit tested without a database. */
export function computeGrowth(
  current: { totalSizeBytes: number; recordedAt: Date },
  previous: { totalSizeBytes: number; recordedAt: Date } | null
): { trend: FootprintTrend; growthBytesPerDay: number } {
  if (!previous) {
    return { trend: "stable", growthBytesPerDay: 0 };
  }

  const elapsedMs = current.recordedAt.getTime() - previous.recordedAt.getTime();
  if (elapsedMs <= 0) {
    return { trend: "stable", growthBytesPerDay: 0 };
  }

  const deltaBytes = current.totalSizeBytes - previous.totalSizeBytes;
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);
  const growthBytesPerDay = deltaBytes / elapsedDays;

  const trend: FootprintTrend =
    Math.abs(growthBytesPerDay) < 1 ? "stable" : growthBytesPerDay > 0 ? "increasing" : "decreasing";

  return { trend, growthBytesPerDay };
}

function mapRow(row: any): ContractStorageSnapshot {
  return {
    id: row.id,
    contractId: row.contract_id,
    label: row.label ?? null,
    ledgerSeq: row.ledger_seq,
    persistentEntries: row.persistent_entries,
    temporaryEntries: row.temporary_entries,
    instanceEntries: row.instance_entries,
    totalSizeBytes: Number(row.total_size_bytes),
    minRentExpirationLedger: row.min_rent_expiration_ledger ?? null,
    recordedAt: new Date(row.recorded_at).toISOString(),
  };
}

export class ContractStorageFootprintService {
  private readonly db = getDatabase();

  async recordSnapshot(input: RecordSnapshotInput): Promise<ContractStorageSnapshot> {
    const [row] = await this.db("contract_storage_snapshots")
      .insert({
        id: randomUUID(),
        contract_id: input.contractId,
        label: input.label ?? null,
        ledger_seq: input.ledgerSeq,
        persistent_entries: input.persistentEntries,
        temporary_entries: input.temporaryEntries,
        instance_entries: input.instanceEntries,
        total_size_bytes: input.totalSizeBytes,
        min_rent_expiration_ledger: input.minRentExpirationLedger ?? null,
        recorded_at: input.recordedAt ?? new Date(),
      })
      .returning("*");

    logger.info(
      { contractId: input.contractId, totalSizeBytes: input.totalSizeBytes },
      "Contract storage snapshot recorded"
    );

    return mapRow(row);
  }

  async getContractHistory(contractId: string, limit = 50): Promise<ContractStorageSnapshot[]> {
    const rows = await this.db("contract_storage_snapshots")
      .where("contract_id", contractId)
      .orderBy("recorded_at", "desc")
      .limit(limit);

    return rows.map(mapRow);
  }

  async getDashboard(options: { thresholds?: StorageThresholds } = {}): Promise<FootprintDashboard> {
    const thresholds = options.thresholds ?? DEFAULT_STORAGE_THRESHOLDS;

    const rows = await this.db("contract_storage_snapshots").orderBy("recorded_at", "desc");
    const snapshots = rows.map(mapRow);

    const latestByContract = new Map<string, ContractStorageSnapshot>();
    const previousByContract = new Map<string, ContractStorageSnapshot>();

    for (const snapshot of snapshots) {
      if (!latestByContract.has(snapshot.contractId)) {
        latestByContract.set(snapshot.contractId, snapshot);
      } else if (!previousByContract.has(snapshot.contractId)) {
        previousByContract.set(snapshot.contractId, snapshot);
      }
    }

    const statusCounts: Record<FootprintStatus, number> = { healthy: 0, warning: 0, critical: 0 };
    let totalSizeBytes = 0;

    const contracts: ContractFootprintSummary[] = Array.from(latestByContract.values())
      .map((latest) => {
        const previous = previousByContract.get(latest.contractId) ?? null;
        const { trend, growthBytesPerDay } = computeGrowth(
          { totalSizeBytes: latest.totalSizeBytes, recordedAt: new Date(latest.recordedAt) },
          previous
            ? { totalSizeBytes: previous.totalSizeBytes, recordedAt: new Date(previous.recordedAt) }
            : null
        );
        const status = computeFootprintStatus(latest.totalSizeBytes, thresholds);

        statusCounts[status] += 1;
        totalSizeBytes += latest.totalSizeBytes;

        return { ...latest, status, trend, growthBytesPerDay };
      })
      .sort((a, b) => b.totalSizeBytes - a.totalSizeBytes);

    return {
      generatedAt: new Date().toISOString(),
      totalContracts: contracts.length,
      totalSizeBytes,
      statusCounts,
      contracts,
    };
  }
}

export const contractStorageFootprintService = new ContractStorageFootprintService();
