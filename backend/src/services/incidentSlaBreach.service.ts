import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type SlaBreachLevel = "warning" | "critical";
export type IncidentSeverity = "critical" | "high" | "medium" | "low";

export interface SlaThreshold {
  warningMinutes: number;
  criticalMinutes: number;
}

export interface SlaBreachEvent {
  incidentId: string;
  bridgeId: string;
  severity: IncidentSeverity;
  status: string;
  title: string;
  occurredAt: string;
  elapsedMinutes: number;
  breachLevel: SlaBreachLevel;
  thresholdMinutes: number;
}

export interface SlaCheckResult {
  checkedAt: string;
  openIncidentsChecked: number;
  breaches: SlaBreachEvent[];
}

const DEFAULT_THRESHOLDS: Record<IncidentSeverity, SlaThreshold> = {
  critical: { warningMinutes: 30, criticalMinutes: 60 },
  high: { warningMinutes: 120, criticalMinutes: 240 },
  medium: { warningMinutes: 480, criticalMinutes: 1440 },
  low: { warningMinutes: 1440, criticalMinutes: 4320 },
};

export class IncidentSlaBreachService {
  private readonly db = getDatabase();
  private thresholds: Record<IncidentSeverity, SlaThreshold> = { ...DEFAULT_THRESHOLDS };

  configureThresholds(overrides: Partial<Record<IncidentSeverity, SlaThreshold>>): void {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...overrides };
  }

  async checkSlaBreaches(): Promise<SlaCheckResult> {
    const checkedAt = new Date().toISOString();

    const openIncidents = await this.db("bridge_incidents")
      .select("id", "bridge_id", "severity", "status", "title", "occurred_at")
      .whereIn("status", ["open", "investigating"])
      .orderBy("occurred_at", "asc");

    const breaches: SlaBreachEvent[] = [];
    const now = Date.now();

    for (const incident of openIncidents) {
      const severity = String(incident.severity) as IncidentSeverity;
      const threshold = this.thresholds[severity] ?? DEFAULT_THRESHOLDS.low;
      const occurredAt = new Date(incident.occurred_at);
      const elapsedMs = now - occurredAt.getTime();
      const elapsedMinutes = Math.floor(elapsedMs / 60_000);

      let breachLevel: SlaBreachLevel | null = null;
      let thresholdMinutes = 0;

      if (elapsedMinutes >= threshold.criticalMinutes) {
        breachLevel = "critical";
        thresholdMinutes = threshold.criticalMinutes;
      } else if (elapsedMinutes >= threshold.warningMinutes) {
        breachLevel = "warning";
        thresholdMinutes = threshold.warningMinutes;
      }

      if (breachLevel) {
        const breach: SlaBreachEvent = {
          incidentId: String(incident.id),
          bridgeId: String(incident.bridge_id),
          severity,
          status: String(incident.status),
          title: String(incident.title),
          occurredAt: occurredAt.toISOString(),
          elapsedMinutes,
          breachLevel,
          thresholdMinutes,
        };

        breaches.push(breach);

        logger.warn(
          {
            incidentId: breach.incidentId,
            bridgeId: breach.bridgeId,
            severity,
            breachLevel,
            elapsedMinutes,
            thresholdMinutes,
          },
          `SLA ${breachLevel} breach: incident open for ${elapsedMinutes}m (threshold: ${thresholdMinutes}m)`
        );
      }
    }

    if (breaches.length > 0) {
      logger.error(
        { totalBreaches: breaches.length, critical: breaches.filter((b) => b.breachLevel === "critical").length },
        "SLA breach check completed with breaches"
      );
    } else {
      logger.info({ checkedAt, openIncidentsChecked: openIncidents.length }, "SLA breach check passed — no breaches");
    }

    return {
      checkedAt,
      openIncidentsChecked: openIncidents.length,
      breaches,
    };
  }

  async getBreachSummary(): Promise<{
    critical: SlaBreachEvent[];
    warning: SlaBreachEvent[];
  }> {
    const result = await this.checkSlaBreaches();
    return {
      critical: result.breaches.filter((b) => b.breachLevel === "critical"),
      warning: result.breaches.filter((b) => b.breachLevel === "warning"),
    };
  }
}

export const incidentSlaBreachService = new IncidentSlaBreachService();
