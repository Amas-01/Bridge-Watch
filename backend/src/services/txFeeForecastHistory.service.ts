import { logger } from "../utils/logger.js";
import { CacheService, CacheTTL } from "../utils/cache.js";
import { getDatabase } from "../database/connection.js";

const knex = getDatabase();

export interface FeeDataPoint {
  timestamp: string;
  /** Median base fee (stroops) observed in the ledger window. */
  medianFee: number;
  /** 95th-percentile fee — useful as an upper-bound forecast input. */
  p95Fee: number;
  /** Simple moving-average fee forecast for the next window. */
  forecastFee: number;
  ledgerCount: number;
}

export interface FeeForecastSummary {
  period: string;
  currentMedianFee: number;
  forecastedFee: number;
  trend: "rising" | "falling" | "stable";
  changePercent: number;
  dataPoints: FeeDataPoint[];
  generatedAt: string;
}

export interface FeeVolatilityReport {
  period: string;
  minFee: number;
  maxFee: number;
  avgFee: number;
  stdDev: number;
  volatilityScore: number;
  generatedAt: string;
}

const CACHE_PREFIX = "fee-forecast";

export class TxFeeForecastHistoryService {
  private readonly cache = new CacheService();

  async getForecastHistory(
    period: "1h" | "24h" | "7d" | "30d" = "24h",
    bypassCache = false,
  ): Promise<FeeForecastSummary> {
    const cacheKey = `${CACHE_PREFIX}:history:${period}`;

    if (!bypassCache) {
      const cached = await this.cache.get<FeeForecastSummary>(cacheKey);
      if (cached) return cached;
    }

    try {
      const intervalMinutes = this.periodToMinutes(period);
      const bucketMinutes = this.bucketSize(period);

      const rows = await knex.raw<{ rows: Array<{ bucket: string; median_fee: string; p95_fee: string; ledger_count: string }> }>(
        `
        SELECT
          date_trunc('minute', created_at) - (
            EXTRACT(MINUTE FROM created_at)::int % ? * interval '1 minute'
          ) AS bucket,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY base_fee_stroops) AS median_fee,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY base_fee_stroops) AS p95_fee,
          COUNT(*) AS ledger_count
        FROM transaction_fee_snapshots
        WHERE created_at >= NOW() - INTERVAL '${intervalMinutes} minutes'
        GROUP BY 1
        ORDER BY 1 ASC
        `,
        [bucketMinutes],
      );

      const dataPoints = this.buildDataPoints(rows.rows);
      const summary = this.buildSummary(period, dataPoints);

      await this.cache.set(cacheKey, summary, CacheTTL.SHORT);
      return summary;
    } catch (err) {
      logger.warn({ err, period }, "DB unavailable for fee forecast — returning stub");
      return this.stubSummary(period);
    }
  }

  async getVolatilityReport(period: "24h" | "7d" | "30d" = "7d"): Promise<FeeVolatilityReport> {
    const cacheKey = `${CACHE_PREFIX}:volatility:${period}`;
    const cached = await this.cache.get<FeeVolatilityReport>(cacheKey);
    if (cached) return cached;

    try {
      const intervalMinutes = this.periodToMinutes(period);

      const [row] = await knex("transaction_fee_snapshots")
        .whereRaw(`created_at >= NOW() - INTERVAL '${intervalMinutes} minutes'`)
        .select(
          knex.raw("MIN(base_fee_stroops) AS min_fee"),
          knex.raw("MAX(base_fee_stroops) AS max_fee"),
          knex.raw("AVG(base_fee_stroops) AS avg_fee"),
          knex.raw("STDDEV_POP(base_fee_stroops) AS std_dev"),
        );

      const avg = parseFloat(row?.avg_fee ?? "100");
      const stdDev = parseFloat(row?.std_dev ?? "0");
      const volatilityScore = avg > 0 ? Math.min(100, (stdDev / avg) * 100) : 0;

      const report: FeeVolatilityReport = {
        period,
        minFee: parseFloat(row?.min_fee ?? "100"),
        maxFee: parseFloat(row?.max_fee ?? "100"),
        avgFee: avg,
        stdDev,
        volatilityScore,
        generatedAt: new Date().toISOString(),
      };

      await this.cache.set(cacheKey, report, CacheTTL.SHORT);
      return report;
    } catch (err) {
      logger.warn({ err, period }, "DB unavailable for fee volatility — returning stub");
      return {
        period,
        minFee: 100,
        maxFee: 100,
        avgFee: 100,
        stdDev: 0,
        volatilityScore: 0,
        generatedAt: new Date().toISOString(),
      };
    }
  }

  private buildDataPoints(
    rows: Array<{ bucket: string; median_fee: string; p95_fee: string; ledger_count: string }>,
  ): FeeDataPoint[] {
    const points: FeeDataPoint[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const median = parseFloat(row.median_fee);
      const p95 = parseFloat(row.p95_fee);
      // Simple SMA forecast: average of last 3 medians
      const window = rows.slice(Math.max(0, i - 2), i + 1).map(r => parseFloat(r.median_fee));
      const forecastFee = window.reduce((s, v) => s + v, 0) / window.length;
      points.push({
        timestamp: row.bucket,
        medianFee: median,
        p95Fee: p95,
        forecastFee: Math.round(forecastFee),
        ledgerCount: parseInt(row.ledger_count, 10),
      });
    }
    return points;
  }

  private buildSummary(period: string, dataPoints: FeeDataPoint[]): FeeForecastSummary {
    if (dataPoints.length === 0) return this.stubSummary(period);

    const first = dataPoints[0].medianFee;
    const last = dataPoints[dataPoints.length - 1].medianFee;
    const changePercent = first > 0 ? ((last - first) / first) * 100 : 0;
    const trend: FeeForecastSummary["trend"] =
      Math.abs(changePercent) < 2 ? "stable" : changePercent > 0 ? "rising" : "falling";

    return {
      period,
      currentMedianFee: last,
      forecastedFee: dataPoints[dataPoints.length - 1].forecastFee,
      trend,
      changePercent,
      dataPoints,
      generatedAt: new Date().toISOString(),
    };
  }

  private stubSummary(period: string): FeeForecastSummary {
    return {
      period,
      currentMedianFee: 100,
      forecastedFee: 100,
      trend: "stable",
      changePercent: 0,
      dataPoints: [],
      generatedAt: new Date().toISOString(),
    };
  }

  private periodToMinutes(period: string): number {
    const map: Record<string, number> = { "1h": 60, "24h": 1440, "7d": 10080, "30d": 43200 };
    return map[period] ?? 1440;
  }

  private bucketSize(period: string): number {
    const map: Record<string, number> = { "1h": 5, "24h": 30, "7d": 120, "30d": 360 };
    return map[period] ?? 30;
  }
}
