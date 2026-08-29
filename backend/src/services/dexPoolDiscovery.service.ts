import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { PoolService, type LiquidityPool } from "./pool.service.js";

// =============================================================================
// TYPES
// =============================================================================

export type DiscoveryRunStatus = "running" | "completed" | "failed";
export type RegisteredPoolStatus = "active" | "delisted";

export interface DiscoveryRun {
  id: string;
  dex: string;
  status: DiscoveryRunStatus;
  poolsSeen: number;
  poolsAdded: number;
  poolsUpdated: number;
  poolsDelisted: number;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
}

export interface RegisteredPool {
  id: string;
  dex: string;
  poolKey: string;
  assetA: string;
  assetB: string;
  contractAddress: string | null;
  totalLiquidity: number;
  status: RegisteredPoolStatus;
  firstSeenAt: Date;
  lastSeenAt: Date;
  delistedAt: Date | null;
  lastRunId: string | null;
}

/** Where the candidate pools for a DEX come from. Swapped out in tests. */
export type PoolSource = (dex: string) => Promise<LiquidityPool[]>;

// =============================================================================
// DEX POOL DISCOVERY SERVICE (#1157)
// =============================================================================

/**
 * Keeps `dex_pool_registry` in step with what each DEX adapter currently
 * reports, and records every reconciliation as a run.
 *
 * A pool that disappears is marked `delisted` rather than deleted — an adapter
 * outage should be visible as a suspicious delisting spike, not silently erase
 * history. A pool that comes back is simply re-activated.
 */
export class DexPoolDiscoveryService {
  constructor(private readonly poolSource: PoolSource = defaultPoolSource) {}

