# Issuer Authorization State Monitoring

This capability monitors and alerts on authorization setting changes (e.g., clawback, authorization required) on Stellar asset issuer accounts.

## Data Model

### `issuer_auth_states`
Tracks current and historical states of an issuer account's authorization settings.
- `id` (UUID): Primary key.
- `issuer_address` (string, 56 chars): Stellar address of the issuer.
- `asset_code` (string): Asset code.
- `auth_required` (boolean): Whether authorization is required to hold the asset.
- `auth_revocable` (boolean): Whether authorization can be revoked.
- `auth_clawback_enabled` (boolean): Whether clawbacks are enabled.
- `auth_immutable` (boolean): Whether authorization settings are permanently locked/immutable.
- `last_checked_at` (timestamp): Last validation check timestamp.
- `created_at` (timestamp): Record insertion timestamp.

### `issuer_auth_alerts`
Logs alerts triggered by changes in issuer authorization settings.
- `id` (UUID): Primary key.
- `issuer_address` (string, 56 chars): Stellar address of the issuer.
- `asset_code` (string): Asset code.
- `alert_type` (string): Type of change (e.g. `clawback_state_changed`, `auth_required_changed`).
- `severity` (string): Severity level (`low`, `medium`, `high`, `critical`).
- `description` (text): Description detailing the change.
- `resolved` (boolean): Whether the alert has been resolved by an operator.
- `resolved_at` (timestamp): Resolution timestamp.
- `created_at` (timestamp): Creation timestamp.

## API Endpoints

### 1. Record Issuer Auth State
- **Method**: `POST`
- **Path**: `/api/v1/issuer-auth/states`
- **Headers**:
  - `x-api-key`: Admin API key required.
- **Request Body**:
  ```json
  {
    "issuerAddress": "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
    "assetCode": "FOBXX",
    "authRequired": false,
    "authRevocable": false,
    "authClawbackEnabled": true,
    "authImmutable": false
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "state": {
      "id": "state-uuid-1",
      "issuerAddress": "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
      "assetCode": "FOBXX",
      "authRequired": false,
      "authRevocable": false,
      "authClawbackEnabled": true,
      "authImmutable": false,
      "lastCheckedAt": "2026-08-26T21:00:00.000Z",
      "createdAt": "2026-08-26T21:00:00.000Z"
    },
    "alertsTriggered": [
      {
        "id": "alert-uuid-1",
        "issuerAddress": "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
        "assetCode": "FOBXX",
        "alertType": "clawback_state_changed",
        "severity": "critical",
        "description": "Asset clawback enabled flag changed from false to true",
        "resolved": false,
        "resolvedAt": null,
        "createdAt": "2026-08-26T21:00:00.000Z"
      }
    ]
  }
  ```

### 2. Get Latest State
- **Method**: `GET`
- **Path**: `/api/v1/issuer-auth/latest`
- **Query Parameters**:
  - `issuerAddress`: Stellar address.
  - `assetCode`: Asset code.
- **Response**: `200 OK`

### 3. List Active Alerts
- **Method**: `GET`
- **Path**: `/api/v1/issuer-auth/alerts`
- **Response**: `200 OK`

### 4. Resolve Alert
- **Method**: `POST`
- **Path**: `/api/v1/issuer-auth/alerts/:alertId/resolve`
- **Headers**:
  - `x-api-key`: Admin API key required.
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
