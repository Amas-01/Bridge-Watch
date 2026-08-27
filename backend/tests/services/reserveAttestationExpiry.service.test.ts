import { describe, it, expect, vi } from "vitest";
import {
  computeExpiryStatus,
  DEFAULT_EXPIRY_WARNING_MS,
} from "../../src/services/reserveAttestationExpiry.service.js";

function createQueryBuilder(rows: any[] = []) {
  const builder: any = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
    first: vi.fn().mockResolvedValue(rows[0]),
    then: (resolve: (value: any) => any) => resolve(rows),
  };
  return builder;
}

const state = vi.hoisted(() => ({ rows: [] as any[] }));

const mockKnex = vi.hoisted(() => {
  const knex: any = vi.fn(() => createQueryBuilder(state.rows));
  return knex;
});

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mockKnex,
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { ReserveAttestationExpiryService } = await import(
  "../../src/services/reserveAttestationExpiry.service.js"
);

function makeRow(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: "a1",
    bridge_id: "bridge-1",
    asset_code: "USDC",
    attestor: "attestor-1",
    attestation_ref: "ref-1",
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: "active",
    revoked_reason: null,
    revoked_at: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides,
  };
}

describe("computeExpiryStatus", () => {
  const now = new Date("2026-08-27T00:00:00Z");

  it("returns valid when far from expiry", () => {
    const result = computeExpiryStatus(
      { status: "active", expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
      now
    );
    expect(result.expiryStatus).toBe("valid");
  });

  it("returns expiring_soon within the warning window", () => {
    const result = computeExpiryStatus(
      { status: "active", expiresAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) },
      now,
      DEFAULT_EXPIRY_WARNING_MS
    );
    expect(result.expiryStatus).toBe("expiring_soon");
  });

  it("returns expired once past expiresAt", () => {
    const result = computeExpiryStatus(
      { status: "active", expiresAt: new Date(now.getTime() - 1000) },
      now
    );
    expect(result.expiryStatus).toBe("expired");
    expect(result.msUntilExpiry).toBeLessThan(0);
  });

  it("returns revoked regardless of expiresAt when status is revoked", () => {
    const result = computeExpiryStatus(
      { status: "revoked", expiresAt: new Date(now.getTime() + 1000) },
      now
    );
    expect(result.expiryStatus).toBe("revoked");
  });

  it("treats the exact expiry instant as expired", () => {
    const result = computeExpiryStatus({ status: "active", expiresAt: now }, now);
    expect(result.expiryStatus).toBe("expired");
  });
});

describe("ReserveAttestationExpiryService", () => {
  it("registers an attestation and returns a computed expiry status", async () => {
    state.rows = [makeRow()];
    const service = new ReserveAttestationExpiryService();

    const attestation = await service.registerAttestation({
      bridgeId: "bridge-1",
      assetCode: "USDC",
      attestor: "attestor-1",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    expect(attestation.bridgeId).toBe("bridge-1");
    expect(attestation.expiryStatus).toBe("valid");
  });

  it("lists attestations filtered by derived expiry status", async () => {
    const expiringSoon = makeRow({
      id: "a-soon",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    const stillValid = makeRow({
      id: "a-valid",
      expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    });
    state.rows = [expiringSoon, stillValid];

    const service = new ReserveAttestationExpiryService();
    const results = await service.listAttestations({ expiryStatus: "expiring_soon" });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("a-soon");
  });

  it("revokes an attestation", async () => {
    state.rows = [makeRow({ status: "revoked", revoked_reason: "compromised key" })];
    const service = new ReserveAttestationExpiryService();

    const attestation = await service.revokeAttestation("a1", "compromised key");

    expect(attestation).not.toBeNull();
    expect(attestation?.status).toBe("revoked");
    expect(attestation?.expiryStatus).toBe("revoked");
  });

  it("returns null when revoking a missing attestation", async () => {
    state.rows = [];
    const service = new ReserveAttestationExpiryService();

    const attestation = await service.revokeAttestation("missing", "n/a");

    expect(attestation).toBeNull();
  });

  it("builds an expiry summary with counts and next-expiring list", async () => {
    state.rows = [
      makeRow({ id: "a-expired", expires_at: new Date(Date.now() - 1000).toISOString() }),
      makeRow({
        id: "a-soon",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
      makeRow({ id: "a-valid", expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() }),
    ];

    const service = new ReserveAttestationExpiryService();
    const summary = await service.getExpirySummary();

    expect(summary.total).toBe(3);
    expect(summary.counts.expired).toBe(1);
    expect(summary.counts.expiring_soon).toBe(1);
    expect(summary.counts.valid).toBe(1);
    expect(summary.nextExpiring[0].id).toBe("a-expired");
  });
});
