import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import type { MaintenanceScope, MaintenanceWindow } from "./maintenance.service.js";

export type ImpactRiskLevel = "low" | "medium" | "high";

export interface ImpactPreviewCandidate {
  scope: MaintenanceScope;
  scopeIdentifier?: string | null;
  startTime: Date;
  endTime: Date;
}

export interface AffectedAlertRule {
  id: string;
  name: string;
  assetCode: string;
  priority: string;
}

export interface AffectedDependency {
  providerKey: string;
  displayName: string;
  category: string;
}

export interface OverlappingWindow {
  id: string;
  title: string;
  scope: MaintenanceScope;
  scopeIdentifier: string | null;
  startTime: string;
  endTime: string;
  status: MaintenanceWindow["status"];
}

export interface ImpactPreviewResult {
  scope: MaintenanceScope;
  scopeIdentifier: string | null;
  startTime: string;
  endTime: string;
  overlappingWindows: OverlappingWindow[];
  affectedAlertRules: AffectedAlertRule[];
  affectedDependencies: AffectedDependency[];
  estimatedAlertsSuppressed: number;
  riskLevel: ImpactRiskLevel;
  warnings: string[];
}

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Pure so overlap semantics can be unit tested without a database. */
export function timeRangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Pure: whether an existing window's scope would also be touched by the candidate. */
export function scopesOverlap(
  candidate: { scope: MaintenanceScope; scopeIdentifier?: string | null },
  existing: { scope: MaintenanceScope; scopeIdentifier: string | null }
): boolean {
  if (candidate.scope === "global" || existing.scope === "global") return true;
  if (candidate.scope !== existing.scope) return false;
  return (candidate.scopeIdentifier ?? null) === (existing.scopeIdentifier ?? null);
}

/** Pure: whether an alert rule (identified by its asset code) falls under the candidate scope. */
export function ruleMatchesScope(
  rule: { assetCode: string },
  candidate: { scope: MaintenanceScope; scopeIdentifier?: string | null }
): boolean {
  if (candidate.scope === "global") return true;
  if (candidate.scope === "asset") return rule.assetCode === candidate.scopeIdentifier;
  return false;
}

/** Pure: whether an external dependency (identified by its category) falls under the candidate scope. */
export function dependencyMatchesScope(
  dependency: { category: string },
  candidate: { scope: MaintenanceScope; scopeIdentifier?: string | null }
): boolean {
  if (candidate.scope === "global") return true;
  if (candidate.scope === "service") return dependency.category === candidate.scopeIdentifier;
  return false;
}

/** Pure: scales a historical alert count up/down to the candidate window's duration. */
export function estimateAlertVolume(
  historicalCount: number,
  historicalWindowMs: number,
  targetWindowMs: number
): number {
  if (historicalWindowMs <= 0 || targetWindowMs <= 0) return 0;
  return Math.round(historicalCount * (targetWindowMs / historicalWindowMs));
}

/** Pure: derives an overall risk level from the computed impact facts. */
export function computeRiskLevel(facts: {
  criticalRuleCount: number;
  totalRuleCount: number;
  overlappingWindowCount: number;
  estimatedAlertsSuppressed: number;
}): ImpactRiskLevel {
  if (facts.criticalRuleCount > 0 || facts.overlappingWindowCount > 0) return "high";
  if (facts.totalRuleCount > 0 || facts.estimatedAlertsSuppressed > 5) return "medium";
  return "low";
}

export class MaintenanceImpactPreviewService {
  private readonly db = getDatabase();

  async previewImpact(candidate: ImpactPreviewCandidate): Promise<ImpactPreviewResult> {
    const [existingWindows, rules, dependencies, historicalAlertCounts] = await Promise.all([
      this.db("maintenance_windows").whereIn("status", ["scheduled", "active"]),
      this.db("alert_rules_v2").select("id", "name", "asset_code", "priority", "status"),
      this.db("external_dependencies").select("provider_key", "display_name", "category"),
      this.db("alert_events")
        .select("asset_code")
        .count("* as count")
        .where("time", ">=", new Date(Date.now() - LOOKBACK_MS))
        .groupBy("asset_code"),
    ]);

    const overlappingWindows: OverlappingWindow[] = existingWindows
      .filter((window: any) =>
        timeRangesOverlap(
          candidate.startTime,
          candidate.endTime,
          new Date(window.start_time),
          new Date(window.end_time)
        ) &&
        scopesOverlap(candidate, { scope: window.scope, scopeIdentifier: window.scope_identifier })
      )
      .map((window: any) => ({
        id: window.id,
        title: window.title,
        scope: window.scope,
        scopeIdentifier: window.scope_identifier,
        startTime: new Date(window.start_time).toISOString(),
        endTime: new Date(window.end_time).toISOString(),
        status: window.status,
      }));

    const affectedAlertRules: AffectedAlertRule[] = rules
      .filter(
        (rule: any) =>
          rule.status === "active" && ruleMatchesScope({ assetCode: rule.asset_code }, candidate)
      )
      .map((rule: any) => ({
        id: rule.id,
        name: rule.name,
        assetCode: rule.asset_code,
        priority: rule.priority,
      }));

    const affectedDependencies: AffectedDependency[] = dependencies
      .filter((dependency: any) => dependencyMatchesScope(dependency, candidate))
      .map((dependency: any) => ({
        providerKey: dependency.provider_key,
        displayName: dependency.display_name,
        category: dependency.category,
      }));

    const matchedAssetCodes = new Set(affectedAlertRules.map((rule) => rule.assetCode));
    const historicalCount = historicalAlertCounts
      .filter((row: any) => matchedAssetCodes.has(row.asset_code))
      .reduce((sum: number, row: any) => sum + Number(row.count), 0);

    const targetWindowMs = candidate.endTime.getTime() - candidate.startTime.getTime();
    const estimatedAlertsSuppressed = estimateAlertVolume(historicalCount, LOOKBACK_MS, targetWindowMs);

    const criticalRuleCount = affectedAlertRules.filter((rule) => rule.priority === "critical").length;

    const riskLevel = computeRiskLevel({
      criticalRuleCount,
      totalRuleCount: affectedAlertRules.length,
      overlappingWindowCount: overlappingWindows.length,
      estimatedAlertsSuppressed,
    });

    const warnings: string[] = [];
    if (overlappingWindows.length > 0) {
      warnings.push(
        `Overlaps ${overlappingWindows.length} existing maintenance window(s) in the same scope.`
      );
    }
    if (criticalRuleCount > 0) {
      warnings.push(`${criticalRuleCount} critical-priority alert rule(s) will be suppressed.`);
    }
    if (targetWindowMs <= 0) {
      warnings.push("endTime is not after startTime.");
    }

    logger.info(
      { scope: candidate.scope, scopeIdentifier: candidate.scopeIdentifier, riskLevel },
      "Computed maintenance impact preview"
    );

    return {
      scope: candidate.scope,
      scopeIdentifier: candidate.scopeIdentifier ?? null,
      startTime: candidate.startTime.toISOString(),
      endTime: candidate.endTime.toISOString(),
      overlappingWindows,
      affectedAlertRules,
      affectedDependencies,
      estimatedAlertsSuppressed,
      riskLevel,
      warnings,
    };
  }
}

export const maintenanceImpactPreviewService = new MaintenanceImpactPreviewService();
