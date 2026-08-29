# Signed Evidence Bundles & Append-Only Transparency Log

> Issue #1019 — Evidence, reports, and compliance.

A **signed evidence bundle** is a portable, independently verifiable proof of
*exactly* which raw observations, code/config versions, decoder versions, query
parameters and chain-finality metadata produced a report or export. Every bundle
commitment is also appended to an **append-only transparency log** (an RFC 6962
Merkle tree) that publishes inclusion and consistency proofs, so an auditor can
show a bundle existed at a point in time and that the log was never rewritten.

Nothing in verification requires trusting the Bridge Watch database: the bundle
document carries the signer's public key, the log's signed tree head, and all
Merkle proof material.

## Components

| Piece | Where |
| --- | --- |
| Pure canonicalization / Merkle / Ed25519 / bundle logic | `backend/src/services/transparencyLog/*` |
| Database service (keys, log append, proofs, disclosure) | `backend/src/services/evidenceBundle.service.ts` |
| REST API (`/api/v1/evidence`) | `backend/src/api/routes/evidenceBundle.routes.ts` |
| Schema | `backend/src/database/migrations/20260829100000_signed_evidence_bundles.ts` |
| Standalone offline verifier (stdlib only) | `backend/scripts/verify-evidence-bundle.mjs` |

## Bundle document

```jsonc
{
  "core": {                       // everything below is canonicalized + hashed => evidenceRoot
    "bundleId": "eb_…",
    "bundleFormatVersion": "1.0",
    "subject": { "type": "compliance_report", "id": "rep_123", "reportType": "bridge_activity" },
    "createdAt": "2026-06-01T00:00:00.000Z",
    "inputsRoot": "<merkle root over section commitments>",
    "sectionCommitments": [
      { "sectionId": "raw_observations", "mediaType": "application/json",
        "label": "raw_observations", "contentHash": "sha256(salt || canonical(value))" }
    ],
    "finalityMetadata": { "chain": "stellar", "observedLedger": 55000010,
                          "finalizedLedger": 55000005, "confirmations": 5,
                          "finalityThreshold": 1, "finalized": true, "observedAt": "…" },
    "decoderVersions": { "stellar-xdr": "21.2.0", "evm-abi": "6.13.4" },
    "codeVersion":  { "gitCommit": "5d30d8d" },
    "configVersion": { "hash": "cfg_…", "version": 42 },
    "queryParameters": { "periodStart": "2026-05-01", "periodEnd": "2026-06-01" },
    "derivedOutputs": [ { "outputId": "report_pdf", "mediaType": "application/pdf",
                          "label": "report_pdf", "outputHash": "sha256(canonical(value))" } ],
    "signer": { "keyId": "ebk_…", "algorithm": "ed25519", "publicKeyHex": "…",
                "validFrom": "…", "validUntil": null, "rotatesKeyId": null, "logEntryIndex": 0 }
  },
  "evidenceRoot": "sha256(canonical(core))",
  "signature": "ed25519(privateKey, evidenceRoot)",   // hex

  "disclosedSections": [ { "sectionId": "…", "saltHex": "…", "value": … } ],
  "redactedSectionIds": [ "…" ],
  "disclosedOutputs":  [ { "outputId": "…", "value": … } ],

  "transparency": {
    "entryIndex": 1,
    "entryData": { "type": "evidence_bundle", "bundleId": "eb_…",
                   "evidenceRoot": "…", "signerKeyId": "ebk_…" },
    "treeSize": 2,
    "rootHash": "…",
    "inclusionProof": [ "…" ],
    "signedTreeHead": { "treeSize": 2, "rootHash": "…", "timestamp": "…",
                        "logPublicKeyHex": "…", "signature": "…" },
    "keyRegistration": { "entryIndex": 0, "entryData": { "type": "key_registration", … },
                         "inclusionProof": [ "…" ] },
    "keyRevocation":   { … }   // present only if the signer key was later revoked
  }
}
```

### Hash / commitment rules

* **Canonical JSON** — RFC 8785 subset: object keys sorted by UTF-16 code unit,
  no whitespace, `undefined` dropped, non-finite numbers rejected.
