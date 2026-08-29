import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { alertRulesService, type AlertRule } from "./alertRules.service.js";

export type GraphNodeType = "alert_rule" | "suppression_rule" | "escalation_rule" | "automation_rule";
export type GraphEdgeType = "suppresses" | "escalates" | "automates" | "controls";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  assetCode: string | null;
  isActive: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: GraphEdgeType;
}

export interface DependencyGraph {
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  cycles: string[][];
  orphanRuleIds: string[];
}

interface RawSuppressionRule {
  id: string;
  name: string;
  is_active: boolean;
  asset_codes: string[] | null;
  alert_types: string[] | null;
}

interface RawEscalationRule {
  id: string;
  asset_code: string;
  alert_type: string;
  is_active: boolean;
}

interface RawAutomationRule {
  id: string;
  name: string;
  asset_code: string;
  status: string;
  actions: Array<{ type: string; config: Record<string, unknown> }>;
}

function parseJsonArray(value: unknown): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function parseActions(value: unknown): Array<{ type: string; config: Record<string, unknown> }> {
  if (Array.isArray(value)) return value as Array<{ type: string; config: Record<string, unknown> }>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Pure graph assembly, kept separate from data fetching so the matching and
 * cycle-detection logic can be unit tested without a database.
 */
export function computeGraph(
  rules: AlertRule[],
  suppressions: RawSuppressionRule[],
  escalations: RawEscalationRule[],
  automations: RawAutomationRule[]
): DependencyGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const ruleNodeId = (id: string) => `alert_rule:${id}`;
  const suppressionNodeId = (id: string) => `suppression_rule:${id}`;
  const escalationNodeId = (id: string) => `escalation_rule:${id}`;
  const automationNodeId = (id: string) => `automation_rule:${id}`;

  for (const rule of rules) {
    nodes.push({
      id: ruleNodeId(rule.id),
      type: "alert_rule",
      label: rule.name,
      assetCode: rule.assetCode,
      isActive: rule.status === "active",
    });
  }

  const rulesByAssetCode = new Map<string, AlertRule[]>();
  for (const rule of rules) {
    const list = rulesByAssetCode.get(rule.assetCode) ?? [];
    list.push(rule);
    rulesByAssetCode.set(rule.assetCode, list);
  }

  for (const suppression of suppressions) {
    nodes.push({
      id: suppressionNodeId(suppression.id),
      type: "suppression_rule",
      label: suppression.name,
      assetCode: null,
      isActive: suppression.is_active,
    });

    const matchesAllAssets = !suppression.asset_codes || suppression.asset_codes.length === 0;
    const targetRules = matchesAllAssets
      ? rules
      : suppression.asset_codes!.flatMap((code) => rulesByAssetCode.get(code) ?? []);

    for (const rule of targetRules) {
      edges.push({
        source: suppressionNodeId(suppression.id),
        target: ruleNodeId(rule.id),
        type: "suppresses",
      });
    }
  }

  for (const escalation of escalations) {
    nodes.push({
      id: escalationNodeId(escalation.id),
      type: "escalation_rule",
      label: `${escalation.asset_code} / ${escalation.alert_type}`,
      assetCode: escalation.asset_code,
      isActive: escalation.is_active,
    });

    for (const rule of rulesByAssetCode.get(escalation.asset_code) ?? []) {
      edges.push({
        source: escalationNodeId(escalation.id),
        target: ruleNodeId(rule.id),
        type: "escalates",
      });
    }
  }

  for (const automation of automations) {
    nodes.push({
      id: automationNodeId(automation.id),
      type: "automation_rule",
      label: automation.name,
      assetCode: automation.asset_code,
      isActive: automation.status === "active",
    });

    for (const rule of rulesByAssetCode.get(automation.asset_code) ?? []) {
      edges.push({
        source: automationNodeId(automation.id),
        target: ruleNodeId(rule.id),
        type: "automates",
      });
    }

    for (const action of automation.actions ?? []) {
      const targetRuleId = (action.config?.targetRuleId ?? action.config?.ruleId) as string | undefined;
      if (targetRuleId && rules.some((r) => r.id === targetRuleId)) {
        edges.push({
          source: automationNodeId(automation.id),
          target: ruleNodeId(targetRuleId),
          type: "controls",
        });
      }
    }
  }

  const cycles = detectCycles(nodes, edges);

  const nodesWithIncoming = new Set(edges.map((e) => e.target));
  const orphanRuleIds = rules
    .map((rule) => ruleNodeId(rule.id))
    .filter((id) => !nodesWithIncoming.has(id));

  return {
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
    cycles,
    orphanRuleIds,
  };
}

