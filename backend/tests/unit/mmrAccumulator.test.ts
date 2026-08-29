/**
 * MMR Accumulator Service — unit + integration test suite.
 *
 * Covers:
 *  - Leaf insertion and root derivation
 *  - Determinism across independent accumulators
 *  - Proof generation and verification (single leaf, two leaves, N leaves)
 *  - Tampered proof detection
 *  - Batch append
 *  - Serialization / deserialization round-trip
 *  - Multi-thousand leaf tree consistency
 */

import { describe, it, expect } from "vitest";
import { MmrAccumulatorService } from "../../src/services/mmrAccumulator.service.js";
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCommitment(byte: number): Buffer {
  return Buffer.alloc(32, byte);
}

function domainLeafHash(data: Buffer): string {
  return createHash("sha256")
    .update(Buffer.from([0x00]))
    .update(data)
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Construction & append
// ---------------------------------------------------------------------------

describe("MmrAccumulatorService — append", () => {
  it("returns leafIndex=0 for the first append", () => {
    const svc = new MmrAccumulatorService();
    const result = svc.append(makeCommitment(0x01));
    expect(result.leafIndex).toBe(0);
    expect(result.leafHash).toBe(domainLeafHash(makeCommitment(0x01)));
  });

  it("increments leafIndex on each append", () => {
    const svc = new MmrAccumulatorService();
    for (let i = 0; i < 8; i++) {
      const r = svc.append(makeCommitment(i));
      expect(r.leafIndex).toBe(i);
    }
    expect(svc.getLeafCount()).toBe(8);
  });

  it("rejects commitments that are not exactly 32 bytes", () => {
    const svc = new MmrAccumulatorService();
    expect(() => svc.append(Buffer.alloc(16))).toThrow("32 bytes");
  });

  it("root is 64-char hex string", () => {
    const svc = new MmrAccumulatorService();
    svc.append(makeCommitment(0xAA));
    expect(svc.getRoot()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("root changes after each new append", () => {
    const svc = new MmrAccumulatorService();
    svc.append(makeCommitment(0x01));
    const r1 = svc.getRoot();
    svc.append(makeCommitment(0x02));
    const r2 = svc.getRoot();
    expect(r1).not.toBe(r2);
  });

  it("two accumulators with identical leaves produce identical roots", () => {
    const a = new MmrAccumulatorService();
    const b = new MmrAccumulatorService();
    [0x11, 0x22, 0x33, 0x44].forEach((byte) => {
      a.append(makeCommitment(byte));
      b.append(makeCommitment(byte));
    });
    expect(a.getRoot()).toBe(b.getRoot());
  });

  it("different leaf sequences produce different roots", () => {
    const a = new MmrAccumulatorService();
    const b = new MmrAccumulatorService();
    a.append(makeCommitment(0x01));
    a.append(makeCommitment(0x02));
    b.append(makeCommitment(0x02));
    b.append(makeCommitment(0x01));
    expect(a.getRoot()).not.toBe(b.getRoot());
  });
});

// ---------------------------------------------------------------------------
// Batch append
// ---------------------------------------------------------------------------

describe("MmrAccumulatorService — batchAppend", () => {
  it("appends all commitments and returns correct indices", () => {
    const svc = new MmrAccumulatorService();
    const commitments = [0x01, 0x02, 0x03].map(makeCommitment);
    const results = svc.appendBatch(commitments);
    expect(results.map((r) => r.leafIndex)).toEqual([0, 1, 2]);
    expect(svc.getLeafCount()).toBe(3);
  });

  it("batch and individual appends produce identical roots", () => {
    const svcBatch = new MmrAccumulatorService();
    const svcSeq = new MmrAccumulatorService();
    const bytes = [0xA1, 0xA2, 0xA3, 0xA4, 0xA5];

    svcBatch.appendBatch(bytes.map(makeCommitment));
    bytes.forEach((b) => svcSeq.append(makeCommitment(b)));

    expect(svcBatch.getRoot()).toBe(svcSeq.getRoot());
  });
});

// ---------------------------------------------------------------------------
// Proof generation & verification
// ---------------------------------------------------------------------------

describe("MmrAccumulatorService — proof round-trip", () => {
  it("single-leaf proof verifies correctly", () => {
    const svc = new MmrAccumulatorService();
    svc.append(makeCommitment(0xDE));
    const proof = svc.generateProof(0);
    const { valid } = svc.verifyProofAgainstCurrent(proof);
    expect(valid).toBe(true);
  });

  it("two-leaf proof verifies leaf 0", () => {
    const svc = new MmrAccumulatorService();
    svc.append(makeCommitment(0x01));
    svc.append(makeCommitment(0x02));
    const proof = svc.generateProof(0);
    const { valid } = svc.verifyProofAgainstCurrent(proof);
    expect(valid).toBe(true);
  });

  it("two-leaf proof verifies leaf 1", () => {
    const svc = new MmrAccumulatorService();
    svc.append(makeCommitment(0x01));
    svc.append(makeCommitment(0x02));
    const proof = svc.generateProof(1);
    const { valid } = svc.verifyProofAgainstCurrent(proof);
    expect(valid).toBe(true);
  });

  it("four-leaf tree: every leaf verifies", () => {
    const svc = new MmrAccumulatorService();
    [0x11, 0x22, 0x33, 0x44].forEach((b) => svc.append(makeCommitment(b)));
    for (let i = 0; i < 4; i++) {
      const proof = svc.generateProof(i);
      const { valid } = svc.verifyProofAgainstCurrent(proof);
      expect(valid).toBe(true);
    }
  });

  it("seven-leaf tree: every leaf verifies", () => {
    const svc = new MmrAccumulatorService();
    for (let i = 0; i < 7; i++) svc.append(makeCommitment(i));
    for (let i = 0; i < 7; i++) {
      const proof = svc.generateProof(i);
      const { valid } = svc.verifyProofAgainstCurrent(proof);
      expect(valid).toBe(true);
    }
  });

  it("tampered leafHash fails verification", () => {
    const svc = new MmrAccumulatorService();
    svc.append(makeCommitment(0x01));
    const proof = svc.generateProof(0);
    const tampered = { ...proof, leafHash: "ff".repeat(32) };
    const { valid } = svc.verifyProofAgainstCurrent(tampered);
    expect(valid).toBe(false);
  });

  it("wrong expected root fails verification", () => {
    const svc = new MmrAccumulatorService();
    svc.append(makeCommitment(0x01));
    const proof = svc.generateProof(0);
    const { valid } = svc.verifyProof(proof, "ab".repeat(32));
    expect(valid).toBe(false);
  });

  it("tampered sibling fails verification", () => {
    const svc = new MmrAccumulatorService();
    svc.append(makeCommitment(0x01));
    svc.append(makeCommitment(0x02));
    const proof = svc.generateProof(0);
    const tampered = {
      ...proof,
      siblings: proof.siblings.map(() => "ee".repeat(32)),
    };
    const { valid } = svc.verifyProofAgainstCurrent(tampered);
    expect(valid).toBe(false);
  });

  it("out-of-range leafIndex throws", () => {
    const svc = new MmrAccumulatorService();
    svc.append(makeCommitment(0x01));
    expect(() => svc.generateProof(5)).toThrow("out of range");
  });

  it("proof generated before new appends still verifies against captured root", () => {
    const svc = new MmrAccumulatorService();
    svc.append(makeCommitment(0xAA));
    const proof = svc.generateProof(0);
    const rootAtProofTime = svc.getRoot();

    // Append more leaves — root changes.
    svc.append(makeCommitment(0xBB));
    svc.append(makeCommitment(0xCC));

    // Proof should still verify against the root captured when it was generated.
    const { valid } = svc.verifyProof(proof, rootAtProofTime);
    expect(valid).toBe(true);
  });

  it("empty peaks snapshot returns valid=false", () => {
    const svc = new MmrAccumulatorService();
    svc.append(makeCommitment(0x01));
    const proof = svc.generateProof(0);
    const tampered = { ...proof, peaksSnapshot: [] };
    const { valid } = svc.verifyProofAgainstCurrent(tampered);
    expect(valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Large tree
// ---------------------------------------------------------------------------

describe("MmrAccumulatorService — large tree", () => {
  it("1 000-leaf tree: root is deterministic across two independent accumulators", () => {
    const N = 1000;
    const build = () => {
      const svc = new MmrAccumulatorService();
      for (let i = 0; i < N; i++) {
        svc.append(Buffer.alloc(32, i % 256));
      }
      return svc.getRoot();
    };

    expect(build()).toBe(build());
  });

  it("1 000-leaf tree: leaf count equals 1000", () => {
    const svc = new MmrAccumulatorService();
    for (let i = 0; i < 1000; i++) svc.append(Buffer.alloc(32, i % 256));
    expect(svc.getLeafCount()).toBe(1000);
  });

  it("5 000-leaf tree: spot-check first and last leaves verify", () => {
    const N = 5000;
    const svc = new MmrAccumulatorService();
    for (let i = 0; i < N; i++) svc.append(Buffer.alloc(32, i % 256));

    const firstProof = svc.generateProof(0);
    const lastProof = svc.generateProof(N - 1);

    expect(svc.verifyProofAgainstCurrent(firstProof).valid).toBe(true);
    expect(svc.verifyProofAgainstCurrent(lastProof).valid).toBe(true);
  });

  it("10 000-leaf tree: root does not throw", () => {
    const svc = new MmrAccumulatorService();
    for (let i = 0; i < 10_000; i++) svc.append(Buffer.alloc(32, i % 256));
    expect(() => svc.getRoot()).not.toThrow();
    expect(svc.getRoot()).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

describe("MmrAccumulatorService — serialization", () => {
  it("round-trips state and preserves root", () => {
    const svc = new MmrAccumulatorService();
    [0x01, 0x02, 0x03, 0x04, 0x05].forEach((b) => svc.append(makeCommitment(b)));
    const serialized = svc.serialize();
    const restored = MmrAccumulatorService.fromSerialized(serialized);
    expect(restored.getRoot()).toBe(svc.getRoot());
    expect(restored.getLeafCount()).toBe(svc.getLeafCount());
  });

  it("restored accumulator can continue appending", () => {
    const svc = new MmrAccumulatorService();
    svc.append(makeCommitment(0xAA));
    const restored = MmrAccumulatorService.fromSerialized(svc.serialize());

    // Append same leaf to both.
    svc.append(makeCommitment(0xBB));
    restored.append(makeCommitment(0xBB));

    expect(restored.getRoot()).toBe(svc.getRoot());
  });
});
