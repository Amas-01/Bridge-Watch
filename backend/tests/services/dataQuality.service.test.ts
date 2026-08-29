import { describe, it, expect } from "vitest";
import { dataQualityService } from "../../src/services/dataQuality.service.js";

describe("DataQualityService", () => {
  it("fetches data quality scores across datasources", async () => {
    const scores = await dataQualityService.getQualityScores();
    expect(scores.length).toBeGreaterThan(0);
    expect(scores[0].overallScore).toBeGreaterThanOrEqual(0);
    expect(scores[0].dimensions.length).toBe(5);
  });

  it("updates and retrieves data quality rule weightings", async () => {
    const updated = await dataQualityService.updateQualityRules({ freshnessWeight: 0.35 });
    expect(updated.freshnessWeight).toBe(0.35);
  });
});
