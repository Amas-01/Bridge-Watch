/**
 * Signed evidence bundles + append-only transparency log (issue #1019).
 *
 * Database wrapper around the pure primitives in
 * `src/services/transparencyLog/*`. Responsibilities:
 *
 *   - manage rotating Ed25519 signer keys and record their lifecycle
 *     (registration / rotation / revocation) as transparency-log entries
 *   - append bundle commitments to a sequential RFC 6962 Merkle log and
 *     publish a signed tree head (checkpoint) for every new size
 *   - assemble a self-contained bundle document (canonical core + disclosed
 *     material + inclusion proof + signed tree head) that verifies offline
 *   - serve inclusion and consistency proofs
 */

import { randomUUID } from "crypto";
import type { Knex } from "knex";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import {
  canonicalBytes,
} from "./transparencyLog/canonical.js";
import {
  consistencyProofFromLeafHashes,
  inclusionProofFromLeafHashes,
  rootHexFromLeafHashes,
  verifyConsistencyProof,
} from "./transparencyLog/merkle.js";
import { generateRawKeyPair, signRaw } from "./transparencyLog/ed25519.js";
import {
  buildBundleCore,
  bundleLogEntryData,
  computeEvidenceRoot,
  discloseSubset,
  logLeafHashHex,
  signedTreeHeadMessage,
  signEvidenceRoot,
  verifyEvidenceBundle,
  type BuildBundleInput,
  type EvidenceBundleDocument,
  type KeyRegistrationEntryData,
  type KeyRevocationEntryData,
  type SignerMetadata,
  type TransparencyProof,
  type VerificationResult,
} from "./transparencyLog/evidenceBundle.js";

const LOG_ID = "primary";
// Stable key for pg_advisory_xact_lock so concurrent appends serialize.
const APPEND_LOCK_KEY = 761_901_019;

export interface CreateBundleRequest {
  subject: BuildBundleInput["subject"];
  sections: BuildBundleInput["sections"];
  finalityMetadata?: BuildBundleInput["finalityMetadata"];
  decoderVersions?: Record<string, string>;
  codeVersion?: Record<string, unknown> | null;
  configVersion?: Record<string, unknown> | null;
  queryParameters?: Record<string, unknown>;
  derivedOutputs?: BuildBundleInput["derivedOutputs"];
  createdBy?: string;
}

export interface SigningKeyView {
  keyId: string;
  algorithm: string;
  purpose: string;
  publicKeyHex: string;
  status: "active" | "superseded" | "revoked";
  validFrom: string;
  validUntil: string | null;
  rotatesKeyId: string | null;
  supersededByKeyId: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  logEntryIndex: number | null;
  createdAt: string;
}

export class EvidenceBundleService {
  private db(): Knex {
    return getDatabase();
  }

  // ── Signing keys ────────────────────────────────────────────────────────

  private keyView(row: any): SigningKeyView {
    return {
      keyId: row.key_id,
      algorithm: row.algorithm,
      purpose: row.purpose,
      publicKeyHex: row.public_key_hex,
      status: row.status,
      validFrom: toIso(row.valid_from),
      validUntil: row.valid_until ? toIso(row.valid_until) : null,
      rotatesKeyId: row.rotates_key_id ?? null,
      supersededByKeyId: row.superseded_by_key_id ?? null,
      revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
      revocationReason: row.revocation_reason ?? null,
      logEntryIndex: row.log_entry_index === null || row.log_entry_index === undefined ? null : Number(row.log_entry_index),
      createdAt: toIso(row.created_at),
    };
  }

  async listSigningKeys(purpose?: string): Promise<SigningKeyView[]> {
    let q = this.db()("evidence_bundle_signing_keys").orderBy("created_at", "asc");
    if (purpose) q = q.where({ purpose });
    return (await q).map((r) => this.keyView(r));
  }

  /** The Ed25519 key used to sign new bundles; created on first use. */
  async getActiveSigner(purpose: "bundle_signer" | "log" = "bundle_signer"): Promise<any> {
    const existing = await this.db()("evidence_bundle_signing_keys")
      .where({ purpose, status: "active" })
      .orderBy("valid_from", "desc")
      .first();
    if (existing) return existing;
    return this.provisionKey(purpose, null, null);
  }

