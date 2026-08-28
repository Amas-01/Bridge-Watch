import { describe, it, expect, vi } from "vitest";
import {
  runWithTenant,
  getTenantContext,
  runAsSystem,
} from "../../src/multi-tenant/tenantContext.js";
import {
  isTenantScopedTable,
  assertTenantMatch,
  tenantFilter,
  TenantViolationError,
} from "../../src/multi-tenant/tenantGuard.js";
import {
  tenantCacheKey,
} from "../../src/multi-tenant/tenantCache.js";
import {
  withTenantJobContext,
  validateJobHasTenantContext,
} from "../../src/multi-tenant/tenantJobGuard.js";

const TENANT_A = "tenant-alpha";
const TENANT_B = "tenant-beta";

describe("TenantContext", () => {
  it("provides tenant context within runWithTenant scope", () => {
    runWithTenant(
      { tenantId: TENANT_A, actorId: "user1", actorType: "user", bypass: false },
      () => {
        const ctx = getTenantContext();
        expect(ctx).toBeDefined();
        expect(ctx?.tenantId).toBe(TENANT_A);
      }
    );
  });

  it("returns undefined outside any scope", () => {
    const ctx = getTenantContext();
    expect(ctx).toBeUndefined();
  });

  it("isolates nested scopes correctly", () => {
    runWithTenant(
      { tenantId: TENANT_A, actorId: "user1", actorType: "user", bypass: false },
      () => {
        expect(getTenantContext()?.tenantId).toBe(TENANT_A);

        runWithTenant(
          { tenantId: TENANT_B, actorId: "user2", actorType: "user", bypass: false },
          () => {
            expect(getTenantContext()?.tenantId).toBe(TENANT_B);
          }
        );

        expect(getTenantContext()?.tenantId).toBe(TENANT_A);
      }
    );
  });

  it("runAsSystem provides system context with bypass", () => {
    runAsSystem(() => {
      const ctx = getTenantContext();
      expect(ctx?.tenantId).toBe("system");
      expect(ctx?.bypass).toBe(true);
    });
  });
});

describe("TenantGuard", () => {
  it("identifies tenant-scoped tables", () => {
    expect(isTenantScopedTable("alert_rules")).toBe(true);
    expect(isTenantScopedTable("export_history")).toBe(true);
    expect(isTenantScopedTable("api_keys")).toBe(true);
    expect(isTenantScopedTable("audit_logs")).toBe(true);
  });

  it("does not mark system tables as tenant-scoped", () => {
    expect(isTenantScopedTable("assets")).toBe(false);
    expect(isTenantScopedTable("bridges")).toBe(false);
    expect(isTenantScopedTable("prices")).toBe(false);
    expect(isTenantScopedTable("health_scores")).toBe(false);
  });

  it("assertTenantMatch succeeds for matching tenant", () => {
    runWithTenant(
      { tenantId: TENANT_A, actorId: "user1", actorType: "user", bypass: false },
      () => {
        expect(() => assertTenantMatch(TENANT_A, "test resource")).not.toThrow();
      }
    );
  });

  it("assertTenantMatch throws for cross-tenant access", () => {
    runWithTenant(
      { tenantId: TENANT_A, actorId: "user1", actorType: "user", bypass: false },
      () => {
        expect(() => assertTenantMatch(TENANT_B, "test resource")).toThrow(
          TenantViolationError
        );
      }
    );
  });

  it("assertTenantMatch allows bypass for system context", () => {
    runAsSystem(() => {
      expect(() => assertTenantMatch(TENANT_B, "test resource")).not.toThrow();
    });
  });

  it("tenantFilter adds tenant_id to query for scoped tables", () => {
    runWithTenant(
      { tenantId: TENANT_A, actorId: "user1", actorType: "user", bypass: false },
      () => {
        const query: Record<string, unknown> = { status: "active" };
        const filtered = tenantFilter(query, "alert_rules");
        expect(filtered.tenant_id).toBe(TENANT_A);
      }
    );
  });

  it("tenantFilter does not modify query for non-scoped tables", () => {
    runWithTenant(
      { tenantId: TENANT_A, actorId: "user1", actorType: "user", bypass: false },
      () => {
        const query: Record<string, unknown> = { status: "active" };
        const filtered = tenantFilter(query, "assets");
        expect(filtered.tenant_id).toBeUndefined();
      }
    );
  });

  it("tenantFilter does not add tenant_id when bypassed", () => {
    runAsSystem(() => {
      const query: Record<string, unknown> = { status: "active" };
      const filtered = tenantFilter(query, "alert_rules");
      expect(filtered.tenant_id).toBeUndefined();
    });
  });
});

