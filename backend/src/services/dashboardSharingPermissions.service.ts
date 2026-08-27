/**
 * Custom Dashboard Sharing Permissions Service
 * Issue #1142
 */

import * as crypto from "node:crypto";

export type DashboardVisibility = "private" | "workspace" | "public" | "link_shared";
export type ShareRole = "viewer" | "editor" | "admin";

export interface DashboardShareEntry {
  userId: string;
  role: ShareRole;
  grantedAt: string;
}

export interface DashboardSharingConfig {
  dashboardId: string;
  ownerId: string;
  visibility: DashboardVisibility;
  sharedUsers: DashboardShareEntry[];
  shareToken?: string;
  updatedAt: string;
}

export class DashboardSharingPermissionsService {
  private configs: Map<string, DashboardSharingConfig> = new Map();

  public async initDashboard(
    dashboardId: string,
    ownerId: string,
    visibility: DashboardVisibility = "private",
  ): Promise<DashboardSharingConfig> {
    const config: DashboardSharingConfig = {
      dashboardId,
      ownerId,
      visibility,
      sharedUsers: [{ userId: ownerId, role: "admin", grantedAt: new Date().toISOString() }],
      shareToken: crypto.randomBytes(16).toString("hex"),
      updatedAt: new Date().toISOString(),
    };

    this.configs.set(dashboardId, config);
    return config;
  }

  public async shareDashboard(
    dashboardId: string,
    grantorId: string,
    targetUserId: string,
    role: ShareRole,
  ): Promise<DashboardSharingConfig> {
    const config = this.configs.get(dashboardId);
    if (!config) {
      throw new Error(`Dashboard not found: ${dashboardId}`);
    }

    const isOwnerOrAdmin = config.sharedUsers.some(
      (u) => u.userId === grantorId && (u.role === "admin" || config.ownerId === grantorId),
    );
    if (!isOwnerOrAdmin) {
      throw new Error("Only dashboard owners and admins can modify sharing permissions");
    }

    const filtered = config.sharedUsers.filter((u) => u.userId !== targetUserId);
    filtered.push({
      userId: targetUserId,
      role,
      grantedAt: new Date().toISOString(),
    });

    config.sharedUsers = filtered;
    config.updatedAt = new Date().toISOString();
    this.configs.set(dashboardId, config);

    return config;
  }

  public async canUserAccess(
    dashboardId: string,
    userId: string,
    requiredRole: ShareRole = "viewer",
  ): Promise<boolean> {
    const config = this.configs.get(dashboardId);
    if (!config) return false;

    if (config.visibility === "public") return true;

    const userShare = config.sharedUsers.find((u) => u.userId === userId);
    if (!userShare) return false;

    if (requiredRole === "viewer") return true;
    if (requiredRole === "editor") return userShare.role === "editor" || userShare.role === "admin";
    if (requiredRole === "admin") return userShare.role === "admin";

    return false;
  }
}

export const dashboardSharingPermissionsService = new DashboardSharingPermissionsService();
