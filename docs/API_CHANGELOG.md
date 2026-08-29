# Bridge Watch API Changelog

This document tracks all API changes, versioned updates, breaking changes, and migration notes for integrators.

**Last Updated:** August 24, 2026

---

## Versioning

This API follows semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes that require client updates
- **MINOR**: New features and additions (backward compatible)
- **PATCH**: Bug fixes and improvements (backward compatible)

---

## Unreleased

### New Features

#### External Source Response Archive (#1162)
- **Endpoints** (mounted at `/api/v1/sources/response-archive`):
  - `GET /` — list archived upstream responses; filters `sourceKey`, `subject`, `outcome`, `collectionRunId`, `from`, `to`; cursor paging via `limit` / `cursor`
  - `GET /stats` — aggregate counts by source and outcome
  - `GET /:id` — one response, metadata only
  - `GET /:id/body` — the raw archived body plus hash / size / truncation flag
  - `PATCH /:id/retention` — place (`retentionDays: null`) or release a legal hold
  - `POST /prune` — run a retention sweep now
- **Purpose**: trace a disputed price / supply / attestation value back to the exact raw response the external source returned at collection time
- **Authorization**: `archive:read` for reads, `admin:config` for `PATCH`/`prune` (no new scope)
- **Compatibility**: additive migration `external_source_responses`; feature is inert until collectors call `record()`; `EXTERNAL_SOURCE_ARCHIVE_ENABLED=false` disables capture while leaving the read API available
- See [external-source-response-archive.md](./external-source-response-archive.md)

---

## Version 1.6.0

**Release Date:** August 24, 2026

### New Features

#### API Changelog Diff Viewer
- **Endpoint**: `GET /api/v1/changelog/diff?from={version1}&to={version2}`
- **Purpose**: Compare API versions and view changes between releases
- **Response**: `{ fromVersion, toVersion, addedFeatures[], removedFeatures[], breakingChanges[], deprecated[] }`
- **Authorization**: Public read

#### Get All Changelog Versions
- **Endpoint**: `GET /api/v1/changelog/versions`
- **Purpose**: Retrieve list of all available API versions
- **Response**: `{ versions: ChangelogVersion[] }`
- **Authorization**: Public read

#### Get Version Details
- **Endpoint**: `GET /api/v1/changelog/versions/{version}`
- **Purpose**: Get detailed information about a specific version
- **Response**: Complete version metadata with all changes
- **Authorization**: Public read

#### Community Annotation Moderation
- **Endpoint**: `POST /api/v1/moderation/{annotationId}/moderate`
- **Purpose**: Review and approve/reject community annotations
- **Request Body**: `{ action: "approve|reject|review", reason?: string, moderatorId: string }`
- **Authorization**: Moderator role required

#### Get Pending Review Annotations
- **Endpoint**: `GET /api/v1/moderation/pending-reviews`
- **Purpose**: Retrieve annotations awaiting moderation review
- **Response**: `{ reviews: PendingAnnotation[] }`
- **Authorization**: Moderator role required

#### Get Moderation History
- **Endpoint**: `GET /api/v1/moderation/{annotationId}/history`
- **Purpose**: View audit trail of moderation actions on an annotation
- **Response**: `{ history: ModerationLog[] }`
- **Authorization**: Public read

#### Public Dataset Registration
- **Endpoint**: `POST /api/v1/datasets/register`
- **Purpose**: Register new public dataset for publication
- **Request Body**: `{ name, description, category, accessLevel }`
- **Response**: `{ id, name, description, category, version, accessLevel }`
- **Authorization**: Admin only

#### Publish Dataset
- **Endpoint**: `POST /api/v1/datasets/{datasetId}/publish`
- **Purpose**: Publish dataset to public access
- **Response**: `{ id, datasetId, status, retryCount }`
- **Authorization**: Admin only

#### Get Public Datasets
- **Endpoint**: `GET /api/v1/datasets/public?limit=50&offset=0`
- **Purpose**: List all publicly available datasets
- **Response**: `{ datasets: PublicDataset[], limit, offset }`
- **Authorization**: Public read

