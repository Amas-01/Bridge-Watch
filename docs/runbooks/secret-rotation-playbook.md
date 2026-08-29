# Secret Rotation Playbook

## 1. Purpose and Scope

This playbook defines the end-to-end procedure for rotating every secret used by the Bridge Watch platform — a cross-chain asset health monitoring system built on Stellar and Soroban. It covers pre-rotation preparation, per-secret rotation steps, service impact expectations, rollback procedures, audit requirements, and the emergency path for a confirmed compromise.

**In scope:**
- All secrets used by the backend API, BullMQ workers, reserve verification worker, and monitoring stack
- Soroban operator signing keys registered with the `BridgeReserveVerifier` contract
- Database and Redis credentials
- API keys issued to external integrations
- JWT signing secrets and webhook signing secrets
- Stellar Horizon and Soroban RPC bearer tokens (where applicable)
- PagerDuty and Slack integration keys used by Alertmanager

**Out of scope:**
- Application-level user passwords (managed by auth layer separately)
- SSL/TLS certificates (see `docs/deployment/ssl-tls-setup.md`)
- Cloud IAM role credentials managed entirely by a cloud provider without a static secret

---

## 2. Secret Inventory

The table below lists every secret that must be managed under this playbook.

| Secret ID | Name / Env Variable | Type | Storage Location | Rotation Frequency |
|---|---|---|---|---|
| SEC-01 | `POSTGRES_PASSWORD` | Database credential | `.env` / K8s Secret / Cloud Secret Manager | Quarterly |
| SEC-02 | `REDIS_PASSWORD` | Cache credential | `.env` / K8s Secret / Cloud Secret Manager | Quarterly |
| SEC-03 | `CIRCLE_API_KEY` | Third-party API key | `.env` / K8s Secret / Cloud Secret Manager | Quarterly or on Circle demand |
| SEC-04 | `ETHEREUM_RPC_URL` bearer token | RPC endpoint token | `.env` / K8s Secret | Quarterly |
| SEC-05 | `SOROBAN_RPC_URL` bearer token | RPC endpoint token | `.env` / K8s Secret | Quarterly |
| SEC-06 | `OPERATOR_SECRET_<BRIDGE_ID>` | Stellar signing key (private key) | `.env` / K8s Secret / KMS | Annually or on compromise |
| SEC-07 | `JWT_SECRET` | JWT signing secret | `.env` / K8s Secret | Quarterly |
| SEC-08 | API keys issued via `/api/v1/api-keys` | Platform API key | Database (`api_keys` table) | On demand or annually |
| SEC-09 | Webhook signing secret | HMAC signing key | `.env` / K8s Secret | Quarterly |
| SEC-10 | Alertmanager Slack webhook URL | Monitoring integration token | `monitoring/alertmanager.yml` / Secret Manager | Annually or on team change |
| SEC-11 | PagerDuty integration key | Monitoring integration token | `monitoring/alertmanager.yml` / Secret Manager | Annually or on personnel change |
| SEC-12 | `PGADMIN_PASSWORD` | Admin tool credential | `.env` (non-production only) | On personnel change |

Stellar operator signing keys (SEC-06) deserve special attention. The `OPERATOR_SECRET_<BRIDGE_ID>` environment variable holds the raw Stellar private key used by the reserve verification worker to sign on-chain commitment transactions. The corresponding public key is registered in the `BridgeReserveVerifier` Soroban contract. Rotating this key requires both a backend secret update and an on-chain transaction to register the new key and deregister the old one.

---

## 3. Pre-Rotation Checklist

Complete all items below before starting any rotation. Do not proceed if a blocker cannot be resolved.