  private async provisionKey(
    purpose: "bundle_signer" | "log",
    rotatesKeyId: string | null,
    createdBy: string | null,
  ): Promise<any> {
    const { privateKeyHex, publicKeyHex } = generateRawKeyPair();
    const keyId = `ebk_${purpose === "log" ? "log_" : ""}${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const [row] = await this.db()("evidence_bundle_signing_keys")
      .insert({
        key_id: keyId,
        algorithm: "ed25519",
        purpose,
        public_key_hex: publicKeyHex,
        private_key_hex: privateKeyHex,
        status: "active",
        rotates_key_id: rotatesKeyId,
        created_by: createdBy,
      })
      .returning("*");

    // A bundle signer's existence is itself logged so verifiers can prove the
    // key was registered before it signed anything.
    if (purpose === "bundle_signer") {
      const entryData: KeyRegistrationEntryData = {
        type: "key_registration",
        keyId,
        algorithm: "ed25519",
        publicKeyHex,
        validFrom: toIso(row.valid_from),
        rotatesKeyId,
      };
      const appended = await this.appendLogEntry("key_registration", entryData);
      await this.db()("evidence_bundle_signing_keys")
        .where({ key_id: keyId })
        .update({ log_entry_index: appended.logIndex });
      row.log_entry_index = appended.logIndex;
    }

    logger.info({ keyId, purpose, rotatesKeyId }, "Provisioned evidence bundle signing key");
    return row;
  }

  async rotateSigner(createdBy?: string): Promise<SigningKeyView> {
    const current = await this.getActiveSigner("bundle_signer");
    const now = this.db().fn.now();
    const fresh = await this.provisionKey("bundle_signer", current.key_id, createdBy ?? null);
    await this.db()("evidence_bundle_signing_keys").where({ key_id: current.key_id }).update({
      status: "superseded",
      superseded_by_key_id: fresh.key_id,
      valid_until: now,
    });
    logger.info({ from: current.key_id, to: fresh.key_id }, "Rotated evidence bundle signer");
    return this.keyView(fresh);
  }

  async revokeSigner(keyId: string, reason: string, revokedBy?: string): Promise<SigningKeyView> {
    const row = await this.db()("evidence_bundle_signing_keys").where({ key_id: keyId }).first();
    if (!row) throw new Error(`signing key ${keyId} not found`);

    const revokedAt = new Date().toISOString();
    const entryData: KeyRevocationEntryData = {
      type: "key_revocation",
      keyId,
      revokedAt,
      reason: reason || "unspecified",
    };
    await this.appendLogEntry("key_revocation", entryData);

    const [updated] = await this.db()("evidence_bundle_signing_keys")
      .where({ key_id: keyId })
      .update({
        status: "revoked",
        revoked_at: revokedAt,
        revocation_reason: reason || "unspecified",
        valid_until: row.valid_until ?? revokedAt,
        created_by: row.created_by,
      })
      .returning("*");

    logger.warn({ keyId, reason, revokedBy }, "Revoked evidence bundle signer");
    return this.keyView(updated);
  }

  // ── Transparency log append ─────────────────────────────────────────────

  async appendLogEntry(
    entryType: "evidence_bundle" | "key_registration" | "key_revocation",
    entryData: unknown,
    bundleId?: string,
  ): Promise<{ logIndex: number; treeSize: number; rootHash: string; leafHash: string }> {
    return this.db().transaction(async (trx) => {
      await trx.raw("SELECT pg_advisory_xact_lock(?)", [APPEND_LOCK_KEY]);

      const priorRows = await trx("transparency_log_entries")
        .where({ log_id: LOG_ID })
        .orderBy("log_index", "asc")
        .select("leaf_hash");
      const priorLeaves = priorRows.map((r) => r.leaf_hash as string);

      const logIndex = priorLeaves.length;
      const leafHash = logLeafHashHex(entryData);
      const leaves = [...priorLeaves, leafHash];
      const treeSize = leaves.length;
      const rootHash = rootHexFromLeafHashes(leaves);

      await trx("transparency_log_entries").insert({
        id: randomUUID(),
        log_id: LOG_ID,
        log_index: logIndex,
        entry_type: entryType,
        leaf_hash: leafHash,
        entry_data: JSON.stringify(entryData),
        tree_size: treeSize,
        root_hash: rootHash,
        bundle_id: bundleId ?? null,
      });

      await this.publishCheckpoint(trx, treeSize, rootHash);

      return { logIndex, treeSize, rootHash, leafHash };
    });
  }

  private async publishCheckpoint(trx: Knex.Transaction, treeSize: number, rootHash: string): Promise<void> {
    // Log checkpoints are signed with a dedicated "log" key (distinct from the
    // bundle signer) so tree-head trust and bundle-authorship trust are separable.
    let logKey = await trx("evidence_bundle_signing_keys")
      .where({ purpose: "log", status: "active" })
      .orderBy("valid_from", "desc")
      .first();
    if (!logKey) {
      const { privateKeyHex, publicKeyHex } = generateRawKeyPair();
      const keyId = `ebk_log_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
      [logKey] = await trx("evidence_bundle_signing_keys")
        .insert({
          key_id: keyId,
          algorithm: "ed25519",
          purpose: "log",
          public_key_hex: publicKeyHex,
          private_key_hex: privateKeyHex,
          status: "active",
        })
        .returning("*");
    }