#### Get Dataset Details
- **Endpoint**: `GET /api/v1/datasets/{datasetId}`
- **Purpose**: Retrieve detailed information about a dataset
- **Response**: Complete dataset metadata
- **Authorization**: Public read for public datasets

#### Incident Evidence Search
- **Endpoint**: `GET /api/v1/evidence/search?q=query&incidentId=INC&severity=high&tags=tag1,tag2`
- **Purpose**: Full-text search incident evidence with filtering
- **Response**: `{ results: EvidenceAnnotation[] }`
- **Authorization**: Public read

#### Add Evidence Annotation
- **Endpoint**: `POST /api/v1/evidence/add`
- **Purpose**: Create new evidence annotation for incident
- **Request Body**: `{ incidentId, content, author, severity, tags[], evidenceType }`
- **Response**: Complete annotation object
- **Authorization**: Analyst role required

#### Get Incident Evidence
- **Endpoint**: `GET /api/v1/evidence/incidents/{incidentId}`
- **Purpose**: Retrieve all evidence for specific incident
- **Response**: `{ evidence: EvidenceAnnotation[] }`
- **Authorization**: Public read

#### Update Evidence Annotation
- **Endpoint**: `PATCH /api/v1/evidence/{id}`
- **Purpose**: Modify existing evidence annotation
- **Request Body**: `{ content?, severity?, tags? }`
- **Response**: Updated annotation object
- **Authorization**: Author or admin only

#### Database Query Performance Explorer
- **Endpoint**: `POST /api/v1/queries/log`
- **Purpose**: Log query execution performance metrics
- **Request Body**: `{ queryHash, queryText, databaseName, executionTimeMs, rowsAffected?, rowsScanned?, status?, errorMessage? }`
- **Authorization**: Internal service only

- **Endpoint**: `GET /api/v1/queries/analyze/:queryHash`
- **Purpose**: Analyze query performance and get recommendations
- **Response**: `{ id, queryHash, avgExecutionTimeMs, maxExecutionTimeMs, executionCount, recommendations[] }`
- **Authorization**: Public read

- **Endpoint**: `GET /api/v1/queries/slow`
- **Purpose**: List slow queries ordered by performance impact
- **Response**: `{ queries: QueryAnalysis[], limit, offset }`
- **Authorization**: Public read

- **Endpoint**: `POST /api/v1/queries/alerts`
- **Purpose**: Create performance alert
- **Request Body**: `{ queryHash, alertType, severity, thresholdMs, currentMs, description }`
- **Authorization**: Admin only

- **Endpoint**: `GET /api/v1/queries/alerts`
- **Purpose**: List active performance alerts
- **Response**: `{ alerts: SlowQueryAlert[], limit, offset }`
- **Authorization**: Public read

#### Deployment Drift Visualization
- **Endpoint**: `POST /api/v1/drift/snapshots`
- **Purpose**: Capture environment configuration snapshot
- **Request Body**: `{ environmentName, environmentType, snapshotVersion, configJson, deployedBy, deploymentTimestamp }`
- **Authorization**: Admin only

- **Endpoint**: `POST /api/v1/drift/detect`
- **Purpose**: Detect configuration drift between environments
- **Request Body**: `{ fromEnvironment, toEnvironment }`
- **Response**: `{ id, fromEnvironment, toEnvironment, driftType, driftScore, changedFields[], severity }`
- **Authorization**: Admin only

- **Endpoint**: `GET /api/v1/drift/environments/:envName/drifts`
- **Purpose**: List drifts for specific environment
- **Response**: `{ drifts: DeploymentDrift[], limit, offset }`
- **Authorization**: Public read

- **Endpoint**: `GET /api/v1/drift/unapproved`
- **Purpose**: List unapproved drift records
- **Response**: `{ drifts: DeploymentDrift[], limit, offset }`
- **Authorization**: Public read

- **Endpoint**: `POST /api/v1/drift/:driftId/approve`
- **Purpose**: Approve detected drift
- **Request Body**: `{ approvedBy }`
- **Authorization**: Admin only

