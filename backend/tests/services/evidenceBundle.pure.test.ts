import { describe, it, expect } from "vitest";
import {
  buildBundleCore,
  bundleLogEntryData,
  discloseSubset,
  logLeafHashHex,
  signedTreeHeadMessage,
  signEvidenceRoot,
  verifyEvidenceBundle,
  type EvidenceBundleDocument,
  type SignerMetadata,
} from "../../src/services/transparencyLog/evidenceBundle.js";
import {
  inclusionProofFromLeafHashes,
  rootHexFromLeafHashes,
} from "../../src/services/transparencyLog/merkle.js";
import { generateRawKeyPair, signRaw } from "../../src/services/transparencyLog/ed25519.js";

// ── fixtures ──────────────────────────────────────────────────────────────

const signerKp = generateRawKeyPair();
const logKp = generateRawKeyPair();

const signer: SignerMetadata = {
  keyId: "ebk_test_signer",
  algorithm: "ed25519",
  publicKeyHex: signerKp.publicKeyHex,
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: null,
  rotatesKeyId: null,
  logEntryIndex: 0,
};

const keyRegistrationEntry = {
  type: "key_registration" as const,
  keyId: signer.keyId,
  algorithm: "ed25519" as const,
  publicKeyHex: signer.publicKeyHex,
  validFrom: signer.validFrom,
  rotatesKeyId: null,
};

function buildSignedBundle(overrides: Partial<Parameters<typeof buildBundleCore>[0]> = {}) {
  const built = buildBundleCore({
    bundleId: "eb_test",
    subject: { type: "compliance_report", id: "rep_123", reportType: "bridge_activity" },
    createdAt: "2026-06-01T00:00:00.000Z",
    sections: [
      { sectionId: "raw_observations", value: [{ ledger: 55_000_001, amount: "100.0" }] },
      { sectionId: "chain_evidence", value: { txHash: "0xabc", confirmations: 64 } },
      { sectionId: "reserve_attestation", value: { issuer: "circle", balance: "1000000" } },
    ],
    finalityMetadata: {
      chain: "stellar",
      observedLedger: 55_000_010,
      finalizedLedger: 55_000_005,
      confirmations: 5,
      finalityThreshold: 1,
      finalized: true,
      observedAt: "2026-06-01T00:00:00.000Z",
    },
    decoderVersions: { "stellar-xdr": "21.2.0", "evm-abi": "6.13.4" },
    codeVersion: { gitCommit: "5d30d8d" },
    configVersion: { hash: "cfg_deadbeef", version: 42 },
    queryParameters: { periodStart: "2026-05-01", periodEnd: "2026-06-01", assets: ["USDC", "EURC"] },
    derivedOutputs: [{ outputId: "report_pdf", mediaType: "application/pdf", value: { pages: 12, total: "5000000" } }],
    signer,
    ...overrides,
  });

  const signature = signEvidenceRoot(signerKp.privateKeyHex, built.evidenceRoot);
  const bundleEntry = bundleLogEntryData(built.core, built.evidenceRoot);

  const leaves = [keyRegistrationEntry, bundleEntry].map((d) => logLeafHashHex(d));
  const treeSize = leaves.length;
  const rootHash = rootHexFromLeafHashes(leaves);
  const timestamp = "2026-06-01T00:00:01.000Z";
  const sthSignature = signRaw(logKp.privateKeyHex, signedTreeHeadMessage({ treeSize, rootHash, timestamp }));

  const doc: EvidenceBundleDocument = {
    core: built.core,
    evidenceRoot: built.evidenceRoot,
    signature,
    disclosedSections: built.disclosedSections,
    redactedSectionIds: [],
    disclosedOutputs: built.disclosedOutputs,
    transparency: {
      logId: "primary",
      entryIndex: 1,
      entryData: bundleEntry,
      treeSize,
      rootHash,
      inclusionProof: inclusionProofFromLeafHashes(1, leaves),
      signedTreeHead: {
        treeSize,
        rootHash,
        timestamp,
        logPublicKeyHex: logKp.publicKeyHex,
        signature: sthSignature,
      },
      keyRegistration: {
        entryIndex: 0,
        entryData: keyRegistrationEntry,
        inclusionProof: inclusionProofFromLeafHashes(0, leaves),
      },
    },
  };

  return { built, doc };
}

// ── tests ─────────────────────────────────────────────────────────────────

