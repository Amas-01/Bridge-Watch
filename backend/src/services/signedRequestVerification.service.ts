import crypto from "crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface RequestSigningKeyRecord {
  id: string;
  key_id: string;
  secret: string;
  algorithm: string;
  owner: string;
  max_clock_skew_seconds: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SignedRequestLogRecord {
  id: string;
  key_id: string;
  request_path: string;
  request_method: string;
  signature: string;
  status: "valid" | "invalid_signature" | "timestamp_expired" | "key_not_found" | "replayed";
  client_ip?: string;
  error_message?: string;
  timestamp: string;
}

export class SignedRequestVerificationService {
  private db() {
    return getDatabase();
  }

  async createKey(data: {
    keyId?: string;
    secret?: string;
    algorithm?: string;
    owner: string;
    maxClockSkewSeconds?: number;
  }) {
    if (!data.owner?.trim()) {
      throw new Error("owner is required");
    }

    const keyId = data.keyId?.trim() || `key_live_${crypto.randomBytes(8).toString("hex")}`;
    const secret = data.secret?.trim() || crypto.randomBytes(32).toString("hex");

    const [row] = await this.db()("request_signing_keys")
      .insert({
        key_id: keyId,
        secret,
        algorithm: data.algorithm ?? "hmac-sha256",
        owner: data.owner.trim(),
        max_clock_skew_seconds: data.maxClockSkewSeconds ?? 300,
        is_active: true,
      })
      .returning("*");

    return this.formatKey(row);
  }

  async listKeys(activeOnly = false) {
    let query = this.db()("request_signing_keys");
    if (activeOnly) {
      query = query.where("is_active", true);
    }
    const rows = await query.orderBy("created_at", "desc");
    return rows.map(this.formatKey);
  }

  async getKeyById(keyId: string) {
    const row = await this.db()("request_signing_keys").where({ key_id: keyId }).first();
    return row ? this.formatKey(row) : null;
  }

  async rotateKeySecret(id: string) {
    const newSecret = crypto.randomBytes(32).toString("hex");
    const [row] = await this.db()("request_signing_keys")
      .where({ id })
      .update({
        secret: newSecret,
        updated_at: this.db().fn.now(),
      })
      .returning("*");

    if (!row) return null;
    logger.info({ id, keyId: row.key_id }, "Rotated signing key secret");
    return this.formatKey(row);
  }

  async revokeKey(id: string) {
    const [row] = await this.db()("request_signing_keys")
      .where({ id })
      .update({
        is_active: false,
        updated_at: this.db().fn.now(),
      })
      .returning("*");

    if (!row) return null;
    return this.formatKey(row);
  }

  async verifySignature(options: {
    keyId: string;
    method: string;
    path: string;
    timestamp: string | number;
    signature: string;
    body?: any;
    clientIp?: string;
  }): Promise<{ valid: boolean; status: SignedRequestLogRecord["status"]; message?: string }> {
    const { keyId, method, path, timestamp, signature, body, clientIp } = options;

    const keyRow = await this.db()("request_signing_keys")
      .where({ key_id: keyId, is_active: true })
      .first();

    if (!keyRow) {
      await this.logVerification({
        keyId,
        path,
        method,
        signature,
        status: "key_not_found",
        clientIp,
        errorMessage: "Active signing key not found",
      });
      return { valid: false, status: "key_not_found", message: "Active signing key not found" };
    }

    // Check timestamp clock skew
    const reqTime = typeof timestamp === "number" ? timestamp : Number(timestamp) || Date.parse(String(timestamp));
    const now = Date.now();
    const maxSkewMs = (keyRow.max_clock_skew_seconds || 300) * 1000;

    if (isNaN(reqTime) || Math.abs(now - reqTime) > maxSkewMs) {
      await this.logVerification({
        keyId,
        path,
        method,
        signature,
        status: "timestamp_expired",
        clientIp,
        errorMessage: `Request timestamp clock skew exceeds limit of ${keyRow.max_clock_skew_seconds}s`,
      });
      return {
        valid: false,
        status: "timestamp_expired",
        message: `Timestamp skew exceeds ${keyRow.max_clock_skew_seconds} seconds limit`,
      };
    }

    // Compute payload digest / string to sign
    const payloadStr = typeof body === "string" ? body : body ? JSON.stringify(body) : "";
    const stringToSign = `${method.toUpperCase()}:${path}:${timestamp}:${payloadStr}`;

    const expectedSignature = crypto
      .createHmac("sha256", keyRow.secret)
      .update(stringToSign)
      .digest("hex");

    const validSig =
      signature.length === expectedSignature.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

    if (!validSig) {
      await this.logVerification({
        keyId,
        path,
        method,
        signature,
        status: "invalid_signature",
        clientIp,
        errorMessage: "Signature mismatch",
      });
      return { valid: false, status: "invalid_signature", message: "Signature mismatch" };
    }

    // Success
    await this.logVerification({
      keyId,
      path,
      method,
      signature,
      status: "valid",
      clientIp,
    });

    return { valid: true, status: "valid" };
  }

  async listLogs(filters?: { keyId?: string; status?: string; limit?: number }) {
    let query = this.db()("signed_request_logs");

    if (filters?.keyId) {
      query = query.where("key_id", filters.keyId);
    }
    if (filters?.status) {
      query = query.where("status", filters.status);
    }

    const rows = await query.orderBy("timestamp", "desc").limit(filters?.limit ?? 100);
    return rows.map(this.formatLog);
  }

  private async logVerification(data: {
    keyId: string;
    path: string;
    method: string;
    signature: string;
    status: SignedRequestLogRecord["status"];
    clientIp?: string;
    errorMessage?: string;
  }) {
    try {
      await this.db()("signed_request_logs").insert({
        key_id: data.keyId,
        request_path: data.path,
        request_method: data.method,
        signature: data.signature,
        status: data.status,
        client_ip: data.clientIp ?? null,
        error_message: data.errorMessage ?? null,
      });
    } catch (e) {
      logger.warn({ error: e }, "Failed to insert signed request verification log");
    }
  }

  private formatKey(row: any) {
    return {
      id: row.id,
      keyId: row.key_id,
      secret: row.secret,
      algorithm: row.algorithm,
      owner: row.owner,
      maxClockSkewSeconds: row.max_clock_skew_seconds,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatLog(row: any) {
    return {
      id: row.id,
      keyId: row.key_id,
      requestPath: row.request_path,
      requestMethod: row.request_method,
      signature: row.signature,
      status: row.status,
      clientIp: row.client_ip,
      errorMessage: row.error_message,
      timestamp: row.timestamp,
    };
  }
}

export const signedRequestVerificationService = new SignedRequestVerificationService();