* `contentHash` of an input section = `SHA-256(salt || canonicalJSON(value))`.
  The salt blinds low-entropy values that may be redacted.
* `inputsRoot` = RFC 6962 Merkle Tree Hash over
  `canonicalJSON({ sectionId, mediaType, contentHash })` leaves.
* `evidenceRoot` = `SHA-256(canonicalJSON(core))`. This is what gets **signed**
  and what gets **logged**.
* Transparency-log leaf hash = `SHA-256(0x00 || canonicalJSON(entryData))`;
  inner node = `SHA-256(0x01 || left || right)`.

Any change to any disclosed input, redacted commitment, derived output, decoder
version, query parameter or finality field changes `evidenceRoot`, which breaks
both the signature and the transparency-log inclusion proof.

## Partial disclosure

`GET /api/v1/evidence/bundles/:id/disclose?sections=chain_evidence&outputs=report_pdf`
returns the same `core`, `evidenceRoot` and `signature`, but only the requested
section values (with their salts). Redacted sections appear as
`redactedSectionIds` — the verifier still recomputes `inputsRoot` from the
commitments, so proof validity is preserved. A fully redacted bundle
(`?sections=`) still verifies down to the commitment level.

## Key rotation & revocation

Signer keys are Ed25519. Their lifecycle is itself recorded in the transparency
log:

* `key_registration` — appended when a signer key is first provisioned;
  `rotatesKeyId` links to the predecessor.
* `key_revocation` — appended by `POST /log/keys/:keyId/revoke`; the verifier
  flags any bundle signed at/after the revocation time.

`POST /api/v1/evidence/log/keys/rotate` supersedes the active signer (sets
`valid_until`, `superseded_by_key_id`) and registers a fresh key. Bundles pin the
`signer` metadata into the signed core, and the offline verifier checks
`createdAt` against `[validFrom, validUntil]`.

The log's **signed tree head** is signed with a separate `log`-purpose key so
tree-head trust and bundle-authorship trust are independent.

## REST endpoints (`/api/v1/evidence`)

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/bundles` | create a signed bundle for a report/export |
| `GET`  | `/bundles` | list bundles (`?subjectType=&subjectId=`) |
| `GET`  | `/bundles/:bundleId` | full bundle document |
| `GET`  | `/bundles/:bundleId/disclose` | partial-disclosure view |
| `GET`  | `/bundles/:bundleId/verify` | server-side offline verification report |
| `POST` | `/bundles/verify` | stateless verification of a supplied document |
| `GET`  | `/log` | transparency-log entries |
| `GET`  | `/log/checkpoint` | latest signed tree head |
| `GET`  | `/log/proof/inclusion` | `?logIndex=&treeSize=` |
| `GET`  | `/log/proof/consistency` | `?first=&second=` |
| `GET`  | `/log/keys` | signer keys with rotation / revocation |
| `POST` | `/log/keys/rotate` | rotate the active bundle signer |
| `POST` | `/log/keys/:keyId/revoke` | revoke a signer key |

Report and export responses/metadata link to a bundle via its `evidenceRoot`
(and `bundleId`); the PDF footer / REST payload carries the same root so a reader
can fetch `/api/v1/evidence/bundles/:bundleId` and verify.

## Verifying offline

```sh
# From a saved document
curl -s "$API/api/v1/evidence/bundles/eb_abc123" > bundle.json
node backend/scripts/verify-evidence-bundle.mjs bundle.json

# Or straight from the pipe
curl -s "$API/api/v1/evidence/bundles/eb_abc123" | node backend/scripts/verify-evidence-bundle.mjs -
```

The script depends only on the Node standard library and prints a PASS/FAIL line
per check (`section_hash`, `inputs_root`, `evidence_root`, `signature`,
`signer_validity`, `transparency_inclusion`, `signed_tree_head`,
`key_registration`, …). Exit code `0` = valid, `1` = invalid.

To check the log has not been rewritten between two observations, compare their
tree heads with a consistency proof:

```sh
curl -s "$API/api/v1/evidence/log/proof/consistency?first=12&second=487"
# { …, "valid": true }
```
