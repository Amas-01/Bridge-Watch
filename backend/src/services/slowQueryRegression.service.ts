import crypto from "crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface SlowQueryBaseline {
  id: string;
  query_name: string;
  query_hash: string;
  baseline_ms: number;
  threshold_ms: number;
  variance_threshold: number;
  status: "active" | "disabled" | "testing";
  created_at: Date;
  updated_at: Date;
}

export interface SlowQueryObservation {
  id: string;
  baseline_id: string;
  execution_ms: number;
  variance_pct: number;
  is_regression: boolean;
  query_details: string | null;
  observed_at: Date;
}

export interface SlowQueryAlert {
  id: string;
  baseline_id: string;
  severity: "low" | "medium" | "high" | "critical";
  observation_count: number;
  max_duration_ms: number;
  avg_variance_pct: number;
  status: "active" | "resolved";
  first_observed_at: Date;
  resolved_at: Date | null;
  created_at: Date;
}

export async function createBaseline(
  queryName: string,
  baselineMs: number,
  varianceThreshold: number = 0.2
): Promise<SlowQueryBaseline> {
  const db = getDatabase();
  const queryHash = crypto.createHash("sha256").update(queryName).digest("hex");

  const [baseline] = await db("slow_query_baselines")
    .insert({
      query_name: queryName,
      query_hash: queryHash,
      baseline_ms: baselineMs,
      threshold_ms: Math.ceil(baselineMs * (1 + varianceThreshold)),
      variance_threshold: varianceThreshold,
      status: "active",
    })
    .returning("*");

  logger.info({ queryHash, baselineMs }, "Created slow query baseline");
  return baseline;
}

export async function recordObservation(
  baselineId: string,
  executionMs: number,
  queryDetails?: string
): Promise<SlowQueryObservation> {
  const db = getDatabase();

  const baseline = await db("slow_query_baselines").where({ id: baselineId }).first();
  if (!baseline) {
    throw new Error(`Baseline ${baselineId} not found`);
  }

  const variancePct = ((executionMs - baseline.baseline_ms) / baseline.baseline_ms) * 100;
  const isRegression = executionMs > baseline.threshold_ms;

  const [observation] = await db("slow_query_observations")
    .insert({
      baseline_id: baselineId,
      execution_ms: executionMs,
      variance_pct: variancePct,
      is_regression: isRegression,
      query_details: queryDetails || null,
    })
    .returning("*");

  if (isRegression) {
    await updateOrCreateAlert(baseline, observation);
  }

  return observation;
}

async function updateOrCreateAlert(
  baseline: SlowQueryBaseline,
  observation: SlowQueryObservation
): Promise<void> {
  const db = getDatabase();

  const recentObservations = await db("slow_query_observations")
    .where({ baseline_id: baseline.id, is_regression: true })
    .where("observed_at", ">", db.raw("NOW() - INTERVAL '1 hour'"));

  const avgVariance = recentObservations.reduce((sum, o) => sum + o.variance_pct, 0) / recentObservations.length;
  const severity = avgVariance > 50 ? "critical" : avgVariance > 30 ? "high" : avgVariance > 10 ? "medium" : "low";

  const existingAlert = await db("slow_query_alerts")
    .where({ baseline_id: baseline.id, status: "active" })
    .first();

  if (existingAlert) {
    await db("slow_query_alerts")
      .where({ id: existingAlert.id })
      .update({
        observation_count: existingAlert.observation_count + 1,
        max_duration_ms: Math.max(existingAlert.max_duration_ms, observation.execution_ms),
        avg_variance_pct: avgVariance,
        severity,
        updated_at: db.fn.now(),
      });
  } else {
    await db("slow_query_alerts").insert({
      baseline_id: baseline.id,
      severity,
      observation_count: 1,
      max_duration_ms: observation.execution_ms,
      avg_variance_pct: avgVariance,
      status: "active",
    });
  }
}

export async function getBaseline(id: string): Promise<SlowQueryBaseline | null> {
  const db = getDatabase();
  return db("slow_query_baselines").where({ id }).first();
}

export async function listBaselines(status?: string): Promise<SlowQueryBaseline[]> {
  const db = getDatabase();
  const query = db("slow_query_baselines");
  if (status) {
    query.where({ status });
  }
  return query.orderBy("created_at", "desc");
}

export async function getActiveAlerts(): Promise<SlowQueryAlert[]> {
  const db = getDatabase();
  return db("slow_query_alerts")
    .where({ status: "active" })
    .orderBy("severity", "desc")
    .orderBy("first_observed_at", "desc");
}

export async function resolveAlert(alertId: string): Promise<SlowQueryAlert> {
  const db = getDatabase();
  const [alert] = await db("slow_query_alerts")
    .where({ id: alertId })
    .update({ status: "resolved", resolved_at: db.fn.now() })
    .returning("*");
  return alert;
}

export async function updateBaseline(
  id: string,
  baselineMs?: number,
  varianceThreshold?: number
): Promise<SlowQueryBaseline> {
  const db = getDatabase();
  const updates: Record<string, unknown> = { updated_at: db.fn.now() };

  if (baselineMs !== undefined) {
    updates.baseline_ms = baselineMs;
  }
  if (varianceThreshold !== undefined) {
    updates.variance_threshold = varianceThreshold;
    if (baselineMs !== undefined) {
      updates.threshold_ms = Math.ceil(baselineMs * (1 + varianceThreshold));
    }
  }

  const [baseline] = await db("slow_query_baselines").where({ id }).update(updates).returning("*");
  return baseline;
}

export async function disableBaseline(id: string): Promise<SlowQueryBaseline> {
  const db = getDatabase();
  const [baseline] = await db("slow_query_baselines")
    .where({ id })
    .update({ status: "disabled", updated_at: db.fn.now() })
    .returning("*");
  return baseline;
}

export const slowQueryRegressionService = {
  createBaseline,
  recordObservation,
  getBaseline,
  listBaselines,
  getActiveAlerts,
  resolveAlert,
  updateBaseline,
  disableBaseline,
};
