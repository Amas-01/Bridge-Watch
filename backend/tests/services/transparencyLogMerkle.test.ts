import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import {
  hashLeaf,
  merkleTreeHash,
  merkleRootHex,
  inclusionProof,
  consistencyProof,
  rootFromLeafHashes,
  inclusionProofFromLeafHashes,
  consistencyProofFromLeafHashes,
  verifyInclusionProof,
  verifyConsistencyProof,
} from "../../src/services/transparencyLog/merkle.js";

// RFC 6962 §2.1 test leaves.
const LEAVES = [
  "",
  "00",
  "10",
  "2021",
  "3031",
  "40414243",
  "5051525354555657",
  "606162636465666768696a6b6c6d6e6f",
].map((h) => Buffer.from(h, "hex"));

describe("RFC 6962 Merkle tree", () => {
  it("matches known-answer roots", () => {
    // SHA-256("") — the empty tree.
    expect(merkleRootHex([])).toBe(createHash("sha256").update(Buffer.alloc(0)).digest("hex"));
    // SHA-256(0x00) — a single empty leaf.
    expect(merkleRootHex(LEAVES.slice(0, 1))).toBe(
      "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d",
    );
    // Documented CT test vector for the 8-leaf tree.
    expect(merkleRootHex(LEAVES)).toBe(
      "5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328",
    );
  });

  it("is deterministic and order-sensitive", () => {
    expect(merkleRootHex(LEAVES.slice(0, 4))).toBe(merkleRootHex(LEAVES.slice(0, 4)));
    const swapped = [LEAVES[1], LEAVES[0], ...LEAVES.slice(2, 4)];
    expect(merkleRootHex(swapped)).not.toBe(merkleRootHex(LEAVES.slice(0, 4)));
  });

  it("rootFromLeafHashes equals merkleTreeHash over pre-hashed leaves", () => {
    for (let n = 0; n <= LEAVES.length; n++) {
      const subset = LEAVES.slice(0, n);
      expect(rootFromLeafHashes(subset.map(hashLeaf)).toString("hex")).toBe(merkleTreeHash(subset).toString("hex"));
    }
  });

  it("produces and verifies inclusion proofs for every leaf in every tree size", () => {
    for (let n = 1; n <= LEAVES.length; n++) {
      const subset = LEAVES.slice(0, n);
      const root = merkleRootHex(subset);
      for (let i = 0; i < n; i++) {
        const proof = inclusionProof(i, subset);
        expect(verifyInclusionProof(hashLeaf(subset[i]).toString("hex"), i, n, proof, root)).toBe(true);
        // Wrong leaf hash must fail.
        expect(verifyInclusionProof(hashLeaf(Buffer.from("deadbeef", "hex")).toString("hex"), i, n, proof, root)).toBe(false);
        // Tampered proof element must fail.
        if (proof.length > 0) {
          const bad = [...proof];
          bad[0] = createHash("sha256").update(Buffer.from(bad[0], "hex")).digest("hex");
          expect(verifyInclusionProof(hashLeaf(subset[i]).toString("hex"), i, n, bad, root)).toBe(false);
        }
      }
    }
  });

  it("inclusionProofFromLeafHashes agrees with the raw-data variant", () => {
    const subset = LEAVES.slice(0, 7);
    const leafHashes = subset.map(hashLeaf);
    for (let i = 0; i < subset.length; i++) {
      expect(inclusionProofFromLeafHashes(i, leafHashes)).toEqual(inclusionProof(i, subset));
    }
  });

  it("produces and verifies consistency proofs for every m <= n", () => {
    for (let n = 1; n <= LEAVES.length; n++) {
      const big = LEAVES.slice(0, n);
      const rootN = merkleRootHex(big);
      for (let m = 1; m <= n; m++) {
        const rootM = merkleRootHex(LEAVES.slice(0, m));
        const proof = consistencyProof(m, big);
        expect(verifyConsistencyProof(m, n, proof, rootM, rootN)).toBe(true);
        // A forged older root must fail.
        expect(verifyConsistencyProof(m, n, proof, rootN, rootN)).toBe(m === n);
      }
    }
  });

  it("consistencyProofFromLeafHashes agrees with the raw-data variant", () => {
    const big = LEAVES.slice(0, 8);
    const leafHashes = big.map(hashLeaf);
    for (let m = 1; m <= 8; m++) {
      expect(consistencyProofFromLeafHashes(m, leafHashes)).toEqual(consistencyProof(m, big));
    }
  });

  it("detects an inconsistent (non-append-only) log", () => {
    const original = LEAVES.slice(0, 5);
    const rewritten = [...LEAVES.slice(0, 4), Buffer.from("ffff", "hex"), ...LEAVES.slice(5, 7)];
    const proof = consistencyProof(5, [...original, ...LEAVES.slice(5, 7)]);
    // rewritten history at size 5 no longer matches.
    expect(verifyConsistencyProof(5, 7, proof, merkleRootHex(rewritten.slice(0, 5)), merkleRootHex(rewritten))).toBe(false);
  });
});
