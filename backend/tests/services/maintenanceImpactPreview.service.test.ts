import { describe, it, expect, vi } from "vitest";
import {
  timeRangesOverlap,
  scopesOverlap,
  ruleMatchesScope,
  dependencyMatchesScope,
  estimateAlertVolume,
  computeRiskLevel,
} from "../../src/services/maintenanceImpactPreview.service.js";

describe("timeRangesOverlap", () => {
  it("detects overlapping ranges", () => {
    const a = [new Date("2026-08-27T10:00:00Z"), new Date("2026-08-27T12:00:00Z")] as const;
    const b = [new Date("2026-08-27T11:00:00Z"), new Date("2026-08-27T13:00:00Z")] as const;
    expect(timeRangesOverlap(a[0], a[1], b[0], b[1])).toBe(true);
  });

  it("returns false for adjacent, non-overlapping ranges", () => {
    const a = [new Date("2026-08-27T10:00:00Z"), new Date("2026-08-27T12:00:00Z")] as const;
    const b = [new Date("2026-08-27T12:00:00Z"), new Date("2026-08-27T13:00:00Z")] as const;
    expect(timeRangesOverlap(a[0], a[1], b[0], b[1])).toBe(false);
  });

  it("returns false for disjoint ranges", () => {
    const a = [new Date("2026-08-27T10:00:00Z"), new Date("2026-08-27T11:00:00Z")] as const;
    const b = [new Date("2026-08-27T12:00:00Z"), new Date("2026-08-27T13:00:00Z")] as const;
    expect(timeRangesOverlap(a[0], a[1], b[0], b[1])).toBe(false);
  });
});

describe("scopesOverlap", () => {
  it("global always overlaps", () => {
    expect(
      scopesOverlap({ scope: "global" }, { scope: "asset", scopeIdentifier: "USDC" })
    ).toBe(true);
    expect(
      scopesOverlap({ scope: "asset", scopeIdentifier: "USDC" }, { scope: "global", scopeIdentifier: null })
    ).toBe(true);
  });

  it("matches same scope and identifier", () => {
    expect(
      scopesOverlap(
        { scope: "asset", scopeIdentifier: "USDC" },
        { scope: "asset", scopeIdentifier: "USDC" }
      )
    ).toBe(true);
  });

  it("does not match different identifiers within the same scope type", () => {
    expect(
      scopesOverlap(
        { scope: "asset", scopeIdentifier: "USDC" },
        { scope: "asset", scopeIdentifier: "XLM" }
      )
    ).toBe(false);
  });

  it("does not match different scope types", () => {
    expect(
      scopesOverlap(
        { scope: "asset", scopeIdentifier: "USDC" },
        { scope: "service", scopeIdentifier: "USDC" }
      )
    ).toBe(false);
  });
});

describe("ruleMatchesScope", () => {
  it("matches every rule for global scope", () => {
    expect(ruleMatchesScope({ assetCode: "USDC" }, { scope: "global" })).toBe(true);
  });

  it("matches rules with the same asset code for asset scope", () => {
    expect(ruleMatchesScope({ assetCode: "USDC" }, { scope: "asset", scopeIdentifier: "USDC" })).toBe(
      true
    );
    expect(ruleMatchesScope({ assetCode: "XLM" }, { scope: "asset", scopeIdentifier: "USDC" })).toBe(
      false
    );
  });

  it("does not match rules for bridge or service scope", () => {
    expect(ruleMatchesScope({ assetCode: "USDC" }, { scope: "bridge", scopeIdentifier: "b1" })).toBe(
      false
    );
    expect(ruleMatchesScope({ assetCode: "USDC" }, { scope: "service", scopeIdentifier: "rpc" })).toBe(
      false
    );
  });
});

describe("dependencyMatchesScope", () => {
  it("matches every dependency for global scope", () => {
    expect(dependencyMatchesScope({ category: "rpc" }, { scope: "global" })).toBe(true);
  });

  it("matches dependencies by category for service scope", () => {
    expect(dependencyMatchesScope({ category: "rpc" }, { scope: "service", scopeIdentifier: "rpc" })).toBe(
      true
    );
    expect(
      dependencyMatchesScope({ category: "oracle" }, { scope: "service", scopeIdentifier: "rpc" })
    ).toBe(false);
  });

  it("does not match dependencies for asset or bridge scope", () => {
    expect(dependencyMatchesScope({ category: "rpc" }, { scope: "asset", scopeIdentifier: "USDC" })).toBe(
      false
    );
  });
});

describe("estimateAlertVolume", () => {
  it("scales historical counts proportionally to the target window", () => {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;
    expect(estimateAlertVolume(14, sevenDays, oneDay)).toBe(2);
  });

  it("returns zero for a non-positive window", () => {
    expect(estimateAlertVolume(10, 0, 1000)).toBe(0);
    expect(estimateAlertVolume(10, 1000, 0)).toBe(0);
  });
});

