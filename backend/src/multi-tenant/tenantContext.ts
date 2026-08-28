import { AsyncLocalStorage } from "async_hooks";

export interface TenantContext {
  tenantId: string;
  actorId: string;
  actorType: "user" | "admin" | "system";
  bypass: boolean;
}

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

export function requireTenantContext(): TenantContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error("No tenant context in current execution scope");
  }
  return ctx;
}

const SYSTEM_TENANT: TenantContext = {
  tenantId: "system",
  actorId: "system",
  actorType: "system",
  bypass: true,
};

export function runAsSystem<T>(fn: () => T): T {
  return storage.run(SYSTEM_TENANT, fn);
}
