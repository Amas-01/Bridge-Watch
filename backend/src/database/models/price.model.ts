import { getDatabase } from "../connection.js";

export interface PriceRecord {
  time: Date;
  symbol: string;
  source: string;
  price: number;
  volume_24h: number | null;
}

export class PriceModel {
  private db = getDatabase();
  private table = "prices";

  async insert(data: PriceRecord): Promise<void> {
    await this.db(this.table).insert(data);
  }

  async insertBatch(records: PriceRecord[]): Promise<void> {
    await this.db(this.table).insert(records);
  }

  async getLatest(symbol: string): Promise<PriceRecord[]> {
    return this.db(this.table)
      .where("symbol", symbol)
      .orderBy("time", "desc")
      .groupBy("source", "time", "symbol", "price", "volume_24h")
      .limit(10);
  }

  /**
   * Get time-bucketed price data using TimescaleDB continuous aggregates for >= 7d ranges,
   * falling back to raw prices hypertable for short-term or unaggregated queries.
   */
  async getTimeBucketed(
    symbol: string,
    bucketInterval: string,
    startTime: Date
  ): Promise<{ bucket: Date; avg_price: number; source: string }[]> {
    const lookbackMs = Date.now() - startTime.getTime();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    if (lookbackMs >= THIRTY_DAYS_MS) {
      try {
        const result = await this.db.raw(
          `SELECT bucket, AVG(avg_price) AS avg_price, 'AGGREGATED' AS source
           FROM prices_daily
           WHERE symbol = ? AND bucket >= ?
           GROUP BY bucket
           ORDER BY bucket DESC`,
          [symbol, startTime]
        );
        const rows = result.rows || result;
        if (Array.isArray(rows) && rows.length > 0) {
          return rows;
        }
      } catch {
        // Fallback to raw prices hypertable query
      }
    } else if (lookbackMs >= SEVEN_DAYS_MS) {
      try {
        const result = await this.db.raw(
          `SELECT time_bucket(?, bucket) AS bucket, AVG(avg_price) AS avg_price, 'AGGREGATED' AS source
           FROM prices_hourly
           WHERE symbol = ? AND bucket >= ?
           GROUP BY bucket
           ORDER BY bucket DESC`,
          [bucketInterval, symbol, startTime]
        );
        const rows = result.rows || result;
        if (Array.isArray(rows) && rows.length > 0) {
          return rows;
        }
      } catch {
        // Fallback to raw prices hypertable query
      }
    }

    return this.db.raw(
      `SELECT time_bucket(?, time) AS bucket, source, AVG(price) AS avg_price
       FROM prices
       WHERE symbol = ? AND time >= ?
       GROUP BY bucket, source
       ORDER BY bucket DESC`,
      [bucketInterval, symbol, startTime]
    );
  }
}
