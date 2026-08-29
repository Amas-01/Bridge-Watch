import { describe, it, expect } from "vitest";
import { transferSLAService } from "../../src/services/transferSLA.service.js";

describe("TransferSLAService", () => {
  it("fetches bridge SLA performance metrics", async () => {
    const metrics = await transferSLAService.getSLAMetrics();
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics[0].compliancePercentage).toBeGreaterThan(0);
  });

  it("fetches recent SLA breach incidents", async () => {
    const breaches = await transferSLAService.getSLABreaches();
    expect(breaches.length).toBeGreaterThan(0);
    expect(breaches[0].actualDurationSec).toBeGreaterThan(breaches[0].expectedDurationSec);
  });

  it("updates and retrieves SLA target configurations", async () => {
    const updated = await transferSLAService.updateConfig({ defaultTargetSec: 200 });
    expect(updated.defaultTargetSec).toBe(200);
  });
});
