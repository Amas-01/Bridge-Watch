import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface PromotionGate {
  id: string;
  source_environment: string;
  target_environment: string;
  gate_name: string;
  gate_type: string;
  status: "active" | "disabled";
  gate_criteria: Record<string, unknown>;
  approval_count: number;
  required_approvals: number;
  approval_roles: string;
  created_at: Date;
  updated_at: Date;
}

export interface PromotionHistory {
  id: string;
  deployment_id: string;
  version: string;
  source_environment: string;
  target_environment: string;
  status: "pending" | "approved" | "denied" | "promoted" | "cancelled";
  gate_results: Record<string, unknown> | null;
  passed_gates: number;
  total_gates: number;
  reason_denied: string | null;
  requested_at: Date;
  approved_at: Date | null;
  promoted_at: Date | null;
}

export interface PromotionApproval {
  id: string;
  promotion_id: string;
  approver_id: string;
  decision: "approved" | "denied";
  comment: string | null;
  approved_at: Date;
}

export interface GateExecutionLog {
  id: string;
  gate_id: string;
  promotion_id: string;
  execution_status: "pending" | "running" | "completed" | "failed";
  passed: boolean;
  execution_result: Record<string, unknown> | null;
  duration_ms: number | null;
  executed_at: Date;
}

export async function createGate(
  sourceEnv: string,
  targetEnv: string,
  gateName: string,
  gateType: string,
  criteria: Record<string, unknown>,
  requiredApprovals: number = 1,
  approvalRoles: string = "admin"
): Promise<PromotionGate> {
  const db = getDatabase();

  const [gate] = await db("promotion_gates")
    .insert({
      source_environment: sourceEnv,
      target_environment: targetEnv,
      gate_name: gateName,
      gate_type: gateType,
      gate_criteria: JSON.stringify(criteria),
      required_approvals: requiredApprovals,
      approval_roles: approvalRoles,
      status: "active",
    })
    .returning("*");

  logger.info({ sourceEnv, targetEnv, gateName }, "Created promotion gate");
  return gate;
}

export async function requestPromotion(
  deploymentId: string,
  version: string,
  sourceEnv: string,
  targetEnv: string
): Promise<PromotionHistory> {
  const db = getDatabase();

  const gates = await db("promotion_gates")
    .where({ source_environment: sourceEnv, target_environment: targetEnv, status: "active" });

  const [promotion] = await db("promotion_history")
    .insert({
      deployment_id: deploymentId,
      version,
      source_environment: sourceEnv,
      target_environment: targetEnv,
      status: "pending",
      total_gates: gates.length,
      passed_gates: 0,
    })
    .returning("*");

  for (const gate of gates) {
    await db("gate_execution_logs").insert({
      gate_id: gate.id,
      promotion_id: promotion.id,
      execution_status: "pending",
      passed: false,
    });
  }

  logger.info({ deploymentId, sourceEnv, targetEnv }, "Requested promotion");
  return promotion;
}

export async function executeGate(
  gateId: string,
  promotionId: string,
  passed: boolean,
  result?: Record<string, unknown>,
  durationMs?: number
): Promise<GateExecutionLog> {
  const db = getDatabase();

  const [log] = await db("gate_execution_logs")
    .where({ gate_id: gateId, promotion_id: promotionId })
    .update({
      execution_status: "completed",
      passed,
      execution_result: result ? JSON.stringify(result) : null,
      duration_ms: durationMs || null,
      executed_at: db.fn.now(),
    })
    .returning("*");

  await updatePromotionStatus(promotionId);

  return log;
}

async function updatePromotionStatus(promotionId: string): Promise<void> {
  const db = getDatabase();

  const promotion = await db("promotion_history").where({ id: promotionId }).first();
  if (!promotion) {
    return;
  }

  const logs = await db("gate_execution_logs").where({ promotion_id: promotionId });
  const completedLogs = logs.filter((l) => l.execution_status === "completed");
  const passedLogs = completedLogs.filter((l) => l.passed);

  const passedGates = passedLogs.length;
  const totalGates = logs.length;
  const allCompleted = completedLogs.length === totalGates;

  let status = promotion.status;
  if (allCompleted) {
    status = passedGates === totalGates ? "approved" : "denied";
  }

  await db("promotion_history")
    .where({ id: promotionId })
    .update({
      passed_gates: passedGates,
      status,
      approved_at: status === "approved" ? db.fn.now() : null,
    });
}