  /**
   * Reconcile one DEX. Returns the completed (or failed) run record.
   */
  async refreshDex(dex: string): Promise<DiscoveryRun> {
    const db = getDatabase();
    const startedAt = new Date();

    const [runRow] = await db("dex_pool_discovery_runs")
      .insert({ dex, status: "running", started_at: startedAt })
      .returning("*");
    const runId = runRow.id as string;

    try {
      const pools = await this.poolSource(dex);
      let added = 0;
      let updated = 0;

      for (const pool of pools) {
        const existing = await db("dex_pool_registry")
          .where({ dex, pool_key: pool.id })
          .first();

        if (existing) {
          await db("dex_pool_registry")
            .where({ id: existing.id })
            .update({
              asset_a: pool.assetA,
              asset_b: pool.assetB,
              contract_address: pool.contractAddress ?? null,
              total_liquidity: pool.totalLiquidity,
              status: "active",
              last_seen_at: startedAt,
              delisted_at: null,
              last_run_id: runId,
            });
          updated += 1;
        } else {
          await db("dex_pool_registry").insert({
            dex,
            pool_key: pool.id,
            asset_a: pool.assetA,
            asset_b: pool.assetB,
            contract_address: pool.contractAddress ?? null,
            total_liquidity: pool.totalLiquidity,
            status: "active",
            first_seen_at: startedAt,
            last_seen_at: startedAt,
            last_run_id: runId,
          });
          added += 1;
        }
      }

      // Anything active that this run did not report is delisted. Matching on
      // the seen keys rather than on `last_seen_at < startedAt` keeps this exact
      // when two refreshes land inside the same clock tick.
      let delistQuery = db("dex_pool_registry").where({ dex, status: "active" });
      const seenKeys = pools.map((p) => p.id);
      if (seenKeys.length > 0) {
        delistQuery = delistQuery.whereNotIn("pool_key", seenKeys);
      }
      const delisted = await delistQuery.update({
        status: "delisted",
        delisted_at: startedAt,
        last_run_id: runId,
      });

      const completedAt = new Date();
      const [done] = await db("dex_pool_discovery_runs")
        .where({ id: runId })
        .update({
          status: "completed",
          pools_seen: pools.length,
          pools_added: added,
          pools_updated: updated,
          pools_delisted: Number(delisted ?? 0),
          completed_at: completedAt,
          duration_ms: completedAt.getTime() - startedAt.getTime(),
        })
        .returning("*");

      logger.info(
        { dex, runId, seen: pools.length, added, updated, delisted },
        "DEX pool discovery refresh completed"
      );
      return mapRun(done ?? { ...runRow, status: "completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Discovery failed";
      logger.error({ dex, runId, error }, "DEX pool discovery refresh failed");

      const [failed] = await db("dex_pool_discovery_runs")
        .where({ id: runId })
        .update({
          status: "failed",
          error_message: message.slice(0, 1000),
          completed_at: new Date(),
        })
        .returning("*");
      return mapRun(failed ?? { ...runRow, status: "failed", error_message: message });
    }
  }

  /**
   * Reconcile every DEX we have ever seen, plus any explicitly requested.
   * One DEX failing does not stop the others.
   */
  async refreshAll(dexes: string[]): Promise<DiscoveryRun[]> {
    const runs: DiscoveryRun[] = [];
    for (const dex of dexes) {
      runs.push(await this.refreshDex(dex));
    }
    return runs;
  }

  async listPools(filters: {
    dex?: string;
    status?: RegisteredPoolStatus;
    limit?: number;
  } = {}): Promise<RegisteredPool[]> {
    const db = getDatabase();
    let query = db("dex_pool_registry");
    if (filters.dex) query = query.where("dex", filters.dex);
    if (filters.status) query = query.where("status", filters.status);

    const rows = await query
      .orderBy("total_liquidity", "desc")
      .limit(Math.min(filters.limit ?? 100, 500));
    return rows.map(mapPool);
  }

  async listRuns(dex?: string, limit = 20): Promise<DiscoveryRun[]> {
    const db = getDatabase();
    let query = db("dex_pool_discovery_runs");
    if (dex) query = query.where("dex", dex);

    const rows = await query.orderBy("started_at", "desc").limit(Math.min(limit, 100));
    return rows.map(mapRun);
  }

  async getLatestRun(dex: string): Promise<DiscoveryRun | null> {
    const db = getDatabase();
    const row = await db("dex_pool_discovery_runs")
      .where({ dex })
      .orderBy("started_at", "desc")
      .first();
    return row ? mapRun(row) : null;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

const defaultPoolSource: PoolSource = async (dex) => {
  // PoolService opens a DB handle in its constructor, so build it per call
  // rather than at module load.
  const pools = await new PoolService().getAllPools();
  return pools.filter((p) => p.dex === dex);
};

function mapRun(row: Record<string, unknown>): DiscoveryRun {
  return {
    id: row.id as string,
    dex: row.dex as string,
    status: row.status as DiscoveryRunStatus,
    poolsSeen: Number(row.pools_seen ?? 0),
    poolsAdded: Number(row.pools_added ?? 0),
    poolsUpdated: Number(row.pools_updated ?? 0),
    poolsDelisted: Number(row.pools_delisted ?? 0),
    errorMessage: (row.error_message as string | null) ?? null,
    startedAt: row.started_at as Date,
    completedAt: (row.completed_at as Date | null) ?? null,
    durationMs: row.duration_ms != null ? Number(row.duration_ms) : null,
  };
}

function mapPool(row: Record<string, unknown>): RegisteredPool {
  return {
    id: row.id as string,
    dex: row.dex as string,
    poolKey: row.pool_key as string,
    assetA: row.asset_a as string,
    assetB: row.asset_b as string,
    contractAddress: (row.contract_address as string | null) ?? null,
    totalLiquidity: Number(row.total_liquidity ?? 0),
    status: row.status as RegisteredPoolStatus,
    firstSeenAt: row.first_seen_at as Date,
    lastSeenAt: row.last_seen_at as Date,
    delistedAt: (row.delisted_at as Date | null) ?? null,
    lastRunId: (row.last_run_id as string | null) ?? null,
  };
}

export const dexPoolDiscoveryService = new DexPoolDiscoveryService();