#### Artifact Provenance Verification
- **Endpoint**: `POST /api/v1/artifacts/register`
- **Purpose**: Register artifact with provenance information
- **Request Body**: `{ artifactId, artifactName, artifactType, artifactHash, sourceRepository, sourceCommit, creatorId }`
- **Authorization**: Service account only

- **Endpoint**: `GET /api/v1/artifacts/:artifactId`
- **Purpose**: Get artifact details and metadata
- **Response**: Complete artifact provenance record
- **Authorization**: Public read

- **Endpoint**: `POST /api/v1/artifacts/:artifactId/actions`
- **Purpose**: Record action in artifact chain (created, verified, signed, deployed, revoked)
- **Request Body**: `{ action, actorId, signature? }`
- **Authorization**: Service account only

- **Endpoint**: `GET /api/v1/artifacts/:artifactId/chain`
- **Purpose**: Get artifact audit trail/provenance chain
- **Response**: `{ chain: ArtifactChainRecord[], limit, offset }`
- **Authorization**: Public read

- **Endpoint**: `POST /api/v1/artifacts/:artifactId/verify`
- **Purpose**: Record artifact verification result
- **Request Body**: `{ verificationType, status, findings[], riskLevel, verifiedBy }`
- **Authorization**: Service account only

- **Endpoint**: `GET /api/v1/artifacts/:artifactId/verifications`
- **Purpose**: List all verifications for artifact
- **Response**: `{ verifications: VerificationResult[], limit, offset }`
- **Authorization**: Public read

#### Release Compatibility Matrix
- **Endpoint**: `POST /api/v1/compatibility`
- **Purpose**: Create compatibility record between versions
- **Request Body**: `{ sourceVersion, targetVersion, compatibilityStatus, migrationPathAvailable?, migrationGuideUrl?, breakingChanges[], deprecations[], testCoverage? }`
- **Authorization**: Admin only

- **Endpoint**: `GET /api/v1/compatibility/:sourceVersion/:targetVersion`
- **Purpose**: Get compatibility record between two versions
- **Response**: Complete compatibility record with breaking changes and deprecations
- **Authorization**: Public read

- **Endpoint**: `GET /api/v1/compatibility/matrix/:releaseVersion`
- **Purpose**: Get compatibility matrix for a release
- **Response**: `{ releaseVersion, compatibleVersions[], incompatibleVersions[], partialVersions[], overallScore }`
- **Authorization**: Public read

- **Endpoint**: `POST /api/v1/compatibility/tests`
- **Purpose**: Record compatibility test result
- **Request Body**: `{ sourceVersion, targetVersion, testId, testName, testCategory, status, executionTimeMs?, errorMessage? }`
- **Authorization**: Service account only

- **Endpoint**: `GET /api/v1/compatibility/tests/:sourceVersion/:targetVersion`
- **Purpose**: Get test results for version pair
- **Response**: `{ results: TestResult[], limit, offset }`
- **Authorization**: Public read

### Changes

- All new endpoints are additive and backward compatible
- New database tables added: query performance, drift tracking, artifact provenance, release compatibility
- Enhanced monitoring and observability for system operations
- Comprehensive audit trails for compliance and debugging
- Improved deployment safety with drift detection
- Supply chain security with artifact provenance tracking

### Backward Compatibility

All new endpoints are additive. Existing endpoints (v1.0.0 - v1.5.0) remain unchanged and fully functional.

---

## Version 1.5.0

**Release Date:** May 29, 2026

### New Features

#### Frozen Asset Controls
- **Endpoint**: `POST /api/assets/{assetCode}/freeze`
- **Purpose**: Prevent updates to unsafe or deprecated assets
- **Request Body**: `{ reason: string }`
- **Response**: `{ asset_code: string, is_frozen: boolean, frozen_at: timestamp }`
- **Authorization**: Admin only

#### Check Asset Freeze Status
- **Endpoint**: `GET /api/assets/{assetCode}/frozen`
- **Purpose**: Query current freeze state of an asset
- **Response**: `{ asset_code: string, is_frozen: boolean, frozen_by: address, frozen_at: timestamp, reason: string }`
- **Authorization**: Public read

