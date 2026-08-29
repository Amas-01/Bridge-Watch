import { randomUUID } from "crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type AttestationLifecycleStatus = "active" | "revoked";

/**
 * Derived from `expiresAt` at read time rather than stored, so the state
 * never drifts from the clock without a background job keeping it in sync.
 */
export type AttestationExpiryStatus = "valid" | "expiring_soon" | "expired" | "revoked";

/** Attestations inside this window (and not yet expired) are flagged for renewal. */
export const DEFAULT_EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface ReserveAttestation {
  id: string;
  bridgeId: string;
  assetCode: string;
  attestor: string;
  attestationRef: string | null;
  issuedAt: string;
  expiresAt: string;
  status: AttestationLifecycleStatus;
  revokedReason: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  expiryStatus: AttestationExpiryStatus;
  msUntilExpiry: number;
}

export interface RegisterAttestationInput {
  bridgeId: string;
  assetCode: string;
  attestor: string;
  attestationRef?: string | null;
  issuedAt: Date;
  expiresAt: Date;
}

export interface ExpirySummary {
  total: number;
  counts: Record<AttestationExpiryStatus, number>;
  nextExpiring: ReserveAttestation[];
}

/** Pure so it can be unit tested without a database in the loop. */
export function computeExpiryStatus(
  row: { status: AttestationLifecycleStatus; expiresAt: Date | string },
  now: Date = new Date(),
  warningWindowMs: number = DEFAULT_EXPIRY_WARNING_MS
): { expiryStatus: AttestationExpiryStatus; msUntilExpiry: number } {
  if (row.status === "revoked") {
    return { expiryStatus: "revoked", msUntilExpiry: 0 };
  }

  const expiresAt = row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt);
  const msUntilExpiry = expiresAt.getTime() - now.getTime();

  if (msUntilExpiry <= 0) {
    return { expiryStatus: "expired", msUntilExpiry };
  }
  if (msUntilExpiry <= warningWindowMs) {
    return { expiryStatus: "expiring_soon", msUntilExpiry };
  }
  return { expiryStatus: "valid", msUntilExpiry };
}

function mapRow(row: any, now: Date, warningWindowMs: number): ReserveAttestation {
  const { expiryStatus, msUntilExpiry } = computeExpiryStatus(
    { status: row.status, expiresAt: row.expires_at },
    now,
    warningWindowMs
  );

  return {
    id: row.id,
    bridgeId: row.bridge_id,
    assetCode: row.asset_code,
    attestor: row.attestor,
    attestationRef: row.attestation_ref ?? null,
    issuedAt: new Date(row.issued_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    status: row.status,
    revokedReason: row.revoked_reason ?? null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    expiryStatus,
    msUntilExpiry,
  };
}

export class ReserveAttestationExpiryService {
  private readonly db = getDatabase();

  async registerAttestation(input: RegisterAttestationInput): Promise<ReserveAttestation> {
    const [row] = await this.db("reserve_attestations")
      .insert({
        id: randomUUID(),
        bridge_id: input.bridgeId,
        asset_code: input.assetCode,
        attestor: input.attestor,
        attestation_ref: input.attestationRef ?? null,
        issued_at: input.issuedAt,
        expires_at: input.expiresAt,
        status: "active",
      })
      .returning("*");

    logger.info(
      { bridgeId: input.bridgeId, assetCode: input.assetCode, expiresAt: input.expiresAt },
      "Reserve attestation registered"
    );

    return mapRow(row, new Date(), DEFAULT_EXPIRY_WARNING_MS);
  }

  async listAttestations(filters: {
    bridgeId?: string;
    assetCode?: string;
    expiryStatus?: AttestationExpiryStatus;
    warningWindowMs?: number;
  } = {}): Promise<ReserveAttestation[]> {
    let query = this.db("reserve_attestations");

    if (filters.bridgeId) {
      query = query.where("bridge_id", filters.bridgeId);
    }
    if (filters.assetCode) {
      query = query.where("asset_code", filters.assetCode);
    }

    const rows = await query.orderBy("expires_at", "asc");
    const now = new Date();
    const warningWindowMs = filters.warningWindowMs ?? DEFAULT_EXPIRY_WARNING_MS;

    const attestations = rows.map((row: any) => mapRow(row, now, warningWindowMs));

    if (filters.expiryStatus) {
      return attestations.filter((a) => a.expiryStatus === filters.expiryStatus);
    }
    return attestations;
  }

  async getAttestation(id: string): Promise<ReserveAttestation | null> {
    const row = await this.db("reserve_attestations").where({ id }).first();
    if (!row) return null;
    return mapRow(row, new Date(), DEFAULT_EXPIRY_WARNING_MS);
  }

  async revokeAttestation(id: string, reason: string): Promise<ReserveAttestation | null> {
    const [row] = await this.db("reserve_attestations")
      .where({ id })
      .update({
        status: "revoked",
        revoked_reason: reason,
        revoked_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    if (!row) return null;

    logger.info({ attestationId: id, reason }, "Reserve attestation revoked");
    return mapRow(row, new Date(), DEFAULT_EXPIRY_WARNING_MS);
  }

  async getExpirySummary(warningWindowMs: number = DEFAULT_EXPIRY_WARNING_MS): Promise<ExpirySummary> {
    const attestations = await this.listAttestations({ warningWindowMs });

    const counts: Record<AttestationExpiryStatus, number> = {
      valid: 0,
      expiring_soon: 0,
      expired: 0,
      revoked: 0,
    };

    for (const attestation of attestations) {
      counts[attestation.expiryStatus] += 1;
    }

    const nextExpiring = attestations
      .filter((a) => a.expiryStatus === "expiring_soon" || a.expiryStatus === "expired")
      .sort((a, b) => a.msUntilExpiry - b.msUntilExpiry)
      .slice(0, 10);

    return { total: attestations.length, counts, nextExpiring };
  }
}

export const reserveAttestationExpiryService = new ReserveAttestationExpiryService();
