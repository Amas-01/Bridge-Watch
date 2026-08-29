/**
 * Deterministic ("canonical") JSON serialization.
 *
 * Two verifiers on different machines must derive byte-identical bytes from the
 * same logical value, otherwise hash commitments and signatures over a bundle
 * are not portable. Rules (a pragmatic subset of RFC 8785 / JCS):
 *
 *   - object keys are emitted in ascending UTF-16 code-unit order
 *   - no insignificant whitespace
 *   - `undefined` object properties are dropped; `undefined` array items become null
 *   - numbers are emitted via the shortest round-trip form (JSON.stringify)
 *   - non-finite numbers are rejected (they have no portable JSON form)
 *
 * The same function is duplicated, byte-for-byte, in
 * `backend/scripts/verify-evidence-bundle.mjs` so an auditor can verify a bundle
 * with nothing but Node's standard library.
 */

export function canonicalize(value: unknown): string {
  if (value === null) return "null";

  const t = typeof value;

  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new Error("canonicalize: non-finite number is not serializable");
    }
    return JSON.stringify(value);
  }

  if (t === "boolean" || t === "string") return JSON.stringify(value);

  if (t === "bigint") return (value as bigint).toString();

  if (Array.isArray(value)) {
    const items = value.map((item) => (item === undefined ? "null" : canonicalize(item)));
    return `[${items.join(",")}]`;
  }

  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
    return `{${entries.join(",")}}`;
  }

  throw new Error(`canonicalize: unsupported value of type ${t}`);
}

/** Canonical bytes (UTF-8) of a value. */
export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(canonicalize(value), "utf8");
}
