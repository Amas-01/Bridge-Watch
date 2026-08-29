import { describe, it, expect } from "vitest";

import {
  DEFAULT_FINALITY_POLICIES,
  type FinalityPolicy,
  type Observation,
  aggregateEvidenceLevel,
  canTransition,
  classify,
  deriveCompensation,
  promotable,
  requiresEvidenceLabel,
  resolvePolicy,
} from "../../src/services/finalityLedger.service.js";

/**
 * Finality state machine and per-chain policy.
 *
 * The rules that matter: a chain that cannot reorg never produces a reverted
 * observation, reverted is terminal, and a mixed-evidence aggregate must be
 * labelled rather than silently averaged.
 */

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: "obs-1",
    chain: "ethereum",
    bridgeId: null,
    blockNumber: 100,
    blockHash: "0xabc",
    confirmations: 0,
    state: "provisional",
    value: "1000",
    observedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolvePolicy", () => {
  it("treats Stellar as final on close", () => {
    // Not a low threshold — a closed Stellar ledger genuinely cannot reorg, so
    // reverted is unreachable there.
    const policy = resolvePolicy("stellar");
    expect(policy.confirmations).toBe(1);
    expect(policy.reorgPossible).toBe(false);
  });

  it("treats Soroban the same as Stellar", () => {
    expect(resolvePolicy("soroban").reorgPossible).toBe(false);
  });

  it("requires confirmations on reorg-capable chains", () => {
    expect(resolvePolicy("ethereum").confirmations).toBe(
      DEFAULT_FINALITY_POLICIES.ethereum.confirmations
    );
    expect(resolvePolicy("ethereum").reorgPossible).toBe(true);
  });

  it("assumes an unknown chain can reorg", () => {
    // Guessing "final" for a chain we do not model would mark unsettled data as
    // evidence, so the default has to fail conservative.
    const policy = resolvePolicy("some-new-l2");
    expect(policy.reorgPossible).toBe(true);
    expect(policy.confirmations).toBeGreaterThan(1);
  });

  it("is case-insensitive on the chain name", () => {
    expect(resolvePolicy("ETHEREUM").confirmations).toBe(resolvePolicy("ethereum").confirmations);
  });

  it("prefers a bridge override over the chain default", () => {
    const overrides: FinalityPolicy[] = [
      { chain: "ethereum", bridgeId: "bridge-x", confirmations: 3, reorgPossible: true },
    ];
    expect(resolvePolicy("ethereum", "bridge-x", overrides).confirmations).toBe(3);
  });

  it("falls back to a chain-wide override for other bridges", () => {
    const overrides: FinalityPolicy[] = [
      { chain: "ethereum", bridgeId: null, confirmations: 20, reorgPossible: true },
      { chain: "ethereum", bridgeId: "bridge-x", confirmations: 3, reorgPossible: true },
    ];
    expect(resolvePolicy("ethereum", "bridge-y", overrides).confirmations).toBe(20);
  });
});

describe("classify", () => {
  const ethereum = resolvePolicy("ethereum");

  it("is provisional below the confirmation threshold", () => {
    expect(classify(observation({ confirmations: 5 }), ethereum)).toBe("provisional");
  });

  it("is finalized at the threshold", () => {
    expect(classify(observation({ confirmations: ethereum.confirmations }), ethereum)).toBe(
      "finalized"
    );
  });

  it("keeps reverted terminal", () => {
    // If the same event reappears on the winning fork it is a new observation
    // with its own id, not a resurrection of this one.
    expect(classify(observation({ state: "reverted", confirmations: 999 }), ethereum)).toBe(
      "reverted"
    );
  });

  it("finalizes immediately on a chain that cannot reorg", () => {
    const stellar = resolvePolicy("stellar");
    expect(classify(observation({ chain: "stellar", confirmations: 1 }), stellar)).toBe("finalized");
  });
});