#### Unfreeze Assets
- **Endpoint**: `POST /api/assets/{assetCode}/unfreeze`
- **Purpose**: Remove freeze restriction from an asset
- **Response**: `{ asset_code: string, is_frozen: boolean, unfrozen_at: timestamp }`
- **Authorization**: Admin only

#### State Export Functions
- **Endpoint**: `GET /api/export/state`
- **Purpose**: Export contract state snapshot for off-chain sync and auditing
- **Query Parameters**: 
  - `asset_code` (optional): Filter by specific asset
  - `format` (optional): `json` or `compact` (default: `json`)
- **Response**: `{ version: 1, exported_at: timestamp, state_hash: string, items: StateSnapshot[] }`
- **Authorization**: Public read

#### Asset State Snapshot
- **Endpoint**: `GET /api/export/assets/{assetCode}/snapshot`
- **Purpose**: Get detailed state snapshot for a specific asset
- **Response**: Includes all asset metadata, chain links, oracle feeds, bridge associations, pool associations, and freeze state
- **Authorization**: Public read

### Changes

- Added `is_frozen` field to all asset metadata responses
- Added `FrozenAsset` data structure to schema definitions
- Updated asset update operations to validate freeze status

### Backward Compatibility

All new endpoints are additive. Existing endpoints unchanged.

---

## Version 1.4.0

**Release Date:** May 15, 2026

### New Features

#### Whitelist Management
- **Endpoint**: `POST /api/whitelist/add`
- **Purpose**: Add asset code to whitelist
- **Request Body**: `{ asset_code: string }`
- **Authorization**: Admin only

#### Asset Category Filtering
- **Endpoint**: `GET /api/assets/category/{category}`
- **Purpose**: Retrieve all assets in a specific category
- **Categories**: `stablecoin`, `real-world-asset`, `native`, `bridged`, `wrapped`, `other`
- **Response**: `Asset[]`
- **Authorization**: Public read

#### Asset Status Filtering
- **Endpoint**: `GET /api/assets/status/{status}`
- **Purpose**: Retrieve assets by lifecycle status
- **Statuses**: `active`, `paused`, `deprecated`, `pending-review`
- **Authorization**: Public read

### Changes

- Added category indices for faster asset filtering
- Added status indices for lifecycle management

---

## Version 1.3.0

**Release Date:** May 1, 2026

### New Features

#### Compliance Tracking
- **Endpoint**: `POST /api/assets/{assetCode}/compliance`
- **Purpose**: Update compliance status and record audit information
- **Request Body**: 
  ```json
  {
    "status": "compliant|under-review|non-compliant|pending|exempt",
    "jurisdiction": "US|EU|GLOBAL",
    "framework": "SOC2|MiCA|other",
    "last_audit_date": timestamp,
    "next_audit_date": timestamp,
    "notes": "string"
  }
  ```
- **Authorization**: Admin only

#### Compliance Records Query
- **Endpoint**: `GET /api/assets/{assetCode}/compliance`
- **Response**: `ComplianceRecord[]`
- **Authorization**: Public read

---

## Version 1.2.0

**Release Date:** April 15, 2026

### New Features

#### Risk Management
- **Endpoint**: `POST /api/assets/{assetCode}/risk`
- **Purpose**: Update risk classification and score
- **Request Body**: 
  ```json
  {
    "risk_rating": "low|medium|high|critical",
    "risk_score_bps": number (0-10000)
  }
  ```
- **Authorization**: Admin only

#### Multi-Chain Linking
- **Endpoint**: `POST /api/assets/{assetCode}/chains`
- **Purpose**: Link asset to blockchain
- **Request Body**:
  ```json
  {
    "chain_id": "ethereum|stellar|polygon|etc",
    "contract_address": "string",
    "is_canonical": boolean
  }
  ```
- **Authorization**: Admin only

#### Oracle Feed Registration
- **Endpoint**: `POST /api/assets/{assetCode}/oracle-feeds`
- **Purpose**: Register price feed for asset
- **Request Body**:
  ```json
  {
    "feed_id": "string",
    "provider": "Chainlink|Band|other",
    "chain_id": "string",
    "contract_address": "string"
  }
  ```
