# Smart Contract Event Schema Explorer

This feature allows monitoring teams to register schemas of Soroban smart contract events and explore/index matching events.

## Data Model

### `contract_event_schemas`
Stores registered event schemas for Soroban smart contracts.
- `id` (UUID): Primary key.
- `contract_id` (string, 56 chars): Soroban contract ID.
- `event_type` (string): Type of event (e.g. `transfer`, `mint`).
- `schema_json` (jsonb): JSON schema defining expected event structure.
- `created_at` (timestamp): Creation timestamp.
- `updated_at` (timestamp): Last update timestamp.

### `matched_contract_events`
Stores indexed smart contract events that match a registered schema.
- `id` (UUID): Primary key.
- `schema_id` (UUID): References `contract_event_schemas.id`.
- `tx_hash` (string, 64 chars): Hash of the Stellar transaction.
- `ledger_seq` (integer): Ledger sequence number.
- `event_data` (jsonb): Event payload details.
- `matched_at` (timestamp): Timestamp when matched.

## API Endpoints

### 1. Register Event Schema
- **Method**: `POST`
- **Path**: `/api/v1/contracts/schemas`
- **Headers**:
  - `x-api-key`: Admin API key required.
- **Request Body**:
  ```json
  {
    "contractId": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "eventType": "transfer",
    "schemaJson": {
      "to": "string",
      "amount": "i128"
    }
  }
  ```
- **Response**: `201 Created`

### 2. Get Schemas by Contract
- **Method**: `GET`
- **Path**: `/api/v1/contracts/:contractId/schemas`
- **Response**: `200 OK`

### 3. Record Matched Event
- **Method**: `POST`
- **Path**: `/api/v1/contracts/schemas/:schemaId/events`
- **Headers**:
  - `x-api-key`: Admin API key required.
- **Request Body**:
  ```json
  {
    "txHash": "tx_hash_123",
    "ledgerSeq": 100,
    "eventData": {
      "to": "alice",
      "amount": "500"
    }
  }
  ```
- **Response**: `201 Created`

### 4. Query Matched Events
- **Method**: `GET`
- **Path**: `/api/v1/contracts/schemas/:schemaId/events?limit=50&offset=0`
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