/**
 * Detects cycles in the dependency graph via DFS. Returns each distinct
 * cycle as an ordered list of node ids (the last id closes back to the first).
 */
export function detectCycles(nodes: GraphNode[], edges: GraphEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge.target);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  function visit(nodeId: string) {
    visited.add(nodeId);
    stack.push(nodeId);
    onStack.add(nodeId);

    for (const neighbor of adjacency.get(nodeId) ?? []) {
      if (!visited.has(neighbor)) {
        visit(neighbor);
      } else if (onStack.has(neighbor)) {
        const cycleStart = stack.indexOf(neighbor);
        cycles.push([...stack.slice(cycleStart), neighbor]);
      }
    }

    stack.pop();
    onStack.delete(nodeId);
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) visit(node.id);
  }

  return cycles;
}

export class AlertRuleDependencyGraphService {
  private readonly db = getDatabase();

  async buildGraph(): Promise<DependencyGraph> {
    const [rules, suppressionRows, escalationRows, automationRows] = await Promise.all([
      alertRulesService.listRules(),
      this.db("alert_suppression_rules").select(
        "id",
        "name",
        "is_active",
        "asset_codes",
        "alert_types"
      ),
      this.db("alert_escalation_rules").select("id", "asset_code", "alert_type", "is_active"),
      this.db("automation_rules").select("id", "name", "asset_code", "status", "actions"),
    ]);

    const suppressions: RawSuppressionRule[] = suppressionRows.map((row: any) => ({
      id: row.id,
      name: row.name,
      is_active: row.is_active,
      asset_codes: parseJsonArray(row.asset_codes),
      alert_types: parseJsonArray(row.alert_types),
    }));

    const escalations: RawEscalationRule[] = escalationRows.map((row: any) => ({
      id: row.id,
      asset_code: row.asset_code,
      alert_type: row.alert_type,
      is_active: row.is_active,
    }));

    const automations: RawAutomationRule[] = automationRows.map((row: any) => ({
      id: row.id,
      name: row.name,
      asset_code: row.asset_code,
      status: row.status,
      actions: parseActions(row.actions),
    }));

    const graph = computeGraph(rules, suppressions, escalations, automations);

    if (graph.cycles.length > 0) {
      logger.warn({ cycleCount: graph.cycles.length }, "Alert rule dependency graph has cycles");
    }

    return graph;
  }

  async getRuleSubgraph(ruleId: string): Promise<DependencyGraph> {
    const graph = await this.buildGraph();
    const targetId = `alert_rule:${ruleId}`;

    const relevantEdges = graph.edges.filter(
      (edge) => edge.source === targetId || edge.target === targetId
    );
    const relevantNodeIds = new Set<string>([targetId]);
    for (const edge of relevantEdges) {
      relevantNodeIds.add(edge.source);
      relevantNodeIds.add(edge.target);
    }

    return {
      generatedAt: graph.generatedAt,
      nodes: graph.nodes.filter((node) => relevantNodeIds.has(node.id)),
      edges: relevantEdges,
      cycles: graph.cycles.filter((cycle) => cycle.includes(targetId)),
      orphanRuleIds: graph.orphanRuleIds.filter((id) => id === targetId),
    };
  }
}

export const alertRuleDependencyGraphService = new AlertRuleDependencyGraphService();
