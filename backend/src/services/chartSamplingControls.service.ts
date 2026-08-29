import crypto from "crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type SamplingStrategy = "lttb" | "fixed_interval" | "min_max" | "nth_point";

export interface ChartDataPoint {
  timestamp: number;
  value: number;
}

export interface ChartSamplingProfile {
  id: string;
  name: string;
  description: string | null;
  strategy: SamplingStrategy;
  max_points: number;
  min_interval_seconds: number | null;
  enabled: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

const MAX_ALLOWED_POINTS = 100_000;

function assertValidPoints(points: ChartDataPoint[]): void {
  if (!Array.isArray(points)) {
    throw new Error("points must be an array");
  }
}

function assertValidMaxPoints(maxPoints: number): void {
  if (!Number.isInteger(maxPoints) || maxPoints <= 0 || maxPoints > MAX_ALLOWED_POINTS) {
    throw new Error(`maxPoints must be an integer between 1 and ${MAX_ALLOWED_POINTS}`);
  }
}

/**
 * Chart data sampling algorithms (#1151).
 *
 * Pure, dependency-free downsampling functions used to keep chart payloads
 * within a configurable point budget while preserving the visual shape of
 * the underlying series (spikes, trend reversals) as much as possible.
 */
export class ChartDataSampler {
  /** Every Nth point, keeping the first and last point. Cheapest strategy. */
  static nthPoint(points: ChartDataPoint[], maxPoints: number): ChartDataPoint[] {
    assertValidPoints(points);
    assertValidMaxPoints(maxPoints);
    if (points.length <= maxPoints) return [...points];

    const step = (points.length - 1) / (maxPoints - 1);
    const result: ChartDataPoint[] = [];
    for (let i = 0; i < maxPoints; i++) {
      result.push(points[Math.round(i * step)]);
    }
    return result;
  }

  /** Fixed-interval bucketing: one point (the average) per time bucket. */
  static fixedInterval(points: ChartDataPoint[], maxPoints: number): ChartDataPoint[] {
    assertValidPoints(points);
    assertValidMaxPoints(maxPoints);
    if (points.length <= maxPoints) return [...points];

    const first = points[0].timestamp;
    const last = points[points.length - 1].timestamp;
    const span = Math.max(last - first, 1);
    const bucketSize = span / maxPoints;

    const buckets = new Map<number, { sum: number; count: number; timestampSum: number }>();
    for (const point of points) {
      const bucketIndex = Math.min(maxPoints - 1, Math.floor((point.timestamp - first) / bucketSize));
      const bucket = buckets.get(bucketIndex) ?? { sum: 0, count: 0, timestampSum: 0 };
      bucket.sum += point.value;
      bucket.timestampSum += point.timestamp;
      bucket.count += 1;
      buckets.set(bucketIndex, bucket);
    }

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([, bucket]) => ({
        timestamp: Math.round(bucket.timestampSum / bucket.count),
        value: bucket.sum / bucket.count,
      }));
  }

  /**
   * Min/max decimation: for each bucket, keeps both the minimum and maximum
   * value so spikes and dips are never smoothed away, at the cost of using
   * up to 2 output points per bucket.
   */
  static minMax(points: ChartDataPoint[], maxPoints: number): ChartDataPoint[] {
    assertValidPoints(points);
    assertValidMaxPoints(maxPoints);
    if (points.length <= maxPoints) return [...points];

    const bucketCount = Math.max(1, Math.floor(maxPoints / 2));
    const bucketSize = points.length / bucketCount;

    const result: ChartDataPoint[] = [];
    for (let i = 0; i < bucketCount; i++) {
      const start = Math.floor(i * bucketSize);
      const end = i === bucketCount - 1 ? points.length : Math.floor((i + 1) * bucketSize);
      const slice = points.slice(start, end);
      if (slice.length === 0) continue;

      let minPoint = slice[0];
      let maxPoint = slice[0];
      for (const point of slice) {
        if (point.value < minPoint.value) minPoint = point;
        if (point.value > maxPoint.value) maxPoint = point;
      }

      if (minPoint.timestamp <= maxPoint.timestamp) {
        result.push(minPoint, maxPoint);
      } else {
        result.push(maxPoint, minPoint);
      }
    }

    return result;
  }

