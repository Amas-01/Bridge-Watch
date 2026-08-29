import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimitService } from "../../src/services/rateLimit.service.js";
import { redis } from "../../src/utils/redis.js";

// Mock logger to avoid spamming the console
vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("RateLimitService Unit Tests", () => {
  let service: RateLimitService;

  beforeEach(() => {
    service = new RateLimitService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getRateLimitStats", () => {
    it("aggregates data correctly from active IP and API key Redis keys", async () => {
      // Mock redis.hgetall for stats
      vi.spyOn(redis, "hgetall").mockResolvedValue({
        totalRequests: "100",
        blockedRequests: "5",
        whitelistedRequests: "2",
      });

      // Mock redis.keys to return keys
      vi.spyOn(redis, "keys").mockImplementation(async (pattern: string) => {
        if (pattern.includes("ip")) {
          return ["bw:rl:ip:192.168.1.1:read", "bw:rl:ip:192.168.1.2:write"];
        } else if (pattern.includes("key")) {
          return ["bw:rl:key:basic_key1:read", "bw:rl:key:premium_key2:write"];
        }
        return [];
      });

      // Mock redis.zrangebyscore to return array of members
      vi.spyOn(redis, "zrangebyscore").mockResolvedValue(["member1", "member2"]);

      // Mock redis.zcard to return active count
      vi.spyOn(redis, "zcard").mockResolvedValue(2);

      const stats = await service.getRateLimitStats("24h");

      expect(stats.totalRequests).toBe(100);
      expect(stats.blockedRequests).toBe(5);
      expect(stats.whitelistedRequests).toBe(2);

      // Verify top IPs list
      expect(stats.topIPs.length).toBe(2);
      expect(stats.topIPs[0].ip).toBe("192.168.1.1");
      expect(stats.topIPs[0].requests).toBe(2);

      // Verify top API keys list
      expect(stats.topApiKeys.length).toBe(2);
      expect(stats.topApiKeys[0].apiKey).toBe("basic_key1");
      expect(stats.topApiKeys[0].tier).toBe("basic");

      // Verify endpoint stats
      expect(stats.endpointStats.length).toBe(2);
      expect(stats.endpointStats[0].requests).toBe(4);

      // Verify tier distribution
      expect(stats.tierDistribution.basic).toBe(2);
      expect(stats.tierDistribution.premium).toBe(2);

      // Verify current window stats
      expect(stats.currentWindowStats.activeIPs).toBe(2);
      expect(stats.currentWindowStats.activeApiKeys).toBe(2);
      expect(stats.currentWindowStats.averageRequestsPerIP).toBe(2);
    });
  });

  describe("getRateLimitStatus", () => {
    it("returns active limits and usage metrics for IP address", async () => {
      vi.spyOn(redis, "keys").mockResolvedValue(["bw:rl:ip:127.0.0.1:read"]);
      vi.spyOn(redis, "zcard").mockResolvedValue(5);
      vi.spyOn(redis, "pttl").mockResolvedValue(60000);

      const status = await service.getRateLimitStatus("127.0.0.1", "ip");
      expect(status.currentUsage).toBe(5);
      expect(status.endpointLimits[0].endpoint).toBe("read");
    });
  });

  describe("resetRateLimit", () => {
    it("deletes redis rate limit keys for the given identifier", async () => {
      vi.spyOn(redis, "keys").mockResolvedValue(["bw:rl:ip:127.0.0.1:read"]);
      const delSpy = vi.spyOn(redis, "del").mockResolvedValue(1);

      await service.resetRateLimit("127.0.0.1", "ip");
      expect(delSpy).toHaveBeenCalledWith("bw:rl:ip:127.0.0.1:read");
    });
  });

  describe("updateRateLimit", () => {
    it("updates target rate limit configuration in Redis and publishes the config change", async () => {
      const hsetSpy = vi.spyOn(redis, "hset").mockResolvedValue(1);
      const publishSpy = vi.spyOn(redis, "publish").mockResolvedValue(1);

      const newLimits = {
        requestsPerWindow: 200,
        windowMs: 60000,
        burstAllowance: 20,
      };

      await service.updateRateLimit("free", newLimits);

      expect(hsetSpy).toHaveBeenCalledWith("bw:rl:config:free", expect.any(Object));
      expect(publishSpy).toHaveBeenCalledWith("bw:rl:config-change", expect.any(String));
    });
  });

  describe("exportData", () => {
    it("exports metrics in JSON format", async () => {
      vi.spyOn(redis, "hgetall").mockResolvedValue({ totalRequests: "10" });
      vi.spyOn(redis, "keys").mockResolvedValue([]);

      const data = await service.exportData("json");
      const parsed = JSON.parse(data);
      expect(parsed).toHaveProperty("totalRequests");
    });

    it("exports metrics in CSV format", async () => {
      vi.spyOn(redis, "hgetall").mockResolvedValue({ totalRequests: "10" });
      vi.spyOn(redis, "keys").mockResolvedValue([]);

      const data = await service.exportData("csv");
      expect(data).toContain("Type,Identifier,Tier,Endpoint,Requests,Blocked");
    });
  });

  describe("computeExternalRateLimitMetrics", () => {
    it("computes external rate limit metrics correctly", async () => {
      vi.spyOn(redis, "hgetall").mockResolvedValue({ totalRequests: "50", blockedRequests: "2" });
      vi.spyOn(redis, "keys").mockResolvedValue([]);

      const result = await service.computeExternalRateLimitMetrics({ timeRange: "24h" });

      expect(result.totalRequests).toBe(50);
      expect(result.blockedRequests).toBe(2);
      expect(result.throttledCount).toBe(0);
      expect(result.isThrottled).toBe(false);
      expect(result.tierDistribution).toBeDefined();
    });
  });
});
