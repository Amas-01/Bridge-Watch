import { describe, it, expect } from "vitest";

import {
  DEFAULT_LEASE_TTL_MS,
  RENEWAL_THRESHOLD,
  isExpired,
  isFencedOut,
  isHeldBy,
  remainingMs,
  renewalIntervalMs,
  shouldRenew,
} from "../../src/services/workerLease.service.js";

/**
 * Lease timing and fencing rules.
 *
 * These are the parts that decide whether two workers can run the same job, so
 * they are tested directly rather than through the database.
 */

const at = (iso: string) => new Date(iso);
const T0 = "2026-01-01T00:00:00.000Z";

describe("isExpired", () => {
  it("treats a lease with no expiry as expired", () => {
    // A row with a null expiry is one that was released or never acquired;
    // reading it as live would hand out a lease nobody holds.
    expect(isExpired({ expiresAt: null })).toBe(true);
  });

  it("is not expired before the expiry instant", () => {
    expect(isExpired({ expiresAt: "2026-01-01T00:00:30.000Z" }, at(T0))).toBe(false);
  });

  it("is expired exactly at the expiry instant", () => {
    // The boundary belongs to expiry, not to the holder — an inclusive holder
    // window is the one-tick overlap that lets two workers both believe they
    // hold the lease.
    expect(isExpired({ expiresAt: T0 }, at(T0))).toBe(true);
  });
});

describe("isHeldBy", () => {
  const lease = { ownerId: "worker-a", expiresAt: "2026-01-01T00:00:30.000Z" };

  it("recognises the current holder", () => {
    expect(isHeldBy(lease, "worker-a", at(T0))).toBe(true);
  });

  it("rejects a different worker", () => {
    expect(isHeldBy(lease, "worker-b", at(T0))).toBe(false);
  });

  it("rejects the owner once the lease has lapsed", () => {
    expect(isHeldBy(lease, "worker-a", at("2026-01-01T00:01:00.000Z"))).toBe(false);
  });

  it("rejects an unowned lease", () => {
    expect(isHeldBy({ ownerId: null, expiresAt: "2026-01-01T00:00:30.000Z" }, "worker-a", at(T0))).toBe(
      false
    );
  });
});

describe("remainingMs", () => {
  it("reports the time left", () => {
    expect(remainingMs({ expiresAt: "2026-01-01T00:00:30.000Z" }, at(T0))).toBe(30_000);
  });

  it("clamps to zero rather than going negative", () => {
    expect(remainingMs({ expiresAt: T0 }, at("2026-01-01T00:05:00.000Z"))).toBe(0);
  });

  it("is zero for a lease with no expiry", () => {
    expect(remainingMs({ expiresAt: null })).toBe(0);
  });
});

describe("shouldRenew", () => {
  const ttlMs = 30_000;

  it("does not renew while most of the lease remains", () => {
    expect(shouldRenew({ expiresAt: "2026-01-01T00:00:30.000Z", ttlMs }, at(T0))).toBe(false);
  });

  it("renews once under a third of the lease is left", () => {
    // 9s of a 30s lease remaining — inside the threshold.
    expect(shouldRenew({ expiresAt: "2026-01-01T00:00:09.000Z", ttlMs }, at(T0))).toBe(true);
  });

  it("renews exactly at the threshold", () => {
    expect(shouldRenew({ expiresAt: "2026-01-01T00:00:10.000Z", ttlMs }, at(T0))).toBe(true);
  });

  it("does not renew a lease that has already lapsed", () => {
    // A lapsed lease must be reacquired — renewing it would extend a claim the
    // worker no longer has, after another worker may already have taken over.
    expect(shouldRenew({ expiresAt: T0, ttlMs }, at("2026-01-01T00:01:00.000Z"))).toBe(false);
  });

  it("leaves room for a retry before the lease lapses", () => {
    // The point of renewing early: when renewal first triggers, a whole further
    // heartbeat still fits before expiry, so one failed attempt does not hand
    // the work to a second worker.
    const remainingAtThreshold = ttlMs * RENEWAL_THRESHOLD;
    expect(remainingAtThreshold).toBeGreaterThanOrEqual(renewalIntervalMs(ttlMs));

    // And the lease is genuinely still held at that point.
    expect(remainingAtThreshold).toBeGreaterThan(0);
  });
});

describe("renewalIntervalMs", () => {
  it("derives a heartbeat from the TTL", () => {
    expect(renewalIntervalMs(30_000)).toBe(10_000);
  });

  it("never returns an interval that would busy-loop", () => {
    expect(renewalIntervalMs(100)).toBe(1_000);
  });

  it("uses the default TTL when none is given", () => {
    expect(renewalIntervalMs()).toBe(Math.floor(DEFAULT_LEASE_TTL_MS * RENEWAL_THRESHOLD));
  });
});

describe("isFencedOut", () => {
  it("rejects a stale token", () => {
    // The scenario the token exists for: a worker stalls past its expiry, wakes
    // up still holding token 4, and writes after the new holder's token 5.
    expect(isFencedOut(4, 5)).toBe(true);
  });

  it("rejects a replay of the token already accepted", () => {
    expect(isFencedOut(5, 5)).toBe(true);
  });

  it("accepts a newer token", () => {
    expect(isFencedOut(6, 5)).toBe(false);
  });

  it("accepts the first token against an unseen resource", () => {
    expect(isFencedOut(1, 0)).toBe(false);
  });
});
