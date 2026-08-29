import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface WebhookIpAllowlistRecord {
  id: string;
  webhook_endpoint_id?: string;
  ip_or_cidr: string;
  description?: string;
  direction: "inbound" | "outbound" | "both";
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export class WebhookIpAllowlistService {
  private db() {
    return getDatabase();
  }

  /**
   * Helper to check if an IPv4 address matches an IP or CIDR specification.
   */
  private matchIp(ip: string, cidrOrIp: string): boolean {
    const target = ip.trim();
    const pattern = cidrOrIp.trim();

    if (pattern === target || pattern === "*" || pattern === "0.0.0.0/0") {
      return true;
    }

    if (!pattern.includes("/")) {
      return pattern === target;
    }

    const [rangeIp, prefixStr] = pattern.split("/");
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

    const ipToNum = (ipStr: string) => {
      const parts = ipStr.split(".").map(Number);
      if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
        return null;
      }
      return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
    };

    const targetNum = ipToNum(target);
    const rangeNum = ipToNum(rangeIp);

    if (targetNum === null || rangeNum === null) return false;

    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    return (targetNum & mask) === (rangeNum & mask);
  }

  async listAllowlist(filters?: { webhookEndpointId?: string; direction?: string; isActive?: boolean }) {
    let query = this.db()("webhook_ip_allowlists");

    if (filters?.webhookEndpointId !== undefined) {
      if (filters.webhookEndpointId === null || filters.webhookEndpointId === "") {
        query = query.whereNull("webhook_endpoint_id");
      } else {
        query = query.where("webhook_endpoint_id", filters.webhookEndpointId);
      }
    }
    if (filters?.direction) {
      query = query.where((b) => {
        b.where("direction", filters.direction).orWhere("direction", "both");
      });
    }
    if (filters?.isActive !== undefined) {
      query = query.where("is_active", filters.isActive);
    }

    const rows = await query.orderBy("created_at", "desc");
    return rows.map(this.formatRecord);
  }

  async getAllowlistEntry(id: string) {
    const row = await this.db()("webhook_ip_allowlists").where({ id }).first();
    return row ? this.formatRecord(row) : null;
  }

  async addAllowlistEntry(data: {
    webhookEndpointId?: string;
    ipOrCidr: string;
    description?: string;
    direction?: "inbound" | "outbound" | "both";
    createdBy?: string;
  }) {
    if (!data.ipOrCidr?.trim()) {
      throw new Error("ipOrCidr is required");
    }

    const [row] = await this.db()("webhook_ip_allowlists")
      .insert({
        webhook_endpoint_id: data.webhookEndpointId ?? null,
        ip_or_cidr: data.ipOrCidr.trim(),
        description: data.description ?? null,
        direction: data.direction ?? "inbound",
        is_active: true,
        created_by: data.createdBy ?? "system",
      })
      .returning("*");

    return this.formatRecord(row);
  }

  async removeAllowlistEntry(id: string) {
    const deleted = await this.db()("webhook_ip_allowlists").where({ id }).del();
    return deleted > 0;
  }

  async toggleEntryStatus(id: string, isActive: boolean) {
    const [row] = await this.db()("webhook_ip_allowlists")
      .where({ id })
      .update({ is_active: isActive, updated_at: this.db().fn.now() })
      .returning("*");

    if (!row) return null;
    return this.formatRecord(row);
  }

  async testIpAgainstAllowlist(ip: string, webhookEndpointId?: string, direction?: string) {
    if (!ip?.trim()) {
      throw new Error("ip is required");
    }

    let query = this.db()("webhook_ip_allowlists").where("is_active", true);

    if (webhookEndpointId) {
      query = query.where((b) => {
        b.where("webhook_endpoint_id", webhookEndpointId).orWhereNull("webhook_endpoint_id");
      });
    }
    if (direction) {
      query = query.where((b) => {
        b.where("direction", direction).orWhere("direction", "both");
      });
    }

    const entries = await query;
    if (entries.length === 0) {
      // If no explicit rules exist for scope, default behavior is allowed
      return { allowed: true, matchingRule: null, reason: "No allowlist rules defined for scope" };
    }

    for (const entry of entries) {
      if (this.matchIp(ip, entry.ip_or_cidr)) {
        return {
          allowed: true,
          matchingRule: this.formatRecord(entry),
          reason: `Matched allowlist entry ${entry.ip_or_cidr}`,
        };
      }
    }

    return {
      allowed: false,
      matchingRule: null,
      reason: `IP ${ip} does not match any active allowlist rules`,
    };
  }

  private formatRecord(row: any) {
    return {
      id: row.id,
      webhookEndpointId: row.webhook_endpoint_id,
      ipOrCidr: row.ip_or_cidr,
      description: row.description,
      direction: row.direction,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const webhookIpAllowlistService = new WebhookIpAllowlistService();