describe("evidence bundle — offline verification", () => {
  it("validates a well-formed bundle with no database", () => {
    const { doc } = buildSignedBundle();
    const result = verifyEvidenceBundle(doc, { requireTransparency: true });
    expect(result.valid).toBe(true);
    expect(result.checks.find((c) => c.name === "signature")?.ok).toBe(true);
    expect(result.checks.find((c) => c.name === "transparency_inclusion")?.ok).toBe(true);
    expect(result.checks.find((c) => c.name === "signed_tree_head")?.ok).toBe(true);
    expect(result.checks.find((c) => c.name === "key_registration")?.ok).toBe(true);
  });

  it("rejects a tampered input observation", () => {
    const { doc } = buildSignedBundle();
    doc.disclosedSections[0].value = [{ ledger: 55_000_001, amount: "999999.0" }];
    const result = verifyEvidenceBundle(doc);
    expect(result.valid).toBe(false);
    expect(result.checks.find((c) => c.name === "section_hash")?.ok).toBe(false);
  });

  it("rejects a tampered derived output", () => {
    const { doc } = buildSignedBundle();
    doc.disclosedOutputs[0].value = { pages: 12, total: "9999999" };
    const result = verifyEvidenceBundle(doc);
    expect(result.valid).toBe(false);
    expect(result.checks.find((c) => c.name === "output_hash")?.ok).toBe(false);
  });

  it("rejects a mutated core field (evidence root / signature break)", () => {
    const { doc } = buildSignedBundle();
    doc.core.queryParameters.assets = ["USDC", "EURC", "PYUSD"];
    const result = verifyEvidenceBundle(doc);
    expect(result.valid).toBe(false);
    expect(result.checks.find((c) => c.name === "evidence_root")?.ok).toBe(false);
    expect(result.checks.find((c) => c.name === "signature")?.ok).toBe(false);
  });

  it("rejects a forged signature from the wrong key", () => {
    const { built } = buildSignedBundle();
    const attacker = generateRawKeyPair();
    const forged = signEvidenceRoot(attacker.privateKeyHex, built.evidenceRoot);
    const result = verifyEvidenceBundle({
      core: built.core,
      evidenceRoot: built.evidenceRoot,
      signature: forged,
      disclosedSections: built.disclosedSections,
      redactedSectionIds: [],
      disclosedOutputs: built.disclosedOutputs,
      transparency: null,
    });
    expect(result.checks.find((c) => c.name === "signature")?.ok).toBe(false);
  });

  it("preserves proof validity under partial disclosure", () => {
    const { doc } = buildSignedBundle();
    const redacted = discloseSubset(doc, ["chain_evidence"]);
    expect(redacted.disclosedSections.map((s) => s.sectionId)).toEqual(["chain_evidence"]);
    expect(redacted.redactedSectionIds.sort()).toEqual(["raw_observations", "reserve_attestation"]);

    const result = verifyEvidenceBundle(redacted, { requireTransparency: true });
    expect(result.valid).toBe(true);
    expect(result.checks.find((c) => c.name === "inputs_root")?.ok).toBe(true);
    expect(result.checks.find((c) => c.name === "evidence_root")?.ok).toBe(true);
  });

  it("still validates a fully redacted bundle (commitments only)", () => {
    const { doc } = buildSignedBundle();
    const result = verifyEvidenceBundle(discloseSubset(doc, []), { requireTransparency: true });
    expect(result.valid).toBe(true);
  });

  it("detects a redacted section whose commitment was swapped", () => {
    const { doc } = buildSignedBundle();
    const redacted = discloseSubset(doc, ["chain_evidence"]);
    redacted.core.sectionCommitments[0].contentHash = "0".repeat(64);
    const result = verifyEvidenceBundle(redacted);
    expect(result.valid).toBe(false);
    // inputsRoot no longer matches the signed core.
    expect(result.checks.find((c) => c.name === "evidence_root")?.ok).toBe(false);
  });

  it("flags a signer key used outside its validity window", () => {
    const { doc } = buildSignedBundle({
      signer: { ...signer, validUntil: "2026-03-01T00:00:00.000Z" },
    });
    const result = verifyEvidenceBundle(doc);
    expect(result.checks.find((c) => c.name === "signer_validity")?.ok).toBe(false);
  });

  it("represents key rotation in the signer metadata and registration entry", () => {
    const rotatedSigner: SignerMetadata = {
      ...signer,
      keyId: "ebk_test_signer_v2",
      rotatesKeyId: "ebk_test_signer",
      logEntryIndex: 0,
    };
    const built = buildBundleCore({
      bundleId: "eb_rot",
      subject: { type: "export", id: "exp_9" },
      createdAt: "2026-07-01T00:00:00.000Z",
      sections: [{ sectionId: "s1", value: { a: 1 } }],
      signer: rotatedSigner,
    });
    expect(built.core.signer.rotatesKeyId).toBe("ebk_test_signer");

    const signature = signEvidenceRoot(signerKp.privateKeyHex, built.evidenceRoot);
    const krEntry = {
      type: "key_registration" as const,
      keyId: rotatedSigner.keyId,
      algorithm: "ed25519" as const,
      publicKeyHex: rotatedSigner.publicKeyHex,
      validFrom: rotatedSigner.validFrom,
      rotatesKeyId: "ebk_test_signer",
    };
    const bundleEntry = bundleLogEntryData(built.core, built.evidenceRoot);
    const leaves = [krEntry, bundleEntry].map((d) => logLeafHashHex(d));
    const rootHash = rootHexFromLeafHashes(leaves);
    const timestamp = "2026-07-01T00:00:01.000Z";

    const doc: EvidenceBundleDocument = {
      core: built.core,
      evidenceRoot: built.evidenceRoot,
      signature,
      disclosedSections: built.disclosedSections,
      redactedSectionIds: [],
      disclosedOutputs: [],
      transparency: {
        logId: "primary",
        entryIndex: 1,
        entryData: bundleEntry,
        treeSize: 2,
        rootHash,
        inclusionProof: inclusionProofFromLeafHashes(1, leaves),
        signedTreeHead: {
          treeSize: 2,
          rootHash,
          timestamp,
          logPublicKeyHex: logKp.publicKeyHex,
          signature: signRaw(logKp.privateKeyHex, signedTreeHeadMessage({ treeSize: 2, rootHash, timestamp })),
        },
        keyRegistration: {
          entryIndex: 0,
          entryData: krEntry,
          inclusionProof: inclusionProofFromLeafHashes(0, leaves),
        },
      },
    };

    const result = verifyEvidenceBundle(doc, { requireTransparency: true });
    expect(result.valid).toBe(true);
    expect(result.checks.find((c) => c.name === "key_registration")?.ok).toBe(true);
  });

  it("rejects a bundle whose transparency entry points at a different evidence root", () => {
    const { doc } = buildSignedBundle();
    doc.transparency!.entryData.evidenceRoot = "0".repeat(64);
    const result = verifyEvidenceBundle(doc, { requireTransparency: true });
    expect(result.valid).toBe(false);
    expect(result.checks.find((c) => c.name === "transparency_entry")?.ok).toBe(false);
  });
});