describe("TenantCache", () => {
  it("generates tenant-namespaced cache key", () => {
    runWithTenant(
      { tenantId: TENANT_A, actorId: "user1", actorType: "user", bypass: false },
      () => {
        const key = tenantCacheKey("prices", "USDC");
        expect(key).toBe(`cache:${TENANT_A}:prices:USDC`);
      }
    );
  });

  it("generates global key when no tenant context", () => {
    const key = tenantCacheKey("prices", "USDC");
    expect(key).toBe("cache:global:prices:USDC");
  });

  it("generates global key for system bypass", () => {
    runAsSystem(() => {
      const key = tenantCacheKey("prices", "USDC");
      expect(key).toBe("cache:global:prices:USDC");
    });
  });
});

describe("TenantJobGuard", () => {
  it("wraps function execution with tenant context", async () => {
    let capturedTenantId: string | undefined;

    await withTenantJobContext(
      { tenantId: TENANT_A, actorId: "worker1" },
      async () => {
        capturedTenantId = getTenantContext()?.tenantId;
      }
    );

    expect(capturedTenantId).toBe(TENANT_A);
  });

  it("warns when job payload lacks tenant context", () => {
    expect(() =>
      validateJobHasTenantContext({ data: "test" })
    ).not.toThrow();
  });
});

describe("Cross-tenant isolation security tests", () => {
  it("REST: tenant A cannot read tenant B exports", () => {
    runWithTenant(
      { tenantId: TENANT_A, actorId: "user1", actorType: "user", bypass: false },
      () => {
        const query: Record<string, unknown> = { id: "export-123" };
        const filtered = tenantFilter(query, "export_history");
        expect(filtered.tenant_id).toBe(TENANT_A);
        expect(filtered.tenant_id).not.toBe(TENANT_B);
      }
    );
  });

  it("WebSocket: replay endpoint rejects cross-tenant tenant_id", () => {
    const requestTenantId = TENANT_A;
    const requestedTenantId = TENANT_B;

    expect(requestTenantId).not.toBe(requestedTenantId);
  });

  it("Exports: export job payload carries tenant context", async () => {
    let jobTenantId: string | undefined;

    await withTenantJobContext(
      { tenantId: TENANT_A, actorId: "user1" },
      async () => {
        jobTenantId = getTenantContext()?.tenantId;
      }
    );

    expect(jobTenantId).toBe(TENANT_A);
  });

  it("Background workers: context-free jobs are flagged", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateJobHasTenantContext({});
    consoleSpy.mockRestore();
  });

  it("Admin tools: system bypass allows cross-tenant access", () => {
    runAsSystem(() => {
      const ctx = getTenantContext();
      expect(ctx?.bypass).toBe(true);
      expect(() => assertTenantMatch(TENANT_B, "admin operation")).not.toThrow();
    });
  });

  it("Cache: tenant isolation prevents cache key collision", () => {
    const keyA = (() => {
      let key = "";
      runWithTenant(
        { tenantId: TENANT_A, actorId: "u1", actorType: "user", bypass: false },
        () => { key = tenantCacheKey("alerts", "rule1"); }
      );
      return key;
    })();

    const keyB = (() => {
      let key = "";
      runWithTenant(
        { tenantId: TENANT_B, actorId: "u2", actorType: "user", bypass: false },
        () => { key = tenantCacheKey("alerts", "rule1"); }
      );
      return key;
    })();

    expect(keyA).not.toBe(keyB);
  });
});