- **Authorization**: Admin only

---

## Version 1.1.0

**Release Date:** April 1, 2026

### New Features

#### Asset Metadata Versioning
- **Endpoint**: `GET /api/assets/{assetCode}/versions`
- **Purpose**: Retrieve historical metadata snapshots
- **Response**: `MetadataVersion[]` with version history

#### Specific Version Lookup
- **Endpoint**: `GET /api/assets/{assetCode}/versions/{version}`
- **Purpose**: Get metadata at specific version
- **Response**: `MetadataVersion`

### Changes

- All metadata updates now create versioned snapshots
- Added version field to AssetMetadata

---

## Version 1.0.0

**Release Date:** March 15, 2026

### Core Features

#### Asset Registration
- **Endpoint**: `POST /api/assets`
- **Request Body**:
  ```json
  {
    "asset_code": "string",
    "name": "string",
    "symbol": "string",
    "issuer": "string",
    "decimals": number,
    "category": "string",
    "description": "string",
    "url": "string"
  }
  ```

#### Asset Retrieval
- **Endpoint**: `GET /api/assets/{assetCode}`
- **Response**: Complete asset metadata

#### Asset List
- **Endpoint**: `GET /api/assets`
- **Response**: `Asset[]`

#### Metadata Update
- **Endpoint**: `POST /api/assets/{assetCode}/metadata`
- **Authorization**: Admin only

#### Bridge Association
- **Endpoint**: `POST /api/assets/{assetCode}/bridges`
- **Purpose**: Link bridge contract to asset

#### Liquidity Pool Association
- **Endpoint**: `POST /api/assets/{assetCode}/pools`
- **Purpose**: Associate liquidity pool with asset

---

## Breaking Changes

### None in Current Version

All updates from v1.0.0 to v1.5.0 are backward compatible.

---

## Migration Guides

Use [Migration Notes Template](./migration-notes-template.md) for new release entries that require migration context.

### Migrating to v1.5.0 from v1.4.0

**No migration required.** The frozen asset controls are new, optional features.

Optional: If you manage assets that should be frozen, use the new freeze endpoints:
```bash
curl -X POST https://api.bridgewatch.io/api/assets/RISKY/freeze \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"reason": "Asset deprecated"}'
```

### Migrating to v1.2.0 from v1.1.0

**Breaking Change**: Risk scoring now uses basis points (0-10000) instead of percentages.

**Migration**:
- Old: `risk_score: 50` (50%)
- New: `risk_score_bps: 5000` (50 basis points = 5000 bps)

```bash
# Before
curl -X POST https://api.bridgewatch.io/api/assets/USDC/risk \
  -d '{"risk_rating": "low", "risk_score": 15}'

# After
curl -X POST https://api.bridgewatch.io/api/assets/USDC/risk \
  -d '{"risk_rating": "low", "risk_score_bps": 1500}'
```

---

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Asset or resource not found |
| 409 | Conflict | Asset frozen or invalid state transition |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Internal error |

---

## Rate Limiting

All endpoints are rate limited at:
- **Public endpoints**: 1000 requests/hour per IP
- **Admin endpoints**: 100 requests/hour per token

Rate limit headers:
- `X-RateLimit-Limit`: Maximum requests in period
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## Authentication

**Admin Endpoints** require authentication via:

1. **Bearer Token**
   ```
   Authorization: Bearer <admin_token>
   ```

2. **Request Signing** (for contract calls)
   ```
   Signature: <signed_request_hash>
   ```

---

## Deprecation Policy

Deprecated endpoints will be supported for **12 months** before removal.

Deprecation notice format:
```
Deprecation-Warning: endpoint=old_endpoint, replacement=new_endpoint, removal_date=2027-05-29
```

---

## Support and Documentation

- **API Documentation**: https://docs.bridgewatch.io/api
- **Status Page**: https://status.bridgewatch.io
- **Support**: https://support.bridgewatch.io
- **Issues**: https://github.com/StellaBridge/Bridge-Watch/issues
