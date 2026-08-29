// Tests for ExternalRateLimitMetricsService — covers DB-backed rate limit tracking,
// hourly-bucket trend aggregation, threshold-based alert generation, and config upsert.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockDb = () => {
  const store: Record<string, any[]> = {
    external_rate_limit_metrics: [],
    external_rate_limit_alert_thresholds: [],
  };

  const makeQuery = (targetTable: "metrics" | "thresholds") => {
    let resolveValue: any = undefined;
    const tableStore = targetTable === "thresholds"
      ? store.external_rate_limit_alert_thresholds
      : store.external_rate_limit_metrics;
    const q: any = {
      where: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      sum: vi.fn().mockReturnThis(),
      max: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      first: vi.fn(),
      insert: vi.fn(function (this: any, data: any) {
        const items = Array.isArray(data) ? data : [data];
        tableStore.push(...items);
        resolveValue = items;
        return this;
      }),
      update: vi.fn(function (this: any, data: any) {
        const items = tableStore;
        if (items.length > 0) {
          Object.assign(items[0], data);
          resolveValue = [items[0]];
        }
        return this;
      }),
      onConflict: vi.fn().mockReturnThis(),
      merge: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      catch: vi.fn(),
      then: vi.fn(function (this: any, resolve: any, _reject: any) {
        if (resolveValue !== undefined) {
          const val = resolveValue;
          resolveValue = undefined;
          resolve(val);
          return;
        }
        resolve(tableStore);
      }),
      __setResolve: (v: any) => { resolveValue = v; },
      __getResolve: () => resolveValue,
    };
    return q;
  };

  const metricsQuery = makeQuery("metrics");
  const thresholdsQuery = makeQuery("thresholds");

  const db: any = (table: string) => {
    if (table === "external_rate_limit_alert_thresholds") return thresholdsQuery;
    return metricsQuery;
  };
  db.raw = vi.fn((str: string) => str);
  db.fn = { now: () => new Date() };
  db.client = { wrapIdentifier: (id: string) => `"${id}"` };
  db.__store = store;
  db.__metricsQuery = metricsQuery;
  db.__thresholdsQuery = thresholdsQuery;

  return db;
};

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockHex = "aabbccdd00112233445566778899aabb";
vi.mock("crypto", () => ({
  randomBytes: vi.fn(() => Buffer.from(mockHex, "hex")),
}));

import { ExternalRateLimitMetricsService } from "../../src/services/externalRateLimitMetrics.service.js";