    const timestamp = new Date().toISOString();
    const signature = signRaw(logKey.private_key_hex, signedTreeHeadMessage({ treeSize, rootHash, timestamp }));

    await trx("transparency_log_checkpoints")
      .insert({
        id: randomUUID(),
        log_id: LOG_ID,
        tree_size: treeSize,
        root_hash: rootHash,
        timestamp,
        log_key_id: logKey.key_id,
        log_public_key_hex: logKey.public_key_hex,
        signature,
      })
      .onConflict(["log_id", "tree_size"])
      .ignore();
  }

  // ── Bundle creation ────────────────────────────────────────────────────

  async createBundle(req: CreateBundleRequest): Promise<{ bundleId: string; evidenceRoot: string; logEntryIndex: number }> {
    const signerRow = await this.getActiveSigner("bundle_signer");
    const signer: SignerMetadata = {
      keyId: signerRow.key_id,
      algorithm: "ed25519",
      publicKeyHex: signerRow.public_key_hex,
      validFrom: toIso(signerRow.valid_from),
      validUntil: signerRow.valid_until ? toIso(signerRow.valid_until) : null,
      rotatesKeyId: signerRow.rotates_key_id ?? null,
      logEntryIndex:
        signerRow.log_entry_index === null || signerRow.log_entry_index === undefined
          ? null
          : Number(signerRow.log_entry_index),
    };

    const bundleId = `eb_${randomUUID().replace(/-/g, "")}`;
    const built = buildBundleCore({
      bundleId,
      subject: req.subject,
      sections: req.sections,
      finalityMetadata: req.finalityMetadata ?? null,
      decoderVersions: req.decoderVersions,
      codeVersion: req.codeVersion ?? null,
      configVersion: req.configVersion ?? null,
      queryParameters: req.queryParameters,
      derivedOutputs: req.derivedOutputs,
      signer,
    });

    const signature = signEvidenceRoot(signerRow.private_key_hex, built.evidenceRoot);

    const appended = await this.appendLogEntry(
      "evidence_bundle",
      bundleLogEntryData(built.core, built.evidenceRoot),
      bundleId,
    );

    await this.db()("evidence_bundles").insert({
      id: randomUUID(),
      bundle_id: bundleId,
      subject_type: req.subject.type,
      subject_id: req.subject.id,
      report_type: req.subject.reportType ?? null,
      period_start: req.subject.periodStart ?? null,
      period_end: req.subject.periodEnd ?? null,
      bundle_format_version: built.core.bundleFormatVersion,
      evidence_root: built.evidenceRoot,
      inputs_root: built.core.inputsRoot,
      signature,
      signer_key_id: signer.keyId,
      core_json: JSON.stringify(built.core),
      disclosed_sections_json: JSON.stringify(built.disclosedSections),
      disclosed_outputs_json: JSON.stringify(built.disclosedOutputs),
      log_entry_index: appended.logIndex,
      created_by: req.createdBy ?? null,
    });

    logger.info(
      { bundleId, evidenceRoot: built.evidenceRoot, logEntryIndex: appended.logIndex, subject: req.subject },
      "Created signed evidence bundle",
    );

    return { bundleId, evidenceRoot: built.evidenceRoot, logEntryIndex: appended.logIndex };
  }

  // ── Bundle retrieval / disclosure ──────────────────────────────────────

  private async loadBundleRow(bundleId: string): Promise<any> {
    const row = await this.db()("evidence_bundles").where({ bundle_id: bundleId }).first();
    if (!row) throw new Error(`evidence bundle ${bundleId} not found`);
    return row;
  }

  async getBundleDocument(
    bundleId: string,
    opts: { discloseSectionIds?: string[]; discloseOutputIds?: string[]; treeSize?: number } = {},
  ): Promise<EvidenceBundleDocument> {
    const row = await this.loadBundleRow(bundleId);
    const core = parseJson(row.core_json);
    const evidenceRoot: string = row.evidence_root;

    const full: EvidenceBundleDocument = {
      core,
      evidenceRoot,
      signature: row.signature,
      disclosedSections: parseJson(row.disclosed_sections_json),
      redactedSectionIds: [],
      disclosedOutputs: parseJson(row.disclosed_outputs_json),
      transparency: await this.buildTransparencyProof(core, evidenceRoot, Number(row.log_entry_index), opts.treeSize),
    };

    if (opts.discloseSectionIds) {
      return discloseSubset(full, opts.discloseSectionIds, opts.discloseOutputIds);
    }
    return full;
  }

  private async buildTransparencyProof(
    core: EvidenceBundleDocument["core"],
    evidenceRoot: string,
    entryIndex: number,
    treeSize?: number,
  ): Promise<TransparencyProof | null> {
    if (entryIndex === null || entryIndex === undefined || Number.isNaN(entryIndex)) return null;

    const checkpoint = await (treeSize
      ? this.db()("transparency_log_checkpoints").where({ log_id: LOG_ID, tree_size: treeSize }).first()
      : this.db()("transparency_log_checkpoints").where({ log_id: LOG_ID }).orderBy("tree_size", "desc").first());
    if (!checkpoint) return null;

    const size = Number(checkpoint.tree_size);
    const leafRows = await this.db()("transparency_log_entries")
      .where({ log_id: LOG_ID })
      .andWhere("log_index", "<", size)
      .orderBy("log_index", "asc")
      .select("log_index", "leaf_hash", "entry_data", "entry_type");
    const leaves = leafRows.map((r) => r.leaf_hash as string);

    const proof: TransparencyProof = {
      logId: LOG_ID,
      entryIndex,
      entryData: bundleLogEntryData(core, evidenceRoot),
      treeSize: size,
      rootHash: checkpoint.root_hash,
      inclusionProof: inclusionProofFromLeafHashes(entryIndex, leaves),
      signedTreeHead: {
        treeSize: size,
        rootHash: checkpoint.root_hash,
        timestamp: toIso(checkpoint.timestamp),
        logPublicKeyHex: checkpoint.log_public_key_hex,
        signature: checkpoint.signature,
      },
    };

    // Attach the signer key's registration (and revocation, if any) so a
    // verifier can confirm the key lifecycle straight from the log.
    const krRow = leafRows.find(
      (r) => r.entry_type === "key_registration" && parseJson(r.entry_data)?.keyId === core.signer.keyId,
    );
    if (krRow) {
      proof.keyRegistration = {
        entryIndex: Number(krRow.log_index),
        entryData: parseJson(krRow.entry_data) as KeyRegistrationEntryData,
        inclusionProof: inclusionProofFromLeafHashes(Number(krRow.log_index), leaves),
      };
    }
    const revRow = leafRows.find(
      (r) => r.entry_type === "key_revocation" && parseJson(r.entry_data)?.keyId === core.signer.keyId,
    );
    if (revRow) {
      proof.keyRevocation = {
        entryIndex: Number(revRow.log_index),
        entryData: parseJson(revRow.entry_data) as KeyRevocationEntryData,
        inclusionProof: inclusionProofFromLeafHashes(Number(revRow.log_index), leaves),
      };
    }

    return proof;
  }

  async verifyBundle(bundleId: string): Promise<VerificationResult> {
    const doc = await this.getBundleDocument(bundleId);
    return verifyEvidenceBundle(doc, { requireTransparency: true });
  }

  // ── Proofs / log reads ─────────────────────────────────────────────────

  async getLatestCheckpoint(): Promise<any | null> {
    const cp = await this.db()("transparency_log_checkpoints")
      .where({ log_id: LOG_ID })
      .orderBy("tree_size", "desc")
      .first();
    if (!cp) return null;
    return {
      logId: LOG_ID,
      treeSize: Number(cp.tree_size),
      rootHash: cp.root_hash,
      timestamp: toIso(cp.timestamp),
      logKeyId: cp.log_key_id,
      logPublicKeyHex: cp.log_public_key_hex,
      signature: cp.signature,
    };
  }

  private async leafHashesUpTo(size: number): Promise<string[]> {
    const rows = await this.db()("transparency_log_entries")
      .where({ log_id: LOG_ID })
      .andWhere("log_index", "<", size)
      .orderBy("log_index", "asc")
      .select("leaf_hash");
    return rows.map((r) => r.leaf_hash as string);
  }

  async getCurrentTreeSize(): Promise<number> {
    const row = await this.db()("transparency_log_entries").where({ log_id: LOG_ID }).max("log_index as maxIndex").first();
    const max = row?.maxIndex;
    return max === null || max === undefined ? 0 : Number(max) + 1;
  }

  async getInclusionProof(logIndex: number, treeSize?: number): Promise<{
    logIndex: number;
    treeSize: number;
    leafHash: string;
    rootHash: string;
    inclusionProof: string[];
  }> {
    const size = treeSize ?? (await this.getCurrentTreeSize());
    if (logIndex < 0 || logIndex >= size) throw new Error(`logIndex ${logIndex} not in tree of size ${size}`);
    const leaves = await this.leafHashesUpTo(size);
    return {
      logIndex,
      treeSize: size,
      leafHash: leaves[logIndex],
      rootHash: rootHexFromLeafHashes(leaves),
      inclusionProof: inclusionProofFromLeafHashes(logIndex, leaves),
    };
  }

  async getConsistencyProof(firstSize: number, secondSize?: number): Promise<{
    firstSize: number;
    secondSize: number;
    firstRoot: string;
    secondRoot: string;
    consistencyProof: string[];
    valid: boolean;
  }> {
    const second = secondSize ?? (await this.getCurrentTreeSize());
    if (firstSize <= 0 || firstSize > second) throw new Error(`firstSize ${firstSize} out of range (0, ${second}]`);
    const secondLeaves = await this.leafHashesUpTo(second);
    const firstLeaves = secondLeaves.slice(0, firstSize);
    const firstRoot = rootHexFromLeafHashes(firstLeaves);
    const secondRoot = rootHexFromLeafHashes(secondLeaves);
    const consistencyProof = consistencyProofFromLeafHashes(firstSize, secondLeaves);
    return {
      firstSize,
      secondSize: second,
      firstRoot,
      secondRoot,
      consistencyProof,
      valid: verifyConsistencyProof(firstSize, second, consistencyProof, firstRoot, secondRoot),
    };
  }

  async listLogEntries(opts: { entryType?: string; limit?: number; offset?: number } = {}): Promise<any[]> {
    let q = this.db()("transparency_log_entries").where({ log_id: LOG_ID }).orderBy("log_index", "asc");
    if (opts.entryType) q = q.where({ entry_type: opts.entryType });
    q = q.offset(opts.offset ?? 0).limit(Math.min(opts.limit ?? 100, 1000));
    return (await q).map((r) => ({
      logIndex: Number(r.log_index),
      entryType: r.entry_type,
      leafHash: r.leaf_hash,
      entryData: parseJson(r.entry_data),
      treeSize: Number(r.tree_size),
      rootHash: r.root_hash,
      bundleId: r.bundle_id,
      createdAt: toIso(r.created_at),
    }));
  }

  async listBundles(opts: { subjectType?: string; subjectId?: string; limit?: number; offset?: number } = {}): Promise<any[]> {
    let q = this.db()("evidence_bundles").orderBy("created_at", "desc");
    if (opts.subjectType) q = q.where({ subject_type: opts.subjectType });
    if (opts.subjectId) q = q.where({ subject_id: opts.subjectId });
    q = q.offset(opts.offset ?? 0).limit(Math.min(opts.limit ?? 50, 500));
    return (await q).map((r) => ({
      bundleId: r.bundle_id,
      subjectType: r.subject_type,
      subjectId: r.subject_id,
      reportType: r.report_type,
      evidenceRoot: r.evidence_root,
      inputsRoot: r.inputs_root,
      signerKeyId: r.signer_key_id,
      logEntryIndex: r.log_entry_index === null ? null : Number(r.log_entry_index),
      createdAt: toIso(r.created_at),
    }));
  }
}

// Helpers ────────────────────────────────────────────────────────────────

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return new Date(v).toISOString();
  if (typeof v === "number") return new Date(v).toISOString();
  return new Date().toISOString();
}

function parseJson(v: unknown): any {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return JSON.parse(v);
  return v;
}

// Re-export canonical bytes for callers that need to hash their own outputs.
export { canonicalBytes, computeEvidenceRoot, verifyEvidenceBundle };

export const evidenceBundleService = new EvidenceBundleService();
