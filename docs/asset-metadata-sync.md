# Asset Metadata Sync

This document defines the sync rules for asset metadata in Bridge-Watch.

## Overview

Asset metadata is synchronized from trusted source adapters and stored in `asset_metadata`.
Each sync attempt is persisted in `asset_metadata_sync_runs` for auditing and failure tracking.

## Trusted Sources and Priority

By default, the source priority is:

1. `static-registry`
2. `coingecko`
3. `stellar-expert`

Conflict resolution is deterministic:

- If multiple sources provide different values for the same field, the highest-priority source wins.
- The conflicting field names are recorded in `asset_metadata_sync_runs.conflicts`.

## Provider Allowlist

Asset metadata sync respects the provider allowlist. When at least one allowlist
entry exists, only providers explicitly allowed are used for external metadata
fetches. The built-in static registry remains available regardless of allowlist
state.

Provider keys for metadata sources:

- `coingecko`
- `stellar-expert`

Allowlist endpoints:

- `GET /api/v1/providers/allowlist`
- `GET /api/v1/providers/allowlist/:providerKey`
- `PUT /api/v1/admin/providers/allowlist/:providerKey`
- `DELETE /api/v1/admin/providers/allowlist/:providerKey`

## Supported Sync Fields

The selective refresh engine supports:

- `logo_url`
- `description`
- `website_url`
- `documentation_url`
- `category`
- `tags`
- `social_links`
- `token_specifications`

When `fields` are provided in the admin sync endpoint, only those fields are refreshed.

## Validation Rules

The sync pipeline validates:

- URL format for website, docs, social links, and logo URLs.
- Image URLs via `HEAD` request (`content-type` must start with `image/`).

If image validation fails, the logo update is skipped and the reason is recorded as sync error details.

## Manual Overrides

Manual overrides can be set per asset metadata record.

- If `manual_override=true`, scheduled/admin sync is skipped unless `force=true`.
- Override changes are versioned in `asset_metadata_versions`.

## Change History

Two history streams are available:

- `asset_metadata_versions`: field revision history and actor.
- `asset_metadata_sync_runs`: sync execution history, source stats, conflicts, and errors.

## Failure Alerts

A sync failure writes:

- `asset_metadata.last_sync_status = failed`
- `asset_metadata.last_sync_error`
- a failed row in `asset_metadata_sync_runs`
- an error log with message `ASSET_METADATA_SYNC_FAILURE`

## Admin Controls

Endpoints:

- `POST /api/v1/metadata/admin/sync` to trigger full or selective refresh
- `POST /api/v1/metadata/:assetId/override` to set or clear manual overrides
- `GET /api/v1/metadata/symbol/:symbol/sync-history` to inspect sync runs
