import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface CanaryDeployment {
  id: string;
  deployment_name: string;
  version: string;
  environment: string;
  status: "running" | "completed" | "failed" | "aborted";
  deployment_config: Record<string, unknown>;
  traffic_percentage: number;
  baseline_version: string | null;
  started_at: Date;
  ended_at: Date | null;
  created_at: Date;
}

export interface CanaryMetric {
  id: string;
  deployment_id: string;
  metric_name: string;
  metric_type: string;
  canary_value: number;
  baseline_value: number;
  deviation_pct: number;
  threshold_pct: number;
  within_threshold: boolean;
  measured_at: Date;
}

export interface CanaryMetricComparison {
  id: string;
  deployment_id: string;
  comparison_status: "in_progress" | "completed" | "failed";
  total_metrics: number;
  healthy_metrics: number;
  overall_deviation_pct: number;
  anomalies: Record<string, unknown>[] | null;
  recommendation: "continue_monitoring" | "expand_traffic" | "rollback" | "investigate";
  evaluated_at: Date | null;
  created_at: Date;
}

export async function createDeployment(
  deploymentName: string,
  version: string,
  environment: string,
  config: Record<string, unknown>,
  trafficPercentage: number = 10,
  baselineVersion?: string
): Promise<CanaryDeployment> {
  const db = getDatabase();

  const [deployment] = await db("canary_deployments")
    .insert({
      deployment_name: deploymentName,
      version,
      environment,
      status: "running",
      deployment_config: JSON.stringify(config),
      traffic_percentage: trafficPercentage,
      baseline_version: baselineVersion || null,
    })
    .returning("*");

  logger.info({ deploymentName, version, environment }, "Created canary deployment");

  await db("canary_metric_comparisons").insert({
    deployment_id: deployment.id,
    comparison_status: "in_progress",
  });

  return deployment;
}

export async function recordMetric(
  deploymentId: string,
  metricName: string,
  metricType: string,
  canaryValue: number,
  baselineValue: number,
  thresholdPct: number = 10
): Promise<CanaryMetric> {
  const db = getDatabase();

  const deviationPct = Math.abs(((canaryValue - baselineValue) / baselineValue) * 100);
  const withinThreshold = deviationPct <= thresholdPct;

  const [metric] = await db("canary_metrics")
    .insert({
      deployment_id: deploymentId,
      metric_name: metricName,
      metric_type: metricType,
      canary_value: canaryValue,
      baseline_value: baselineValue,
      deviation_pct: deviationPct,
      threshold_pct: thresholdPct,
      within_threshold: withinThreshold,
    })
    .returning("*");

  await updateComparison(deploymentId);

  return metric;
}

async function updateComparison(deploymentId: string): Promise<void> {
  const db = getDatabase();

  const metrics = await db("canary_metrics").where({ deployment_id: deploymentId });

  if (metrics.length === 0) {
    return;
  }

  const healthyMetrics = metrics.filter((m) => m.within_threshold).length;
  const overallDeviation = metrics.reduce((sum, m) => sum + m.deviation_pct, 0) / metrics.length;

  const anomalies = metrics
    .filter((m) => !m.within_threshold)
    .map((m) => ({
      metric_name: m.metric_name,
      deviation_pct: m.deviation_pct,
      threshold_pct: m.threshold_pct,
    }));

  let recommendation: "continue_monitoring" | "expand_traffic" | "rollback" | "investigate";
  if (healthyMetrics === metrics.length) {
    recommendation = "expand_traffic";
  } else if (healthyMetrics < metrics.length * 0.5) {
    recommendation = "rollback";
  } else if (anomalies.length > 0) {
    recommendation = "investigate";
  } else {
    recommendation = "continue_monitoring";
  }

  const [comparison] = await db("canary_metric_comparisons")
    .where({ deployment_id: deploymentId })
    .update({
      total_metrics: metrics.length,
      healthy_metrics: healthyMetrics,
      overall_deviation_pct: overallDeviation,
      anomalies: anomalies.length > 0 ? JSON.stringify(anomalies) : null,
      recommendation,
      evaluated_at: db.fn.now(),
    })
    .returning("*");
}

export async function getDeployment(id: string): Promise<CanaryDeployment | null> {
  const db = getDatabase();
  return db("canary_deployments").where({ id }).first();
}

export async function getComparison(deploymentId: string): Promise<CanaryMetricComparison | null> {
  const db = getDatabase();
  return db("canary_metric_comparisons").where({ deployment_id: deploymentId }).first();
}

export async function getMetrics(deploymentId: string): Promise<CanaryMetric[]> {
  const db = getDatabase();
  return db("canary_metrics").where({ deployment_id: deploymentId }).orderBy("metric_name");
}

export async function completeDeployment(
  deploymentId: string,
  status: "completed" | "failed" | "aborted"
): Promise<CanaryDeployment> {
  const db = getDatabase();

  const [deployment] = await db("canary_deployments")
    .where({ id: deploymentId })
    .update({
      status,
      ended_at: db.fn.now(),
    })
    .returning("*");

  logger.info({ deploymentId, status }, "Completed canary deployment");
  return deployment;
}

export async function listDeployments(environment?: string, status?: string): Promise<CanaryDeployment[]> {
  const db = getDatabase();
  const query = db("canary_deployments");

  if (environment) {
    query.where({ environment });
  }
  if (status) {
    query.where({ status });
  }

  return query.orderBy("started_at", "desc");
}

export const canaryMetricService = {
  createDeployment,
  recordMetric,
  getDeployment,
  getComparison,
  getMetrics,
  completeDeployment,
  listDeployments,
};
