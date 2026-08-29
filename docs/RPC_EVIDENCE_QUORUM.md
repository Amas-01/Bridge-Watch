# Independent RPC Evidence Quorum for Chain State Reads

## Overview

Provider failover mechanisms prevent RPC outages by switching endpoints on error, but failover alone does not verify that multi-provider responses agree on block headers, state roots, or contract read states. A faulty, malicious, or lagging provider can supply plausible yet inconsistent reserve data.

The Independent RPC Evidence Quorum protocol enforces header-anchored verification across independently grouped RPC providers before accepting chain state reads.

---

## Core Concepts & Guarantees

1. **Header Anchor Evidence**: Reads are anchored with header evidence (`blockNumber`, `blockHash`, `stateRoot`, `timestamp`).
2. **Correlated Provider Grouping**: Endpoints hosted within the same infrastructure or provider organization (e.g. Infura-1 & Infura-2) are grouped under a single `providerGroup` so correlated nodes cannot inflate quorum confidence.
3. **Disagreement & Lag Classification**: Disagreement (divergent hashes or data values) and excessive block lag relative to chain tip are detected, persisted, and exposed as degraded confidence.
4. **Configurable Thresholds**: Quorum size (`minQuorumSize`), consensus ratio (`quorumThresholdRatio`), and max lag (`maxLagBlocks`) are configured per chain and operation.
5. **Explicit Fail-Closed vs Fail-Open**: Callers or system policy configure whether unreached quorum causes execution failure (`failClosed = true`) or returns degraded confidence data (`failClosed = false`).

---

## Data Model & Migration

Database table: `rpc_evidence_quorum_configs`
- `chain_id` / `operation_type` (Unique composite key)
- `min_quorum_size` (Integer, default 2)
- `quorum_threshold_ratio` (Float, default 0.67)
- `max_lag_blocks` (Integer, default 5)
- `fail_closed` (Boolean, default false)

Database table: `rpc_provider_groups`
- `endpoint_url` (String, Unique)
- `provider_group` (String)
- `asn_or_org` (String)

Database table: `rpc_evidence_logs`
- Audit log of verification evaluations, confidence scores, header anchors, disagreement details, and decisions (`ACCEPTED`, `DEGRADED`, `REJECTED`).

---

## REST API Specification

### Verify RPC Evidence Quorum
```http
POST /api/v1/rpc-quorum/verify
Content-Type: application/json

{
  "chainId": "ethereum-mainnet",
  "operationType": "reserve_read",
  "readIdentifier": "USDC-vault-balance",
  "responses": [
    {
      "endpoint": "https://mainnet.infura.io/v3/YOUR_KEY",
      "providerGroup": "infura",
      "blockNumber": 18000000,
      "blockHash": "0xblockhash123",
      "stateRoot": "0xstateroot456",
      "data": { "lockedBalance": "500000000" }
    },
    {
      "endpoint": "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY",
      "providerGroup": "alchemy",
      "blockNumber": 18000000,
      "blockHash": "0xblockhash123",
      "stateRoot": "0xstateroot456",
      "data": { "lockedBalance": "500000000" }
    }
  ]
}
```

### View & Update Quorum Configurations
```http
GET /api/v1/rpc-quorum/configs?chainId=ethereum-mainnet&operationType=reserve_read

POST /api/v1/rpc-quorum/configs
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "chainId": "ethereum-mainnet",
  "operationType": "reserve_read",
  "minQuorumSize": 3,
  "quorumThresholdRatio": 0.67,
  "failClosed": true
}
```

### View Verification Audit Logs
```http
GET /api/v1/rpc-quorum/logs?chainId=ethereum-mainnet&limit=20
```

---

## Observability

- **`bridge_watch_rpc_quorum_evaluations_total`**: Counter of quorum evaluations by `chain_id` and `decision`.
- **`bridge_watch_rpc_quorum_disagreements_total`**: Counter of provider disagreements detected.
- **`bridge_watch_rpc_quorum_confidence_score`**: Gauge tracking confidence score (0.0 to 1.0) per chain.
