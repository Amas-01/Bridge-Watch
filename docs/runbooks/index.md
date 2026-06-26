# Bridge Watch Runbook Index

This index is the single entry point for all operational runbooks covering the Bridge Watch platform — a cross-chain asset health monitoring system built on Stellar and Soroban. Runbooks document repeatable procedures so that any on-call engineer can execute critical tasks safely, consistently, and without relying on tribal knowledge.

Runbooks are organized by operational category. Each entry includes a short description and a direct link to the procedure. Keep this index updated whenever a new runbook is added or retired.

---

## Categories

| Category | Purpose | Owner |
|---|---|---|
| [Incident Response](#incident-response) | Triage, escalation, and recovery for live incidents | Platform On-Call |
| [Security Operations](#security-operations) | Key rotation, access review, compromise response | Security Team |
| [Deployment](#deployment) | Release procedures, rollbacks, contract upgrades | Platform Engineering |
| [Maintenance](#maintenance) | Database upkeep, dependency patching, cache management | Infrastructure |
| [Monitoring](#monitoring) | Alert tuning, dashboard management, probe configuration | Observability Guild |

---

## Incident Response

These runbooks cover the full lifecycle of a live incident from initial alert through postmortem.

| Runbook | Description | Link |
|---|---|---|
| Support Handbook | Fast-reference troubleshooting, status checks, and escalation ownership for support and ops staff | [../support-handbook.md](../support-handbook.md) |
| Incident Response Guide | Severity matrix, roles, communication templates, escalation policy, and postmortem workflow | [../incident-response-guide.md](../incident-response-guide.md) |
| Incident Response Templates | Copy-paste triage, update, status page, and postmortem formats with owner/action fields | [incident-response-templates.md](incident-response-templates.md) |
| Support Escalation Tree | Tiered support path, owner contacts, availability notes, and maintenance workflow for support escalation | [support-escalation-tree.md](support-escalation-tree.md) |
| Circuit Breaker Trip Alert | Response plan when the bridge circuit breaker activates and asset transfers are blocked | [alert-circuit-breaker.md](alert-circuit-breaker.md) |
| Price Deviation Alert | How to diagnose and recover from stale or divergent asset price data across Stellar and source chains | [alert-price-deviation.md](alert-price-deviation.md) |
| Supply Mismatch Alert | Procedure for investigating and resolving a discrepancy between on-chain reserve commitments and source chain balances | [alert-supply-mismatch.md](alert-supply-mismatch.md) |
| Provider Health Failure Alert | Response plan when the Soroban RPC endpoint or other provider is slow, returning errors, or unreachable | [alert-provider-health.md](alert-provider-health.md) |
| Depeg Alert | Procedure for responding to a depeg where a stable asset's price on Stellar deviates from its peg | [alert-depeg.md](alert-depeg.md) |
| Cross-Chain Finality Delay | How to assess and communicate delays in Ethereum or other source-chain finality affecting bridge confirmations | *(pending — file: `finality-delay.md`)* |

---

## Security Operations

These runbooks cover proactive security maintenance and reactive response to security events.

| Runbook | Description | Link |
|---|---|---|
| Secret Rotation Playbook | Step-by-step procedures for rotating all secrets in the platform including API keys, signing keys, DB credentials, and JWT secrets | [secret-rotation-playbook.md](secret-rotation-playbook.md) |
| Secrets Audit Checklist | Quarterly inventory, least-privilege, rotation, and exposure review for runtime and CI secrets | [../secrets-audit-checklist.md](../secrets-audit-checklist.md) |
| Operator Key Compromise | Emergency procedure when an operator signing key is confirmed or suspected compromised — includes on-chain key revocation via Soroban contract | *(pending — file: `operator-key-compromise.md`)* |
| API Key Audit | Quarterly review of active API keys: enumerate, validate, and revoke stale or over-privileged keys | *(pending — file: `api-key-audit.md`)* |
| Dependency Vulnerability Response | How to triage `npm audit` and `cargo audit` findings and apply patches safely | *(pending — file: `dependency-vuln-response.md`)* |
| Unauthorized Contract Invocation | Response plan when the alert stream signals unexpected calls to admin-gated Soroban contract functions | *(pending — file: `unauthorized-contract-call.md`)* |

---

## Deployment

These runbooks cover releases, rollbacks, and Soroban contract upgrade procedures.

| Runbook | Description | Link |
|---|---|---|
| Deployment README | Overview of all deployment guides for Docker, Kubernetes, database, SSL, and monitoring | [../deployment/README.md](../deployment/README.md) |
| Environment Setup | Environment variable reference and secrets configuration for development, staging, and production | [../deployment/environment-setup.md](../deployment/environment-setup.md) |
| Docker Deployment | Docker Compose build-and-start procedure for production | [../deployment/docker-deployment.md](../deployment/docker-deployment.md) |
| Kubernetes Deployment | Helm and manifest deployment guide including namespace, secrets, and health verification | [../deployment/kubernetes-deployment.md](../deployment/kubernetes-deployment.md) |
| Database Setup | PostgreSQL and TimescaleDB setup, migration execution, and schema verification | [../deployment/database-setup.md](../deployment/database-setup.md) |
| Soroban Contract Upgrade | Procedure for building an optimized WASM, deploying to Soroban, and updating the contract reference in backend config | *(pending — file: `contract-upgrade.md`)* |
| Release Checklist | Pre-release gate items covering tests, security scan, performance baselines, and stakeholder sign-off | [../release-checklist.md](../release-checklist.md) |
| Rollback Procedure | How to revert a failed deployment to the previous known-good image or contract version | [../deployment/troubleshooting.md](../deployment/troubleshooting.md) |

---

## Maintenance

These runbooks cover routine platform upkeep to keep the system healthy between incidents.

| Runbook | Description | Link |
|---|---|---|
| Database Backup and Restore | Scheduled backup procedures, retention policy, and tested restore steps for PostgreSQL and TimescaleDB | [../deployment/backup-procedures.md](../deployment/backup-procedures.md) |
| TimescaleDB Chunk Maintenance | Managing hypertable chunk compression, retention policies, and query performance over time | *(pending — file: `timescaledb-maintenance.md`)* |
| Redis Cache Flush | Safe procedure for flushing Redis cache without disrupting rate-limit counters or BullMQ queues | *(pending — file: `redis-cache-flush.md`)* |
| Dead-Letter Queue Drain | How to inspect, replay, or discard failed BullMQ jobs in the dead-letter queue | *(pending — file: `dead-letter-queue.md`)* |
| Dependency Update Cycle | Applying automated dependency update PRs: review, test, merge, and monitor workflow | *(pending — file: `dependency-update-cycle.md`)* |
| SSL Certificate Renewal | Certificate expiry monitoring and manual renewal steps for Nginx TLS configuration | [../deployment/ssl-tls-setup.md](../deployment/ssl-tls-setup.md) |

---

## Monitoring

These runbooks cover the observability stack and alert management.

| Runbook | Description | Link |
|---|---|---|
| Monitoring Overview | Prometheus, Grafana, Alertmanager, Loki, Tempo, and Blackbox Exporter overview and local validation | [../monitoring.md](../monitoring.md) |
| Monitoring Setup | Deploying and configuring the full observability stack in production | [../deployment/monitoring-setup.md](../deployment/monitoring-setup.md) |
| Alert Routing Configuration | How to update Alertmanager routes, Slack webhooks, and PagerDuty keys | *(pending — file: `alert-routing-config.md`)* |
| Grafana Dashboard Management | Adding, modifying, and exporting Grafana dashboards via provisioned JSON | *(pending — file: `grafana-dashboard-management.md`)* |
| Blackbox Probe Failure | Steps to investigate a failed uptime probe and determine whether it indicates a real outage | *(pending — file: `blackbox-probe-failure.md`)* |
| Prometheus Rule Tuning | How to add or adjust alert rules and recording rules without disrupting existing alerts | *(pending — file: `prometheus-rule-tuning.md`)* |

---

## Ownership

Each category has a designated team that owns the runbooks within it, meaning they are responsible for keeping procedures accurate and reviewing them at least quarterly.

| Category | Primary Owner | Backup Owner | Review Cadence |
|---|---|---|---|
| Incident Response | Platform On-Call Lead | Engineering Manager | Quarterly |
| Security Operations | Security Team Lead | Platform On-Call Lead | Quarterly or after any rotation event |
| Deployment | Platform Engineering Lead | DevOps / Infrastructure | Before each major release |
| Maintenance | Infrastructure Lead | Platform Engineering | Bi-annually |
| Monitoring | Observability Guild Lead | Platform On-Call Lead | Quarterly |

---

## Quick Reference — Common On-Call Scenarios

Use these links to reach the most critical runbooks immediately during an incident.

| Scenario | Go To |
|---|---|
| Bridge has halted — transfers are blocked | [../incident-response-guide.md](../incident-response-guide.md), then `bridge-halt-response.md` |
| Reserve mismatch alert is firing | `reserve-mismatch.md` (pending), cross-reference [../security-audit-checklist.md](../security-audit-checklist.md) |
| Suspected operator key compromise | [secret-rotation-playbook.md — Emergency Section](secret-rotation-playbook.md#6-emergency-rotation-confirmed-compromise), then `operator-key-compromise.md` |
| Soroban RPC is unreachable | `soroban-rpc-degradation.md` (pending), escalate per [../incident-response-guide.md](../incident-response-guide.md) |
| Need to rotate secrets immediately | [secret-rotation-playbook.md](secret-rotation-playbook.md) |
| Deployment is failing in production | [../deployment/troubleshooting.md](../deployment/troubleshooting.md) |
| Critical alert firing with no runbook link | See [Escalation Path](#escalation-path) below |

---

## How to Contribute a New Runbook

### Naming Convention

- Use lowercase with hyphens: `short-descriptive-name.md`
- Place the file in `docs/runbooks/`
- Add an entry to this index under the appropriate category before the pull request is merged

### Required Sections

Every runbook must include the following sections, in order:

1. **Purpose and Scope** — what the runbook covers and when to use it
2. **Prerequisites** — access requirements, tools, and prior knowledge needed
3. **Procedure** — numbered steps; each step must be actionable
4. **Verification** — how to confirm the procedure succeeded
5. **Rollback** — how to undo the procedure if it causes a problem
6. **Ownership** — team or role responsible for the runbook
7. **Related Documents** — links to related runbooks, architecture docs, or external references

### Review Process

1. Open a pull request with the new file and the updated index entry.
2. Request a review from the owner of the relevant category (see [Ownership](#ownership)).
3. The reviewer verifies the procedure can be executed by someone unfamiliar with the system.
4. Merge after approval. If the runbook addresses a gap exposed by an incident, link the postmortem issue.

### Keeping Runbooks Current

- Runbooks that become inaccurate after a system change must be updated in the same pull request as the change.
- Runbooks marked `*(pending)*` in this index should be created as GitHub issues and assigned to the category owner.

---

## Escalation Path

When no runbook covers the current situation, follow this path in order:

1. **Search existing documentation** — check `docs/` for architecture guides, the incident response guide, and the security audit checklist.
2. **Escalate to the category owner** listed in the [Ownership](#ownership) table for the affected subsystem.
3. **Page the Incident Commander** if the event meets SEV-1 or SEV-2 criteria per the [incident response severity matrix](../incident-response-guide.md).
4. **Contact security on-call** immediately if the event involves suspected key compromise, unauthorized contract invocations, or data integrity violations.
5. **Reach out to external parties** if the situation involves a third-party dependency (Circle API, Stellar network, Horizon, Soroban RPC):
   - Stellar Development Foundation status: https://status.stellar.org
   - Circle API status: https://status.circle.com
   - Bridge Watch security contact: security@stellarbridgewatch.io
6. **Document the gap** — after the incident is resolved, open a GitHub issue to create the missing runbook so the gap is not repeated.
