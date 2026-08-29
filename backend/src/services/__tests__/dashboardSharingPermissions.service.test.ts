import { describe, it, expect, beforeEach } from "vitest";
import { DashboardSharingPermissionsService } from "../dashboardSharingPermissions.service.js";

describe("DashboardSharingPermissionsService (#1142)", () => {
  let service: DashboardSharingPermissionsService;

  beforeEach(() => {
    service = new DashboardSharingPermissionsService();
  });

  it("should initialize dashboard with owner permissions", async () => {
    const dash = await service.initDashboard("dash_1", "user_alice", "private");
    expect(dash.ownerId).toBe("user_alice");
    expect(dash.visibility).toBe("private");
    expect(await service.canUserAccess("dash_1", "user_alice", "admin")).toBe(true);
    expect(await service.canUserAccess("dash_1", "user_bob", "viewer")).toBe(false);
  });

  it("should share dashboard with another user", async () => {
    await service.initDashboard("dash_2", "user_alice", "private");
    await service.shareDashboard("dash_2", "user_alice", "user_bob", "editor");

    expect(await service.canUserAccess("dash_2", "user_bob", "viewer")).toBe(true);
    expect(await service.canUserAccess("dash_2", "user_bob", "editor")).toBe(true);
    expect(await service.canUserAccess("dash_2", "user_bob", "admin")).toBe(false);
  });

  it("should reject sharing attempts from non-admin users", async () => {
    await service.initDashboard("dash_3", "user_alice", "private");
    await service.shareDashboard("dash_3", "user_alice", "user_bob", "viewer");

    await expect(
      service.shareDashboard("dash_3", "user_bob", "user_charlie", "viewer"),
    ).rejects.toThrow(/Only dashboard owners and admins/);
  });
});
