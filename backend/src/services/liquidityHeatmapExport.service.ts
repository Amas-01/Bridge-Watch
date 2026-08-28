import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type HeatmapInterval = "hour" | "day";

export interface LiquiditySnapshotRow {
  time: Date | string;
  symbol: string;
  dex: string;
  tvl_usd: number | string;
}

export interface HeatmapCell {
  bucket: string;
  symbol: string;
  dex: string;
  tvlUsd: number;
}

export interface HeatmapAxis {
  buckets: string[];
  symbols: string[];
  dexes: string[];
}

export interface LiquidityHeatmap {
  interval: HeatmapInterval;
  startDate: string | null;
  endDate: string | null;
  axis: HeatmapAxis;
  cells: HeatmapCell[];
  /** matrix[symbol][bucket] = summed TVL across all dexes for that symbol/bucket */
  matrix: Record<string, Record<string, number>>;
}

function truncateToBucket(date: Date, interval: HeatmapInterval): string {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  if (interval === "day") {
    d.setUTCHours(0);
    return d.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 13) + ":00:00.000Z";
}

/**
 * Historical liquidity heatmap export service (#1150).
 *
 * Aggregates raw liquidity snapshots into a symbol x time bucket matrix so
 * the frontend heatmap (and downstream reporting/export) doesn't need to
 * reprocess raw time-series rows on every render.
 */
export class LiquidityHeatmapExportService {
  /**
   * Pure aggregation over already-fetched rows, kept separate from the DB
   * query so the bucketing/matrix logic is unit testable without a database.
   */
  buildHeatmap(
    rows: LiquiditySnapshotRow[],
    options: { interval?: HeatmapInterval; startDate?: string; endDate?: string } = {}
  ): LiquidityHeatmap {
    const interval = options.interval ?? "day";

    const cellMap = new Map<string, HeatmapCell>();
    const buckets = new Set<string>();
    const symbols = new Set<string>();
    const dexes = new Set<string>();

    for (const row of rows) {
      const bucket = truncateToBucket(new Date(row.time), interval);
      const tvl = Number(row.tvl_usd) || 0;
      const key = `${row.symbol}|${row.dex}|${bucket}`;

      const existing = cellMap.get(key);
      if (existing) {
        existing.tvlUsd += tvl;
      } else {
        cellMap.set(key, { bucket, symbol: row.symbol, dex: row.dex, tvlUsd: tvl });
      }

      buckets.add(bucket);
      symbols.add(row.symbol);
      dexes.add(row.dex);
    }

    const cells = Array.from(cellMap.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));

    const matrix: Record<string, Record<string, number>> = {};
    for (const cell of cells) {
      matrix[cell.symbol] ??= {};
      matrix[cell.symbol][cell.bucket] = (matrix[cell.symbol][cell.bucket] ?? 0) + cell.tvlUsd;
    }

    return {
      interval,
      startDate: options.startDate ?? null,
      endDate: options.endDate ?? null,
      axis: {
        buckets: Array.from(buckets).sort(),
        symbols: Array.from(symbols).sort(),
        dexes: Array.from(dexes).sort(),
      },
      cells,
      matrix,
    };
  }

  async fetchSnapshots(params: {
    startDate: string;
    endDate: string;
    symbols?: string[];
  }): Promise<LiquiditySnapshotRow[]> {
    const db = getDatabase();
    const query = db("liquidity_snapshots")
      .select("time", "symbol", "dex", "tvl_usd")
      .where("time", ">=", params.startDate)
      .andWhere("time", "<=", params.endDate);

    if (params.symbols && params.symbols.length > 0) {
      query.andWhere("symbol", "in", params.symbols);
    }

    return query.orderBy("time", "asc");
  }

  async exportHeatmap(params: {
    startDate: string;
    endDate: string;
    symbols?: string[];
    interval?: HeatmapInterval;
  }): Promise<LiquidityHeatmap> {
    const rows = await this.fetchSnapshots(params);
    logger.info(
      { startDate: params.startDate, endDate: params.endDate, rowCount: rows.length },
      "Exporting historical liquidity heatmap"
    );
    return this.buildHeatmap(rows, {
      interval: params.interval,
      startDate: params.startDate,
      endDate: params.endDate,
    });
  }

  /**
   * Renders the heatmap as a symbol x bucket CSV matrix for spreadsheet-style
   * export/download workflows.
   */
  toCsv(heatmap: LiquidityHeatmap): string {
    const header = ["symbol", ...heatmap.axis.buckets];
    const rows = heatmap.axis.symbols.map((symbol) => {
      const values = heatmap.axis.buckets.map((bucket) =>
        (heatmap.matrix[symbol]?.[bucket] ?? 0).toString()
      );
      return [symbol, ...values].join(",");
    });
    return [header.join(","), ...rows].join("\n");
  }
}

export const liquidityHeatmapExportService = new LiquidityHeatmapExportService();
