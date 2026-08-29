# Stellar Account Risk Clustering

Stellar Account Risk Clustering groups Stellar accounts by risk profile based on connection to known malicious entities, volume, frequency, and log detected risk signals.

## Data Model

### `stellar_account_clusters`
Represents a group of accounts with a shared risk profile.
- `id` (UUID): Primary key.
- `name` (string): Unique name of the cluster.
- `risk_level` (string): Risk level associated with the cluster (`low`, `moderate`, `high`, `critical`).
- `description` (text): Description of the cluster.
- `created_at` (timestamp): Creation time.
- `updated_at` (timestamp): Last update time.

### `stellar_account_cluster_mappings`
Maps individual Stellar accounts to a risk cluster.
- `id` (UUID): Primary key.
- `cluster_id` (UUID): Reference to `stellar_account_clusters.id`.
- `account_address` (string, 56 chars): Stellar address of the account (Unique).
- `reason` (text): Rationale for the mapping.
- `confidence_score` (decimal): Confidence in the mapping (between 0.0 and 1.0).
- `added_by` (string): Username of the operator/admin who created the mapping.
- `created_at` (timestamp): Creation time.

### `account_risk_signals`
Tracks individual raw risk alerts and indicators detected for any Stellar account.
- `id` (UUID): Primary key.
- `account_address` (string, 56 chars): Stellar address of the account.
- `signal_type` (string): Type of signal (e.g., `rapid_transfers`, `malicious_association`).
- `severity` (string): Severity (`info`, `low`, `medium`, `high`, `critical`).
- `description` (text): Narrative details of the signal.
- `detected_at` (timestamp): Detection time.

## API Endpoints

### 1. Create a Risk Cluster
- **Method**: `POST`
- **Path**: `/api/v1/risk/clusters`
- **Headers**:
  - `x-api-key`: Admin API key required.
- **Request Body**:
  ```json
  {
    "name": "bridge-exploiters",
    "riskLevel": "critical",
    "description": "Accounts directly receiving funds from the August bridge exploit"
  }
  ```
- **Response**: `201 Created`

### 2. List Risk Clusters
- **Method**: `GET`
- **Path**: `/api/v1/risk/clusters`
- **Response**: `200 OK`
  ```json
  {
    "clusters": [
      {
        "id": "uuid-1",
        "name": "bridge-exploiters",
        "riskLevel": "critical",
        "description": "Accounts directly receiving funds from the August bridge exploit",
        "createdAt": "2026-08-26T21:00:00.000Z",
        "updatedAt": "2026-08-26T21:00:00.000Z"
      }
    ]
  }
  ```

### 3. Map Account to Cluster
- **Method**: `POST`
- **Path**: `/api/v1/risk/clusters/:clusterId/accounts`
- **Headers**:
  - `x-api-key`: Admin API key required.
- **Request Body**:
  ```json
  {
    "accountAddress": "GBHZAE5IQTOPQZ66TFWZYIYCHQ6T3GMWHDKFEXAKYWJ2BHLZQ227KRYE",
    "addedBy": "admin",
    "reason": "Direct transferee of exploit wallet",
    "confidenceScore": 0.95
  }
  ```
- **Response**: `201 Created`

### 4. Get Account Risk Profile
- **Method**: `GET`
- **Path**: `/api/v1/risk/accounts/:address`
- **Response**: `200 OK`
  ```json
  {
    "accountAddress": "GBHZAE5IQTOPQZ66TFWZYIYCHQ6T3GMWHDKFEXAKYWJ2BHLZQ227KRYE",
    "cluster": {
      "id": "uuid-1",
      "name": "bridge-exploiters",
      "riskLevel": "critical",
      "description": "Accounts directly receiving funds from the August bridge exploit"
    },
    "confidenceScore": 0.95,
    "reason": "Direct transferee of exploit wallet",
    "signals": []
  }
  ```

### 5. Record Risk Signal
- **Method**: `POST`
- **Path**: `/api/v1/risk/signals`
- **Headers**:
  - `x-api-key`: Admin API key required.
- **Request Body**:
  ```json
  {
    "accountAddress": "GBHZAE5IQTOPQZ66TFWZYIYCHQ6T3GMWHDKFEXAKYWJ2BHLZQ227KRYE",
    "signalType": "rapid_transfers",
    "severity": "high",
    "description": "50 transactions in 1 minute"
  }
  ```
- **Response**: `201 Created`

### 6. List Risk Signals
- **Method**: `GET`
- **Path**: `/api/v1/risk/signals?limit=50&offset=0`
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

### Monitoring & Support
- Observe pino logs using keyword `riskClusteringService` or filter for `"stellar_account_clusters"` insert operations.
- Metrics are tracked via standard error tracking and request latency indicators.
