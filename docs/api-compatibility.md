# API Compatibility Gateway

Bridge-Watch clients can pin and inspect their response contract independently of the URL version. The URL remains `/api/v1`, while contract negotiation supports either header below:

```http
Accept: application/vnd.bridge-watch.v1+json
X-API-Version: v1
```

`X-API-Version` takes precedence when both headers are present. Requests without either header receive the current contract. Unsupported versions return `406 Not Acceptable` with `UNSUPPORTED_API_VERSION` and the supported version list.

Every API response includes:

```http
X-API-Version: v1
X-API-Contract: <sha-256 fingerprint>
Vary: Accept, X-API-Version
```

Deprecated contracts additionally include `Deprecation: true` and an RFC 7231 `Sunset` timestamp. Lifecycle dates are defined once in `backend/src/api/compatibility/contracts.ts`, ensuring all routes emit the same policy.

## Discovery

- `GET /api/v1/compatibility/versions` lists supported contracts and fingerprints.
- `GET /api/v1/compatibility/contract?version=v1` returns the complete contract.
- `GET /api/v1/compatibility/capabilities?version=v1` returns field and migration capabilities.

The fingerprint is a SHA-256 digest of a recursively key-sorted contract. Clients can compare it with fixtures without depending on JSON property order.

## Stable Formats

Version `v1` uses page/limit pagination. The default limit is 20, the maximum is 100, and totals are JSON integers.

Errors use JSON objects with `error`, `message`, and optional `statusCode` fields. New optional fields are additive; removing or changing an existing field is incompatible.

Timestamps use RFC 3339 in UTC. Producers should emit a `Z` suffix, and consumers must not infer a local timezone.

Ordinary measurements use JSON numbers with IEEE-754 double precision. Values that require exact decimal or integer precision, including asset amounts and ledger-scale identifiers, use decimal strings.

## Contract Checks

`contracts/api-compatibility.json` is the source for generated frontend and SDK fixtures. Run `npm run generate:api-contract` after changing it. `npm run check:api-contract` ensures every supported fixture exists in the backend registry with the same media type and that both generated copies are current. CI runs this check before builds and tests, so an incompatible removal, stale fixture, or media-type change fails the pull request.

## Breaking Migrations

For renamed domain fields, use `dualRead` and `dualWrite` from `backend/src/api/compatibility/migration.ts` during the published deprecation window. Writes populate both representations; reads prefer the current field and fall back to the legacy field. Remove the legacy representation only after its contract sunset date.
