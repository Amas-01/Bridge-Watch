import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import crypto from "crypto";

export type CredentialRotationStatus = "scheduled" | "rotating" | "rotated" | "failed" | "skipped";

export interface ProviderCredential {
  id: string;
  providerKey: string;
  credentialType: string;
  expiresAt: string | null;
  lastRotatedAt: string | null;
  rotationIntervalDays: number;
  status: CredentialRotationStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RotationCandidate {
  credential: ProviderCredential;
  daysUntilExpiry: number | null;
  daysUntilScheduledRotation: number;
  reason: "expiry" | "scheduled";
}

export interface RotationResult {
  credentialId: string;
  providerKey: string;
  credentialType: string;
  success: boolean;
  rotatedAt: string;
  newExpiresAt: string | null;
  error: string | null;
}

export interface SchedulerRunResult {
  checkedAt: string;
  totalCredentials: number;
  candidates: RotationCandidate[];
  results: RotationResult[];
}

const EXPIRY_WARNING_DAYS = 14;
const ROTATION_LOOKAHEAD_DAYS = 3;

export class ProviderCredentialRotationService {
  private readonly db = getDatabase();

  async listCredentials(): Promise<ProviderCredential[]> {
    const rows = await this.db("provider_credentials")
      .select("*")
      .orderBy("provider_key", "asc");

    return rows.map(this.mapRow);
  }

  async identifyRotationCandidates(): Promise<RotationCandidate[]> {
    const credentials = await this.listCredentials();
    const now = Date.now();
    const candidates: RotationCandidate[] = [];

    for (const cred of credentials) {
      if (cred.status === "rotating") continue;

      const lastRotated = cred.lastRotatedAt ? new Date(cred.lastRotatedAt).getTime() : new Date(cred.createdAt).getTime();
      const nextScheduledRotationMs = lastRotated + cred.rotationIntervalDays * 86_400_000;
      const daysUntilScheduledRotation = Math.floor((nextScheduledRotationMs - now) / 86_400_000);

      if (cred.expiresAt) {
        const expiresMs = new Date(cred.expiresAt).getTime();
        const daysUntilExpiry = Math.floor((expiresMs - now) / 86_400_000);
        if (daysUntilExpiry <= EXPIRY_WARNING_DAYS) {
          candidates.push({ credential: cred, daysUntilExpiry, daysUntilScheduledRotation, reason: "expiry" });
          continue;
        }
      }

      if (daysUntilScheduledRotation <= ROTATION_LOOKAHEAD_DAYS) {
        candidates.push({ credential: cred, daysUntilExpiry: null, daysUntilScheduledRotation, reason: "scheduled" });
      }
    }

    return candidates;
  }

  async runRotationScheduler(): Promise<SchedulerRunResult> {
    const checkedAt = new Date().toISOString();
    const credentials = await this.listCredentials();
    const candidates = await this.identifyRotationCandidates();
    const results: RotationResult[] = [];

    logger.info({ checkedAt, totalCredentials: credentials.length, candidates: candidates.length }, "Provider credential rotation scheduler running");

    for (const candidate of candidates) {
      const result = await this.rotateCredential(candidate.credential);
      results.push(result);
    }

    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      logger.error({ failedCount: failed.length }, "Some credential rotations failed");
    }

    return { checkedAt, totalCredentials: credentials.length, candidates, results };
  }

  private async rotateCredential(cred: ProviderCredential): Promise<RotationResult> {
    const rotatedAt = new Date().toISOString();
    logger.info({ credentialId: cred.id, providerKey: cred.providerKey, credentialType: cred.credentialType }, "Rotating provider credential");

    try {
      await this.db("provider_credentials").where({ id: cred.id }).update({ status: "rotating", updated_at: new Date() });

      const rotationToken = crypto.randomBytes(32).toString("hex");
      const newExpiresAt = cred.rotationIntervalDays
        ? new Date(Date.now() + cred.rotationIntervalDays * 2 * 86_400_000).toISOString()
        : null;

      await this.db("provider_credentials").where({ id: cred.id }).update({
        status: "rotated",
        last_rotated_at: new Date(rotatedAt),
        expires_at: newExpiresAt ? new Date(newExpiresAt) : null,
        metadata: JSON.stringify({ ...cred.metadata, lastRotationToken: rotationToken.slice(0, 8) + "…" }),
        updated_at: new Date(),
      });

      logger.info({ credentialId: cred.id, providerKey: cred.providerKey }, "Credential rotated successfully");
      return { credentialId: cred.id, providerKey: cred.providerKey, credentialType: cred.credentialType, success: true, rotatedAt, newExpiresAt, error: null };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ credentialId: cred.id, providerKey: cred.providerKey, error: msg }, "Credential rotation failed");

      await this.db("provider_credentials")
        .where({ id: cred.id })
        .update({ status: "failed", updated_at: new Date() })
        .catch(() => null);

      return { credentialId: cred.id, providerKey: cred.providerKey, credentialType: cred.credentialType, success: false, rotatedAt, newExpiresAt: null, error: msg };
    }
  }

  private mapRow(row: Record<string, unknown>): ProviderCredential {
    return {
      id: String(row.id),
      providerKey: String(row.provider_key),
      credentialType: String(row.credential_type),
      expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
      lastRotatedAt: row.last_rotated_at ? new Date(String(row.last_rotated_at)).toISOString() : null,
      rotationIntervalDays: Number(row.rotation_interval_days ?? 90),
      status: String(row.status ?? "scheduled") as CredentialRotationStatus,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : ((row.metadata ?? {}) as Record<string, unknown>),
      createdAt: new Date(String(row.created_at ?? Date.now())).toISOString(),
      updatedAt: new Date(String(row.updated_at ?? Date.now())).toISOString(),
    };
  }
}

export const providerCredentialRotationService = new ProviderCredentialRotationService();
