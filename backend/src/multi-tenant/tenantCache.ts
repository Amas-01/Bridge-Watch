import { getTenantContext } from "./tenantContext.js";

export function tenantCacheKey(namespace: string, id: string): string {
  const ctx = getTenantContext();
  const tenantPrefix = ctx && !ctx.bypass ? ctx.tenantId : "global";
  return `cache:${tenantPrefix}:${namespace}:${id}`;
}

export function tenantPatternForInvalidation(namespace: string): string {
  const ctx = getTenantContext();
  const tenantPrefix = ctx && !ctx.bypass ? ctx.tenantId : "*";
  return `cache:${tenantPrefix}:${namespace}:*`;
}
