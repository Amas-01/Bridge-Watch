import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDatabase } from "../../src/database/connection.js";
import { PermissionChangeNotificationService } from "../../src/services/permissionChangeNotification.service.js";

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pcn-1",
    target_user_id: "user-100",
    actor_id: "admin-1",
    action: "ROLE_ASSIGNED",
    permission_or_role: "OPERATOR",
    channels: JSON.stringify(["IN_APP"]),
    status: "SENT",
    details: JSON.stringify({ role: "OPERATOR" }),
    read_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
  chain.whereNull = vi.fn().mockReturnValue(chain);
  chain.first = vi.fn().mockResolvedValue(rows[0]);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(updated ? [updated] : rows.length ? [makeRow()] : []);
  chain.groupBy = vi.fn().mockReturnValue(chain);
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

describe("PermissionChangeNotificationService", () => {
  let service: PermissionChangeNotificationService;

  beforeEach(() => {
    service = new PermissionChangeNotificationService();
    makeChain([makeRow()], makeRow());
    vi.mocked(getDatabase).mockReturnValue(dbMock() as never);
  });

  it("creates and dispatches permission change notification", async () => {
    makeChain([], makeRow());
    const notification = await service.notify({
      targetUserId: "user-100",
      actorId: "admin-1",
      action: "ROLE_ASSIGNED",
      permissionOrRole: "OPERATOR",
    });

    expect(notification.status).toBe("SENT");
    expect(notification.action).toBe("ROLE_ASSIGNED");
    expect(notification.targetUserId).toBe("user-100");
  });

  it("throws error when targetUserId or actorId is missing", async () => {
    await expect(
      service.notify({
        targetUserId: "",
        actorId: "admin-1",
        action: "ROLE_ASSIGNED",
        permissionOrRole: "OPERATOR",
      })
    ).rejects.toThrow("targetUserId and actorId are required");
  });

  it("lists notifications for a target user", async () => {
    const list = await service.listUserNotifications("user-100");
    expect(list).toHaveLength(1);
    expect(list[0].permissionOrRole).toBe("OPERATOR");
  });

  it("marks notification as read", async () => {
    makeChain([makeRow()], makeRow({ read_at: new Date().toISOString() }));
    const updated = await service.markAsRead("pcn-1", "user-100");
    expect(updated?.readAt).not.toBeNull();
  });

  it("computes stats for permission notifications", async () => {
    makeChain([
      { status: "SENT", cnt: 10 },
      { status: "FAILED", cnt: 1 },
    ]);
    const stats = await service.getStats();
    expect(stats.byStatus.SENT).toBe(10);
    expect(stats.byStatus.FAILED).toBe(1);
    expect(stats.total).toBe(11);
  });
});