  /**
   * Largest-Triangle-Three-Buckets: preserves visual shape (trend reversals)
   * better than naive decimation by picking, per bucket, the point that
   * forms the largest triangle with the previously selected point and the
   * average of the next bucket.
   */
  static lttb(points: ChartDataPoint[], maxPoints: number): ChartDataPoint[] {
    assertValidPoints(points);
    assertValidMaxPoints(maxPoints);
    if (maxPoints >= points.length || maxPoints < 3) {
      return points.length <= maxPoints ? [...points] : ChartDataSampler.nthPoint(points, maxPoints);
    }

    const sampled: ChartDataPoint[] = [points[0]];
    const bucketSize = (points.length - 2) / (maxPoints - 2);
    let a = 0;

    for (let i = 0; i < maxPoints - 2; i++) {
      const rangeStart = Math.floor((i + 1) * bucketSize) + 1;
      const rangeEnd = Math.floor((i + 2) * bucketSize) + 1;
      const nextRangeEnd = Math.min(rangeEnd, points.length);

      let avgX = 0;
      let avgY = 0;
      const avgRangeStart = rangeEnd;
      const avgRangeEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, points.length);
      const avgSlice = points.slice(avgRangeStart, avgRangeEnd);
      const avgCount = avgSlice.length || 1;
      for (const p of avgSlice) {
        avgX += p.timestamp;
        avgY += p.value;
      }
      avgX /= avgCount;
      avgY /= avgCount;

      const pointA = points[a];
      let maxArea = -1;
      let maxAreaIndex = rangeStart;

      for (let j = rangeStart; j < nextRangeEnd; j++) {
        const point = points[j];
        const area = Math.abs(
          (pointA.timestamp - avgX) * (point.value - pointA.value) -
            (pointA.timestamp - point.timestamp) * (avgY - pointA.value)
        );
        if (area > maxArea) {
          maxArea = area;
          maxAreaIndex = j;
        }
      }

      sampled.push(points[maxAreaIndex]);
      a = maxAreaIndex;
    }

    sampled.push(points[points.length - 1]);
    return sampled;
  }

  static sample(
    points: ChartDataPoint[],
    strategy: SamplingStrategy,
    maxPoints: number
  ): ChartDataPoint[] {
    switch (strategy) {
      case "lttb":
        return ChartDataSampler.lttb(points, maxPoints);
      case "fixed_interval":
        return ChartDataSampler.fixedInterval(points, maxPoints);
      case "min_max":
        return ChartDataSampler.minMax(points, maxPoints);
      case "nth_point":
        return ChartDataSampler.nthPoint(points, maxPoints);
      default:
        throw new Error(`Unsupported sampling strategy "${strategy}"`);
    }
  }
}

/**
 * Chart data sampling controls service (#1151).
 *
 * Manages reusable, named sampling profiles (persisted) on top of the pure
 * `ChartDataSampler` algorithms so dashboards can request a downsampled
 * series by profile name instead of repeating strategy/maxPoints on every call.
 */
export class ChartSamplingControlsService {
  private table = "chart_sampling_profiles";

  sampleSeries(
    points: ChartDataPoint[],
    options: { strategy?: SamplingStrategy; maxPoints?: number }
  ): ChartDataPoint[] {
    const strategy = options.strategy ?? "lttb";
    const maxPoints = options.maxPoints ?? 500;
    return ChartDataSampler.sample(points, strategy, maxPoints);
  }

  async createProfile(params: {
    name: string;
    description?: string | null;
    strategy?: SamplingStrategy;
    maxPoints?: number;
    minIntervalSeconds?: number | null;
    createdBy: string;
  }): Promise<ChartSamplingProfile> {
    if (!params.name || !params.name.trim()) {
      throw new Error("Profile name is required");
    }
    const maxPoints = params.maxPoints ?? 500;
    assertValidMaxPoints(maxPoints);

    const db = getDatabase();
    const existing = await db(this.table).where({ name: params.name.trim() }).first();
    if (existing) {
      throw new Error(`Sampling profile "${params.name}" already exists`);
    }

    const [row] = await db(this.table)
      .insert({
        id: crypto.randomUUID(),
        name: params.name.trim(),
        description: params.description ?? null,
        strategy: params.strategy ?? "lttb",
        max_points: maxPoints,
        min_interval_seconds: params.minIntervalSeconds ?? null,
        enabled: true,
        created_by: params.createdBy,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    logger.info({ profileId: row.id, name: row.name }, "Chart sampling profile created");
    return row;
  }

  async listProfiles(): Promise<ChartSamplingProfile[]> {
    const db = getDatabase();
    return db(this.table).select("*").orderBy("name", "asc");
  }

  async getProfileByName(name: string): Promise<ChartSamplingProfile | null> {
    const db = getDatabase();
    const row = await db(this.table).where({ name }).first();
    return row ?? null;
  }

  async deleteProfile(id: string): Promise<boolean> {
    const db = getDatabase();
    const count = await db(this.table).where({ id }).del();
    return count > 0;
  }

  /** Downsamples a series using a saved profile's configuration. */
  async sampleWithProfile(name: string, points: ChartDataPoint[]): Promise<ChartDataPoint[]> {
    const profile = await this.getProfileByName(name);
    if (!profile) {
      throw new Error(`Sampling profile "${name}" not found`);
    }
    if (!profile.enabled) {
      throw new Error(`Sampling profile "${name}" is disabled`);
    }
    return this.sampleSeries(points, {
      strategy: profile.strategy,
      maxPoints: profile.max_points,
    });
  }
}

export const chartSamplingControlsService = new ChartSamplingControlsService();