- [ ] Confirm you have write access to the secret storage location (`.env`, Kubernetes Secret, or Cloud Secret Manager) for the target secret.
- [ ] Confirm you have access to a backup of the current secret value in a secure location (password manager, vault), so rotation can be reversed if needed.
- [ ] Notify stakeholders — inform the on-call engineer, team lead, and, for customer-visible secrets (API keys, webhooks), any affected integration partners. Use the incident channel or a scheduled maintenance window.
- [ ] Verify the rotation is occurring during an acceptable maintenance window. Avoid rotating secrets that require service restarts during peak traffic hours unless it is an emergency.
- [ ] Check that there are no active incidents. Rotating a secret during an ongoing incident increases risk and complicates root-cause analysis.
- [ ] Confirm the CI/CD pipeline is not in the middle of a deployment. A deployment in progress may use the old secret and fail unexpectedly mid-run.
- [ ] For Soroban signing keys (SEC-06): confirm no BullMQ jobs are in the `active` state for the affected bridge worker. Drain the queue first.
- [ ] Record the rotation in the audit log before you begin (see [Section 7](#7-audit-trail)).
- [ ] Confirm the rollback procedure for this secret is understood and rehearsed.

---

## 4. Step-by-Step Rotation Procedures

### 4.1 Database Password (SEC-01 — `POSTGRES_PASSWORD`)

1. Generate a new strong password:
   ```bash
   openssl rand -base64 32
   ```
2. Connect to the PostgreSQL instance as a superuser:
   ```bash
   psql -h <POSTGRES_HOST> -U postgres
   ```
3. Update the `bridge_watch` database user's password:
   ```sql
   ALTER USER bridge_watch WITH PASSWORD '<new-password>';
   ```
4. Update the secret in the appropriate storage location:
   - **Docker / local:** Replace `POSTGRES_PASSWORD` in `.env`.
   - **Kubernetes:** `kubectl create secret generic bridge-watch-secrets --namespace bridge-watch --from-literal=postgres-password=<new-password> --dry-run=client -o yaml | kubectl apply -f -`
   - **Cloud Secret Manager:** Update the secret version via the cloud provider console or CLI.
5. Perform a rolling restart of the backend service to pick up the new credential:
   - **Docker Compose:** `docker compose restart backend`
   - **Kubernetes:** `kubectl rollout restart deployment/bridge-watch-backend -n bridge-watch`
6. Verify backend health: `curl http://<host>:3001/health/detailed`
7. Confirm no database authentication errors appear in the backend logs for 5 minutes.
8. Revoke the old password session if the database supports it (PostgreSQL terminates existing connections on password change automatically).
9. Update the audit log with the completion timestamp and the rotating engineer's identity.

---

### 4.2 Redis Password (SEC-02 — `REDIS_PASSWORD`)

1. Generate a new password:
   ```bash
   openssl rand -base64 32
   ```
2. Connect to the Redis instance and update the password using the `ACL SETUSER` command (Redis 6+):
   ```bash
   redis-cli -h <REDIS_HOST> -p 6379 -a <current-password>
   ACL SETUSER default >new-password on ~* &* +@all
   ```
   For Redis versions prior to 6, use `CONFIG SET requirepass <new-password>`.
3. Test the new password immediately:
   ```bash
   redis-cli -h <REDIS_HOST> -p 6379 -a <new-password> PING
   ```
   Expected response: `PONG`.
4. Update `REDIS_PASSWORD` in all secret storage locations (same sequence as SEC-01 step 4).
5. Restart the backend service and BullMQ workers:
   - **Docker Compose:** `docker compose restart backend`
   - **Kubernetes:** `kubectl rollout restart deployment/bridge-watch-backend -n bridge-watch`
6. Monitor BullMQ queue health — ensure jobs resume processing and no `NOAUTH` errors appear in logs.
7. Verify rate-limit counters are still functional by making a request and checking `X-RateLimit-Remaining` headers.

---

### 4.3 Circle API Key (SEC-03 — `CIRCLE_API_KEY`)

1. Log in to the Circle Developer Console (https://console.circle.com).
2. Navigate to **API Keys** and generate a new key with the same scopes as the current key.
3. Store the new key securely before closing the console — it will not be shown again.
4. Update `CIRCLE_API_KEY` in all secret storage locations.
5. Restart the reserve verification worker:
   - **Docker Compose:** `docker compose restart worker`
   - **Kubernetes:** `kubectl rollout restart deployment/bridge-watch-worker -n bridge-watch`
6. Verify the worker successfully calls the Circle API by checking worker logs for a successful reserve fetch within 5 minutes.
7. Revoke the old key in the Circle Developer Console.
8. Confirm no Circle API errors appear in logs for 10 minutes after revocation.

---

### 4.4 RPC Endpoint Tokens (SEC-04, SEC-05 — Ethereum RPC / Soroban RPC bearer tokens)

1. Obtain a new API token from the RPC provider (Alchemy, Infura, QuickNode, or the Stellar Foundation's authenticated RPC service, as applicable).
2. Update `ETHEREUM_RPC_URL` or `SOROBAN_RPC_URL` (with the new token embedded in the URL or provided as a separate authorization header, depending on provider convention) in all secret storage locations.
3. Restart the backend and worker services as in SEC-01 step 5.
4. Verify connectivity by checking health endpoint output for `soroban_rpc` and `ethereum_rpc` dependency statuses:
   ```bash
   curl http://<host>:3001/health/detailed | jq '.dependencies'
   ```
5. Revoke the old token in the provider console.
6. Monitor for 10 minutes for RPC timeout or connectivity errors in backend and worker logs.

---

### 4.5 Stellar Operator Signing Key (SEC-06 — `OPERATOR_SECRET_<BRIDGE_ID>`)

This is the most operationally complex rotation because it involves an on-chain transaction.

1. **Drain the BullMQ queue** for the affected bridge. Ensure the `active` job count is zero before proceeding:
   ```bash
   redis-cli -h <REDIS_HOST> LLEN bull:<queue-name>:active
   ```
   Wait or manually drain if active jobs are present.
2. **Pause the worker** for the affected bridge:
   - **Docker Compose:** `docker compose stop worker`
   - **Kubernetes:** `kubectl scale deployment/bridge-watch-worker --replicas=0 -n bridge-watch`
3. **Generate a new Stellar keypair** using the Stellar Lab or the Soroban CLI:
   ```bash
   soroban keys generate new-operator-key --network mainnet
   soroban keys address new-operator-key    # public key (G...)
   soroban keys show new-operator-key       # private key (S...) — store securely now
   ```
4. **Register the new key on-chain** by invoking the `BridgeReserveVerifier` contract's key update function from the admin account. The admin keypair must sign this transaction:
   ```bash
   soroban contract invoke \
     --id <CONTRACT_ID> \
     --source <admin-keypair> \
     --network mainnet \
     -- update_operator_key \
     --bridge_id <BRIDGE_ID> \
     --new_public_key <new-G-address>
   ```
5. Confirm the transaction is included in a finalized ledger. Check transaction status via Horizon:
   ```bash
   curl "https://horizon.stellar.org/transactions/<txhash>"
   ```
6. Update `OPERATOR_SECRET_<BRIDGE_ID>` in all secret storage locations with the new private key.
7. **Resume the worker:**
   - **Docker Compose:** `docker compose start worker`
   - **Kubernetes:** `kubectl scale deployment/bridge-watch-worker --replicas=1 -n bridge-watch`
8. Monitor worker logs to confirm the next scheduled commitment transaction is submitted and confirmed successfully.
9. Verify the on-chain commitment by querying the contract's latest commitment record for the bridge.
10. After successful verification, ensure the old private key is deleted from all non-vault locations.

---

### 4.6 JWT Secret (SEC-07 — `JWT_SECRET`)

Rotating the JWT secret invalidates all currently-issued tokens. Users and API clients will be required to re-authenticate.

1. Generate a cryptographically secure new secret:
   ```bash
   openssl rand -base64 64
   ```
2. Decide on a transition strategy:
   - **Hard cutover (immediate):** Update the secret and restart. All existing sessions become invalid immediately. Appropriate for emergency rotations.
   - **Dual-key transition (recommended for planned rotation):** Temporarily configure the backend to accept tokens signed by either the old or new secret during a transition window (typically 1 hour), then remove the old key. This requires a code-level feature flag if not already supported.
3. Update `JWT_SECRET` in all secret storage locations.
4. Restart the backend service.
5. Verify the health endpoint and confirm authenticated API routes return `401 Unauthorized` for tokens signed with the old secret.
6. Notify API integration partners with advance warning if a hard cutover is used outside of an emergency.

---

### 4.7 Platform API Keys (SEC-08 — `api_keys` table)

Platform API keys are managed through the admin API endpoint, not through environment variables.

**To rotate a specific key:**
1. Identify the key to rotate from the `api_keys` table. Note the key's scope and the integration it serves.
2. Generate a new key via the admin endpoint:
   ```bash
   curl -X POST http://<host>:3001/api/v1/api-keys \
     -H "Authorization: Bearer <admin-api-key>" \
     -H "Content-Type: application/json" \
     -d '{"name": "<integration-name>", "scopes": ["<scope>"]}'
   ```
3. Deliver the new key to the integration owner securely (never by email in plaintext).
4. Confirm the integration owner has updated their configuration and tested the new key.
5. Revoke the old key via the admin endpoint or by deleting it from the `api_keys` table:
   ```bash
   curl -X DELETE http://<host>:3001/api/v1/api-keys/<key-id> \
     -H "Authorization: Bearer <admin-api-key>"
   ```

**For bulk quarterly audit:**
1. Query all active keys and their last-used timestamps from the `api_keys` table.
2. Revoke any key that has not been used in 90 days.
3. Contact owners of keys approaching the annual rotation deadline.

---

### 4.8 Webhook Signing Secret (SEC-09)

1. Generate a new HMAC signing secret:
   ```bash
   openssl rand -hex 32
   ```
2. Update the secret in all storage locations.
3. Notify webhook consumers of the upcoming key change and provide the new secret securely.
4. Restart the backend service.
5. Confirm webhook consumers are re-validating delivery signatures with the new key before revoking the old one.
6. After consumer confirmation, remove the old secret from all locations.

---

### 4.9 Alertmanager Integration Keys (SEC-10, SEC-11 — Slack and PagerDuty)

1. **Slack:** In the Slack app management console, rotate or generate a new incoming webhook URL for the `#alerts-critical` and `#alerts-warning` channels.
2. **PagerDuty:** In PagerDuty, navigate to **Services** > **Integrations** and regenerate the integration key for the Bridge Watch service.
3. Update the values in `monitoring/alertmanager.yml` or, if templated at deploy time, in the secret manager.
4. Reload Alertmanager configuration:
   ```bash
   docker compose exec alertmanager amtool alertmanager config reload
   # or for Kubernetes:
   kubectl exec -n monitoring deploy/alertmanager -- amtool alertmanager config reload
   ```
5. Trigger a test alert and verify it routes correctly to Slack and PagerDuty.
6. Revoke the old keys in the respective consoles.

---

## 5. Service Impact Table

| Secret | Services Impacted | Restart Required | Expected Downtime | Notes |
|---|---|---|---|---|
| SEC-01 `POSTGRES_PASSWORD` | Backend API, BullMQ workers, reserve verification worker | Yes (backend + workers) | 30–60 seconds per rolling restart | PostgreSQL terminates existing connections on password change |
| SEC-02 `REDIS_PASSWORD` | Backend API (rate limiting, caching), BullMQ workers | Yes (backend + workers) | 30–60 seconds | In-flight jobs may fail and retry |
| SEC-03 `CIRCLE_API_KEY` | Reserve verification worker | Yes (worker only) | None for API, 30 seconds for worker restart | Reserve data will not refresh until worker restarts |
| SEC-04 `ETHEREUM_RPC_URL` token | Backend API, bridge verification worker | Yes | 30–60 seconds | Cross-chain finality checks will pause briefly |
| SEC-05 `SOROBAN_RPC_URL` token | Backend API, reserve verification worker | Yes | 30–60 seconds | Soroban health checks will fail during restart |
| SEC-06 Operator signing key | Reserve verification worker, on-chain bridge ops | Yes (worker pause required) | Worker paused 5–15 minutes; on-chain tx takes ~6 seconds | Queue must be drained first to avoid signing with wrong key |
| SEC-07 `JWT_SECRET` | Backend API (all authenticated routes) | Yes | 30–60 seconds | All existing sessions invalidated on hard cutover |
| SEC-08 Platform API keys | External integrations using the key | No (revoke only) | None for platform; integration-side disruption until consumer updates | Coordinate with integration owner before revoking |
| SEC-09 Webhook signing secret | Webhook delivery service, consuming integrations | Yes | 30–60 seconds | Consumer validation will fail during transition window |
| SEC-10 Slack webhook URL | Alertmanager | Config reload only | None | Test routing after reload |
| SEC-11 PagerDuty key | Alertmanager | Config reload only | None | Test routing after reload |
| SEC-12 `PGADMIN_PASSWORD` | Admin UI only (non-production) | Yes (pgadmin container) | None for platform | Non-production tool only |

---

## 6. Emergency Rotation — Confirmed Compromise

If a secret is confirmed compromised or there is a credible suspicion of unauthorized use, follow this path immediately without waiting for a scheduled maintenance window.

### Immediate Actions (within 5 minutes)

1. **Alert the on-call engineer and security lead** via PagerDuty or direct message. Open an incident channel immediately.
2. **Revoke the compromised secret at the source** — in the external console (Circle, RPC provider, Slack, PagerDuty) or by disabling the database user — before generating a replacement. Revocation takes precedence over continuity.
3. For a compromised Stellar operator key (SEC-06): invoke `slash_operator` or `update_operator_key` via the admin account to deregister the compromised key on-chain immediately. This is critical because the compromised key can submit fraudulent reserve commitments until it is deregistered.

### Rotation (within 15 minutes)

4. Follow the full per-secret rotation procedure in [Section 4](#4-step-by-step-rotation-procedures) for the affected secret.
5. For database or Redis credentials (SEC-01, SEC-02): also audit recent query logs for anomalous access patterns dating back to the estimated time of compromise.
6. For JWT secrets (SEC-07): perform a hard cutover — no transition window. Invalidate all sessions immediately.

### Post-Revocation

7. Conduct an access log review to determine the scope of unauthorized activity.
8. Determine whether funds, data, or contract state have been affected.
9. Notify affected parties (integration owners, users) as appropriate given the nature of the exposure.
10. Escalate to SEV-1 in the incident management system and follow the [Incident Response Guide](../incident-response-guide.md).
11. File a postmortem within 48 hours covering the timeline of compromise, detection method, impact, and prevention actions.
12. Open a GitHub issue to track all follow-up actions with deadlines and owners.

---

## 7. Rollback Procedure

If a rotation causes a service disruption, follow these steps to restore the previous secret.

1. **Confirm the old secret value is available** from the secure backup maintained before rotation began. If the backup is missing, escalate immediately — do not attempt to guess or brute-force the old value.
2. Restore the old secret to all storage locations using the same procedure as rotation (steps 4 in each per-secret section), but substituting the previous value.
3. Restart affected services in the reverse order they were restarted during rotation.
4. Verify service health using the health endpoint and monitor logs for 10 minutes.
5. For Soroban operator key rollback (SEC-06): invoke the contract's key update function again with the original public key, then re-deploy the original private key to the worker. This requires the admin keypair.
6. Document what failed, what was rolled back, and the timeline in the audit log (see [Section 7](#7-audit-trail)).
7. Do not close the rotation task until the root cause of the failure is understood and the next attempt is planned.

---

## 8. Audit Trail

Every rotation event — planned or emergency — must be recorded. The audit record demonstrates compliance and provides the evidence needed for postmortems.

### What to Record

| Field | Value |
|---|---|
| Secret ID | The identifier from the [Secret Inventory](#2-secret-inventory) (e.g., SEC-01) |
| Secret name | Human-readable name (e.g., `POSTGRES_PASSWORD`) |
| Rotation type | `Planned` or `Emergency` |
| Trigger | Quarterly schedule, personnel change, incident, compromise, etc. |
| Rotating engineer | Full name and GitHub username |
| Approver | Full name and GitHub username |
| Verifier | Full name and GitHub username |
| Date and time (UTC) | ISO 8601 format (e.g., `2026-05-29T14:00:00Z`) |
| Old secret fingerprint | Last 4 characters or a hash of the old value (never the full secret) |
| New secret fingerprint | Last 4 characters or a hash of the new value (never the full secret) |
| Outcome | `Success`, `Rolled back`, or `Partial — follow-up required` |
| Follow-up issue | GitHub issue number if applicable |

### Where to Record

- **Primary:** A dedicated `secret-rotation-log` entry in the team's secure operations log (Notion, Confluence, or equivalent — access-controlled to security team and leads only).
- **Secondary:** A comment on the GitHub issue or pull request that tracked the rotation work.
- **Never:** Do not record secret values or fingerprints in public GitHub issues, Slack, or any unencrypted location.

---

## 9. Ownership and Responsibility Matrix

| Activity | Approver | Executor | Verifier |
|---|---|---|---|
| Quarterly planned rotation (all secrets) | Engineering Manager or Security Lead | Platform On-Call Engineer or designated team member | Second on-call engineer or team lead |
| Emergency rotation on compromise | Security Lead (or Engineering Manager if unavailable) | Most senior available engineer | Security Lead |
| Stellar operator key rotation (SEC-06) | Security Lead + Engineering Manager (dual approval) | Platform Engineering Lead | Second platform engineer |
| API key audit and revocation (SEC-08) | Platform Engineering Lead | Any team member with admin API access | Platform Engineering Lead |
| Alertmanager key rotation (SEC-10, SEC-11) | Infrastructure Lead | Infrastructure team member | Platform On-Call Lead |

A rotation must not be executed by the same person who approves it, except in a declared emergency where only one qualified person is available. In that case, a second reviewer must audit the audit log entry within 24 hours.

---

## 10. Post-Rotation Verification Checklist

Complete these checks after every rotation to confirm the system is healthy before closing the rotation task.

- [ ] Backend health endpoint returns `200 OK` with all dependencies in `healthy` or acceptable `degraded` state:
  ```bash
  curl http://<host>:3001/health/detailed
  ```
- [ ] BullMQ workers are processing jobs — at least one job has completed successfully after the restart.
- [ ] Reserve verification worker has submitted at least one successful commitment transaction to the Soroban contract since the rotation.
- [ ] No authentication errors (`NOAUTH`, `password authentication failed`, `invalid token`) appear in backend or worker logs.
- [ ] Prometheus scrape targets are healthy (`curl http://<prometheus-host>:9090/api/v1/targets | jq '.data.activeTargets[] | select(.health != "up")'` returns empty).
- [ ] A test alert routes correctly through Alertmanager to Slack and PagerDuty (only required when SEC-10 or SEC-11 were rotated).
- [ ] Webhook consumers have confirmed successful delivery with the new signing secret (only required when SEC-09 was rotated).
- [ ] External API integrations that use platform API keys (SEC-08) have confirmed their keys still work.
- [ ] The old secret value has been deleted from all locations it previously existed, including any local `.env` backup files.
- [ ] The audit log entry for this rotation is complete with all required fields filled in.
- [ ] A follow-up GitHub issue has been opened for any issue discovered during rotation.

---

## Related Documents

- [Incident Response Guide](../incident-response-guide.md)
- [Security Architecture](../architecture/security-architecture.md)
- [Environment Setup](../deployment/environment-setup.md)
- [Security Audit Checklist](../security-audit-checklist.md)
- [Secrets Audit Checklist](../secrets-audit-checklist.md)
- [Kubernetes Deployment](../deployment/kubernetes-deployment.md)
- [Runbook Index](index.md)
