import { describe, it, expect } from "vitest";
import { providerLatencyService } from "../../src/services/providerLatency.service.js";

describe("ProviderLatencyService", () => {
  it("fetches provider latency comparison", async () => {
    const comparison = await providerLatencyService.getComparison();
    expect(comparison.length).toBeGreaterThan(0);
    expect(comparison[0].avgLatencyMs).toBeGreaterThan(0);
  });

  it("fetches historical latency time points", async () => {
    const history = await providerLatencyService.getHistorical();
    expect(history.length).toBeGreaterThan(0);
  });

  it("triggers latency benchmark probe", async () => {
    const benchmark = await providerLatencyService.triggerBenchmark();
    expect(benchmark.benchmarkId).toBeDefined();
    expect(benchmark.totalProbesSent).toBe(100);
  });
});
