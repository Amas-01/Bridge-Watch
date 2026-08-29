import { beforeEach, describe, expect, it, vi } from "vitest";
import { RuleEvaluatorService } from "../../src/services/ruleEvaluator.service.js";

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(() => {
    const b: any = {};
    b.then = (resolve: any) => Promise.resolve([]).then(resolve);
    b.where = vi.fn().mockReturnValue(b);
    b.orderBy = vi.fn().mockReturnValue(b);
    b.insert = vi.fn().mockReturnValue(b);
    b.returning = vi.fn().mockResolvedValue([]);
    b.first = vi.fn().mockResolvedValue(null);
    b.limit = vi.fn().mockReturnValue(b);
    b.offset = vi.fn().mockResolvedValue([]);
    b.count = vi.fn().mockReturnValue(b);
    const fn = (_t: string) => b;
    return fn;
  }),
}));

describe("RuleEvaluatorService - AND/OR condition combinations", () => {
  let service: RuleEvaluatorService;

  beforeEach(() => {
    (RuleEvaluatorService as any).instance = undefined;
    service = RuleEvaluatorService.getInstance();
  });

  describe("flat AND groups across varied operator types", () => {
    it("triggers when every operator variant in the group passes", () => {
      const result = service.evaluate(
        {
          ruleName: "multi-operator-and",
          assetCode: "USDC",
          conditions: [
            { field: "price", operator: "gte", value: 100 },
            { field: "supply", operator: "lte", value: 1_000_000 },
            { field: "peg", operator: "eq", value: 1 },
            { field: "status", operator: "ne", value: 0 },
            { field: "reserve_ratio", operator: "between", value: 90, valueHigh: 110 },
          ],
          logicOperator: "AND",
        },
        { price: 100, supply: 1_000_000, peg: 1, status: 1, reserve_ratio: 100 }
      );

      expect(result.triggered).toBe(true);
      expect(result.conditionResults).toHaveLength(5);
      expect(result.conditionResults.every((c) => c.passed)).toBe(true);
    });

    it("does not trigger when a single condition among many fails, short-circuiting after the failure", () => {
      const result = service.evaluate(
        {
          ruleName: "multi-operator-and-fail",
          assetCode: "USDC",
          conditions: [
            { field: "price", operator: "gte", value: 100 },
            { field: "supply", operator: "lte", value: 1_000_000 },
            { field: "peg", operator: "eq", value: 1 },
          ],
          logicOperator: "AND",
        },
        { price: 100, supply: 2_000_000, peg: 1 }
      );

      expect(result.triggered).toBe(false);
      // AND uses Array.prototype.every, which short-circuits at the first
      // failing condition - "peg" is never evaluated.
      expect(result.conditionResults).toHaveLength(2);
      expect(result.conditionResults[0].passed).toBe(true);
      expect(result.conditionResults[1].passed).toBe(false);
    });

    it("treats a missing metric field as 0 for evaluation purposes", () => {
      const result = service.evaluate(
        {
          ruleName: "missing-field-and",
          assetCode: "USDC",
          conditions: [
            { field: "price", operator: "gt", value: 100 },
            { field: "unknown_metric", operator: "eq", value: 0 },
          ],
          logicOperator: "AND",
        },
        { price: 150 }
      );

      expect(result.conditionResults[1].actualValue).toBe(0);
      expect(result.conditionResults[1].passed).toBe(true);
      expect(result.triggered).toBe(true);
    });
  });

  describe("flat OR groups across varied metric snapshots", () => {
    const conditions = [
      { field: "price_deviation", operator: "gt" as const, value: 5 },
      { field: "volume_drop_pct", operator: "gte" as const, value: 50 },
      { field: "bridge_downtime_min", operator: "gt" as const, value: 30 },
    ];

    it.each([
      { metrics: { price_deviation: 6, volume_drop_pct: 0, bridge_downtime_min: 0 }, expected: true },
      { metrics: { price_deviation: 0, volume_drop_pct: 50, bridge_downtime_min: 0 }, expected: true },
      { metrics: { price_deviation: 0, volume_drop_pct: 0, bridge_downtime_min: 31 }, expected: true },
      { metrics: { price_deviation: 1, volume_drop_pct: 10, bridge_downtime_min: 5 }, expected: false },
    ])("resolves to $expected for metrics $metrics", ({ metrics, expected }) => {
      const result = service.evaluate(
        { ruleName: "or-snapshot", assetCode: "USDC", conditions, logicOperator: "OR" },
        metrics
      );
      expect(result.triggered).toBe(expected);
    });

    it("records every evaluated condition outcome when the passing condition is last", () => {
      const result = service.evaluate(
        { ruleName: "or-collect", assetCode: "USDC", conditions, logicOperator: "OR" },
        { price_deviation: 1, volume_drop_pct: 10, bridge_downtime_min: 35 }
      );
      expect(result.triggered).toBe(true);
      expect(result.conditionResults).toHaveLength(3);
      expect(result.conditionResults[0].passed).toBe(false);
      expect(result.conditionResults[1].passed).toBe(false);
      expect(result.conditionResults[2].passed).toBe(true);
    });
  });

  describe("nested AND/OR AST combinations", () => {
    it("evaluates (A OR B) AND (C OR D) across passing and failing snapshots", () => {
      const astCondition: any = {
        op: "AND",
        conditions: [
          {
            op: "OR",
            conditions: [
              { field: "price_deviation", operator: "gt", value: 5 },
              { field: "volume_drop_pct", operator: "gte", value: 50 },
            ],
          },
          {
            op: "OR",
            conditions: [
              { field: "tvl", operator: "lt", value: 500_000 },
              { field: "bridge_downtime_min", operator: "gt", value: 30 },
            ],
          },
        ],
      };

      const bothGroupsPass = service.evaluate(
        { ruleName: "and-of-or", assetCode: "USDC", astCondition },
        { price_deviation: 6, volume_drop_pct: 0, tvl: 600_000, bridge_downtime_min: 45 }
      );
      expect(bothGroupsPass.triggered).toBe(true);

      const onlyFirstGroupPasses = service.evaluate(
        { ruleName: "and-of-or", assetCode: "USDC", astCondition },
        { price_deviation: 6, volume_drop_pct: 0, tvl: 600_000, bridge_downtime_min: 0 }
      );
      expect(onlyFirstGroupPasses.triggered).toBe(false);
    });

    it("evaluates (A AND B) OR (C AND D) across passing and failing snapshots", () => {
      const astCondition: any = {
        op: "OR",
        conditions: [
          {
            op: "AND",
            conditions: [
              { field: "price_deviation", operator: "gt", value: 2 },
              { field: "tvl", operator: "lt", value: 500_000 },
            ],
          },
          {
            op: "AND",
            conditions: [
              { field: "volume", operator: "lt", value: 10_000 },
              { field: "bridge_downtime_min", operator: "gt", value: 30 },
            ],
          },
        ],
      };

      const secondGroupPasses = service.evaluate(
        { ruleName: "or-of-and", assetCode: "USDC", astCondition },
        { price_deviation: 1, tvl: 800_000, volume: 5_000, bridge_downtime_min: 40 }
      );
      expect(secondGroupPasses.triggered).toBe(true);

      const neitherGroupPasses = service.evaluate(
        { ruleName: "or-of-and", assetCode: "USDC", astCondition },
        { price_deviation: 1, tvl: 800_000, volume: 5_000, bridge_downtime_min: 0 }
      );
      expect(neitherGroupPasses.triggered).toBe(false);
    });

    it("evaluates three-level nested AND(OR(AND)) combinations", () => {
      const astCondition: any = {
        op: "AND",
        conditions: [
          { field: "peg", operator: "eq", value: 1 },
          {
            op: "OR",
            conditions: [
              { field: "price_deviation", operator: "gt", value: 5 },
              {
                op: "AND",
                conditions: [
                  { field: "volume", operator: "lt", value: 10_000 },
                  { field: "tvl", operator: "lt", value: 500_000 },
                ],
              },
            ],
          },
        ],
      };

      const deepOrPathPasses = service.evaluate(
        { ruleName: "deep-nested", assetCode: "USDC", astCondition },
        { peg: 1, price_deviation: 0, volume: 5_000, tvl: 400_000 }
      );
      expect(deepOrPathPasses.triggered).toBe(true);

      const topLevelFails = service.evaluate(
        { ruleName: "deep-nested", assetCode: "USDC", astCondition },
        { peg: 0, price_deviation: 10, volume: 5_000, tvl: 400_000 }
      );
      expect(topLevelFails.triggered).toBe(false);
    });

    it("combines changes_by_pct with AND/OR groups given previous metric snapshots", () => {
      const astCondition: any = {
        op: "OR",
        conditions: [
          { field: "price", operator: "changes_by_pct", value: 10 },
          {
            op: "AND",
            conditions: [
              { field: "volume", operator: "gt", value: 1000 },
              { field: "tvl", operator: "lt", value: 500_000 },
            ],
          },
        ],
      };

      const changePctTriggers = service.evaluate(
        { ruleName: "changes-or", assetCode: "USDC", astCondition },
        { price: 120, volume: 0, tvl: 900_000 },
        { price: 100, volume: 0, tvl: 900_000 }
      );
      expect(changePctTriggers.triggered).toBe(true);

      const noPreviousMetricsFallsBackToOtherBranch = service.evaluate(
        { ruleName: "changes-or", assetCode: "USDC", astCondition },
        { price: 120, volume: 2000, tvl: 400_000 }
      );
      expect(noPreviousMetricsFallsBackToOtherBranch.triggered).toBe(true);
      expect(noPreviousMetricsFallsBackToOtherBranch.conditionResults[0].passed).toBe(false);
    });
  });

  describe("evaluateBatch with mixed AND/OR rules", () => {
    it("evaluates independent AND and OR rules against a single metric snapshot", () => {
      const metrics = { price: 150, volume: 200, tvl: 600_000 };
      const results = service.evaluateBatch(
        [
          {
            ruleName: "and-rule",
            assetCode: "USDC",
            logicOperator: "AND",
            conditions: [
              { field: "price", operator: "gt", value: 100 },
              { field: "tvl", operator: "gt", value: 500_000 },
            ],
          },
          {
            ruleName: "or-rule",
            assetCode: "USDC",
            logicOperator: "OR",
            conditions: [
              { field: "volume", operator: "gt", value: 10_000 },
              { field: "tvl", operator: "gt", value: 500_000 },
            ],
          },
        ],
        metrics
      );

      expect(results[0].triggered).toBe(true);
      expect(results[0].logicOperator).toBe("AND");
      expect(results[1].triggered).toBe(true);
      expect(results[1].logicOperator).toBe("OR");
    });
  });
});
