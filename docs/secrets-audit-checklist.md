# Secrets Audit Checklist

Periodic review of secrets usage, scope, rotation readiness, and exposure for the Bridge Watch platform.

**Scope:** Runtime secrets, CI/CD credentials, Kubernetes secrets, and integration tokens.  
**Not in scope:** Soroban contract security review — see [security-audit-checklist.md](./security-audit-checklist.md) (contract/reserve verification).

**Rotation procedures:** [secret-rotation-playbook.md](./runbooks/secret-rotation-playbook.md)

---

## 1. Secrets inventory

Complete or verify the inventory below. Extend SEC-01–SEC-12 from the rotation playbook with CI and deployment secrets.

| ID | Name / variable | Type | Storage | Owner team | Last reviewed |
|----|-----------------|------|---------|------------|---------------|
| SEC-01 | `POSTGRES_PASSWORD` | DB credential | `.env` / K8s / Secret Manager | Infrastructure | |
| SEC-02 | `REDIS_PASSWORD` | Cache credential | `.env` / K8s / Secret Manager | Infrastructure | |
| SEC-03 | `CIRCLE_API_KEY` | Third-party API | `.env` / K8s | Platform Engineering | |
| SEC-04 | `ETHEREUM_RPC_URL` token | RPC bearer | `.env` / K8s | Infrastructure | |
| SEC-05 | `SOROBAN_RPC_URL` token | RPC bearer | `.env` / K8s | Infrastructure | |
| SEC-06 | `OPERATOR_SECRET_<BRIDGE_ID>` | Stellar signing key | `.env` / K8s / KMS | Security + Platform | |
| SEC-07 | `JWT_SECRET` | JWT signing | `.env` / K8s | Platform Engineering | |
| SEC-08 | Platform API keys | API key | Database (`api_keys`) | Platform Engineering | |
| SEC-09 | Webhook signing secret | HMAC key | `.env` / K8s | Platform Engineering | |
| SEC-10 | Slack webhook URL | Monitoring | `monitoring/alertmanager.yml` | Observability | |
| SEC-11 | PagerDuty integration key | Monitoring | `monitoring/alertmanager.yml` | Observability | |
| SEC-12 | `PGADMIN_PASSWORD` | Admin tool | `.env` (non-prod) | Infrastructure | |
| CI-01 | `GITHUB_TOKEN` | CI default | GitHub Actions | Platform Engineering | |
| CI-02 | `CODECOV_TOKEN` | CI upload | GitHub Actions secrets | Platform Engineering | |
| CI-03 | `NPM_TOKEN` | Package publish | GitHub Actions secrets | Platform Engineering | |
| CI-04 | `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY` | Deploy SSH | GitHub environment secrets | Platform Engineering | |
| CI-05 | `SLACK_WEBHOOK_URL` | CI notifications | GitHub Actions | Platform Engineering | |

Reference: [`.env.example`](../.env.example), [environment-setup.md](./deployment/environment-setup.md), [CICD.md](./CICD.md), [`.github/workflows/README.md`](../.github/workflows/README.md).

### Inventory checklist

- [ ] Every production secret has a row in the table above with a named owner.
- [ ] No secret values are stored in git (only placeholders in `.env.example`).
- [ ] Staging and production use separate secret stores / GitHub environments.
- [ ] Deprecated secrets are removed from Secret Manager, K8s, and local `.env` backups.

---

## 2. Least privilege

- [ ] Database roles use least privilege (app user is not superuser).
- [ ] Redis ACLs restrict commands to what the backend/workers need.
- [ ] Platform API keys are scoped to required routes and expired when unused.
- [ ] GitHub environment protection rules require review for production deploy secrets.
- [ ] Kubernetes RBAC limits who can read `bridge-watch-secrets` (see [kubernetes-deployment.md](./deployment/kubernetes-deployment.md)).
- [ ] Soroban operator keys (SEC-06) are registered only for bridges they operate.

---

## 3. Rotation status

Cross-check against [secret-rotation-playbook.md](./runbooks/secret-rotation-playbook.md) frequencies.

| Category | Target cadence | Verified |
|----------|----------------|----------|
| DB / Redis (SEC-01, SEC-02) | Quarterly | [ ] |
| JWT / webhooks (SEC-07, SEC-09) | Quarterly | [ ] |
| Third-party API keys (SEC-03–05) | Quarterly or vendor demand | [ ] |
| Operator signing keys (SEC-06) | Annually or on compromise | [ ] |
| Monitoring integrations (SEC-10, SEC-11) | Annually | [ ] |
| CI deploy keys (CI-04) | On personnel change | [ ] |

- [ ] Every rotated secret has a completed audit log entry (rotation playbook §7).
- [ ] Secrets past due for rotation have an owner-assigned GitHub issue.

---

## 4. Exposure review

- [ ] `.env` and credential files are listed in `.gitignore` and not committed.
- [ ] Application logs redact tokens, passwords, and signing material.
- [ ] Error responses do not echo secret values or connection strings.
- [ ] Public repos and docs contain no live keys (grep for `sk_`, `Bearer`, `PRIVATE KEY`).
- [ ] Slack/PagerDuty webhook URLs are not posted in public channels.
- [ ] Backup dumps and support exports are encrypted and access-controlled.

---

## 5. Owner mapping

| Secret category | Primary owner | Backup reviewer |
|-----------------|---------------|-----------------|
| Database / Redis | Infrastructure | Platform On-Call |
| JWT / API keys / webhooks | Platform Engineering | Security Team |
| Stellar operator keys | Security Lead | Platform Engineering Lead |
| CI/CD deploy secrets | Platform Engineering | Engineering Manager |
| Monitoring integrations | Observability Guild | Infrastructure Lead |

- [ ] Each category has a reachable on-call contact documented in [runbooks/index.md](./runbooks/index.md).

---

## 6. Audit cadence

| Activity | Frequency | Output |
|----------|-----------|--------|
| Full inventory review (this checklist) | Quarterly | Signed checklist + updated table |
| Operator signing key review (SEC-06) | Annually | On-chain key list vs env inventory |
| CI secret access review | Quarterly | GitHub environment audit export |
| Post-incident secret re-audit | After SEV-1/2 security incidents | Updated inventory + rotation tickets |

---

## Related documents

- [Secret Rotation Playbook](./runbooks/secret-rotation-playbook.md)
- [Runbook index](./runbooks/index.md)
- [Environment setup](./deployment/environment-setup.md)
- [Security architecture](./architecture/security-architecture.md)
- [Release checklist](./release-checklist.md)
- [CICD.md](./CICD.md)
