import { describe, it, expect } from "vitest";
import {
  computeGraph,
  detectCycles,
  type GraphNode,
  type GraphEdge,
} from "../../src/services/alertRuleDependencyGraph.service.js";
import type { AlertRule } from "../../src/services/alertRules.service.js";

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: "rule-1",
    ownerAddress: "owner-1",
    name: "USDC drift",
    description: null,
    assetCode: "USDC",
    conditions: [],
    logicOperator: "AND",
    priority: "high",
    status: "active",
    cooldownSeconds: 3600,
    timeWindow: null,
    version: 1,
    templateId: null,
    webhookUrl: null,
    lastTriggeredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("computeGraph", () => {
  it("creates a node per alert rule", () => {
    const graph = computeGraph([makeRule()], [], [], []);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({ id: "alert_rule:rule-1", type: "alert_rule" });
  });

  it("links a suppression rule to matching rules by asset code", () => {
    const rules = [makeRule({ id: "r1", assetCode: "USDC" }), makeRule({ id: "r2", assetCode: "XLM" })];
    const suppressions = [
      { id: "s1", name: "USDC maintenance", is_active: true, asset_codes: ["USDC"], alert_types: null },
    ];

    const graph = computeGraph(rules, suppressions, [], []);

    expect(graph.edges).toContainEqual({
      source: "suppression_rule:s1",
      target: "alert_rule:r1",
      type: "suppresses",
    });
    expect(graph.edges).not.toContainEqual(
      expect.objectContaining({ target: "alert_rule:r2" })
    );
  });

  it("links a wildcard suppression rule (no asset_codes) to every rule", () => {
    const rules = [makeRule({ id: "r1", assetCode: "USDC" }), makeRule({ id: "r2", assetCode: "XLM" })];
    const suppressions = [
      { id: "s1", name: "global maintenance", is_active: true, asset_codes: null, alert_types: null },
    ];

    const graph = computeGraph(rules, suppressions, [], []);

    const targets = graph.edges.filter((e) => e.source === "suppression_rule:s1").map((e) => e.target);
    expect(targets).toEqual(expect.arrayContaining(["alert_rule:r1", "alert_rule:r2"]));
  });

  it("links escalation rules to matching rules by asset code", () => {
    const rules = [makeRule({ id: "r1", assetCode: "USDC" })];
    const escalations = [{ id: "e1", asset_code: "USDC", alert_type: "price_deviation", is_active: true }];

    const graph = computeGraph(rules, [], escalations, []);

    expect(graph.edges).toContainEqual({
      source: "escalation_rule:e1",
      target: "alert_rule:r1",
      type: "escalates",
    });
  });

  it("links automation rules via asset code and via explicit targetRuleId", () => {
    const rules = [makeRule({ id: "r1", assetCode: "USDC" }), makeRule({ id: "r2", assetCode: "XLM" })];
    const automations = [
      {
        id: "a1",
        name: "disable on spike",
        asset_code: "USDC",
        status: "active",
        actions: [{ type: "disable_rule", config: { targetRuleId: "r2" } }],
      },
    ];

    const graph = computeGraph(rules, [], [], automations);

    expect(graph.edges).toContainEqual({
      source: "automation_rule:a1",
      target: "alert_rule:r1",
      type: "automates",
    });
    expect(graph.edges).toContainEqual({
      source: "automation_rule:a1",
      target: "alert_rule:r2",
      type: "controls",
    });
  });

  it("ignores a targetRuleId that does not correspond to a known rule", () => {
    const rules = [makeRule({ id: "r1", assetCode: "USDC" })];
    const automations = [
      {
        id: "a1",
        name: "no-op",
        asset_code: "USDC",
        status: "active",
        actions: [{ type: "disable_rule", config: { targetRuleId: "does-not-exist" } }],
      },
    ];

    const graph = computeGraph(rules, [], [], automations);

    expect(graph.edges.some((e) => e.type === "controls")).toBe(false);
  });

  it("reports rules with no incoming edges as orphans", () => {
    const rules = [makeRule({ id: "r1", assetCode: "USDC" })];
    const graph = computeGraph(rules, [], [], []);
    expect(graph.orphanRuleIds).toEqual(["alert_rule:r1"]);
  });

  it("does not report a rule as orphan once something depends on it", () => {
    const rules = [makeRule({ id: "r1", assetCode: "USDC" })];
    const suppressions = [
      { id: "s1", name: "sup", is_active: true, asset_codes: ["USDC"], alert_types: null },
    ];
    const graph = computeGraph(rules, suppressions, [], []);
    expect(graph.orphanRuleIds).toEqual([]);
  });
});

describe("detectCycles", () => {
  it("returns no cycles for an acyclic graph", () => {
    const nodes: GraphNode[] = [
      { id: "a", type: "automation_rule", label: "a", assetCode: null, isActive: true },
      { id: "b", type: "alert_rule", label: "b", assetCode: null, isActive: true },
    ];
    const edges: GraphEdge[] = [{ source: "a", target: "b", type: "controls" }];

    expect(detectCycles(nodes, edges)).toEqual([]);
  });

  it("detects a direct two-node cycle", () => {
    const nodes: GraphNode[] = [
      { id: "a", type: "automation_rule", label: "a", assetCode: null, isActive: true },
      { id: "b", type: "alert_rule", label: "b", assetCode: null, isActive: true },
    ];
    const edges: GraphEdge[] = [
      { source: "a", target: "b", type: "controls" },
      { source: "b", target: "a", type: "controls" },
    ];

    const cycles = detectCycles(nodes, edges);
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0]).toContain("a");
    expect(cycles[0]).toContain("b");
  });

  it("detects a longer transitive cycle", () => {
    const nodes: GraphNode[] = ["a", "b", "c"].map((id) => ({
      id,
      type: "alert_rule",
      label: id,
      assetCode: null,
      isActive: true,
    }));
    const edges: GraphEdge[] = [
      { source: "a", target: "b", type: "controls" },
      { source: "b", target: "c", type: "controls" },
      { source: "c", target: "a", type: "controls" },
    ];

    const cycles = detectCycles(nodes, edges);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toEqual(["a", "b", "c", "a"]);
  });
});
