import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type RiskLevel = "critical" | "high" | "medium" | "low";
export type SignalType = "suspicious_ip" | "failed_attempts" | "unusual_location" | "anomalous_behavior";

export interface LoginRiskSignal {
  id: string;
  userAddress: string;
  signalType: SignalType;
  riskLevel: RiskLevel;
  metadata: Record<string, unknown> | null;
  detectedAt: Date;
  resolvedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class LoginRiskSignalService {
  async createSignal(
    userAddress: string,
    signalType: SignalType,
    riskLevel: RiskLevel,
    metadata?: Record<string, unknown>
  ): Promise<LoginRiskSignal> {
    const db = getDatabase();
    const [signal] = await db("login_risk_signals")
      .insert({
        user_address: userAddress,
        signal_type: signalType,
        risk_level: riskLevel,
        metadata: metadata || null,
      })
      .returning("*");
    return this.formatSignal(signal);
  }

  async getSignalsForUser(userAddress: string): Promise<LoginRiskSignal[]> {
    const db = getDatabase();
    const signals = await db("login_risk_signals")
      .where("user_address", userAddress)
      .orderBy("detected_at", "desc");
    return signals.map((s) => this.formatSignal(s));
  }

  async getActiveSignals(minRiskLevel: RiskLevel = "medium"): Promise<LoginRiskSignal[]> {
    const db = getDatabase();
    const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const signals = await db("login_risk_signals")
      .where("is_active", true)
      .whereIn("risk_level", Object.keys(riskOrder).filter((r) => riskOrder[r as RiskLevel] <= riskOrder[minRiskLevel]))
      .orderBy("detected_at", "desc");
    return signals.map((s) => this.formatSignal(s));
  }

  async resolveSignal(signalId: string): Promise<LoginRiskSignal> {
    const db = getDatabase();
    const [signal] = await db("login_risk_signals")
      .where("id", signalId)
      .update({ is_active: false, resolved_at: new Date() })
      .returning("*");
    return this.formatSignal(signal);
  }

  private formatSignal(row: any): LoginRiskSignal {
    return {
      id: row.id,
      userAddress: row.user_address,
      signalType: row.signal_type,
      riskLevel: row.risk_level,
      metadata: row.metadata,
      detectedAt: row.detected_at,
      resolvedAt: row.resolved_at,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