describe("canTransition", () => {
  const ethereum = resolvePolicy("ethereum");
  const stellar = resolvePolicy("stellar");

  it("allows provisional to finalized", () => {
    expect(canTransition("provisional", "finalized", ethereum)).toBe(true);
  });

  it("refuses to un-finalize settled evidence", () => {
    expect(canTransition("finalized", "provisional", ethereum)).toBe(false);
  });

  it("allows a revert on a reorg-capable chain", () => {
    expect(canTransition("finalized", "reverted", ethereum)).toBe(true);
  });

  it("refuses a revert on a chain that cannot reorg", () => {
    expect(canTransition("finalized", "reverted", stellar)).toBe(false);
  });

  it("treats reverted as terminal", () => {
    expect(canTransition("reverted", "provisional", ethereum)).toBe(false);
    expect(canTransition("reverted", "finalized", ethereum)).toBe(false);
  });

  it("permits a no-op transition", () => {
    expect(canTransition("provisional", "provisional", ethereum)).toBe(true);
  });
});

describe("promotable", () => {
  it("returns only observations whose state actually changes", () => {
    const ready = observation({ id: "ready", confirmations: 12 });
    const notYet = observation({ id: "not-yet", confirmations: 3 });
    const already = observation({ id: "already", confirmations: 12, state: "finalized" });

    const result = promotable([ready, notYet, already]);

    expect(result.map((o) => o.id)).toEqual(["ready"]);
    expect(result[0].state).toBe("finalized");
  });

  it("never promotes a reverted observation", () => {
    expect(promotable([observation({ state: "reverted", confirmations: 999 })])).toEqual([]);
  });

  it("applies per-bridge overrides", () => {
    const overrides: FinalityPolicy[] = [
      { chain: "ethereum", bridgeId: "fast", confirmations: 2, reorgPossible: true },
    ];
    const obs = observation({ bridgeId: "fast", confirmations: 2 });

    expect(promotable([obs], overrides)).toHaveLength(1);
    // Without the override the same observation is still provisional.
    expect(promotable([obs])).toHaveLength(0);
  });
});

describe("deriveCompensation", () => {
  it("negates the reverted contribution", () => {
    const entry = deriveCompensation(observation({ value: "1000" }), "reorg at block 100");

    expect(entry.compensatingValue).toBe("-1000");
    expect(entry.observationId).toBe("obs-1");
    expect(entry.reason).toBe("reorg at block 100");
  });

  it("negates a negative contribution back to positive", () => {
    expect(deriveCompensation(observation({ value: "-250" }), "reorg").compensatingValue).toBe("250");
  });

  it("leaves zero alone rather than producing -0", () => {
    expect(deriveCompensation(observation({ value: "0" }), "reorg").compensatingValue).toBe("0");
  });

  it("keeps values as strings so large amounts stay exact", () => {
    // Chain amounts exceed the exact range of a double; routing this through a
    // float would silently round the compensation.
    const huge = "123456789012345678901234567890";
    expect(deriveCompensation(observation({ value: huge }), "reorg").compensatingValue).toBe(
      `-${huge}`
    );
  });
});

describe("evidence labelling", () => {
  it("requires a label when provisional and finalized are mixed", () => {
    expect(
      requiresEvidenceLabel([{ state: "provisional" }, { state: "finalized" }])
    ).toBe(true);
  });

  it("needs no label for uniformly finalized evidence", () => {
    expect(requiresEvidenceLabel([{ state: "finalized" }, { state: "finalized" }])).toBe(false);
  });

  it("ignores reverted rows, which are compensated rather than aggregated", () => {
    expect(requiresEvidenceLabel([{ state: "finalized" }, { state: "reverted" }])).toBe(false);
  });

  it("labels a mixed aggregate at the weakest level present", () => {
    expect(aggregateEvidenceLevel([{ state: "finalized" }, { state: "provisional" }])).toBe(
      "provisional"
    );
  });

  it("labels a fully settled aggregate as finalized", () => {
    expect(aggregateEvidenceLevel([{ state: "finalized" }])).toBe("finalized");
  });

  it("reports empty when every observation was reverted", () => {
    // Distinct from "finalized with value zero" — the caller has no evidence at
    // all, and should say so rather than publish a confident zero.
    expect(aggregateEvidenceLevel([{ state: "reverted" }])).toBe("empty");
  });

  it("reports empty for no observations", () => {
    expect(aggregateEvidenceLevel([])).toBe("empty");
  });
});
