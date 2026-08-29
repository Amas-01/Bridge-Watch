# Trustline Distribution Analytics

Trustline Distribution Analytics tracks and analyzes Stellar asset trustline distributions, balances, concentration metrics, and historical counts.

## Data Model

### `trustline_snapshots`
Represents snapshot metrics of trustline counts and balances.
- `id` (UUID): Primary key.
- `asset_code` (string): Stellar asset code (e.g. `FOBXX`).
- `asset_issuer` (string, 56 chars): Stellar address of the asset issuer.
- `total_trustlines` (integer): Total trustlines established for the asset.
- `active_trustlines` (integer): Active trustlines with non-zero balances.
- `total_balance` (decimal): Aggregated balance of all trustlines.
- `snapshot_at` (timestamp): Time at which the snapshot was taken.
- `created_at` (timestamp): Insertion time.

### `trustline_concentration_metrics`
Concentration percentiles of asset distribution among trustline holders.
- `id` (UUID): Primary key.
- `snapshot_id` (UUID): References `trustline_snapshots.id`.
- `percentile` (string): Percentile representation (e.g. `top_10`, `top_50`, `top_100`).
- `balance_percentage` (decimal): Percentage of total supply held by this percentile.
- `created_at` (timestamp): Insertion time.

## API Endpoints

### 1. Record Trustline Snapshot
- **Method**: `POST`
- **Path**: `/api/v1/trustlines/snapshots`
- **Headers**:
  - `x-api-key`: Admin API key required.
- **Request Body**:
  ```json
  {
    "assetCode": "FOBXX",
    "assetIssuer": "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
    "totalTrustlines": 1000,
    "activeTrustlines": 800,
    "totalBalance": 15000000.5,
    "concentration": [
      { "percentile": "top_10", "balancePercentage": 65.4 },
      { "percentile": "top_100", "balancePercentage": 95.2 }
    ]
  }
  ```
- **Response**: `201 Created`

### 2. Get Latest Report
- **Method**: `GET`
- **Path**: `/api/v1/trustlines/latest`
- **Query Parameters**:
  - `assetCode`: Asset code (e.g., `FOBXX`).
  - `assetIssuer`: Issuer address.
- **Response**: `200 OK`
  ```json
  {
    "snapshot": {
      "id": "uuid-1",
      "assetCode": "FOBXX",
      "assetIssuer": "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
      "totalTrustlines": 1000,
      "activeTrustlines": 800,
      "totalBalance": 15000000.5,
      "snapshotAt": "2026-08-26T21:00:00.000Z"
    },
    "concentration": [
      {
        "id": "uuid-c1",
        "snapshotId": "uuid-1",
        "percentile": "top_10",
        "balancePercentage": 65.4
      }
    ]
  }
  ```

### 3. Get Historical Snapshots
- **Method**: `GET`
- **Path**: `/api/v1/trustlines/history`
- **Query Parameters**:
  - `assetCode`: Asset code.
  - `assetIssuer`: Issuer address.
  - `limit`: (Optional) Limit count.
- **Response**: `200 OK`

---

## Operational Guide

### Rollout Plan
1. **Migration**: Run `npm run knex migrate:latest` to create the schema.
2. **Configuration**: No new env configurations required.
3. **Deployment**: Restart the backend services to expose the new endpoints.

### Rollback Plan
1. **Migration rollback**: Run `npm run knex migrate:rollback` to remove the tables.
2. **Revert code**: Revert deployment to previous backend version.
