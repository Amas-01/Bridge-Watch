import { describe, expect, it, vi } from "vitest";
import { AlertRoutingService } from "../../src/services/alertRouting.service.js";

describe("AlertRoutingService bulk operations", () => {
  it("bulkUpdateRules handles empty ids array gracefully", async () => {
    const service = new AlertRoutingService();
    const result = await service.bulkUpdateRules([], true);
    expect(result).toEqual([]);
  });
});
