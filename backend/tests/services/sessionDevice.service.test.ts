import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDatabase } from "../../src/database/connection.js";
import { SessionDeviceService } from "../../src/services/sessionDevice.service.js";

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "dev-1",
    user_id: "user-100",
    device_fingerprint: "fp-abc-123",
    device_name: "Chrome macOS",
    device_type: "DESKTOP",
    ip_address: "192.168.1.1",
    location: "San Francisco, CA",
    user_agent: "Mozilla/5.0",
    is_active: true,
    is_trusted: false,
    last_active_at: new Date().toISOString(),
    revoked_at: null,
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
  chain.whereNot = vi.fn().mockReturnValue(chain);
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

describe("SessionDeviceService", () => {
  let service: SessionDeviceService;

  beforeEach(() => {
    service = new SessionDeviceService();
    makeChain([makeRow()], makeRow());
    vi.mocked(getDatabase).mockReturnValue(dbMock() as never);
  });

  it("registers a new session device", async () => {
    makeChain([], makeRow());
    const device = await service.registerOrUpdateDevice({
      userId: "user-100",
      deviceFingerprint: "fp-abc-123",
      deviceName: "Chrome macOS",
      ipAddress: "192.168.1.1",
    });

    expect(device.userId).toBe("user-100");
    expect(device.deviceFingerprint).toBe("fp-abc-123");
    expect(device.isActive).toBe(true);
  });

  it("throws error when userId or deviceFingerprint is missing", async () => {
    await expect(
      service.registerOrUpdateDevice({
        userId: "",
        deviceFingerprint: "fp-abc-123",
        deviceName: "Chrome macOS",
        ipAddress: "192.168.1.1",
      })
    ).rejects.toThrow("userId and deviceFingerprint are required");
  });

  it("lists user devices", async () => {
    const devices = await service.getUserDevices("user-100");
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceName).toBe("Chrome macOS");
  });

  it("revokes a single device session", async () => {
    makeChain([makeRow()], makeRow({ is_active: false, revoked_at: new Date().toISOString() }));
    const revoked = await service.revokeDevice("user-100", "dev-1");
    expect(revoked?.isActive).toBe(false);
  });

  it("sets device trust status", async () => {
    makeChain([makeRow()], makeRow({ is_trusted: true }));
    const trusted = await service.setTrustStatus("user-100", "dev-1", true);
    expect(trusted?.isTrusted).toBe(true);
  });
});