describe("computeRiskLevel", () => {
  it("is high when a critical rule is affected", () => {
    expect(
      computeRiskLevel({
        criticalRuleCount: 1,
        totalRuleCount: 1,
        overlappingWindowCount: 0,
        estimatedAlertsSuppressed: 0,
      })
    ).toBe("high");
  });

  it("is high when there is an overlapping window even with no rules", () => {
    expect(
      computeRiskLevel({
        criticalRuleCount: 0,
        totalRuleCount: 0,
        overlappingWindowCount: 1,
        estimatedAlertsSuppressed: 0,
      })
    ).toBe("high");
  });

  it("is medium when non-critical rules are affected", () => {
    expect(
      computeRiskLevel({
        criticalRuleCount: 0,
        totalRuleCount: 3,
        overlappingWindowCount: 0,
        estimatedAlertsSuppressed: 0,
      })
    ).toBe("medium");
  });

  it("is low when nothing is affected", () => {
    expect(
      computeRiskLevel({
        criticalRuleCount: 0,
        totalRuleCount: 0,
        overlappingWindowCount: 0,
        estimatedAlertsSuppressed: 0,
      })
    ).toBe("low");
  });
});

// ─── Service-level composition (mocked knex) ────────────────────────────────

function createQueryBuilder(rows: any[] = []) {
  const builder: any = {
    where: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue(rows),
    count: vi.fn().mockReturnThis(),
    then: (resolve: (value: any) => any) => resolve(rows),
  };
  return builder;
}

const state = vi.hoisted(() => ({
  windows: [] as any[],
  rules: [] as any[],
  dependencies: [] as any[],
  alertCounts: [] as any[],
}));

const mockKnex = vi.hoisted(() => {
  const knex: any = vi.fn((table: string) => {
    if (table === "maintenance_windows") return createQueryBuilder(state.windows);
    if (table === "alert_rules_v2") return createQueryBuilder(state.rules);
    if (table === "external_dependencies") return createQueryBuilder(state.dependencies);
    if (table === "alert_events") return createQueryBuilder(state.alertCounts);
    return createQueryBuilder([]);
  });
  return knex;
});

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mockKnex,
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { MaintenanceImpactPreviewService } = await import(
  "../../src/services/maintenanceImpactPreview.service.js"
);

describe("MaintenanceImpactPreviewService.previewImpact", () => {
  it("aggregates overlapping windows, affected rules, dependencies, and risk", async () => {
    state.windows = [
      {
        id: "w1",
        title: "Existing USDC work",
        scope: "asset",
        scope_identifier: "USDC",
        start_time: "2026-08-27T09:00:00Z",
        end_time: "2026-08-27T11:00:00Z",
        status: "scheduled",
      },
    ];
    state.rules = [
      { id: "r1", name: "USDC drift", asset_code: "USDC", priority: "critical", status: "active" },
      { id: "r2", name: "XLM drift", asset_code: "XLM", priority: "low", status: "active" },
    ];
    state.dependencies = [{ provider_key: "p1", display_name: "RPC", category: "rpc" }];
    state.alertCounts = [{ asset_code: "USDC", count: "7" }];

    const service = new MaintenanceImpactPreviewService();
    const result = await service.previewImpact({
      scope: "asset",
      scopeIdentifier: "USDC",
      startTime: new Date("2026-08-27T10:00:00Z"),
      endTime: new Date("2026-08-27T12:00:00Z"),
    });

    expect(result.overlappingWindows).toHaveLength(1);
    expect(result.affectedAlertRules).toEqual([
      { id: "r1", name: "USDC drift", assetCode: "USDC", priority: "critical" },
    ]);
    expect(result.affectedDependencies).toEqual([]);
    expect(result.riskLevel).toBe("high");
    expect(result.warnings.some((w) => w.includes("critical-priority"))).toBe(true);
  });

  it("returns low risk and no matches for an isolated global window with no data", async () => {
    state.windows = [];
    state.rules = [];
    state.dependencies = [];
    state.alertCounts = [];

    const service = new MaintenanceImpactPreviewService();
    const result = await service.previewImpact({
      scope: "asset",
      scopeIdentifier: "DOES_NOT_EXIST",
      startTime: new Date("2026-08-27T10:00:00Z"),
      endTime: new Date("2026-08-27T11:00:00Z"),
    });

    expect(result.overlappingWindows).toEqual([]);
    expect(result.affectedAlertRules).toEqual([]);
    expect(result.riskLevel).toBe("low");
    expect(result.warnings).toEqual([]);
  });
});
