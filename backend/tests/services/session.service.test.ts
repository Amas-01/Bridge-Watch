import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionService } from "../../src/services/session.service.js";

let mockRows: Record<string, unknown>[] = [];
let mockCount = 0;

function buildQB(rows: Record<string, unknown>[]) {
  const qb: Record<string, unknown> = {
    then: vi.fn((resolve: (v: unknown) => void) => {
      resolve(rows);
      return Promise.resolve(rows);
    }),
    catch: vi.fn(),
    where: vi.fn((_col: unknown, _val?: unknown) => {
      if (typeof _col === "object" && _col !== null && !_val) {
        const obj = _col as Record<string, unknown>;
        const key = Object.keys(obj)[0];
        return buildQB(rows.filter((r) => r[key] === obj[key]));
      }
      if (typeof _col === "string" && _val !== undefined) {
        if (_col === "token_hash") return buildQB(rows);
        return buildQB(rows.filter((r) => r[_col as string] === _val));
      }
      return buildQB(rows);
    }),
    whereNot: vi.fn((_col: string, _val: unknown) =>
      buildQB(rows.filter((r) => r[_col] !== _val)),
    ),
    orderBy: vi.fn((_col: string, _dir?: string) => buildQB(rows)),
    limit: vi.fn((n: number) => buildQB(rows.slice(0, n))),
    offset: vi.fn((_n: number) => buildQB(rows)),
    first: vi.fn(() => Promise.resolve(rows[0] ?? null)),
    insert: vi.fn(() => Promise.resolve(undefined)),
    update: vi.fn(() => Promise.resolve(1)),
    delete: vi.fn(() => Promise.resolve(1)),
    returning: vi.fn(() => Promise.resolve(rows)),
    clone: vi.fn(() => buildQB(rows)),
    count: vi.fn(() => Promise.resolve([{ count: String(mockCount) }])),
    select: vi.fn(() => Promise.resolve(rows)),
  };
  return qb;
}

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(() => {
    const fn = (_table: string) => buildQB(mockRows);
    fn.raw = vi.fn((v: string) => v);
    fn.fn = { now: () => new Date() };
    return fn;
  }),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/utils/pagination.js", () => ({
  getPaginationParams: vi.fn((opts?: { page?: number; limit?: number }) => ({
    page: opts?.page ?? 1,
    limit: opts?.limit ?? 20,
    offset: ((opts?.page ?? 1) - 1) * (opts?.limit ?? 20),
  })),
  formatPaginatedResponse: vi.fn(
    (data: unknown[], total: number, page: number, limit: number) => ({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    }),
  ),
}));

