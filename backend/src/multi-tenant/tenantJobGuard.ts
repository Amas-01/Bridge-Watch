import { runWithTenant, type TenantContext } from "./tenantContext.js";
import { logger } from "../utils/logger.js";

export interface TenantJobPayload {
  tenantId?: string;
  actorId?: string;
  bypass?: boolean;
  [key: string]: unknown;
}

export function withTenantJobContext<T>(
  payload: TenantJobPayload,
  fn: () => Promise<T>
): Promise<T> {
  const ctx: TenantContext = {
    tenantId: payload.tenantId ?? "system",
    actorId: payload.actorId ?? "system",
    actorType: payload.bypass ? "system" : "system",
    bypass: payload.bypass ?? false,
  };

  return runWithTenant(ctx, fn);
}

export function validateJobHasTenantContext(payload: TenantJobPayload): void {
  if (!payload.tenantId && !payload.bypass) {
    logger.warn(
      { jobPayload: Object.keys(payload) },
      "Job dispatched without tenant context"
    );
  }
}