describe("ExternalRateLimitMetricsService", () => {
  let service: ExternalRateLimitMetricsService;
  let db: ReturnType<typeof mockDb>;

  beforeEach(async () => {
    const { getDatabase } = await import("../../src/database/connection.js");
    db = mockDb();
    vi.mocked(getDatabase).mockReturnValue(db as any);
    service = new ExternalRateLimitMetricsService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("recordUsage", () => {
    it("inserts a record with default values", async () => {
      await service.recordUsage({ providerKey: "stellar-horizon" });

      const record = db.__store.external_rate_limit_metrics[0];
      expect(record.provider_key).toBe("stellar-horizon");
      expect(record.requests_count).toBe(1);
      expect(record.throttled_count).toBe(0);
      expect(record.burst_count).toBe(0);
      expect(record.is_throttled).toBe(false);
      expect(record.id).toBe(mockHex);
    });

    it("records with custom request count", async () => {
      await service.recordUsage({ providerKey: "eth-rpc", requestsCount: 5 });

      const record = db.__store.external_rate_limit_metrics[0];
      expect(record.requests_count).toBe(5);
    });

    it("records throttled state", async () => {
      await service.recordUsage({ providerKey: "polygon-rpc", throttled: true });

      const record = db.__store.external_rate_limit_metrics[0];
      expect(record.throttled_count).toBe(1);
      expect(record.is_throttled).toBe(true);
    });

    it("records burst state", async () => {
      await service.recordUsage({ providerKey: "base-rpc", burst: true });

      const record = db.__store.external_rate_limit_metrics[0];
      expect(record.burst_count).toBe(1);
    });

    it("records limit remaining and total", async () => {
      await service.recordUsage({ providerKey: "stellar-horizon", limitRemaining: 850, limitTotal: 1000 });

      const record = db.__store.external_rate_limit_metrics[0];
      expect(record.limit_remaining).toBe(850);
      expect(record.limit_total).toBe(1000);
    });

    it("records resetAtEpoch", async () => {
      const epoch = Date.now() + 60000;

      await service.recordUsage({ providerKey: "eth-rpc", resetAtEpoch: epoch });

      const record = db.__store.external_rate_limit_metrics[0];
      expect(record.reset_at_epoch).toBe(epoch);
    });

    it("stores details as JSON string", async () => {
      await service.recordUsage({ providerKey: "polygon-rpc", details: { region: "us-east" } });

      const record = db.__store.external_rate_limit_metrics[0];
      expect(record.details).toBe(JSON.stringify({ region: "us-east" }));
    });

    it("defaults details to empty object", async () => {
      await service.recordUsage({ providerKey: "base-rpc" });

      const record = db.__store.external_rate_limit_metrics[0];
      expect(record.details).toBe(JSON.stringify({}));
    });

    it("records multiple providers independently", async () => {
      await service.recordUsage({ providerKey: "provider-a", requestsCount: 3 });
      await service.recordUsage({ providerKey: "provider-b", requestsCount: 7 });

      expect(db.__store.external_rate_limit_metrics).toHaveLength(2);
      expect(db.__store.external_rate_limit_metrics[0].provider_key).toBe("provider-a");
      expect(db.__store.external_rate_limit_metrics[1].provider_key).toBe("provider-b");
    });
  });

  describe("getProviderSnapshots", () => {
    it("returns empty array when no records exist", async () => {
      db.__metricsQuery.__setResolve([]);

      const snapshots = await service.getProviderSnapshots();
      expect(snapshots).toEqual([]);
    });

    it("aggregates data for a single provider", async () => {
      const now = new Date();
      const rec = {
        id: "rec-1", provider_key: "stellar-horizon", requests_count: 10,
        throttled_count: 2, burst_count: 1, limit_remaining: 800, limit_total: 1000,
        is_throttled: false, details: "{}", recorded_at: now,
      };

      db.__metricsQuery.__setResolve([
        { provider_key: "stellar-horizon", last_recorded_at: now },
      ]);
      db.__metricsQuery.first
        .mockResolvedValueOnce(rec)
        .mockResolvedValueOnce({ requests: 10, throttled: 2, bursts: 1 });

      const snapshots = await service.getProviderSnapshots();

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].providerKey).toBe("stellar-horizon");
      expect(snapshots[0].requestsCount).toBe(10);
      expect(snapshots[0].throttledCount).toBe(2);
      expect(snapshots[0].burstCount).toBe(1);
      expect(snapshots[0].limitRemaining).toBe(800);
      expect(snapshots[0].limitTotal).toBe(1000);
      expect(snapshots[0].usagePercent).toBe(20);
      expect(snapshots[0].isThrottled).toBe(false);
      expect(snapshots[0].lastRecordedAt).toBeDefined();
    });

    it("handles multiple providers independently", async () => {
      const now = new Date();
      const recA = {
        id: "rec-a", provider_key: "provider-a", requests_count: 5,
        throttled_count: 0, burst_count: 0, limit_remaining: 95, limit_total: 100,
        is_throttled: false, details: "{}", recorded_at: now,
      };
      const recB = {
        id: "rec-b", provider_key: "provider-b", requests_count: 20,
        throttled_count: 3, burst_count: 2, limit_remaining: 50, limit_total: 100,
        is_throttled: true, details: "{}", recorded_at: now,
      };

      db.__metricsQuery.__setResolve([
        { provider_key: "provider-a", last_recorded_at: now },
        { provider_key: "provider-b", last_recorded_at: now },
      ]);
      db.__metricsQuery.first
        .mockResolvedValueOnce(recA)
        .mockResolvedValueOnce({ requests: 5, throttled: 0, bursts: 0 })
        .mockResolvedValueOnce(recB)
        .mockResolvedValueOnce({ requests: 20, throttled: 3, bursts: 2 });

      const snapshots = await service.getProviderSnapshots();

      expect(snapshots).toHaveLength(2);
      expect(snapshots[0].providerKey).toBe("provider-a");
      expect(snapshots[0].requestsCount).toBe(5);
      expect(snapshots[0].isThrottled).toBe(false);
      expect(snapshots[1].providerKey).toBe("provider-b");
      expect(snapshots[1].requestsCount).toBe(20);
      expect(snapshots[1].isThrottled).toBe(true);
    });

    it("sets usagePercent to null when limitTotal is null", async () => {
      const now = new Date();
      const rec = {
        id: "rec-1", provider_key: "eth-rpc", requests_count: 5,
        throttled_count: 0, burst_count: 0, limit_remaining: null, limit_total: null,
        is_throttled: false, details: "{}", recorded_at: now,
      };

      db.__metricsQuery.__setResolve([
        { provider_key: "eth-rpc", last_recorded_at: now },
      ]);
      db.__metricsQuery.first
        .mockResolvedValueOnce(rec)
        .mockResolvedValueOnce({ requests: 5, throttled: 0, bursts: 0 });

      const snapshots = await service.getProviderSnapshots();

      expect(snapshots[0].usagePercent).toBeNull();
      expect(snapshots[0].limitTotal).toBeNull();
      expect(snapshots[0].limitRemaining).toBeNull();
    });

    it("skips rows where latest query returns null", async () => {
      const now = new Date();

      db.__metricsQuery.__setResolve([
        { provider_key: "ghost", last_recorded_at: now },
      ]);
      db.__metricsQuery.first.mockResolvedValueOnce(null);

      const snapshots = await service.getProviderSnapshots();
      expect(snapshots).toEqual([]);
    });
  });

  describe("getTrend", () => {
    it("returns empty array when no records exist", async () => {
      db.__metricsQuery.__setResolve([]);

      const trend = await service.getTrend("stellar-horizon");
      expect(trend).toEqual([]);
    });

    it("groups records into hourly buckets", async () => {
      const baseHour = new Date("2025-01-15T10:00:00.000Z");
      const hour1 = new Date(baseHour.getTime() + 5 * 60000);
      const hour2 = new Date(baseHour.getTime() + 65 * 60000);

      db.__metricsQuery.__setResolve([
        { recorded_at: hour1, requests_count: 3, throttled_count: 0, burst_count: 0 },
        { recorded_at: hour1, requests_count: 2, throttled_count: 1, burst_count: 0 },
        { recorded_at: hour2, requests_count: 7, throttled_count: 0, burst_count: 1 },
      ]);

      const trend = await service.getTrend("stellar-horizon", 24);

      expect(trend).toHaveLength(2);
      expect(trend[0].bucket).toBe("2025-01-15T10:00:00.000Z");
      expect(trend[0].requestsCount).toBe(5);
      expect(trend[0].throttledCount).toBe(1);
      expect(trend[0].burstCount).toBe(0);
      expect(trend[1].bucket).toBe("2025-01-15T11:00:00.000Z");
      expect(trend[1].requestsCount).toBe(7);
      expect(trend[1].throttledCount).toBe(0);
      expect(trend[1].burstCount).toBe(1);
    });

    it("returns empty for provider with no data", async () => {
      db.__metricsQuery.__setResolve([]);

      const trend = await service.getTrend("nonexistent", 24);
      expect(trend).toEqual([]);
    });
  });

  describe("getAlerts", () => {
    it("returns empty array when no provider snapshots exist", async () => {
      db.__metricsQuery.__setResolve([]);

      const alerts = await service.getAlerts();
      expect(alerts).toEqual([]);
    });

    it("generates throttle alert when provider is throttled", async () => {
      const now = new Date();
      const rec = {
        id: "rec-1", provider_key: "eth-rpc", requests_count: 1,
        throttled_count: 1, burst_count: 0, limit_remaining: null, limit_total: null,
        is_throttled: true, details: "{}", recorded_at: now,
      };

      db.__metricsQuery.__setResolve([
        { provider_key: "eth-rpc", last_recorded_at: now },
      ]);
      db.__metricsQuery.first
        .mockResolvedValueOnce(rec)
        .mockResolvedValueOnce({ requests: 1, throttled: 1, bursts: 0 });

      db.__thresholdsQuery.__setResolve([]);

      const alerts = await service.getAlerts();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe("throttle");
      expect(alerts[0].severity).toBe("critical");
      expect(alerts[0].providerKey).toBe("eth-rpc");
    });

    it("generates critical usage alert when above critical threshold", async () => {
      const now = new Date();
      const rec = {
        id: "rec-1", provider_key: "polygon-rpc", requests_count: 1,
        throttled_count: 0, burst_count: 0, limit_remaining: 5, limit_total: 100,
        is_throttled: false, details: "{}", recorded_at: now,
      };

      db.__metricsQuery.__setResolve([
        { provider_key: "polygon-rpc", last_recorded_at: now },
      ]);
      db.__metricsQuery.first
        .mockResolvedValueOnce(rec)
        .mockResolvedValueOnce({ requests: 1, throttled: 0, bursts: 0 });

      db.__thresholdsQuery.__setResolve([]);

      const alerts = await service.getAlerts();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe("usage");
      expect(alerts[0].severity).toBe("critical");
      expect(alerts[0].message).toContain("95%");
    });

    it("generates warning usage alert when above warning but below critical", async () => {
      const now = new Date();
      const rec = {
        id: "rec-1", provider_key: "base-rpc", requests_count: 1,
        throttled_count: 0, burst_count: 0, limit_remaining: 25, limit_total: 100,
        is_throttled: false, details: "{}", recorded_at: now,
      };

      db.__metricsQuery.__setResolve([
        { provider_key: "base-rpc", last_recorded_at: now },
      ]);
      db.__metricsQuery.first
        .mockResolvedValueOnce(rec)
        .mockResolvedValueOnce({ requests: 1, throttled: 0, bursts: 0 });

      db.__thresholdsQuery.__setResolve([]);

      const alerts = await service.getAlerts();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe("usage");
      expect(alerts[0].severity).toBe("warning");
      expect(alerts[0].message).toContain("75%");
    });

    it("generates burst alert when burst count exceeds threshold", async () => {
      const now = new Date();
      const rec = {
        id: "rec-1", provider_key: "stellar-horizon", requests_count: 1,
        throttled_count: 0, burst_count: 10, limit_remaining: 50, limit_total: 100,
        is_throttled: false, details: "{}", recorded_at: now,
      };

      db.__metricsQuery.__setResolve([
        { provider_key: "stellar-horizon", last_recorded_at: now },
      ]);
      db.__metricsQuery.first
        .mockResolvedValueOnce(rec)
        .mockResolvedValueOnce({ requests: 1, throttled: 0, bursts: 10 });

      db.__thresholdsQuery.__setResolve([]);

      const alerts = await service.getAlerts();

      const burstAlert = alerts.find((a) => a.type === "burst");
      expect(burstAlert).toBeDefined();
      expect(burstAlert!.severity).toBe("warning");
      expect(burstAlert!.message).toContain("10 burst events");
    });

    it("skips disabled providers", async () => {
      const now = new Date();
      const rec = {
        id: "rec-1", provider_key: "disabled-provider", requests_count: 1,
        throttled_count: 1, burst_count: 10, limit_remaining: 5, limit_total: 100,
        is_throttled: true, details: "{}", recorded_at: now,
      };

      db.__metricsQuery.__setResolve([
        { provider_key: "disabled-provider", last_recorded_at: now },
      ]);
      db.__metricsQuery.first
        .mockResolvedValueOnce(rec)
        .mockResolvedValueOnce({ requests: 1, throttled: 1, bursts: 10 });

      db.__thresholdsQuery.__setResolve([
        { provider_key: "disabled-provider", enabled: false },
      ]);

      const alerts = await service.getAlerts();
      expect(alerts).toEqual([]);
    });

    it("uses custom thresholds when configured", async () => {
      const now = new Date();
      const rec = {
        id: "rec-1", provider_key: "custom-provider", requests_count: 1,
        throttled_count: 0, burst_count: 3, limit_remaining: 85, limit_total: 100,
        is_throttled: false, details: "{}", recorded_at: now,
      };

      db.__metricsQuery.__setResolve([
        { provider_key: "custom-provider", last_recorded_at: now },
      ]);
      db.__metricsQuery.first
        .mockResolvedValueOnce(rec)
        .mockResolvedValueOnce({ requests: 1, throttled: 0, bursts: 3 });

      db.__thresholdsQuery.__setResolve([
        {
          provider_key: "custom-provider",
          usage_warning_pct: 10,
          usage_critical_pct: 20,
          burst_warning_count: 2,
          enabled: true,
        },
      ]);

      const alerts = await service.getAlerts();

      const usageAlerts = alerts.filter((a) => a.type === "usage");
      expect(usageAlerts.length).toBeGreaterThanOrEqual(1);
      const warningUsage = usageAlerts.find((a) => a.severity === "warning");
      expect(warningUsage).toBeDefined();
      const burstAlert = alerts.find((a) => a.type === "burst");
      expect(burstAlert).toBeDefined();
    });
  });

  describe("setAlertThreshold", () => {
    it("creates a new threshold record when none exists", async () => {
      db.__thresholdsQuery.first.mockResolvedValue(undefined);

      await service.setAlertThreshold("stellar-horizon", { usageWarningPct: 60, usageCriticalPct: 85 });

      const records = db.__store.external_rate_limit_alert_thresholds;
      expect(records).toHaveLength(1);
      expect(records[0].provider_key).toBe("stellar-horizon");
      expect(records[0].usage_warning_pct).toBe(60);
      expect(records[0].usage_critical_pct).toBe(85);
      expect(records[0].burst_warning_count).toBe(5);
      expect(records[0].enabled).toBe(true);
    });

    it("updates an existing threshold record", async () => {
      db.__store.external_rate_limit_alert_thresholds.push({
        provider_key: "stellar-horizon",
        usage_warning_pct: 70,
        usage_critical_pct: 90,
        burst_warning_count: 5,
        enabled: true,
      });

      db.__thresholdsQuery.first.mockResolvedValue(db.__store.external_rate_limit_alert_thresholds[0]);

      await service.setAlertThreshold("stellar-horizon", { usageWarningPct: 50 });

      const record = db.__store.external_rate_limit_alert_thresholds[0];
      expect(record.usage_warning_pct).toBe(50);
      expect(record.usage_critical_pct).toBe(90);
      expect(record.enabled).toBe(true);
    });

    it("preserves existing values for unspecified fields on update", async () => {
      db.__store.external_rate_limit_alert_thresholds.push({
        provider_key: "base-rpc",
        usage_warning_pct: 70,
        usage_critical_pct: 90,
        burst_warning_count: 10,
        enabled: true,
      });

      db.__thresholdsQuery.first.mockResolvedValue(db.__store.external_rate_limit_alert_thresholds[0]);

      await service.setAlertThreshold("base-rpc", { burstWarningCount: 3 });

      const record = db.__store.external_rate_limit_alert_thresholds[0];
      expect(record.usage_warning_pct).toBe(70);
      expect(record.usage_critical_pct).toBe(90);
      expect(record.burst_warning_count).toBe(3);
      expect(record.enabled).toBe(true);
    });

    it("disables thresholds for a provider", async () => {
      db.__thresholdsQuery.first.mockResolvedValue(undefined);

      await service.setAlertThreshold("eth-rpc", { enabled: false });

      const record = db.__store.external_rate_limit_alert_thresholds[0];
      expect(record.enabled).toBe(false);
      expect(record.provider_key).toBe("eth-rpc");
    });
  });

  describe("exportMetrics", () => {
    it("returns JSON format with providers and alerts", async () => {
      db.__metricsQuery.__setResolve([]);
      db.__thresholdsQuery.__setResolve([]);

      const result = await service.exportMetrics("json");

      expect(result.format).toBe("json");
      expect(result.exportedAt).toBeDefined();
      expect(result.providers).toEqual([]);
      expect(result.alerts).toEqual([]);
    });
  });
});