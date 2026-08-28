import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface RollbackReadinessCheck {
  id: string;
  deployment_id: string;
  check_type: string;
  status: "pending" | "running" | "completed" | "failed";
  passed: boolean | null;
  check_criteria: Record<string, unknown>;
  check_result: Record<string, unknown> | null;
  failure_reason: string | null;
  executed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface RollbackReadinessSummary {
  id: string;
  deployment_id: string;
  total_checks: number;
  passed_checks: number;
  overall_status: "pending" | "in_progress" | "ready" | "blocked";
  ready_for_rollback: boolean;
  blocked_checks: string[] | null;
  evaluated_at: Date | null;
  created_at: Date;
}

export interface RollbackExecutionHistory {
  id: string;
  deployment_id: string;
  initiated_by: string;
  status: "initiated" | "in_progress" | "completed" | "failed";
  reason: string | null;
  rollback_config: Record<string, unknown> | null;
  duration_seconds: number | null;
  started_at: Date;
  completed_at: Date | null;
}

export async function createCheck(
  deploymentId: string,
  checkType: string,
  criteria: Record<string, unknown>
): Promise<RollbackReadinessCheck> {
  const db = getDatabase();

  const [check] = await db("rollback_readiness_checks")
    .insert({
      deployment_id: deploymentId,
      check_type: checkType,
      check_criteria: JSON.stringify(criteria),
      status: "pending",
    })
    .returning("*");

  logger.info({ deploymentId, checkType }, "Created rollback readiness check");
  return check;
}

export async function executeCheck(
  checkId: string,
  result: Record<string, unknown>,
  passed: boolean,
  failureReason?: string
): Promise<RollbackReadinessCheck> {
  const db = getDatabase();

  const [check] = await db("rollback_readiness_checks")
    .where({ id: checkId })
    .update({
      status: "completed",
      passed,
      check_result: JSON.stringify(result),
      failure_reason: failureReason || null,
      executed_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
    .returning("*");

  logger.info({ checkId, passed }, "Executed rollback readiness check");

  await updateSummary(check.deployment_id);

  return check;
}

async function updateSummary(deploymentId: string): Promise<void> {
  const db = getDatabase();

  const checks = await db("rollback_readiness_checks").where({ deployment_id: deploymentId });
  const completedChecks = checks.filter((c) => c.status === "completed");
  const passedChecks = completedChecks.filter((c) => c.passed);
  const blockedChecks = completedChecks.filter((c) => !c.passed).map((c) => c.check_type);

  const overallStatus =
    completedChecks.length === checks.length
      ? passedChecks.length === checks.length
        ? "ready"
        : "blocked"
      : "in_progress";

  const readyForRollback = overallStatus === "ready";

  const existingSummary = await db("rollback_readiness_summaries")
    .where({ deployment_id: deploymentId })
    .first();

  if (existingSummary) {
    await db("rollback_readiness_summaries")
      .where({ id: existingSummary.id })
      .update({
        total_checks: checks.length,
        passed_checks: passedChecks.length,
        overall_status: overallStatus,
        ready_for_rollback: readyForRollback,
        blocked_checks: blockedChecks.length > 0 ? JSON.stringify(blockedChecks) : null,
        evaluated_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
  } else {
    await db("rollback_readiness_summaries").insert({
      deployment_id: deploymentId,
      total_checks: checks.length,
      passed_checks: passedChecks.length,
      overall_status: overallStatus,
      ready_for_rollback: readyForRollback,
      blocked_checks: blockedChecks.length > 0 ? JSON.stringify(blockedChecks) : null,
      evaluated_at: db.fn.now(),
    });
  }
}

export async function getSummary(deploymentId: string): Promise<RollbackReadinessSummary | null> {
  const db = getDatabase();
  return db("rollback_readiness_summaries").where({ deployment_id: deploymentId }).first();
}

export async function getChecks(deploymentId: string): Promise<RollbackReadinessCheck[]> {
  const db = getDatabase();
  return db("rollback_readiness_checks")
    .where({ deployment_id: deploymentId })
    .orderBy("check_type");
}

export async function initiateRollback(
  deploymentId: string,
  initiatedBy: string,
  reason?: string,
  config?: Record<string, unknown>
): Promise<RollbackExecutionHistory> {
  const db = getDatabase();

  const summary = await getSummary(deploymentId);
  if (!summary?.ready_for_rollback) {
    throw new Error("Deployment is not ready for rollback");
  }

  const [execution] = await db("rollback_execution_history")
    .insert({
      deployment_id: deploymentId,
      initiated_by: initiatedBy,
      status: "initiated",
      reason: reason || null,
      rollback_config: config ? JSON.stringify(config) : null,
    })
    .returning("*");

  logger.info({ deploymentId, initiatedBy }, "Initiated rollback");
  return execution;
}

export async function completeRollback(
  executionId: string,
  status: "completed" | "failed",
  durationSeconds?: number
): Promise<RollbackExecutionHistory> {
  const db = getDatabase();

  const [execution] = await db("rollback_execution_history")
    .where({ id: executionId })
    .update({
      status,
      completed_at: db.fn.now(),
      duration_seconds: durationSeconds || null,
    })
    .returning("*");

  logger.info({ executionId, status }, "Completed rollback");
  return execution;
}

export async function getRollbackHistory(deploymentId: string): Promise<RollbackExecutionHistory[]> {
  const db = getDatabase();
  return db("rollback_execution_history")
    .where({ deployment_id: deploymentId })
    .orderBy("started_at", "desc");
}

export const rollbackReadinessService = {
  createCheck,
  executeCheck,
  getSummary,
  getChecks,
  initiateRollback,
  completeRollback,
  getRollbackHistory,
};
