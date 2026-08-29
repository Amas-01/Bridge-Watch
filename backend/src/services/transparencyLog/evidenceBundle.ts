/**
 * Signed evidence bundles (issue #1019).
 *
 * A bundle is a portable, independently verifiable proof of exactly which raw
 * observations, code/config versions, decoder versions, query parameters and
 * chain-finality metadata produced a report or export. It commits to those
 * inputs with a Merkle root, wraps everything in a canonical "core" object,
 * and signs the SHA-256 of that core (the *evidence root*) with a rotating
 * Ed25519 key whose lifecycle lives in the append-only transparency log.
 *
 * This module is pure (no database, no I/O). The database wrapper lives in
 * `backend/src/services/evidenceBundle.service.ts`; a standalone re-implementation
 * for auditors lives in `backend/scripts/verify-evidence-bundle.mjs`.
 */

import { randomBytes } from "crypto";
import { canonicalBytes, canonicalize } from "./canonical.js";
import { hashLeaf, merkleRootHex, sha256, verifyInclusionProof } from "./merkle.js";
import { signRaw, verifyRaw } from "./ed25519.js";

export const BUNDLE_FORMAT_VERSION = "1.0";

// ── Wire types ────────────────────────────────────────────────────────────

export interface EvidenceSectionInput {
  /** Stable identifier, unique within the bundle. */
  sectionId: string;
  /** IANA media type of `value` once serialized. Defaults to application/json. */
  mediaType?: string;
  label?: string;
  /** The raw disclosed content (canonical observations, chain evidence, …). */
  value: unknown;
  /** 32-byte hex salt; generated if omitted. Blinds low-entropy redacted values. */
  saltHex?: string;
}

export interface SectionCommitment {
  sectionId: string;
  mediaType: string;
  label: string;
  /** SHA-256(salt || canonical(value)), hex. */
  contentHash: string;
}

export interface DisclosedSection {
  sectionId: string;
  mediaType: string;
  label: string;
  saltHex: string;
  value: unknown;
}

export interface DerivedOutputInput {
  outputId: string;
  label?: string;
  mediaType?: string;
  /** Serialized value used to derive the hash; or supply `outputHash` directly. */
  value?: unknown;
  /** SHA-256 hex of the output bytes. Computed from `value` when omitted. */
  outputHash?: string;
}

export interface DerivedOutputCommitment {
  outputId: string;
  label: string;
  mediaType: string;
  outputHash: string;
}

export interface FinalityMetadata {
  chain: string;
  observedLedger: number | string;
  finalizedLedger: number | string;
  confirmations: number;
  finalityThreshold: number;
  finalized: boolean;
  observedAt: string;
}

