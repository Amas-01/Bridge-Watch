import { getTenantContext, requireTenantContext } from "./tenantContext.js";

const TENANT_TABLES = new Set([
  "alert_rules",
  "alert_events",
  "export_history",
  "webhook_endpoints",
  "user_preferences",
  "api_keys",
  "saved_dashboards",
  "query_presets",
  "alert_suppression_rules",
  "event_subscription_filters",
  "asset_tags",
  "notification_channels",
  "notification_digests",
  "saved_metrics",
  "audit_logs",
]);

export function isTenantScopedTable(table: string): boolean {
  return TENANT_TABLES.has(table);
}

export function assertTenantMatch(
  resourceOwnerId: string,
  description: string
): void {
  const ctx = getTenantContext();
  if (!ctx || ctx.bypass) return;
  if (resourceOwnerId !== ctx.tenantId) {
    throw new TenantViolationError(
      `Cross-tenant access denied: ${description}`
    );
  }
}

export function tenantFilter(
  query: Record<string, unknown>,
  table: string
): Record<string, unknown> {
  if (!isTenantScopedTable(table)) return query;
  const ctx = getTenantContext();
  if (!ctx || ctx.bypass) return query;
  query.tenant_id = ctx.tenantId;
  return query;
}

export function requireTenantJobContext(): string {
  const ctx = requireTenantContext();
  return ctx.tenantId;
}

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantViolationError";
  }
}