describe("SessionService", () => {
  let service: SessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRows = [];
    mockCount = 0;
    service = new SessionService();
  });

  describe("createSession", () => {
    it("creates a session and returns session with token", async () => {
      const result = await service.createSession({
        userId: "user-1",
        ipAddress: "127.0.0.1",
      });

      expect(result.session).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.session.userId).toBe("user-1");
      expect(result.session.status).toBe("active");
      expect(result.token.length).toBe(64);
    });

    it("sets default TTL of 7 days", async () => {
      const result = await service.createSession({ userId: "user-1" });

      const expiresAt = new Date(result.session.expiresAt);
      const now = new Date();
      const diffDays =
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

      expect(diffDays).toBeGreaterThan(6.5);
      expect(diffDays).toBeLessThan(7.5);
    });

    it("respects custom TTL", async () => {
      const result = await service.createSession({
        userId: "user-1",
        ttlSeconds: 3600,
      });

      const expiresAt = new Date(result.session.expiresAt);
      const now = new Date();
      const diffHours =
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);

      expect(diffHours).toBeGreaterThan(0.5);
      expect(diffHours).toBeLessThan(1.5);
    });

    it("includes device info when provided", async () => {
      const result = await service.createSession({
        userId: "user-1",
        deviceId: "device-1",
        deviceName: "iPhone 15",
        deviceType: "mobile",
        userAgent: "Mozilla/5.0",
      });

      expect(result.session.deviceId).toBe("device-1");
      expect(result.session.deviceName).toBe("iPhone 15");
      expect(result.session.deviceType).toBe("mobile");
      expect(result.session.userAgent).toBe("Mozilla/5.0");
    });
  });

  describe("validateSession", () => {
    it("returns null for invalid token", async () => {
      const result = await service.validateSession("invalid-token");
      expect(result).toBeNull();
    });

    it("returns session for valid token when db row exists and is active", async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 86400000);
      mockRows = [
        {
          id: "session-abc",
          user_id: "user-1",
          token_hash: "any_hash",
          device_id: null,
          device_name: null,
          device_type: null,
          user_agent: null,
          ip_address: "127.0.0.1",
          status: "active",
          expires_at: future.toISOString(),
          last_active_at: now.toISOString(),
          revoked_at: null,
          revoked_reason: null,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        },
      ];

      const result = await service.validateSession("some-valid-token");

      expect(result).not.toBeNull();
      expect(result?.userId).toBe("user-1");
      expect(result?.status).toBe("active");
    });

    it("returns null for revoked session", async () => {
      mockRows = [
        {
          id: "session-abc",
          user_id: "user-1",
          status: "revoked",
          token_hash: "hash",
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          device_id: null,
          device_name: null,
          device_type: null,
          user_agent: null,
          ip_address: null,
          last_active_at: new Date().toISOString(),
          revoked_at: null,
          revoked_reason: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const result = await service.validateSession("revoked-token");

      expect(result).toBeNull();
    });
  });

  describe("getSessionById", () => {
    it("returns null for non-existent session", async () => {
      const result = await service.getSessionById("nonexistent");
      expect(result).toBeNull();
    });

    it("returns session when found", async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 86400000);
      mockRows = [
        {
          id: "session-found",
          user_id: "user-1",
          token_hash: "hash",
          device_id: null,
          device_name: null,
          device_type: null,
          user_agent: null,
          ip_address: "127.0.0.1",
          status: "active",
          expires_at: future.toISOString(),
          last_active_at: now.toISOString(),
          revoked_at: null,
          revoked_reason: null,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        },
      ];

      const result = await service.getSessionById("session-found");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("session-found");
    });
  });

  describe("listSessions", () => {
    it("returns paginated sessions", async () => {
      mockCount = 3;
      const now = new Date();
      mockRows = [
        {
          id: "s1",
          user_id: "user-1",
          status: "active",
          token_hash: "h1",
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          last_active_at: now.toISOString(),
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
          device_id: null,
          device_name: null,
          device_type: null,
          user_agent: null,
          ip_address: "1.1.1.1",
          revoked_at: null,
          revoked_reason: null,
        },
        {
          id: "s2",
          user_id: "user-1",
          status: "active",
          token_hash: "h2",
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          last_active_at: now.toISOString(),
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
          device_id: null,
          device_name: null,
          device_type: null,
          user_agent: null,
          ip_address: "1.1.1.2",
          revoked_at: null,
          revoked_reason: null,
        },
      ];

      const result = await service.listSessions({ userId: "user-1" });

      expect(result.data).toBeDefined();
      expect(typeof result.total).toBe("number");
      expect(typeof result.page).toBe("number");
    });
  });

  describe("revokeSession", () => {
    it("returns false for non-existent session", async () => {
      const result = await service.revokeSession("nonexistent", "user-1");
      expect(result).toBe(false);
    });
  });

  describe("revokeAllUserSessions", () => {
    it("returns 0 when no active sessions", async () => {
      const result = await service.revokeAllUserSessions("user-1", "admin");
      expect(result).toBe(0);
    });
  });

  describe("purgeExpiredSessions", () => {
    it("returns count of purged sessions", async () => {
      const result = await service.purgeExpiredSessions();
      expect(typeof result).toBe("number");
    });
  });

  describe("getAuditLog", () => {
    it("returns audit entries for a session", async () => {
      mockRows = [
        {
          id: 1,
          session_id: "session-abc123",
          user_id: "u1",
          action: "created",
          actor: "u1",
          ip_address: "1.1.1.1",
          metadata: null,
          created_at: new Date().toISOString(),
        },
      ];

      const result = await service.getAuditLog("session-abc123");

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].action).toBe("created");
    });
  });
});
