#!/usr/bin/env node
/**
 * Standalone, offline verifier for a signed evidence bundle (#1019).
 *
 * Depends on nothing but the Node standard library. It never contacts the
 * Bridge Watch API or database — every commitment, signature and Merkle proof
 * is recomputed from the bundle document itself.
 *
 *   node scripts/verify-evidence-bundle.mjs path/to/bundle.json
 *   curl -s $API/api/v1/evidence/bundles/<id> | node scripts/verify-evidence-bundle.mjs -
 *
 * Exit code 0 = valid, 1 = invalid, 2 = usage error.
 *
 * The crypto below is intentionally a verbatim re-implementation of
 * backend/src/services/transparencyLog/{canonical,merkle,ed25519,evidenceBundle}.ts.
 */

import { createHash, createPublicKey, verify as edVerify } from "node:crypto";
import { readFileSync } from "node:fs";

// ── canonical JSON (RFC 8785 subset) ──────────────────────────────────────
function canonicalize(value) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number");
    return JSON.stringify(value);
  }
  if (t === "boolean" || t === "string") return JSON.stringify(value);
  if (t === "bigint") return value.toString();
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonicalize(v))).join(",")}]`;
  if (t === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
  }
  throw new Error(`unsupported type ${t}`);
}
const cbytes = (v) => Buffer.from(canonicalize(v), "utf8");

// ── hashing / merkle (RFC 6962) ──────────────────────────────────────────
const sha256 = (...parts) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest();
};
const hashLeaf = (d) => sha256(Buffer.from([0x00]), d);
const hashChildren = (l, r) => sha256(Buffer.from([0x01]), l, r);
const toBuf = (h) => (typeof h === "string" ? Buffer.from(h, "hex") : h);
const splitPoint = (n) => {
  let k = 1;
  while (k << 1 < n) k <<= 1;
  return k;
};
function merkleTreeHash(leaves) {
  const n = leaves.length;
  if (n === 0) return sha256(Buffer.alloc(0));
  if (n === 1) return hashLeaf(leaves[0]);
  const k = splitPoint(n);
  return hashChildren(merkleTreeHash(leaves.slice(0, k)), merkleTreeHash(leaves.slice(k)));
}
const bitLen = (x) => (x === 0 ? 0 : Math.floor(Math.log2(x)) + 1);
const onesCount = (x) => {
  let c = 0;
  while (x > 0) { c += x & 1; x = Math.floor(x / 2); }
  return c;
};
function decompose(index, size) {
  const inner = bitLen(index ^ (size - 1));
  return [inner, onesCount(Math.floor(index / 2 ** inner))];
}
function chainInner(seed, proof, index) {
  let acc = seed;
  for (let i = 0; i < proof.length; i++) {
    acc = (Math.floor(index / 2 ** i) & 1) === 0 ? hashChildren(acc, proof[i]) : hashChildren(proof[i], acc);
  }
  return acc;
}
function chainBorderRight(seed, proof) {
  let acc = seed;
  for (const h of proof) acc = hashChildren(h, acc);
  return acc;
}
function verifyInclusion(leafHash, index, treeSize, proof, root) {
  try {
    if (index >= treeSize) return false;
    const path = proof.map(toBuf);
    const [inner, border] = decompose(index, treeSize);
    if (path.length !== inner + border) return false;
    let res = chainInner(toBuf(leafHash), path.slice(0, inner), index);
    res = chainBorderRight(res, path.slice(inner));
    return res.equals(toBuf(root));
  } catch {
    return false;
  }
}

// ── ed25519 over raw 32-byte keys ────────────────────────────────────────
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
function verifyRaw(publicKeyHex, message, signatureHex) {
  try {
    const raw = Buffer.from(publicKeyHex, "hex");
    if (raw.length !== 32) return false;
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: "der", type: "spki" });
    return edVerify(null, message, key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

// ── bundle verification ──────────────────────────────────────────────────
const BUNDLE_FORMAT_VERSION = "1.0";
const sectionContentHash = (saltHex, value) => sha256(Buffer.from(saltHex, "hex"), cbytes(value)).toString("hex");
const sectionLeafBytes = (c) => cbytes({ sectionId: c.sectionId, mediaType: c.mediaType, contentHash: c.contentHash });
const computeInputsRoot = (commitments) => merkleTreeHash(commitments.map(sectionLeafBytes)).toString("hex");
const outputHashOf = (value) => sha256(cbytes(value)).toString("hex");
const computeEvidenceRoot = (core) => sha256(cbytes(core)).toString("hex");
const logLeafHashHex = (entryData) => hashLeaf(cbytes(entryData)).toString("hex");

function verifyEvidenceBundle(doc, opts = {}) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  const core = doc.core;

  add("format", core?.bundleFormatVersion === BUNDLE_FORMAT_VERSION, `version=${core?.bundleFormatVersion}`);

  const commitmentIds = (core?.sectionCommitments ?? []).map((c) => c.sectionId);
  const disclosedIds = (doc.disclosedSections ?? []).map((s) => s.sectionId);
  const redactedIds = doc.redactedSectionIds ?? [];
  const partitionOk =
    [...disclosedIds, ...redactedIds].length === commitmentIds.length &&
    new Set([...disclosedIds, ...redactedIds]).size === commitmentIds.length &&
    [...disclosedIds, ...redactedIds].every((id) => commitmentIds.includes(id));
  add("section_partition", partitionOk, `${disclosedIds.length} disclosed + ${redactedIds.length} redacted / ${commitmentIds.length}`);

  for (const s of doc.disclosedSections ?? []) {
    const commitment = core.sectionCommitments.find((c) => c.sectionId === s.sectionId);
    if (!commitment) { add("section_hash", false, `${s.sectionId}: no commitment`); continue; }
    const recomputed = sectionContentHash(s.saltHex, s.value);
    add("section_hash", recomputed === commitment.contentHash, `${s.sectionId}: ${recomputed === commitment.contentHash ? "ok" : "MISMATCH"}`);
  }

  const inputsRoot = computeInputsRoot(core.sectionCommitments ?? []);
  add("inputs_root", inputsRoot === core.inputsRoot, `${inputsRoot === core.inputsRoot ? "ok" : `${inputsRoot} != ${core.inputsRoot}`}`);

  for (const o of doc.disclosedOutputs ?? []) {
    const commitment = core.derivedOutputs.find((d) => d.outputId === o.outputId);
    if (!commitment) { add("output_hash", false, `${o.outputId}: no commitment`); continue; }
    add("output_hash", outputHashOf(o.value) === commitment.outputHash, `${o.outputId}: ${outputHashOf(o.value) === commitment.outputHash ? "ok" : "MISMATCH"}`);
  }

  const evidenceRoot = computeEvidenceRoot(core);
  const rootOk = evidenceRoot === doc.evidenceRoot;
  add("evidence_root", rootOk, rootOk ? "ok" : `${evidenceRoot} != ${doc.evidenceRoot}`);

  const sigOk = rootOk && verifyRaw(core.signer.publicKeyHex, Buffer.from(doc.evidenceRoot, "hex"), doc.signature);
  add("signature", sigOk, sigOk ? `valid ed25519 by ${core.signer.keyId}` : "INVALID");

  const asOf = opts.asOf ?? core.createdAt;
  const fromOk = new Date(asOf) >= new Date(core.signer.validFrom);
  const untilOk = !core.signer.validUntil || new Date(asOf) <= new Date(core.signer.validUntil);
  add("signer_validity", fromOk && untilOk, `valid at ${asOf}: from=${fromOk} until=${untilOk}`);

  const tp = doc.transparency;
  if (opts.requireTransparency && !tp) add("transparency", false, "missing");
  if (tp) {
    const eok =
      tp.entryData?.type === "evidence_bundle" &&
      tp.entryData.bundleId === core.bundleId &&
      tp.entryData.evidenceRoot === doc.evidenceRoot &&
      tp.entryData.signerKeyId === core.signer.keyId;
    add("transparency_entry", eok, eok ? "binds bundleId+evidenceRoot+signerKeyId" : "MISMATCH");

    add(
      "transparency_inclusion",
      verifyInclusion(logLeafHashHex(tp.entryData), tp.entryIndex, tp.treeSize, tp.inclusionProof, tp.rootHash),
      `entry ${tp.entryIndex} in tree ${tp.treeSize}`,
    );

    const sth = tp.signedTreeHead;
    const sthShapeOk = sth.treeSize === tp.treeSize && sth.rootHash === tp.rootHash;
    const sthMsg = cbytes({ treeSize: sth.treeSize, rootHash: sth.rootHash, timestamp: sth.timestamp });
    add("signed_tree_head", sthShapeOk && verifyRaw(sth.logPublicKeyHex, sthMsg, sth.signature), sthShapeOk ? "signed" : "shape mismatch");

    if (tp.keyRegistration) {
      const kr = tp.keyRegistration;
      const dataOk =
        kr.entryData.type === "key_registration" &&
        kr.entryData.keyId === core.signer.keyId &&
        kr.entryData.publicKeyHex === core.signer.publicKeyHex &&
        kr.entryData.algorithm === core.signer.algorithm &&
        kr.entryData.rotatesKeyId === core.signer.rotatesKeyId;
      const inclOk = verifyInclusion(logLeafHashHex(kr.entryData), kr.entryIndex, tp.treeSize, kr.inclusionProof, tp.rootHash);
      add("key_registration", dataOk && inclOk, dataOk && inclOk ? `registered @ ${kr.entryIndex}` : "INVALID");
    }
    if (tp.keyRevocation) {
      const rev = tp.keyRevocation;
      const inclOk = verifyInclusion(logLeafHashHex(rev.entryData), rev.entryIndex, tp.treeSize, rev.inclusionProof, tp.rootHash);
      const afterUse = new Date(rev.entryData.revokedAt) >= new Date(core.createdAt);
      add("key_revocation", inclOk && afterUse, inclOk ? `revoked ${rev.entryData.revokedAt} (${afterUse ? "after" : "BEFORE"} signing)` : "INVALID");
    }
  }

  return { valid: checks.every((c) => c.ok), bundleId: core?.bundleId, evidenceRoot: doc.evidenceRoot, checks };
}

// ── CLI ──────────────────────────────────────────────────────────────────
const arg = process.argv[2];
if (!arg) {
  console.error("usage: verify-evidence-bundle.mjs <bundle.json | ->");
  process.exit(2);
}
let raw;
try {
  raw = arg === "-" ? readFileSync(0, "utf8") : readFileSync(arg, "utf8");
} catch (e) {
  console.error(`cannot read input: ${e.message}`);
  process.exit(2);
}
let payload;
try {
  payload = JSON.parse(raw);
} catch (e) {
  console.error(`invalid JSON: ${e.message}`);
  process.exit(2);
}
// Accept either a bare document or an API envelope ({ data: <document> }).
const doc = payload.core ? payload : payload.data;
if (!doc || !doc.core) {
  console.error("input does not look like an evidence bundle document");
  process.exit(2);
}

const result = verifyEvidenceBundle(doc, { requireTransparency: Boolean(doc.transparency) });
for (const c of result.checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name.padEnd(24)} ${c.detail}`);
}
console.log(`\nbundle ${result.bundleId}`);
console.log(`evidence root ${result.evidenceRoot}`);
console.log(result.valid ? "\nBUNDLE VALID" : "\nBUNDLE INVALID");
process.exit(result.valid ? 0 : 1);