export async function approvePromotion(
  promotionId: string,
  approverId: string,
  comment?: string
): Promise<PromotionApproval> {
  const db = getDatabase();

  const promotion = await db("promotion_history").where({ id: promotionId }).first();
  if (!promotion) {
    throw new Error(`Promotion ${promotionId} not found`);
  }

  if (promotion.status !== "pending") {
    throw new Error(`Cannot approve promotion with status ${promotion.status}`);
  }

  const [approval] = await db("promotion_approvals")
    .insert({
      promotion_id: promotionId,
      approver_id: approverId,
      decision: "approved",
      comment: comment || null,
    })
    .returning("*");

  const approvals = await db("promotion_approvals")
    .where({ promotion_id: promotionId, decision: "approved" });

  const gate = await db("promotion_gates")
    .where({
      source_environment: promotion.source_environment,
      target_environment: promotion.target_environment,
    })
    .first();

  if (approvals.length >= gate.required_approvals) {
    await db("promotion_history").where({ id: promotionId }).update({ status: "approved" });
  }

  logger.info({ promotionId, approverId }, "Approved promotion");
  return approval;
}

export async function denyPromotion(
  promotionId: string,
  approverId: string,
  reason: string
): Promise<PromotionApproval> {
  const db = getDatabase();

  const promotion = await db("promotion_history").where({ id: promotionId }).first();
  if (!promotion) {
    throw new Error(`Promotion ${promotionId} not found`);
  }

  const [approval] = await db("promotion_approvals")
    .insert({
      promotion_id: promotionId,
      approver_id: approverId,
      decision: "denied",
      comment: reason,
    })
    .returning("*");

  await db("promotion_history")
    .where({ id: promotionId })
    .update({ status: "denied", reason_denied: reason });

  logger.info({ promotionId, approverId }, "Denied promotion");
  return approval;
}

export async function promoteDeployment(promotionId: string): Promise<PromotionHistory> {
  const db = getDatabase();

  const promotion = await db("promotion_history").where({ id: promotionId }).first();
  if (!promotion) {
    throw new Error(`Promotion ${promotionId} not found`);
  }

  if (promotion.status !== "approved") {
    throw new Error(`Cannot promote deployment with status ${promotion.status}`);
  }

  const [updated] = await db("promotion_history")
    .where({ id: promotionId })
    .update({ status: "promoted", promoted_at: db.fn.now() })
    .returning("*");

  logger.info({ promotionId }, "Promoted deployment");
  return updated;
}

export async function getPromotion(id: string): Promise<PromotionHistory | null> {
  const db = getDatabase();
  return db("promotion_history").where({ id }).first();
}

export async function listPromotions(
  sourceEnv?: string,
  targetEnv?: string,
  status?: string
): Promise<PromotionHistory[]> {
  const db = getDatabase();
  const query = db("promotion_history");

  if (sourceEnv) {
    query.where({ source_environment: sourceEnv });
  }
  if (targetEnv) {
    query.where({ target_environment: targetEnv });
  }
  if (status) {
    query.where({ status });
  }

  return query.orderBy("requested_at", "desc");
}

export async function getGates(sourceEnv: string, targetEnv: string): Promise<PromotionGate[]> {
  const db = getDatabase();
  return db("promotion_gates")
    .where({ source_environment: sourceEnv, target_environment: targetEnv, status: "active" });
}

export const promotionGatesService = {
  createGate,
  requestPromotion,
  executeGate,
  approvePromotion,
  denyPromotion,
  promoteDeployment,
  getPromotion,
  listPromotions,
  getGates,
};