export interface BundleSubject {
  type: string;
  id: string;
  reportType?: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface SignerMetadata {
  keyId: string;
  algorithm: "ed25519";
  publicKeyHex: string;
  validFrom: string;
  validUntil: string | null;
  /** Predecessor key this key rotated from, if any. */
  rotatesKeyId: string | null;
  /** Index of this key's `key_registration` entry in the transparency log. */
  logEntryIndex: number | null;
}

export interface BundleCore {
  bundleId: string;
  bundleFormatVersion: string;
  subject: BundleSubject;
  createdAt: string;
  inputsRoot: string;
  sectionCommitments: SectionCommitment[];
  finalityMetadata: FinalityMetadata | null;
  decoderVersions: Record<string, string>;
  codeVersion: Record<string, unknown> | null;
  configVersion: Record<string, unknown> | null;
  queryParameters: Record<string, unknown>;
  derivedOutputs: DerivedOutputCommitment[];
  signer: SignerMetadata;
}

export interface SignedTreeHead {
  treeSize: number;
  rootHash: string;
  timestamp: string;
  logPublicKeyHex: string;
  signature: string;
}

export interface TransparencyEntryData {
  type: "evidence_bundle";
  bundleId: string;
  evidenceRoot: string;
  signerKeyId: string;
}

export interface KeyRegistrationEntryData {
  type: "key_registration";
  keyId: string;
  algorithm: "ed25519";
  publicKeyHex: string;
  validFrom: string;
  rotatesKeyId: string | null;
}

export interface KeyRevocationEntryData {
  type: "key_revocation";
  keyId: string;
  revokedAt: string;
  reason: string;
}

export interface TransparencyProof {
  logId: string;
  entryIndex: number;
  entryData: TransparencyEntryData;
  treeSize: number;
  rootHash: string;
  inclusionProof: string[];
  signedTreeHead: SignedTreeHead;
  keyRegistration?: {
    entryIndex: number;
    entryData: KeyRegistrationEntryData;
    inclusionProof: string[];
  };
  keyRevocation?: {
    entryIndex: number;
    entryData: KeyRevocationEntryData;
    inclusionProof: string[];
  };
}

export interface EvidenceBundleDocument {
  core: BundleCore;
  evidenceRoot: string;
  signature: string;
  disclosedSections: DisclosedSection[];
  redactedSectionIds: string[];
  disclosedOutputs: Array<{ outputId: string; value: unknown }>;
  transparency: TransparencyProof | null;
}

// ── Construction ──────────────────────────────────────────────────────────

function randomSaltHex(): string {
  return randomBytes(32).toString("hex");
}

export function sectionContentHash(saltHex: string, value: unknown): string {
  return sha256(Buffer.from(saltHex, "hex"), canonicalBytes(value)).toString("hex");
}

/** Leaf bytes for a section within the inputs Merkle tree. */
export function sectionLeafBytes(c: Pick<SectionCommitment, "sectionId" | "mediaType" | "contentHash">): Buffer {
  return canonicalBytes({ sectionId: c.sectionId, mediaType: c.mediaType, contentHash: c.contentHash });
}

export function computeInputsRoot(commitments: SectionCommitment[]): string {
  return merkleRootHex(commitments.map(sectionLeafBytes));
}

export function outputHashOf(value: unknown): string {
  return sha256(canonicalBytes(value)).toString("hex");
}

export interface BuildBundleInput {
  bundleId: string;
  subject: BundleSubject;
  createdAt?: string;
  sections: EvidenceSectionInput[];
  finalityMetadata?: FinalityMetadata | null;
  decoderVersions?: Record<string, string>;
  codeVersion?: Record<string, unknown> | null;
  configVersion?: Record<string, unknown> | null;
  queryParameters?: Record<string, unknown>;
  derivedOutputs?: DerivedOutputInput[];
  signer: SignerMetadata;
}

export interface BuiltBundle {
  core: BundleCore;
  evidenceRoot: string;
  disclosedSections: DisclosedSection[];
  disclosedOutputs: Array<{ outputId: string; value: unknown }>;
}

/** Build the canonical core + disclosed material. Does not sign. */
export function buildBundleCore(input: BuildBundleInput): BuiltBundle {
  if (!input.sections.length) throw new Error("evidence bundle requires at least one input section");
  const seenIds = new Set<string>();

  const disclosedSections: DisclosedSection[] = [];
  const sectionCommitments: SectionCommitment[] = input.sections.map((s) => {
    if (!s.sectionId) throw new Error("section is missing sectionId");
    if (seenIds.has(s.sectionId)) throw new Error(`duplicate sectionId: ${s.sectionId}`);
    seenIds.add(s.sectionId);

    const mediaType = s.mediaType ?? "application/json";
    const label = s.label ?? s.sectionId;
    const saltHex = s.saltHex ?? randomSaltHex();
    const contentHash = sectionContentHash(saltHex, s.value);

    disclosedSections.push({ sectionId: s.sectionId, mediaType, label, saltHex, value: s.value });
    return { sectionId: s.sectionId, mediaType, label, contentHash };
  });

  const derivedOutputs: DerivedOutputCommitment[] = (input.derivedOutputs ?? []).map((o) => {
    if (!o.outputId) throw new Error("derived output is missing outputId");
    const outputHash = o.outputHash ?? (o.value !== undefined ? outputHashOf(o.value) : undefined);
    if (!outputHash) throw new Error(`derived output ${o.outputId} needs a value or an outputHash`);
    return {
      outputId: o.outputId,
      label: o.label ?? o.outputId,
      mediaType: o.mediaType ?? "application/json",
      outputHash,
    };
  });

  const disclosedOutputs = (input.derivedOutputs ?? [])
    .filter((o) => o.value !== undefined)
    .map((o) => ({ outputId: o.outputId, value: o.value }));

  const core: BundleCore = {
    bundleId: input.bundleId,
    bundleFormatVersion: BUNDLE_FORMAT_VERSION,
    subject: input.subject,
    createdAt: input.createdAt ?? new Date().toISOString(),
    inputsRoot: computeInputsRoot(sectionCommitments),
    sectionCommitments,
    finalityMetadata: input.finalityMetadata ?? null,
    decoderVersions: input.decoderVersions ?? {},
    codeVersion: input.codeVersion ?? null,
    configVersion: input.configVersion ?? null,
    queryParameters: input.queryParameters ?? {},
    derivedOutputs,
    signer: input.signer,
  };

  return { core, evidenceRoot: computeEvidenceRoot(core), disclosedSections, disclosedOutputs };
}

/** SHA-256 of the canonical core = the evidence root that gets signed & logged. */
export function computeEvidenceRoot(core: BundleCore): string {
  return sha256(canonicalBytes(core)).toString("hex");
}

export function signEvidenceRoot(privateKeyHex: string, evidenceRoot: string): string {
  return signRaw(privateKeyHex, Buffer.from(evidenceRoot, "hex"));
}

// ── Transparency-log leaf helpers ─────────────────────────────────────────

export function bundleLogEntryData(core: BundleCore, evidenceRoot: string): TransparencyEntryData {
  return { type: "evidence_bundle", bundleId: core.bundleId, evidenceRoot, signerKeyId: core.signer.keyId };
}

export function logLeafHashHex(entryData: unknown): string {
  return hashLeaf(canonicalBytes(entryData)).toString("hex");
}

export function signedTreeHeadMessage(sth: Pick<SignedTreeHead, "treeSize" | "rootHash" | "timestamp">): Buffer {
  return canonicalBytes({ treeSize: sth.treeSize, rootHash: sth.rootHash, timestamp: sth.timestamp });
}

// ── Partial disclosure ───────────────────────────────────────────────────

/**
 * Return a copy of `doc` exposing only `keepSectionIds` (and, when given, only
 * `keepOutputIds`). The core, evidence root and signature are untouched, so
 * proof validity is preserved.
 */
export function discloseSubset(
  doc: EvidenceBundleDocument,
  keepSectionIds: string[],
  keepOutputIds?: string[],
): EvidenceBundleDocument {
  const keep = new Set(keepSectionIds);
  const allIds = doc.core.sectionCommitments.map((c) => c.sectionId);
  for (const id of keep) {
    if (!allIds.includes(id)) throw new Error(`unknown sectionId: ${id}`);
  }

  const disclosedSections = doc.disclosedSections.filter((s) => keep.has(s.sectionId));
  const redactedSectionIds = allIds.filter((id) => !keep.has(id));

  const disclosedOutputs = keepOutputIds
    ? doc.disclosedOutputs.filter((o) => keepOutputIds.includes(o.outputId))
    : doc.disclosedOutputs;

  return { ...doc, disclosedSections, redactedSectionIds, disclosedOutputs };
}

// ── Offline verification ─────────────────────────────────────────────────

export interface VerificationCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface VerificationResult {
  valid: boolean;
  bundleId: string;
  evidenceRoot: string;
  checks: VerificationCheck[];
}

export interface VerifyOptions {
  /** ISO timestamp; when set, also assert the signer key was valid at this instant. */
  asOf?: string;
  /** Require an embedded transparency proof (default: verify it only if present). */
  requireTransparency?: boolean;
}

/**
 * Validate a bundle with no database and no network. Every commitment is
 * recomputed from disclosed material and checked against the signed core; the
 * signature and (when present) the transparency-log inclusion + signed tree
 * head are verified against keys embedded in the bundle.
 */
export function verifyEvidenceBundle(doc: EvidenceBundleDocument, opts: VerifyOptions = {}): VerificationResult {
  const checks: VerificationCheck[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const core = doc.core;

  add(
    "format",
    core?.bundleFormatVersion === BUNDLE_FORMAT_VERSION,
    `bundleFormatVersion=${core?.bundleFormatVersion} (supported: ${BUNDLE_FORMAT_VERSION})`,
  );

  // Section id partition: disclosed ∪ redacted == all, and disjoint.
  const commitmentIds = (core?.sectionCommitments ?? []).map((c) => c.sectionId);
  const disclosedIds = doc.disclosedSections.map((s) => s.sectionId);
  const redactedIds = doc.redactedSectionIds ?? [];
  const partitionOk =
    new Set([...disclosedIds, ...redactedIds]).size === commitmentIds.length &&
    [...disclosedIds, ...redactedIds].length === commitmentIds.length &&
    disclosedIds.every((id) => commitmentIds.includes(id)) &&
    redactedIds.every((id) => commitmentIds.includes(id));
  add(
    "section_partition",
    partitionOk,
    `${disclosedIds.length} disclosed + ${redactedIds.length} redacted vs ${commitmentIds.length} commitments`,
  );

  // Disclosed section content hashes.
  let sectionHashesOk = true;
  for (const s of doc.disclosedSections) {
    const commitment = core.sectionCommitments.find((c) => c.sectionId === s.sectionId);
    if (!commitment) {
      sectionHashesOk = false;
      add("section_hash", false, `disclosed section ${s.sectionId} has no commitment`);
      continue;
    }
    const recomputed = sectionContentHash(s.saltHex, s.value);
    const ok = recomputed === commitment.contentHash;
    if (!ok) sectionHashesOk = false;
    add("section_hash", ok, `${s.sectionId}: ${ok ? "matches" : `expected ${commitment.contentHash}, got ${recomputed}`}`);
  }
  if (!doc.disclosedSections.length) add("section_hash", true, "no sections disclosed (fully redacted bundle)");

  // Inputs Merkle root over all commitments (redacted-safe).
  const inputsRoot = computeInputsRoot(core.sectionCommitments ?? []);
  add("inputs_root", inputsRoot === core.inputsRoot, `recomputed ${inputsRoot} vs core ${core?.inputsRoot}`);

  // Disclosed derived-output hashes.
  for (const o of doc.disclosedOutputs ?? []) {
    const commitment = core.derivedOutputs.find((d) => d.outputId === o.outputId);
    if (!commitment) {
      add("output_hash", false, `disclosed output ${o.outputId} has no commitment`);
      continue;
    }
    const recomputed = outputHashOf(o.value);
    add("output_hash", recomputed === commitment.outputHash, `${o.outputId}: ${recomputed === commitment.outputHash ? "matches" : "mismatch"}`);
  }

  // Evidence root = SHA-256(canonical(core)).
  const evidenceRoot = computeEvidenceRoot(core);
  const rootOk = evidenceRoot === doc.evidenceRoot;
  add("evidence_root", rootOk, `recomputed ${evidenceRoot} vs document ${doc.evidenceRoot}`);

  // Signature over the evidence root.
  const sigOk = rootOk && verifyRaw(core.signer.publicKeyHex, Buffer.from(doc.evidenceRoot, "hex"), doc.signature);
  add("signature", sigOk, sigOk ? `valid ${core.signer.algorithm} signature by ${core.signer.keyId}` : "signature verification failed");

  // Signer key validity window.
  const asOf = opts.asOf ?? core.createdAt;
  const validFromOk = new Date(asOf).getTime() >= new Date(core.signer.validFrom).getTime();
  const validUntilOk = !core.signer.validUntil || new Date(asOf).getTime() <= new Date(core.signer.validUntil).getTime();
  add("signer_validity", validFromOk && validUntilOk, `key ${core.signer.keyId} valid at ${asOf}: from=${validFromOk} until=${validUntilOk}`);

  // Transparency log proof.
  const tp = doc.transparency;
  if (opts.requireTransparency && !tp) {
    add("transparency", false, "no transparency proof embedded");
  }
  if (tp) {
    const expected = bundleLogEntryData(core, doc.evidenceRoot);
    const entryDataOk =
      tp.entryData?.type === "evidence_bundle" &&
      tp.entryData.bundleId === expected.bundleId &&
      tp.entryData.evidenceRoot === expected.evidenceRoot &&
      tp.entryData.signerKeyId === expected.signerKeyId;
    add("transparency_entry", entryDataOk, entryDataOk ? "log entry binds bundleId + evidenceRoot + signerKeyId" : "log entry data does not match bundle");

    const leafHex = logLeafHashHex(tp.entryData);
    const inclOk = verifyInclusionProof(leafHex, tp.entryIndex, tp.treeSize, tp.inclusionProof, tp.rootHash);
    add("transparency_inclusion", inclOk, `entry ${tp.entryIndex} in tree size ${tp.treeSize} @ root ${tp.rootHash.slice(0, 16)}…`);

    const sth = tp.signedTreeHead;
    const sthShapeOk = sth.treeSize === tp.treeSize && sth.rootHash === tp.rootHash;
    const sthSigOk = sthShapeOk && verifyRaw(sth.logPublicKeyHex, signedTreeHeadMessage(sth), sth.signature);
    add("signed_tree_head", sthSigOk, sthSigOk ? `STH signed by log key ${sth.logPublicKeyHex.slice(0, 16)}…` : "signed tree head invalid");

    if (tp.keyRegistration) {
      const kr = tp.keyRegistration;
      const krDataOk =
        kr.entryData.type === "key_registration" &&
        kr.entryData.keyId === core.signer.keyId &&
        kr.entryData.publicKeyHex === core.signer.publicKeyHex &&
        kr.entryData.algorithm === core.signer.algorithm &&
        kr.entryData.rotatesKeyId === core.signer.rotatesKeyId;
      const krInclOk = verifyInclusionProof(logLeafHashHex(kr.entryData), kr.entryIndex, tp.treeSize, kr.inclusionProof, tp.rootHash);
      add("key_registration", krDataOk && krInclOk, krDataOk && krInclOk ? `signer key registered at log entry ${kr.entryIndex}` : "key registration proof invalid");
    }

    if (tp.keyRevocation) {
      const rev = tp.keyRevocation;
      const revInclOk = verifyInclusionProof(logLeafHashHex(rev.entryData), rev.entryIndex, tp.treeSize, rev.inclusionProof, tp.rootHash);
      const revokedAfterUse = new Date(rev.entryData.revokedAt).getTime() >= new Date(core.createdAt).getTime();
      add(
        "key_revocation",
        revInclOk && revokedAfterUse,
        revInclOk
          ? `key revoked ${rev.entryData.revokedAt} (${revokedAfterUse ? "after" : "BEFORE"} this bundle was signed)`
          : "key revocation proof invalid",
      );
    }
  }

  const valid = checks.every((c) => c.ok);
  return { valid, bundleId: core?.bundleId, evidenceRoot: doc.evidenceRoot, checks };
}

/** Convenience: canonical string of any value (re-exported for callers/tests). */
export { canonicalize };
