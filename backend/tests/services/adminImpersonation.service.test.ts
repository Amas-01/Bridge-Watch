import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDatabase } from "../../src/database/connection.js";
import { AdminImpersonationService } from "../../src/services/adminImpersonation.service.js";

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "imp-session-1",
    admin_id: "admin-100",
    impersonated_user_id: "user-200",
    reason: "Support ticket #INC-889 investigation",
    approval_ticket_id: "INC-889",
    status: "ACTIVE",
    token_hash: "mockedhash",
    max_duration_minutes: 30,
    expires_at: new Date(Date.now() + 1800000).toISOString(),
    ended_at: null,
    ip_address: "10.0.0.1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeAuditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "audit-1",
    impersonation_session_id: "imp-session-1",
    admin_id: "admin-100",
    impersonated_user_id: "user-200",
    action_performed: "VIEW_TRANSACTIONS",
    request_path: "/api/v1/user/transactions",
    request_method: "GET",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

let currentChain: Record<string, unknown> = {};

function makeChain(rows: unknown[] = [], updated?: unknown) {
  const chain: Record<string, unknown> = {};
  chain.modify = vi.fn().mockImplementation((mod: (qb: unknown) => void) => {
    mod(chain);
    return chain;
  });
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.first = vi.fn().mockResolvedValue(rows[0]);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(updated ? [updated] : rows.length ? [makeSessionRow()] : []);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.raw = (v: string) => ({ sql: v });
  chain.then = vi.fn().mockImplementation((resolve) => {
    resolve(rows);
    return Promise.resolve();
  });
  currentChain = chain;
  return chain;
}

function dbMock() {
  const dbFn = vi.fn().mockImplementation(() => currentChain);
  (dbFn as unknown as Record<string, unknown>).raw = (v: string) => ({ sql: v });
  return dbFn as never;
}

describe("AdminImpersonationService", () => {
  let service: AdminImpersonationService;

  beforeEach(() => {
    service = new AdminImpersonationService();
    makeChain([makeSessionRow()], makeSessionRow());
    vi.mocked(getDatabase).mockReturnValue(dbMock() as never);
  });

  it("starts an impersonation session with ticket justification", async () => {
    makeChain([], makeSessionRow());
    const result = await service.startSession({
      adminId: "admin-100",
      impersonatedUserId: "user-200",
      reason: "Support ticket #INC-889 investigation",
      approvalTicketId: "INC-889",
      ipAddress: "10.0.0.1",
    });

    expect(result.session.adminId).toBe("admin-100");
    expect(result.session.impersonatedUserId).toBe("user-200");
    expect(result.session.status).toBe("ACTIVE");
    expect(result.token).toBeDefined();
  });

  it("throws error when reason/justification is missing", async () => {
    await expect(
      service.startSession({
        adminId: "admin-100",
        impersonatedUserId: "user-200",
        reason: "",
        ipAddress: "10.0.0.1",
      })
    ).rejects.toThrow("Reason / ticket justification is mandatory");
  });

  it("throws error when admin tries to impersonate self", async () => {
    await expect(
      service.startSession({
        adminId: "admin-100",
        impersonatedUserId: "admin-100",
        reason: "testing self",
        ipAddress: "10.0.0.1",
      })
    ).rejects.toThrow("Admin cannot impersonate themselves");
  });

  it("logs an impersonation action to audit trail", async () => {
    makeChain([], makeAuditRow());
    const log = await service.logAction({
      impersonationSessionId: "imp-session-1",
      adminId: "admin-100",
      impersonatedUserId: "user-200",
      actionPerformed: "VIEW_TRANSACTIONS",
      requestPath: "/api/v1/user/transactions",
      requestMethod: "GET",
    });

    expect(log.actionPerformed).toBe("VIEW_TRANSACTIONS");
    expect(log.adminId).toBe("admin-100");
  });

  it("ends an impersonation session", async () => {
    makeChain([makeSessionRow()], makeSessionRow({ status: "ENDED", ended_at: new Date().toISOString() }));
    const ended = await service.endSession("imp-session-1", "admin-100");
    expect(ended?.status).toBe("ENDED");
  });

  it("lists active impersonation sessions", async () => {
    const sessions = await service.listSessions({ status: "ACTIVE" });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe("ACTIVE");
  });
});
