/**
 * Ed25519 helpers over raw 32-byte keys.
 *
 * Evidence bundles carry signer keys as raw hex (not PEM) so the wire format is
 * small and language-neutral. Node's `crypto` only ingests DER/PEM/JWK, so we
 * wrap the raw bytes in the fixed Ed25519 SPKI / PKCS#8 prefixes. Duplicated in
 * `backend/scripts/verify-evidence-bundle.mjs`.
 */

import { createPublicKey, createPrivateKey, generateKeyPairSync, sign, verify, type KeyObject } from "crypto";

const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex"); // 12 bytes, then 32-byte public key
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex"); // 16 bytes, then 32-byte seed

export function publicKeyFromRawHex(hex: string): KeyObject {
  const raw = Buffer.from(hex, "hex");
  if (raw.length !== 32) throw new Error(`ed25519 public key must be 32 bytes, got ${raw.length}`);
  return createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: "der", type: "spki" });
}

export function privateKeyFromRawHex(hex: string): KeyObject {
  const raw = Buffer.from(hex, "hex");
  if (raw.length !== 32) throw new Error(`ed25519 private key seed must be 32 bytes, got ${raw.length}`);
  return createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, raw]), format: "der", type: "pkcs8" });
}

export function rawPublicKeyHex(key: KeyObject): string {
  const der = key.export({ format: "der", type: "spki" }) as Buffer;
  return der.subarray(der.length - 32).toString("hex");
}

export function rawPrivateKeyHex(key: KeyObject): string {
  const der = key.export({ format: "der", type: "pkcs8" }) as Buffer;
  return der.subarray(der.length - 32).toString("hex");
}

export interface RawKeyPair {
  privateKeyHex: string;
  publicKeyHex: string;
}

export function generateRawKeyPair(): RawKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { privateKeyHex: rawPrivateKeyHex(privateKey), publicKeyHex: rawPublicKeyHex(publicKey) };
}

export function signRaw(privateKeyHex: string, message: Buffer): string {
  return sign(null, message, privateKeyFromRawHex(privateKeyHex)).toString("hex");
}

export function verifyRaw(publicKeyHex: string, message: Buffer, signatureHex: string): boolean {
  try {
    return verify(null, message, publicKeyFromRawHex(publicKeyHex), Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}
