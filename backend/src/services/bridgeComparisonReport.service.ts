import { BridgeService, type BridgeStats } from "./bridge.service.js";
import { logger } from "../utils/logger.js";

export interface BridgeComparisonRow extends BridgeStats {
  /** Rank (1 = best) among the compared bridges by total value locked. */
  tvlRank: number;
  /** Rank (1 = best) by 30-day uptime. */
  uptimeRank: number;
  /** Rank (1 = best, i.e. fastest) by average transfer time. */
  transferSpeedRank: number;
  /** Share of the combined TVL across all compared bridges, 0-1. */
  tvlShare: number;
}

export interface BridgeComparisonReport {
  generatedAt: string;
  dateRange?: { startDate?: string; endDate?: string };
  bridges: BridgeComparisonRow[];
  summary: {
    bridgeCount: number;
    combinedTvl: number;
    combinedVolume30d: number;
    combinedTransactions: number;
    bestTvl: string | null;
    bestUptime: string | null;
    fastestTransfer: string | null;
  };
}

function rankDescending(values: number[]): number[] {
  const sortedDesc = [...values].sort((a, b) => b - a);
  return values.map((value) => sortedDesc.indexOf(value) + 1);
}

function rankAscending(values: number[]): number[] {
  const sortedAsc = [...values].sort((a, b) => a - b);
  return values.map((value) => sortedAsc.indexOf(value) + 1);
}

/**
 * Bridge comparison report service (#1149).
 *
 * Builds a side-by-side comparison of bridge performance (TVL, volume,
 * uptime, transfer speed) so operators and users can evaluate which bridge
 * best fits a given transfer instead of inspecting each bridge in isolation.
 */
export class BridgeComparisonReportService {
  private readonly bridgeService = new BridgeService();

  /**
   * Pure aggregation step, kept separate from data fetching so the ranking
   * math can be unit tested without a database.
   */
  buildReport(
    stats: BridgeStats[],
    dateRange?: { startDate?: string; endDate?: string }
  ): BridgeComparisonReport {
    if (stats.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        dateRange,
        bridges: [],
        summary: {
          bridgeCount: 0,
          combinedTvl: 0,
          combinedVolume30d: 0,
          combinedTransactions: 0,
          bestTvl: null,
          bestUptime: null,
          fastestTransfer: null,
        },
      };
    }

    const tvlValues = stats.map((s) => s.totalValueLocked);
    const uptimeValues = stats.map((s) => s.uptime30d);
    const transferTimeValues = stats.map((s) => s.averageTransferTime);

    const tvlRanks = rankDescending(tvlValues);
    const uptimeRanks = rankDescending(uptimeValues);
    const transferSpeedRanks = rankAscending(transferTimeValues);

    const combinedTvl = tvlValues.reduce((sum, v) => sum + v, 0);
    const combinedVolume30d = stats.reduce((sum, s) => sum + s.volume30d, 0);
    const combinedTransactions = stats.reduce((sum, s) => sum + s.totalTransactions, 0);

    const bridges: BridgeComparisonRow[] = stats.map((s, i) => ({
      ...s,
      tvlRank: tvlRanks[i],
      uptimeRank: uptimeRanks[i],
      transferSpeedRank: transferSpeedRanks[i],
      tvlShare: combinedTvl > 0 ? s.totalValueLocked / combinedTvl : 0,
    }));

    const bestTvl = bridges.find((b) => b.tvlRank === 1)?.name ?? null;
    const bestUptime = bridges.find((b) => b.uptimeRank === 1)?.name ?? null;
    const fastestTransfer = bridges.find((b) => b.transferSpeedRank === 1)?.name ?? null;

    return {
      generatedAt: new Date().toISOString(),
      dateRange,
      bridges: bridges.sort((a, b) => a.tvlRank - b.tvlRank),
      summary: {
        bridgeCount: bridges.length,
        combinedTvl,
        combinedVolume30d,
        combinedTransactions,
        bestTvl,
        bestUptime,
        fastestTransfer,
      },
    };
  }

  /**
   * Fetches stats for the requested bridges (or all known bridges when
   * `bridgeNames` is omitted) and builds the comparison report.
   */
  async generateReport(
    bridgeNames?: string[],
    dateRange?: { startDate?: string; endDate?: string }
  ): Promise<BridgeComparisonReport> {
    let names = bridgeNames;
    if (!names || names.length === 0) {
      const { bridges } = await this.bridgeService.getAllBridgeStatuses();
      names = bridges.map((b) => b.name);
    }

    const statsResults = await Promise.all(
      names.map((name) => this.bridgeService.getBridgeStats(name, dateRange))
    );
    const stats = statsResults.filter((s): s is BridgeStats => s !== null);

    logger.info(
      { requested: names.length, resolved: stats.length },
      "Generated bridge comparison report"
    );

    return this.buildReport(stats, dateRange);
  }

  /**
   * Renders a comparison report as CSV for download/export workflows.
   */
  toCsv(report: BridgeComparisonReport): string {
    const header = [
      "name",
      "status",
      "totalValueLocked",
      "tvlRank",
      "tvlShare",
      "volume24h",
      "volume7d",
      "volume30d",
      "totalTransactions",
      "averageTransferTime",
      "transferSpeedRank",
      "uptime30d",
      "uptimeRank",
    ];

    const rows = report.bridges.map((b) =>
      [
        b.name,
        b.status,
        b.totalValueLocked,
        b.tvlRank,
        b.tvlShare.toFixed(4),
        b.volume24h,
        b.volume7d,
        b.volume30d,
        b.totalTransactions,
        b.averageTransferTime,
        b.transferSpeedRank,
        b.uptime30d,
        b.uptimeRank,
      ].join(",")
    );

    return [header.join(","), ...rows].join("\n");
  }
}

export const bridgeComparisonReportService = new BridgeComparisonReportService();
