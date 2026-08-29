import { getDatabase } from "../database/connection.js";
import { CacheService } from "../utils/cache.js";

type QueryWindow = {
  start?: string;
  end?: string;
};

type FeatureFlagRow = {
  name: string;
  enabled: boolean;
  environment: string;
  conditions?: string | Record<string, unknown> | null;
};

function defaultWindow({ start, end }: QueryWindow) {
  return {
    start: start ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    end: end ?? new Date().toISOString(),
  };
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function reliabilityScore(successRate: number, p95Ms: number): number {
  const latencyPenalty = Math.min(35, Math.max(0, (p95Ms - 250) / 50));
  return Math.max(0, Math.min(100, Math.round(successRate * 100 - latencyPenalty)));
}

function parseConditions(value: FeatureFlagRow["conditions"]): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value;
}

function normalizeDependencies(conditions: Record<string, unknown>): string[] {
  const raw =
    conditions.dependsOn ??
    conditions.dependencies ??
    conditions.requires ??
    conditions.requiredFlags;

  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string");
  }

  if (raw && typeof raw === "object") {
    return Object.keys(raw);
  }

  return [];
}

export class OperationalIntelligenceService {
  private db = getDatabase();

  async getEndpointReliabilityScorecards(window: QueryWindow = {}) {
    const { start, end } = defaultWindow(window);
    const result = await this.db.raw(
      `SELECT endpoint,
              method,
              count(*)::int as requests,
              sum(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END)::int as server_errors,
              sum(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END)::int as client_errors,
              avg(duration_ms)::numeric as avg_ms,
              percentile_cont(0.95) within group (order by duration_ms)::numeric as p95_ms
       FROM usage_metrics
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY endpoint, method
       ORDER BY requests DESC
       LIMIT 100`,
      [start, end],
    );

    const rows = result.rows ?? result;
    return rows.map((row: Record<string, unknown>) => {
      const requests = asNumber(row.requests);
      const serverErrors = asNumber(row.server_errors);
      const p95Ms = asNumber(row.p95_ms);
      const successRate = requests === 0 ? 1 : (requests - serverErrors) / requests;

      return {
        endpoint: row.endpoint,
        method: row.method,
        requests,
        serverErrors,
        clientErrors: asNumber(row.client_errors),
        avgMs: Math.round(asNumber(row.avg_ms)),
        p95Ms: Math.round(p95Ms),
        successRate: Number(successRate.toFixed(4)),
        score: reliabilityScore(successRate, p95Ms),
      };
    });
  }

  async forecastApiConsumerUsage({
    start,
    end,
    horizonHours = 24,
  }: QueryWindow & { horizonHours?: number } = {}) {
    const window = defaultWindow({ start, end });
    const result = await this.db.raw(
      `WITH hourly AS (
         SELECT date_trunc('hour', created_at) as bucket,
                coalesce(user_id, 'anonymous') as consumer,
                count(*)::int as requests
         FROM usage_metrics
         WHERE created_at >= ? AND created_at <= ?
         GROUP BY bucket, consumer
       )
       SELECT consumer,
              count(*)::int as buckets,
              sum(requests)::int as total_requests,
              avg(requests)::numeric as avg_hourly_requests,
              regr_slope(requests, extract(epoch from bucket))::numeric as requests_per_second_slope
       FROM hourly
       GROUP BY consumer
       ORDER BY total_requests DESC
       LIMIT 100`,
      [window.start, window.end],
    );

    const boundedHorizon = Math.max(1, Math.min(24 * 14, horizonHours));
    const rows = result.rows ?? result;
    return rows.map((row: Record<string, unknown>) => {
      const avgHourly = asNumber(row.avg_hourly_requests);
      const hourlySlope = asNumber(row.requests_per_second_slope) * 3600;
      const forecastHourly = Math.max(0, avgHourly + hourlySlope * boundedHorizon);

      return {
        consumer: row.consumer,
        buckets: asNumber(row.buckets),
        totalRequests: asNumber(row.total_requests),
        avgHourlyRequests: Math.round(avgHourly),
        projectedRequests: Math.round(forecastHourly * boundedHorizon),
        horizonHours: boundedHorizon,
        trend: hourlySlope > 1 ? "increasing" : hourlySlope < -1 ? "decreasing" : "stable",
      };
    });
  }

  async validateFeatureFlagDependencies(environment = "production") {
    const flags = (await this.db("feature_flags")
      .select("name", "enabled", "environment", "conditions")
      .where({ environment })) as FeatureFlagRow[];

    const byName = new Map(flags.map((flag) => [flag.name, flag]));
    const graph = new Map<string, string[]>();
    const violations: Array<{
      flag: string;
      dependency: string;
      reason: "missing" | "disabled" | "cycle";
    }> = [];

    for (const flag of flags) {
      const dependencies = normalizeDependencies(parseConditions(flag.conditions));
      graph.set(flag.name, dependencies);

      for (const dependency of dependencies) {
        const dependencyFlag = byName.get(dependency);
        if (!dependencyFlag) {
          violations.push({ flag: flag.name, dependency, reason: "missing" });
        } else if (!dependencyFlag.enabled) {
          violations.push({ flag: flag.name, dependency, reason: "disabled" });
        }
      }
    }

    for (const [flag, dependencies] of graph) {
      for (const dependency of dependencies) {
        if (graph.get(dependency)?.includes(flag)) {
          violations.push({ flag, dependency, reason: "cycle" });
        }
      }
    }

    return {
      environment,
      valid: violations.length === 0,
      checkedFlags: flags.length,
      violations,
    };
  }

  async getCacheHitRateAttribution(window: QueryWindow = {}) {
    const { start, end } = defaultWindow(window);
    const stats = CacheService.getStats();
    const totalLookups = stats.hits + stats.misses;
    const result = await this.db.raw(
      `SELECT coalesce(metadata->>'cacheNamespace', metadata->>'cache_key', endpoint) as source,
              count(*)::int as requests,
              sum(CASE WHEN metadata->>'cacheResult' = 'hit' THEN 1 ELSE 0 END)::int as hits,
              sum(CASE WHEN metadata->>'cacheResult' = 'miss' THEN 1 ELSE 0 END)::int as misses
       FROM usage_metrics
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY source
       ORDER BY requests DESC
       LIMIT 100`,
      [start, end],
    );

    const rows = result.rows ?? result;
    return {
      window: { start, end },
      overall: {
        hits: stats.hits,
        misses: stats.misses,
        errors: stats.errors,
        bypassed: stats.bypassed,
        invalidations: stats.invalidations,
        hitRate: totalLookups === 0 ? null : Number((stats.hits / totalLookups).toFixed(4)),
      },
      sources: rows.map((row: Record<string, unknown>) => {
        const hits = asNumber(row.hits);
        const misses = asNumber(row.misses);
        const lookups = hits + misses;
        return {
          source: row.source,
          requests: asNumber(row.requests),
          hits,
          misses,
          hitRate: lookups === 0 ? null : Number((hits / lookups).toFixed(4)),
        };
      }),
    };
  }
}

let instance: OperationalIntelligenceService | null = null;

export function getOperationalIntelligenceService() {
  if (!instance) instance = new OperationalIntelligenceService();
  return instance;
}
